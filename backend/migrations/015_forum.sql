-- Forum topics
CREATE TABLE forum_topics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    body            TEXT NOT NULL,
    category        VARCHAR(30) NOT NULL CHECK (category IN ('general', 'tips', 'stories', 'questions', 'off-topic')),
    is_anonymous    BOOLEAN NOT NULL DEFAULT FALSE,
    is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked       BOOLEAN NOT NULL DEFAULT FALSE,
    like_count      INTEGER NOT NULL DEFAULT 0,
    comment_count   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_forum_topics_category ON forum_topics(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_forum_topics_created ON forum_topics(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_forum_topics_likes ON forum_topics(like_count DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_forum_topics_pinned ON forum_topics(is_pinned) WHERE is_pinned = TRUE AND deleted_at IS NULL;

-- Forum comments
CREATE TABLE forum_comments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id        UUID NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id       UUID REFERENCES forum_comments(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    depth           SMALLINT NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 2),
    like_count      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_forum_comments_topic ON forum_comments(topic_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_forum_comments_parent ON forum_comments(parent_id) WHERE parent_id IS NOT NULL;

-- Forum likes (upvote only, toggle)
CREATE TABLE forum_likes (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type     VARCHAR(10) NOT NULL CHECK (target_type IN ('topic', 'comment')),
    target_id       UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, target_type, target_id)
);
