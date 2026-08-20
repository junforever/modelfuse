--liquibase formatted sql

--changeset modelfuse:002-replace-response-slots
ALTER TABLE model_responses
    DROP CONSTRAINT ck_model_responses_slot,
    DROP CONSTRAINT ck_model_responses_slot_role,
    DROP CONSTRAINT ck_model_responses_stale;

ALTER TABLE model_responses
    ADD CONSTRAINT ck_model_responses_slot
        CHECK (slot IN ('base-1', 'base-2', 'base-3', 'consolidator')),
    ADD CONSTRAINT ck_model_responses_slot_role
        CHECK (
            (slot IN ('base-1', 'base-2', 'base-3') AND role = 'base')
            OR (slot = 'consolidator' AND role = 'consolidator')
        ),
    ADD CONSTRAINT ck_model_responses_stale
        CHECK (
            NOT is_stale
            OR (
                slot = 'consolidator'
                AND content IS NOT NULL
                AND length(btrim(content)) > 0
            )
        );

--rollback ALTER TABLE model_responses DROP CONSTRAINT ck_model_responses_slot, DROP CONSTRAINT ck_model_responses_slot_role, DROP CONSTRAINT ck_model_responses_stale;
--rollback ALTER TABLE model_responses ADD CONSTRAINT ck_model_responses_slot CHECK (slot IN ('openai', 'google', 'minimax', 'qwen')), ADD CONSTRAINT ck_model_responses_slot_role CHECK ((slot IN ('openai', 'google', 'minimax') AND role = 'base') OR (slot = 'qwen' AND role = 'consolidator')), ADD CONSTRAINT ck_model_responses_stale CHECK (NOT is_stale OR (slot = 'qwen' AND content IS NOT NULL AND length(btrim(content)) > 0));
