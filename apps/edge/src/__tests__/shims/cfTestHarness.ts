import { DatabaseSync } from 'node:sqlite';
import type { WorkerEnv } from '../../env';
import type { GameRoomDO } from '../../GameRoomDO';

export class MockWebSocket {
  public readonly sentMessages: string[] = [];
  public closedCode: number | null = null;
  public closedReason: string | null = null;
  public peer: MockWebSocket | null = null;
  private attachment: unknown = null;

  serializeAttachment(value: unknown): void {
    this.attachment = structuredClone(value);
  }

  deserializeAttachment(): unknown {
    return this.attachment === null ? null : structuredClone(this.attachment);
  }

  send(data: string | ArrayBuffer | ArrayBufferView): void {
    const text =
      typeof data === 'string'
        ? data
        : new TextDecoder().decode(
            data instanceof ArrayBuffer
              ? data
              : new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
          );
    this.sentMessages.push(text);
  }

  close(code = 1000, reason = ''): void {
    this.closedCode = code;
    this.closedReason = reason;
  }

  drainJson<T = unknown>(): T[] {
    const items = this.sentMessages.map((msg) => JSON.parse(msg) as T);
    this.sentMessages.length = 0;
    return items;
  }
}

export class MockSqlCursor<T = Record<string, unknown>> {
  constructor(private readonly rows: T[]) {}

  toArray(): T[] {
    return this.rows;
  }

  one(): T {
    if (!this.rows[0]) {
      throw new Error('Expected at least 1 SQL row');
    }
    return this.rows[0];
  }
}

export class MockSqlStorage {
  public readonly db: DatabaseSync;

  constructor(existingDb?: DatabaseSync) {
    this.db = existingDb ?? new DatabaseSync(':memory:');
  }

  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): MockSqlCursor<T> {
    if (bindings.length === 0 && !/^\s*(SELECT|PRAGMA)/i.test(query)) {
      this.db.exec(query);
      return new MockSqlCursor<T>([]);
    }
    const stmt = this.db.prepare(query);
    if (/^\s*(SELECT|PRAGMA|WITH)/i.test(query)) {
      return new MockSqlCursor<T>(stmt.all(...bindings) as T[]);
    }
    stmt.run(...bindings);
    return new MockSqlCursor<T>([]);
  }
}

export class MockDurableObjectState {
  public readonly waitUntilPromises: Promise<unknown>[] = [];
  public readonly acceptedSockets: MockWebSocket[] = [];
  public readonly sql: MockSqlStorage;
  public readonly storage: DurableObjectStorage;

  constructor(existingDb?: DatabaseSync) {
    this.sql = new MockSqlStorage(existingDb);
    const sqlRef = this.sql;
    this.storage = {
      sql: sqlRef,
      transactionSync<T>(callback: () => T): T {
        sqlRef.db.exec('BEGIN');
        try {
          const result = callback();
          sqlRef.db.exec('COMMIT');
          return result;
        } catch (error) {
          sqlRef.db.exec('ROLLBACK');
          throw error;
        }
      },
    } as unknown as DurableObjectStorage;
  }

  async blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T> {
    return callback();
  }

  waitUntil(promise: Promise<unknown>): void {
    this.waitUntilPromises.push(promise);
  }

  acceptWebSocket(ws: WebSocket): void {
    this.acceptedSockets.push(ws as unknown as MockWebSocket);
  }

  getWebSockets(): WebSocket[] {
    return this.acceptedSockets.filter((ws) => ws.closedCode === null) as unknown as WebSocket[];
  }
}

export function installMockWebSocketPairGlobal(): void {
  const g = globalThis as unknown as {
    WebSocketPair?: new () => { 0: WebSocket; 1: WebSocket };
    Response: typeof Response;
    __w20Patched101Response?: boolean;
  };
  g.WebSocketPair = class {
    0: WebSocket;
    1: WebSocket;
    constructor() {
      const client = new MockWebSocket();
      const server = new MockWebSocket();
      client.peer = server;
      server.peer = client;
      this[0] = client as unknown as WebSocket;
      this[1] = server as unknown as WebSocket;
    }
  };

  if (!g.__w20Patched101Response) {
    const NativeResponse = g.Response;
    const PatchedResponse = function (
      body?: BodyInit | null,
      init?: ResponseInit & { webSocket?: WebSocket },
    ): Response {
      if (init && init.status === 101) {
        return {
          status: 101,
          ok: true,
          headers: new Headers(init.headers),
          webSocket: init.webSocket,
        } as unknown as Response;
      }
      return new NativeResponse(body, init);
    } as unknown as typeof Response;
    PatchedResponse.prototype = NativeResponse.prototype;
    PatchedResponse.json = NativeResponse.json.bind(NativeResponse);
    PatchedResponse.error = NativeResponse.error.bind(NativeResponse);
    PatchedResponse.redirect = NativeResponse.redirect.bind(NativeResponse);
    g.Response = PatchedResponse;
    g.__w20Patched101Response = true;
  }
}

export class MockR2Bucket {
  private version = 0;
  private readonly store = new Map<
    string,
    {
      body: Uint8Array;
      httpMetadata?: R2HTTPMetadata;
      customMetadata?: Record<string, string>;
      etag: string;
      uploaded: Date;
    }
  >();

