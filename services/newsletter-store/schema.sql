CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'blog',
  consented_at TIMESTAMPTZ NOT NULL,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_sends (
  week_key TEXT NOT NULL,
  email TEXT NOT NULL REFERENCES newsletter_subscribers(email) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'dry-run')),
  subject TEXT,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (week_key, email)
);

CREATE INDEX IF NOT EXISTS newsletter_subscribers_active_idx
  ON newsletter_subscribers (email)
  WHERE unsubscribed_at IS NULL;

CREATE TABLE IF NOT EXISTS chat_push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subscription JSONB NOT NULL,
  rooms TEXT[] NOT NULL DEFAULT ARRAY['general']::TEXT[],
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_push_subscriptions_rooms_idx
  ON chat_push_subscriptions USING GIN (rooms);

CREATE TABLE IF NOT EXISTS chat_push_deliveries (
  room TEXT NOT NULL,
  message_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room, message_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  room TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  username TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room, message_id)
);

CREATE INDEX IF NOT EXISTS chat_messages_room_created_idx
  ON chat_messages (room, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_import_runs (
  run_id TEXT PRIMARY KEY,
  source_name TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  report JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE TABLE IF NOT EXISTS crm_contacts (
  contact_id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL DEFAULT 'person' CHECK (record_type IN ('person', 'company')),
  name TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  website TEXT,
  status TEXT,
  source TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'unknown' CHECK (consent_status IN ('unknown', 'consented', 'legitimate-interest', 'declined')),
  suppressed BOOLEAN NOT NULL DEFAULT FALSE,
  suppression_reason TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_email_unique_idx
  ON crm_contacts (LOWER(email)) WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS crm_contacts_status_idx ON crm_contacts (status);
CREATE INDEX IF NOT EXISTS crm_contacts_suppressed_idx ON crm_contacts (suppressed) WHERE suppressed = TRUE;

CREATE TABLE IF NOT EXISTS crm_activities (
  activity_id TEXT PRIMARY KEY,
  contact_id TEXT REFERENCES crm_contacts(contact_id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  channel TEXT,
  status TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  subject TEXT,
  body TEXT,
  source TEXT NOT NULL,
  raw_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS crm_activities_contact_time_idx
  ON crm_activities (contact_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS crm_raw_records (
  source_name TEXT NOT NULL,
  source_record_id TEXT NOT NULL,
  record_kind TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_name, source_record_id)
);

CREATE TABLE IF NOT EXISTS assembly_workspace_grants (
  grant_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  principal_id TEXT NOT NULL,
  profile TEXT NOT NULL CHECK (profile IN ('owner', 'editor', 'viewer')),
  issued_by TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'invite' CHECK (source_type IN ('invite', 'bootstrap', 'admin')),
  source_id TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_type, source_id)
);

CREATE INDEX IF NOT EXISTS assembly_workspace_grants_active_principal_idx
  ON assembly_workspace_grants (workspace_id, principal_id)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS assembly_workspace_grants_workspace_idx
  ON assembly_workspace_grants (workspace_id, granted_at DESC);

CREATE TABLE IF NOT EXISTS assembly_access_events (
  event_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  actor_principal_id TEXT NOT NULL,
  target_principal_id TEXT,
  grant_id TEXT REFERENCES assembly_workspace_grants(grant_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assembly_access_events_workspace_time_idx
  ON assembly_access_events (workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS assembly_access_events_principal_time_idx
  ON assembly_access_events (target_principal_id, occurred_at DESC)
  WHERE target_principal_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON newsletter_subscribers, newsletter_sends, chat_push_subscriptions, chat_push_deliveries, chat_messages, crm_import_runs, crm_contacts, crm_activities, crm_raw_records TO newsletter_store;
GRANT SELECT, INSERT, UPDATE ON assembly_workspace_grants TO newsletter_store;
GRANT SELECT, INSERT ON assembly_access_events TO newsletter_store;
