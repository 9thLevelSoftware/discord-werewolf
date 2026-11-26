import {
  applyRuleSpend,
  nextSheetVersion,
  preserveRuleTransactions,
  RuleSpendConflictError,
  type RuleSpendInput,
} from './userSheetTransactions';
export { preserveRuleTransactions, RuleSpendConflictError, type RuleSpendInput } from './userSheetTransactions';
import type { W20UserCharacterSheet } from '@w20-vtt/core';
import type { WorkerEnv } from './env';
import { SupabaseRestClient, SupabaseRestError } from './supabaseRest';

const SHEET_PREFIX = 'private/character-sheets/sheets/';
const OWNERS_PREFIX = 'private/character-sheets/owners/';
const SYNC_PREFIX = 'private/character-sheets/sync/';

function sheetKey(id: string): string {
  return `${SHEET_PREFIX}${id}.json`;
}

function ownerPrefix(ownerDiscordId: string): string {
  return `${OWNERS_PREFIX}${ownerDiscordId}/`;
}

function ownerIndexKey(ownerDiscordId: string, id: string): string {
  return `${ownerPrefix(ownerDiscordId)}${id}.json`;
}

function syncIndexKey(syncCode: string): string {
  return `${SYNC_PREFIX}${syncCode}.json`;
}

