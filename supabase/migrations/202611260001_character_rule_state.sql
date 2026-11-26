-- Persist sourced modifier bindings and active effects alongside campaign characters.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS rule_state JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE characters ADD CONSTRAINT characters_rule_state_object
  CHECK (jsonb_typeof(rule_state) = 'object');
