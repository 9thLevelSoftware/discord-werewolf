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
  if (!(err instanceof SupabaseRestError)) {
    return false;
  }
  if (err.status === 404) {
    return true;
  }
  return (
    err.bodyText.includes('PGRST205') ||
    err.bodyText.toLowerCase().includes('user_character_sheets')
  );
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
      return await obj.json<W20UserCharacterSheet>();
    } catch {
      return null;
    }
  }

  private async r2WriteSheetAndIndexes(
    sheet: W20UserCharacterSheet,
    previous?: W20UserCharacterSheet | null,
  ): Promise<W20UserCharacterSheet> {
    const bucket = this.requireBucket();
    const keysToDelete: string[] = [];

    if (previous) {
      if (previous.syncCode && previous.syncCode !== sheet.syncCode) {
        keysToDelete.push(syncIndexKey(previous.syncCode));
      }
      if (previous.ownerDiscordId !== sheet.ownerDiscordId) {
        keysToDelete.push(ownerIndexKey(previous.ownerDiscordId, sheet.id));
      }
    }

    if (keysToDelete.length > 0) {
      await bucket.delete(keysToDelete);
    }

    const jsonMeta = {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'no-store',
      },
    };

    const writes: Promise<unknown>[] = [
      bucket.put(sheetKey(sheet.id), JSON.stringify(sheet), jsonMeta),
      bucket.put(
        ownerIndexKey(sheet.ownerDiscordId, sheet.id),
        JSON.stringify({
          id: sheet.id,
          ownerDiscordId: sheet.ownerDiscordId,
          lastUsedAt: sheet.lastUsedAt,
          updatedAt: sheet.updatedAt,
        }),
        jsonMeta,
      ),
    ];

    if (sheet.syncCode) {
      writes.push(
        bucket.put(
          syncIndexKey(sheet.syncCode),
          JSON.stringify({
            sheetId: sheet.id,
            ownerDiscordId: sheet.ownerDiscordId,
            syncCode: sheet.syncCode,
            updatedAt: sheet.updatedAt,
          }),
          jsonMeta,
        ),
      );
    }

    await Promise.all(writes);
    return sheet;
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
          await bucket.delete(indexKey);
          return null;
        }
        const sheetId = record?.sheetId ?? record?.id;
        if (!sheetId) {
          await bucket.delete(indexKey);
          return null;
        }
        const sheet = await this.r2GetById(sheetId);
        if (!sheet || sheet.syncCode !== syncCode) {
          await bucket.delete(indexKey);
          return null;
        }
        return sheet;
      },
    );
  }

  async create(sheet: W20UserCharacterSheet): Promise<W20UserCharacterSheet> {
    return this.withFallback(
      () => this.supa.insertUserCharacterSheet(sheet),
      () => this.r2WriteSheetAndIndexes(sheet, null),
    );
  }

  async update(sheet: W20UserCharacterSheet): Promise<W20UserCharacterSheet | null> {
    return this.withFallback(
      () => this.supa.updateUserCharacterSheet(sheet),
      async () => {
        const existing = await this.r2GetById(sheet.id);
        if (!existing) {
          return null;
        }
        return this.r2WriteSheetAndIndexes(sheet, existing);
      },
    );
  }

  async delete(id: string): Promise<void> {
    await this.withFallback(
      () => this.supa.deleteUserCharacterSheet(id),
      async () => {
        const bucket = this.requireBucket();
        const existing = await this.r2GetById(id);
        const keysToDelete = [sheetKey(id)];
        if (existing) {
          keysToDelete.push(ownerIndexKey(existing.ownerDiscordId, id));
          if (existing.syncCode) {
            keysToDelete.push(syncIndexKey(existing.syncCode));
          }
        }
        await bucket.delete(keysToDelete);
      },
    );
  }
}
