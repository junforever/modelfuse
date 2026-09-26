--liquibase formatted sql

--changeset modelfuse:005-upgrade-direct-web-search-capabilities
ALTER TABLE conversation_deployments
    DISABLE TRIGGER trg_conversation_deployments_reject_update;

UPDATE conversation_deployments
SET supports_web_search = true
WHERE deployment_id IN ('openai-5.6-sol', 'kimi-k3');

ALTER TABLE conversation_deployments
    ENABLE TRIGGER trg_conversation_deployments_reject_update;

--rollback ALTER TABLE conversation_deployments DISABLE TRIGGER trg_conversation_deployments_reject_update;
--rollback UPDATE conversation_deployments SET supports_web_search = false WHERE deployment_id IN ('openai-5.6-sol', 'kimi-k3');
--rollback ALTER TABLE conversation_deployments ENABLE TRIGGER trg_conversation_deployments_reject_update;
