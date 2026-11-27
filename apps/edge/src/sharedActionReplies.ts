import type { SharedActionRecord } from './sharedRuleCommit';

const MAX_SHARED_ACTION_REPLIES = 1000;

/** Durable command replies, kept outside the room's JSON snapshot. */
export class SharedActionReplies {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS shared_action_replies (
        action_key TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      )
    `);
  }

  get(actionKey: string): SharedActionRecord | undefined {
    const row = this.storage.sql
      .exec<{
        record_json: string;
      }>('SELECT record_json FROM shared_action_replies WHERE action_key = ?', actionKey)
      .toArray()[0];
    return row ? (JSON.parse(row.record_json) as SharedActionRecord) : undefined;
  }

  /** Called within the room publication transaction by the command handler. */
  put(actionKey: string, record: SharedActionRecord): void {
    this.storage.sql.exec(
      'INSERT INTO shared_action_replies (action_key, record_json) VALUES (?, ?) ON CONFLICT(action_key) DO UPDATE SET record_json = excluded.record_json',
      actionKey,
      JSON.stringify(record)
    );
    // Only recent actions can be retried, so older replies are not kept.
    this.storage.sql.exec(
      'DELETE FROM shared_action_replies WHERE rowid <= (SELECT MAX(rowid) FROM shared_action_replies) - ?',
      MAX_SHARED_ACTION_REPLIES
    );
  }
}