  private toR2Object(
    key: string,
    entry: {
      body: Uint8Array;
      httpMetadata?: R2HTTPMetadata;
      customMetadata?: Record<string, string>;
      etag: string;
      uploaded: Date;
    },
  ): R2Object {
    return {
      key,
      version: 'mock-v1',
      size: entry.body.byteLength,
      etag: entry.etag,
      httpEtag: entry.etag,
      checksums: { toJSON: () => ({}) },
      uploaded: entry.uploaded,
      httpMetadata: entry.httpMetadata,
      customMetadata: entry.customMetadata,
      storageClass: 'Standard',
      writeHttpMetadata(headers: Headers) {
        if (entry.httpMetadata?.contentType) {
          headers.set('Content-Type', entry.httpMetadata.contentType);
        }
        if (entry.httpMetadata?.cacheControl) {
          headers.set('Cache-Control', entry.httpMetadata.cacheControl);
        }
      },
    } as unknown as R2Object;
  }

  async head(key: string): Promise<R2Object | null> {
    const entry = this.store.get(key);
    return entry ? this.toR2Object(key, entry) : null;
  }

  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: R2PutOptions,
  ): Promise<R2Object | null> {
    const condition = options?.onlyIf;
    if (condition && !(condition instanceof Headers) && condition.etagMatches && this.store.get(key)?.etag !== condition.etagMatches) return null;
    if (condition && !(condition instanceof Headers) && condition.etagDoesNotMatch) {
      const current = this.store.get(key);
      if (condition.etagDoesNotMatch === '*' ? current !== undefined : current?.etag === condition.etagDoesNotMatch) return null;
    }
    const bytes =
      typeof value === 'string'
        ? new TextEncoder().encode(value)
        : value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const etag = `etag-${++this.version}-${bytes.byteLength}`;
    const entry = {
      body: new Uint8Array(bytes),
      httpMetadata: options?.httpMetadata as R2HTTPMetadata | undefined,
      customMetadata: options?.customMetadata,
      etag,
      uploaded: new Date(),
    };
    this.store.set(key, entry);
    return this.toR2Object(key, entry);
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    const copy = new Uint8Array(entry.body);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(copy);
        controller.close();
      },
    });
    const baseObj = this.toR2Object(key, entry);
    return {
      ...baseObj,
      body: stream,
      bodyUsed: false,
      writeHttpMetadata: baseObj.writeHttpMetadata,
      async arrayBuffer(): Promise<ArrayBuffer> {
        return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
      },
      async bytes(): Promise<Uint8Array> {
        return new Uint8Array(copy);
      },
      async text(): Promise<string> {
        return new TextDecoder().decode(copy);
      },
      async json<T>(): Promise<T> {
        return JSON.parse(new TextDecoder().decode(copy)) as T;
      },
      async blob(): Promise<Blob> {
        return new Blob([copy]);
      },
    } as unknown as R2ObjectBody;
  }

  async delete(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const key of list) {
      this.store.delete(key);
    }
  }

  async list(options?: R2ListOptions): Promise<R2Objects> {
    const prefix = options?.prefix ?? '';
    const startAfter = options?.startAfter ?? '';
    const delimiter = options?.delimiter;
    const limit = typeof options?.limit === 'number' && options.limit > 0 ? options.limit : 1000;
    const offset = options?.cursor ? Math.max(0, Number(options.cursor) || 0) : 0;

    const allKeys = Array.from(this.store.keys())
      .filter((key) => key.startsWith(prefix) && (!startAfter || key > startAfter))
      .sort();

    const delimitedSet = new Set<string>();
    const matchingKeys: string[] = [];

    for (const key of allKeys) {
      if (delimiter) {
        const rest = key.slice(prefix.length);
        const delimIdx = rest.indexOf(delimiter);
        if (delimIdx >= 0) {
          delimitedSet.add(prefix + rest.slice(0, delimIdx + delimiter.length));
          continue;
        }
      }
      matchingKeys.push(key);
    }

    const slice = matchingKeys.slice(offset, offset + limit);
    const objects = slice.map((key) => this.toR2Object(key, this.store.get(key)!));
    const delimitedPrefixes = Array.from(delimitedSet).sort();
    const nextOffset = offset + slice.length;

    if (nextOffset < matchingKeys.length) {
      return {
        objects,
        delimitedPrefixes,
        truncated: true,
        cursor: String(nextOffset),
      };
    }

    return {
      objects,
      delimitedPrefixes,
      truncated: false,
    };
  }
}

export function createMockEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DISCORD_APPLICATION_ID: 'app-123456',
    DISCORD_CLIENT_SECRET: 'discord-secret-xyz',
    DISCORD_PUBLIC_KEY: '00'.repeat(32),
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_service_role_test',
    SUPABASE_JWT_SECRET: 'super-secret-jwt-signing-key-for-w20-tests-256bit',
    VTT_MEDIA_BUCKET: new MockR2Bucket() as unknown as R2Bucket,
    ASSETS: {
      fetch: async () => new Response('<html>spa</html>', { status: 200 }),
    } as unknown as Fetcher,
    GAME_ROOM: {
      idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
      get: () => ({} as DurableObjectStub<GameRoomDO>),
    } as unknown as DurableObjectNamespace<GameRoomDO>,
    ...overrides,
  };
}
