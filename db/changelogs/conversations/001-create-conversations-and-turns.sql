--liquibase formatted sql

--changeset modelfuse:001-create-conversations-and-turns
CREATE TABLE conversations (
    id uuid PRIMARY KEY,
    create_client_request_id uuid NOT NULL,
    title text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL,
    CONSTRAINT uq_conversations_create_client_request_id UNIQUE (create_client_request_id)
);

CREATE INDEX idx_conversations_sidebar
    ON conversations (updated_at DESC, id DESC);

CREATE TABLE turns (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL,
    client_request_id uuid NOT NULL,
    ordinal integer NOT NULL,
    user_content text NOT NULL,
    status varchar(16) NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT fk_turns_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT uq_turns_conversation_client_request
        UNIQUE (conversation_id, client_request_id),
    CONSTRAINT uq_turns_conversation_ordinal
        UNIQUE (conversation_id, ordinal),
    CONSTRAINT ck_turns_ordinal_positive CHECK (ordinal > 0),
    CONSTRAINT ck_turns_user_content_not_blank CHECK (btrim(user_content) <> ''),
    CONSTRAINT ck_turns_status
        CHECK (status IN ('pending', 'running', 'partial', 'completed', 'failed'))
);

CREATE UNIQUE INDEX uq_turns_one_active_per_conversation
    ON turns (conversation_id)
    WHERE status IN ('pending', 'running');

CREATE INDEX idx_turns_conversation_history
    ON turns (conversation_id, ordinal DESC, id DESC);

--rollback DROP TABLE turns;
--rollback DROP TABLE conversations;
