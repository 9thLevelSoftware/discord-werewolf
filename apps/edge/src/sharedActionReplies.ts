import type { SharedActionRecord } from './sharedRuleCommit';

const MAX_SHARED_ACTION_REPLIES = 1000;
const PRUNE_OLD_REPLIES =
  'DELETE FROM shared_action_replies WHERE rowid <= (SELECT MAX(rowid) FROM shared_action_replies) - ' +
  MAX_SHARED_ACTION_REPLIES;

/** Durable command replies, kept outside the room's JSON snapshot. */
export class SharedActionReplies {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS shared_action_replies (
        action_key TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS expired_shared_actions (
        action_key TEXT PRIMARY KEY
      ) WITHOUT ROWID;
      CREATE TRIGGER IF NOT EXISTS remember_expired_shared_action
      BEFORE DELETE ON shared_action_replies
      BEGIN
        INSERT OR IGNORE INTO expired_shared_actions (action_key) VALUES (OLD.action_key);
      END;
      CREATE TRIGGER IF NOT EXISTS cap_shared_action_replies
      AFTER INSERT ON shared_action_replies
      BEGIN
        ${PRUNE_OLD_REPLIES};
      END;
    `);
    // Apply the cap to existing replies too. Pruning and retaining their IDs are atomic.
    storage.sql.exec(PRUNE_OLD_REPLIES);
  }

  get(actionKey: string): SharedActionRecord | 'expired' | undefined {
    const row = this.storage.sql
      .exec<{
        record_json: string;
      }>('SELECT record_json FROM shared_action_replies WHERE action_key = ?', actionKey)
      .toArray()[0];
    if (row) return JSON.parse(row.record_json) as SharedActionRecord;
    const expired = this.storage.sql
      .exec('SELECT 1 FROM expired_shared_actions WHERE action_key = ?', actionKey)
      .toArray()[0];
    return expired ? 'expired' : undefined;
  }

  /** Called within the room publication transaction by the command handler. */
  put(actionKey: string, record: SharedActionRecord): void {
    this.storage.sql.exec(
      `INSERT INTO shared_action_replies (action_key, record_json)
       SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM expired_shared_actions WHERE action_key = ?)
       ON CONFLICT(action_key) DO UPDATE SET record_json = excluded.record_json`,
      actionKey,
      JSON.stringify(record),
      actionKey
    );
  }
}
