-- ============================================================
-- haveismashedV2 — Initial Database Schema
-- PostgreSQL 16 + PostGIS
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS TABLE
-- Auth via 12-word mnemonic phrase (argon2 hash stored).
-- Nickname required before any meaningful action.
-- ============================================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_hash         TEXT NOT NULL UNIQUE,                   -- Argon2 hash of 12-word mnemonic
    nickname            VARCHAR(30) UNIQUE,                     -- Must be set before creating dates/links
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at        TIMESTAMPTZ,
    invite_count        INTEGER NOT NULL DEFAULT 0
                        CHECK (invite_count >= 0 AND invite_count <= 10),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    deletion_requested_at TIMESTAMPTZ
);

CREATE INDEX idx_users_nickname ON users(nickname) WHERE nickname IS NOT NULL;
CREATE INDEX idx_users_active ON users(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_users_deletion ON users(deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;

-- ============================================================
-- CITIES LOOKUP (Reference data, not user data)
-- ============================================================
CREATE TABLE cities (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    country_code    CHAR(2) NOT NULL,                       -- ISO 3166-1 alpha-2
    location        GEOMETRY(Point, 4326) NOT NULL,
    population      INTEGER,

    UNIQUE(name, country_code)
);

CREATE INDEX idx_cities_country ON cities(country_code);
CREATE INDEX idx_cities_location ON cities USING GIST(location);
CREATE INDEX idx_cities_name ON cities(name);

-- ============================================================
-- TAGS — Categorized tag system
-- Categories: meeting, venue, activity, physical_male, physical_female
-- ============================================================
CREATE TABLE tags (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    category        VARCHAR(30) NOT NULL
                    CHECK (category IN ('meeting', 'venue', 'activity', 'physical_male', 'physical_female')),
    is_predefined   BOOLEAN NOT NULL DEFAULT FALSE,

    UNIQUE(name, category)
);

CREATE INDEX idx_tags_category ON tags(category);

-- ============================================================
-- DATES (formerly log_entries)
-- A date record with structured fields.
-- ============================================================
CREATE TABLE dates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Location
    country_code    CHAR(2) NOT NULL,                       -- ISO 3166-1 alpha-2
    city_id         INTEGER NOT NULL REFERENCES cities(id),

    -- Date partner info
    gender          VARCHAR(10) NOT NULL
                    CHECK (gender IN ('male', 'female', 'other')),
    age_range       VARCHAR(10) NOT NULL
                    CHECK (age_range IN ('18-22', '23-27', '28-32', '33-37', '38-42', '43-47', '48+')),

    -- Details
    description     TEXT,                                   -- Free-form notes about the date
    rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
    date_at         DATE NOT NULL,                          -- When the date happened

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ                             -- Soft delete
);

CREATE INDEX idx_dates_user_id ON dates(user_id);
CREATE INDEX idx_dates_user_date ON dates(user_id, date_at);
CREATE INDEX idx_dates_country ON dates(user_id, country_code);
CREATE INDEX idx_dates_city ON dates(user_id, city_id);
CREATE INDEX idx_dates_active ON dates(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_dates_soft_deleted ON dates(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================
-- DATE_TAGS — Many-to-many between dates and tags
-- ============================================================
CREATE TABLE date_tags (
    date_id         UUID NOT NULL REFERENCES dates(id) ON DELETE CASCADE,
    tag_id          INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (date_id, tag_id)
);

CREATE INDEX idx_date_tags_date ON date_tags(date_id);
CREATE INDEX idx_date_tags_tag ON date_tags(tag_id);

-- ============================================================
-- CONNECTIONS (Friend relationships)
-- ============================================================
CREATE TABLE connections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    responder_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,

    UNIQUE(requester_id, responder_id),
    CHECK (requester_id != responder_id)
);

CREATE INDEX idx_connections_responder ON connections(responder_id, status);
CREATE INDEX idx_connections_requester ON connections(requester_id, status);
CREATE INDEX idx_connections_accepted ON connections(status) WHERE status = 'accepted';

-- ============================================================
-- PRIVACY SETTINGS
-- Per-connection sharing granularity.
-- NULL connection_id = default settings for all friends.
-- ============================================================
CREATE TABLE privacy_settings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id   UUID REFERENCES connections(id) ON DELETE CASCADE,

    share_countries BOOLEAN NOT NULL DEFAULT TRUE,
    share_cities    BOOLEAN NOT NULL DEFAULT FALSE,
    share_dates     BOOLEAN NOT NULL DEFAULT FALSE,
    share_stats     BOOLEAN NOT NULL DEFAULT TRUE,

    UNIQUE(user_id, connection_id)
);

CREATE INDEX idx_privacy_user ON privacy_settings(user_id);
CREATE INDEX idx_privacy_connection ON privacy_settings(connection_id);

-- ============================================================
-- INVITES
-- Two types:
--   'platform' — limited: 3/month, 10 lifetime per user
--   'friend'   — unlimited, for adding existing users as friends
-- ============================================================
CREATE TABLE invites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inviter_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invite_type     VARCHAR(10) NOT NULL
                    CHECK (invite_type IN ('platform', 'friend')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,                   -- 24h TTL
    used_at         TIMESTAMPTZ,
    used_by         UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_invites_inviter ON invites(inviter_id);
CREATE INDEX idx_invites_type ON invites(inviter_id, invite_type);
CREATE INDEX idx_invites_active ON invites(expires_at) WHERE used_at IS NULL;
CREATE INDEX idx_invites_monthly ON invites(inviter_id, created_at)
    WHERE invite_type = 'platform';