export function isMissingUserSheetsTableError(err: unknown): boolean {
  if (!(err instanceof SupabaseRestError)) return false;
  let body: { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  try {
    body = JSON.parse(err.bodyText);
  } catch {
    return false;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const missingTable = body.code === 'PGRST205' || body.code === '42P01';
  const description = [body.message, body.details, body.hint]
    .filter(value => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return missingTable && /\b(?:public\.)?user_character_sheets\b/.test(description);
}

interface SyncIndexRecord {
  sheetId?: string;
  id?: string;
}

export class UserSheetRepository {
  private readonly supa: SupabaseRestClient;
  private readonly bucket: R2Bucket | undefined;

  constructor(env: Pick<WorkerEnv, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'VTT_MEDIA_BUCKET'>) {
    this.supa = new SupabaseRestClient(env);
    this.bucket = env.VTT_MEDIA_BUCKET;
  }

  private requireBucket(originalErr?: unknown): R2Bucket {
    if (!this.bucket) {
      if (originalErr) {
        throw originalErr;
      }
      throw new Error('VTT_MEDIA_BUCKET is not configured for character sheet storage.');
    }
    return this.bucket;
  }

  private async withFallback<T>(
    supaOp: () => Promise<T>,
    r2Op: () => Promise<T>,
  ): Promise<T> {
    if (!this.supa.isConfigured()) {
      return r2Op();
    }
    try {
      return await supaOp();
    } catch (err) {
      if (isMissingUserSheetsTableError(err)) {
        return r2Op();
      }
      throw err;
    }
  }

  private async r2GetById(id: string): Promise<W20UserCharacterSheet | null> {
    const bucket = this.requireBucket();
    const obj = await bucket.get(sheetKey(id));
    if (!obj) {
      return null;
    }
    try {
      const sheet = await obj.json<W20UserCharacterSheet & {_deleted?:boolean}>();
      return sheet._deleted ? null : sheet;
    } catch {
      return null;
    }
  }

  private async r2WriteSheetAndIndexes(sheet: W20UserCharacterSheet): Promise<W20UserCharacterSheet> {
    const bucket = this.requireBucket();
    await this.r2ClaimSyncCode(sheet);
    const saved = await bucket.put(sheetKey(sheet.id), JSON.stringify(sheet), {
      onlyIf: {etagDoesNotMatch: '*'},
      httpMetadata: {contentType: 'application/json; charset=utf-8', cacheControl: 'no-store'},
    });
    if (!saved) {
      throw new RuleSpendConflictError(
        'STALE',
        'A character sheet with this ID already exists.',
        await this.r2GetById(sheet.id) ?? undefined,
      );
    }
    await this.r2PublishIndexes(sheet);
    return sheet;
  }

  private async r2ClaimSyncCode(sheet: W20UserCharacterSheet): Promise<void> {
    if (!sheet.syncCode) return;
    const bucket = this.requireBucket();
    const key = syncIndexKey(sheet.syncCode);
    const current = await bucket.get(key);
    if (current) {
      const record = await current.json<SyncIndexRecord>();
      if ((record.sheetId ?? record.id) === sheet.id) return;
      throw new SupabaseRestError('This sync code is already allocated.', 409, '23505');
    }
    const claimed = await bucket.put(key, JSON.stringify({sheetId: sheet.id}), {
      onlyIf: {etagDoesNotMatch: '*'},
      httpMetadata: {contentType: 'application/json; charset=utf-8'},
    });
    if (!claimed) {
      const winner = await bucket.get(key);
      const record = winner ? await winner.json<SyncIndexRecord>() : undefined;
      if ((record?.sheetId ?? record?.id) !== sheet.id) {
        throw new SupabaseRestError('This sync code is already allocated.', 409, '23505');
      }
    }
  }

  private async r2PublishIndexes(
    sheet: W20UserCharacterSheet,
    previous?: W20UserCharacterSheet,
  ): Promise<void> {
    if (previous?.ownerDiscordId === sheet.ownerDiscordId && previous.syncCode === sheet.syncCode) return;
    const bucket = this.requireBucket();
    const current = await this.r2GetById(sheet.id);
    if (!current) return;
    if (previous?.syncCode && previous.syncCode !== current.syncCode) {
      const key = syncIndexKey(previous.syncCode);
      const object = await bucket.get(key);
      const record = object ? await object.json<SyncIndexRecord>() : undefined;
      if ((record?.sheetId ?? record?.id) === sheet.id) await bucket.delete(key);
    }
    if (previous?.ownerDiscordId === current.ownerDiscordId) return;
    // The owner index is a lookup hint. Ordering and details come from the canonical sheet.
    await bucket.put(
      ownerIndexKey(current.ownerDiscordId, current.id),
      JSON.stringify({id: current.id}),
      {httpMetadata: {contentType: 'application/json; charset=utf-8', cacheControl: 'no-store'}},
    );
  }

  private async r2RemoveIndexes(id: string, ownerDiscordId?: string): Promise<void> {
    const bucket = this.requireBucket();
    const keys = new Set<string>();
    if (ownerDiscordId) keys.add(ownerIndexKey(ownerDiscordId, id));
    else {
      let ownerCursor: string | undefined;
      do {
        const page = await bucket.list({prefix: OWNERS_PREFIX, ...(ownerCursor ? {cursor: ownerCursor} : {})});
        for (const entry of page.objects) {
          if (entry.key.endsWith(`/${id}.json`)) keys.add(entry.key);
        }
        ownerCursor = page.truncated ? page.cursor : undefined;
      } while (ownerCursor);
    }
    let cursor: string | undefined;
    do {
      const page = await bucket.list({prefix: SYNC_PREFIX, ...(cursor ? {cursor} : {})});
      for (const entry of page.objects) {
        const object = await bucket.get(entry.key);
        if (!object) continue;
        try {
          const record = await object.json<SyncIndexRecord>();
          if ((record.sheetId ?? record.id) === id) keys.add(entry.key);
        } catch {
          // An unrelated malformed hint does not belong to this sheet.
        }
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    if (keys.size) await bucket.delete([...keys]);
  }

  async listByOwner(ownerDiscordId: string): Promise<W20UserCharacterSheet[]> {
    return this.withFallback(
      () => this.supa.listUserCharacterSheets(ownerDiscordId),
      async () => {
        const bucket = this.requireBucket();
        const prefix = ownerPrefix(ownerDiscordId);
        const indexKeys: string[] = [];
        let cursor: string | undefined;

        do {
          const page = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
          for (const obj of page.objects) {
            if (obj.key.startsWith(prefix) && obj.key.endsWith('.json')) {
              indexKeys.push(obj.key);
            }
          }
          cursor = page.truncated ? page.cursor : undefined;
        } while (cursor);

        const sheets: W20UserCharacterSheet[] = [];
        const staleIndexKeys: string[] = [];

        const loaded = await Promise.all(
          indexKeys.map(async (key) => {
            const id = key.slice(prefix.length, -'.json'.length);
            const sheet = await this.r2GetById(id);
            return { key, sheet };
          }),
        );

        for (const { key, sheet } of loaded) {
          if (!sheet || sheet.ownerDiscordId !== ownerDiscordId) {
            staleIndexKeys.push(key);
          } else {
            sheets.push(sheet);
          }
        }

        if (staleIndexKeys.length > 0) {
          await bucket.delete(staleIndexKeys);
        }

        sheets.sort((a, b) => b.lastUsedAt - a.lastUsedAt || b.updatedAt - a.updatedAt);
        return sheets;
      },
    );
  }

  async getById(id: string): Promise<W20UserCharacterSheet | null> {
    return this.withFallback(
      () => this.supa.getUserCharacterSheetById(id),
      () => this.r2GetById(id),
    );
  }

  async getBySyncCode(syncCode: string): Promise<W20UserCharacterSheet | null> {
    return this.withFallback(
      () => this.supa.getUserCharacterSheetBySyncCode(syncCode),
      async () => {
        const bucket = this.requireBucket();
        const indexKey = syncIndexKey(syncCode);
        const obj = await bucket.get(indexKey);
        if (!obj) {
          return null;
        }
        let record: SyncIndexRecord | null = null;
        try {
          record = await obj.json<SyncIndexRecord>();
        } catch {
          return null;
        }
        const sheetId = record?.sheetId ?? record?.id;
        if (!sheetId) {
          return null;
        }
        const sheet = await this.r2GetById(sheetId);
        if (!sheet || sheet.syncCode !== syncCode) {
          return null;
        }
        return sheet;
      },
    );
  }

  async create(sheet: W20UserCharacterSheet): Promise<W20UserCharacterSheet> {
    return this.withFallback(
      () => this.supa.insertUserCharacterSheet(sheet),
      () => this.r2WriteSheetAndIndexes(sheet),
    );
  }

  async update(
    sheet: W20UserCharacterSheet,
    expectedUpdatedAt?: number,
  ): Promise<W20UserCharacterSheet | null> {
    return this.mutateRuleState(sheet.id, existing => {
      if (expectedUpdatedAt !== undefined && existing.updatedAt !== expectedUpdatedAt) {
        throw new RuleSpendConflictError('STALE', 'Character sheet changed while saving.', existing);
      }
      return preserveRuleTransactions(existing, sheet);
    }, true);
  }

  async authorizeRuleSpend(
    input: RuleSpendInput,
    mutate?: (sheet: W20UserCharacterSheet) => W20UserCharacterSheet,
  ): Promise<{sheet: W20UserCharacterSheet; alreadyCommitted: boolean}> {
    let alreadyCommitted = false;
    const sheet = await this.mutateRuleState(input.sheetId, existing => {
      const next = applyRuleSpend(existing, input, mutate);
      alreadyCommitted = next === existing;
      return next;
    });
    if (!sheet) {
      throw new RuleSpendConflictError('NOT_FOUND', 'The character sheet is no longer in shared storage.');
    }
    return {sheet, alreadyCommitted};
  }

  async delete(id: string): Promise<void> {
    await this.withFallback(
      () => this.supa.deleteUserCharacterSheet(id),
      async () => {
        const bucket = this.requireBucket();
        for (let attempt = 0; attempt < 3; attempt++) {
          const current = await bucket.get(sheetKey(id));
          if (!current) return;
          const existing = await current.json<W20UserCharacterSheet & {_deleted?: boolean}>();
          if (existing._deleted) {
            await this.r2RemoveIndexes(id);
            await bucket.delete(sheetKey(id));
            return;
          }
          const saved = await bucket.put(
            sheetKey(id),
            JSON.stringify({id, _deleted: true, updatedAt: nextSheetVersion(existing)}),
            {
              onlyIf: {etagMatches: current.etag},
              httpMetadata: {contentType: 'application/json; charset=utf-8'},
            },
          );
          if (saved) {
            await this.r2RemoveIndexes(id, existing.ownerDiscordId);
            await bucket.delete(sheetKey(id));
            return;
          }
        }
        throw new RuleSpendConflictError('STALE', 'Character sheet changed while deleting.');
      },
    );
  }

  /** Resource/effect mutations merge against the latest sheet with optimistic concurrency. */
  async mutateRuleState(
    id: string,
    mutate: (sheet: W20UserCharacterSheet) => W20UserCharacterSheet,
    updateMetadata = false,
  ): Promise<W20UserCharacterSheet | null> {
    return this.withFallback(
      () => this.supa.mutateUserCharacterSheet(id, mutate, updateMetadata),
      async () => {
        const bucket = this.requireBucket();
        for (let attempt = 0; attempt < 3; attempt++) {
          const current = await bucket.get(sheetKey(id));
          if (!current) return null;
          const sheet = await current.json<W20UserCharacterSheet & {_deleted?: boolean}>();
          if (sheet._deleted) return null;
          const changed = mutate(sheet);
          if (changed === sheet) return sheet;
          const next = {
            ...changed,
            id: sheet.id,
            ownerDiscordId: sheet.ownerDiscordId,
            createdAt: sheet.createdAt,
            updatedAt: nextSheetVersion(sheet),
          };
          if (next.syncCode !== sheet.syncCode) await this.r2ClaimSyncCode(next);
          const saved = await bucket.put(sheetKey(id), JSON.stringify(next), {
            onlyIf: {etagMatches: current.etag},
            httpMetadata: {contentType: 'application/json; charset=utf-8'},
          });
          if (saved) {
            await this.r2PublishIndexes(next, sheet);
            return next;
          }
        }
        throw new RuleSpendConflictError(
          'STALE',
          'Character sheet changed while applying a rule.',
          await this.r2GetById(id) ?? undefined,
        );
      },
    );
  }
}
