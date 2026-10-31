CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email CITEXT NOT NULL UNIQUE,
  username VARCHAR(30) NOT NULL UNIQUE,
  password_hash TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(80) NOT NULL,
  bio VARCHAR(500),
  avatar_url TEXT,
  banner_url TEXT,
  website_url TEXT,
  location VARCHAR(120),
  is_private BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(16) NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followed_id),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> followed_id)
);
CREATE INDEX follows_followed_idx ON follows (followed_id, status, created_at DESC);

CREATE TABLE media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  media_type VARCHAR(16) NOT NULL CHECK (media_type IN ('image', 'video', 'audio')),
  mime_type VARCHAR(100) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  processing_status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'ready', 'rejected', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX media_owner_created_idx ON media (owner_id, created_at DESC);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  visibility VARCHAR(16) NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'followers', 'private')),
  status VARCHAR(16) NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'scheduled', 'published', 'removed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT posts_body_or_schedule CHECK (length(body) > 0 OR scheduled_at IS NOT NULL)
);
CREATE INDEX posts_feed_idx ON posts (published_at DESC, id DESC)
  WHERE status = 'published' AND visibility = 'public';
CREATE INDEX posts_author_idx ON posts (author_id, published_at DESC);

CREATE TABLE post_media (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES media(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position >= 0),
  PRIMARY KEY (post_id, position),
  UNIQUE (post_id, media_id)
);

CREATE TABLE reactions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reaction VARCHAR(16) NOT NULL DEFAULT 'like',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX reactions_post_idx ON reactions (post_id, created_at DESC);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  CONSTRAINT comments_non_empty CHECK (length(trim(body)) > 0)
);
CREATE INDEX comments_post_created_idx ON comments (post_id, created_at);

CREATE TABLE bookmarks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(120) NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_active_idx ON sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
