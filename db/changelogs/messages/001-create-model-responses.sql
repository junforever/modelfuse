--liquibase formatted sql

--changeset modelfuse:001-create-model-responses
CREATE TABLE model_responses (
    id uuid PRIMARY KEY,
    turn_id uuid NOT NULL,
    slot varchar(16) NOT NULL,
    role varchar(16) NOT NULL,
    provider varchar(64) NOT NULL,
    model varchar(128) NOT NULL,
    status varchar(16) NOT NULL,
    content text,
    error_code varchar(64),
    error_message text,
    error_recoverable boolean,
    continued_without_at timestamptz,
    is_stale boolean NOT NULL DEFAULT false,
    attempt_no integer NOT NULL DEFAULT 0,
    metadata jsonb,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT fk_model_responses_turn
        FOREIGN KEY (turn_id) REFERENCES turns (id) ON DELETE CASCADE,
    CONSTRAINT uq_model_responses_turn_slot UNIQUE (turn_id, slot),
    CONSTRAINT ck_model_responses_slot
        CHECK (slot IN ('openai', 'google', 'minimax', 'qwen')),
    CONSTRAINT ck_model_responses_role
        CHECK (role IN ('base', 'consolidator')),
    CONSTRAINT ck_model_responses_slot_role
        CHECK (
            (slot IN ('openai', 'google', 'minimax') AND role = 'base')
            OR (slot = 'qwen' AND role = 'consolidator')
        ),
    CONSTRAINT ck_model_responses_status
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    CONSTRAINT ck_model_responses_completed_content
        CHECK (status <> 'completed' OR (content IS NOT NULL AND length(btrim(content)) > 0)),
    CONSTRAINT ck_model_responses_failed_error
        CHECK (status <> 'failed' OR error_code IS NOT NULL),
    CONSTRAINT ck_model_responses_continued_without
        CHECK (continued_without_at IS NULL OR (role = 'base' AND status = 'failed')),
    CONSTRAINT ck_model_responses_stale
        CHECK (NOT is_stale OR (slot = 'qwen' AND content IS NOT NULL AND length(btrim(content)) > 0)),
    CONSTRAINT ck_model_responses_attempt_no CHECK (attempt_no >= 0)
);

CREATE INDEX idx_model_responses_active
    ON model_responses (turn_id)
    WHERE status IN ('pending', 'running');

--rollback DROP TABLE model_responses;
