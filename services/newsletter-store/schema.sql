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

GRANT SELECT, INSERT, UPDATE, DELETE ON newsletter_subscribers, newsletter_sends, chat_push_subscriptions, chat_push_deliveries, chat_messages TO newsletter_store;
