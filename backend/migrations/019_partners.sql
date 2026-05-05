-- ============================================================
-- Long-term relationship tracking
-- Adds birthday to users + creates partners table
-- ============================================================

ALTER TABLE users ADD COLUMN birthday DATE;

CREATE TABLE partners (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name                VARCHAR(60) NOT NULL,
    birthday            DATE NOT NULL,
    relationship_start  DATE NOT NULL,
    relationship_end    DATE,

    satisfaction_score  SMALLINT CHECK (satisfaction_score IS NULL OR (satisfaction_score >= 1 AND satisfaction_score <= 10)),
    end_reason          VARCHAR(20)
                        CHECK (end_reason IS NULL OR end_reason IN ('distance', 'lost_interest', 'cheating', 'mutual', 'incompatibility', 'other')),
    how_we_met          VARCHAR(20)
                        CHECK (how_we_met IS NULL OR how_we_met IN ('app', 'friends', 'work', 'school', 'family', 'random', 'other')),
    notes               TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ,

    CHECK (relationship_end IS NULL OR relationship_end >= relationship_start)
);

CREATE INDEX idx_partners_user ON partners(user_id);
CREATE INDEX idx_partners_user_start ON partners(user_id, relationship_start);
