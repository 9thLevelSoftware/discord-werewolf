declare module 'node:sqlite' {
  export interface SqlStatementSync {
    all(...params: unknown[]): Array<Record<string, unknown>>;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): SqlStatementSync;
    close(): void;
  }
}
