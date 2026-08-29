--liquibase formatted sql

--changeset modelfuse:003-make-conversation-deployment-max-output-optional
ALTER TABLE conversation_deployments
    ALTER COLUMN max_output_tokens DROP NOT NULL;

--rollback ALTER TABLE conversation_deployments ALTER COLUMN max_output_tokens SET NOT NULL;
