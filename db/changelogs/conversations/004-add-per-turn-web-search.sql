--liquibase formatted sql

--changeset modelfuse:004-add-turn-web-search-enabled
ALTER TABLE turns
    ADD COLUMN web_search_enabled boolean NOT NULL DEFAULT false;

--rollback ALTER TABLE turns DROP COLUMN web_search_enabled;

--changeset modelfuse:004-add-conversation-deployment-web-search-capability
ALTER TABLE conversation_deployments
    ADD COLUMN supports_web_search boolean NOT NULL DEFAULT false;

ALTER TABLE conversation_deployments
    ALTER COLUMN supports_web_search DROP DEFAULT;

--rollback ALTER TABLE conversation_deployments DROP COLUMN supports_web_search;
