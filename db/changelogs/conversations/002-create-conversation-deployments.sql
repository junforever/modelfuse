--liquibase formatted sql

--changeset modelfuse:002-create-conversation-deployments-table
CREATE TABLE conversation_deployments (
    conversation_id uuid NOT NULL,
    slot varchar(16) NOT NULL,
    deployment_id varchar(128) NOT NULL,
    provider_id varchar(32) NOT NULL,
    model_id varchar(256) NOT NULL,
    display_name varchar(128) NOT NULL,
    context_limit_tokens integer NOT NULL,
    max_output_tokens integer NOT NULL,
    input_modalities text[] NOT NULL,
    output_modalities text[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_conversation_deployments PRIMARY KEY (conversation_id, slot),
    CONSTRAINT uq_conversation_deployments_conversation_deployment
        UNIQUE (conversation_id, deployment_id),
    CONSTRAINT fk_conversation_deployments_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
    CONSTRAINT ck_conversation_deployments_slot
        CHECK (slot IN ('base-1', 'base-2', 'base-3', 'consolidator')),
    CONSTRAINT ck_conversation_deployments_deployment_id_not_blank
        CHECK (btrim(deployment_id) <> ''),
    CONSTRAINT ck_conversation_deployments_provider_id_not_blank
        CHECK (btrim(provider_id) <> ''),
    CONSTRAINT ck_conversation_deployments_model_id_not_blank
        CHECK (btrim(model_id) <> ''),
    CONSTRAINT ck_conversation_deployments_display_name_not_blank
        CHECK (btrim(display_name) <> ''),
    CONSTRAINT ck_conversation_deployments_context_limit_positive
        CHECK (context_limit_tokens > 0),
    CONSTRAINT ck_conversation_deployments_max_output_positive
        CHECK (max_output_tokens > 0),
    CONSTRAINT ck_conversation_deployments_input_modalities_not_empty
        CHECK (cardinality(input_modalities) > 0),
    CONSTRAINT ck_conversation_deployments_output_modalities_not_empty
        CHECK (cardinality(output_modalities) > 0),
    CONSTRAINT ck_conversation_deployments_timestamps_equal
        CHECK (created_at = updated_at)
);

--rollback DROP TABLE conversation_deployments;

--changeset modelfuse:002-reject-conversation-deployment-updates splitStatements:false
CREATE FUNCTION reject_conversation_deployment_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'conversation deployments are immutable';
END;
$$;

--rollback DROP FUNCTION reject_conversation_deployment_update();

--changeset modelfuse:002-create-conversation-deployment-update-trigger
CREATE TRIGGER trg_conversation_deployments_reject_update
    BEFORE UPDATE ON conversation_deployments
    FOR EACH ROW
    EXECUTE FUNCTION reject_conversation_deployment_update();

--rollback DROP TRIGGER trg_conversation_deployments_reject_update ON conversation_deployments;
