\set ON_ERROR_STOP on

\if :{?expect_schema}
\else
  \set expect_schema present
\endif

SELECT :'expect_schema' = 'absent' AS expect_absent \gset

\if :expect_absent
DO $$
BEGIN
  IF to_regclass('public.conversations') IS NOT NULL
     OR to_regclass('public.turns') IS NOT NULL
     OR to_regclass('public.model_responses') IS NOT NULL THEN
    RAISE EXCEPTION 'ModelFuse tables remain after rollback';
  END IF;
END
$$;
\else
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(name, ', ' ORDER BY name)
  INTO missing
  FROM unnest(ARRAY['conversations', 'turns', 'model_responses']) AS name
  WHERE to_regclass('public.' || name) IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing ModelFuse tables: %', missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'conversations'
      AND column_name = 'title'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION 'conversations.title must be text';
  END IF;

  SELECT string_agg(name, ', ' ORDER BY name)
  INTO missing
  FROM unnest(ARRAY[
    'uq_conversations_create_client_request_id',
    'uq_turns_conversation_client_request',
    'uq_turns_conversation_ordinal',
    'uq_model_responses_turn_slot'
  ]) AS name
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = name AND contype = 'u'
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing unique constraints: %', missing;
  END IF;

  SELECT string_agg(name, ', ' ORDER BY name)
  INTO missing
  FROM unnest(ARRAY[
    'ck_turns_ordinal_positive',
    'ck_turns_user_content_not_blank',
    'ck_turns_status',
    'ck_model_responses_slot',
    'ck_model_responses_role',
    'ck_model_responses_slot_role',
    'ck_model_responses_status',
    'ck_model_responses_completed_content',
    'ck_model_responses_failed_error',
    'ck_model_responses_continued_without',
    'ck_model_responses_stale',
    'ck_model_responses_attempt_no'
  ]) AS name
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = name AND contype = 'c'
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing check constraints: %', missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_turns_conversation' AND contype = 'f' AND confdeltype = 'c'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_model_responses_turn' AND contype = 'f' AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'Both foreign keys must use ON DELETE CASCADE';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.turns'::regclass
      AND i.indisunique
      AND i.indpred IS NOT NULL
      AND pg_get_indexdef(i.indexrelid) LIKE '%(conversation_id)%'
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%pending%'
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%running%'
  ) THEN
    RAISE EXCEPTION 'Missing partial unique index for active turn';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    WHERE i.indrelid = 'public.model_responses'::regclass
      AND NOT i.indisunique
      AND i.indpred IS NOT NULL
      AND pg_get_indexdef(i.indexrelid) LIKE '%(turn_id)%'
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%pending%'
      AND pg_get_expr(i.indpred, i.indrelid) LIKE '%running%'
  ) THEN
    RAISE EXCEPTION 'Missing partial index for active model responses';
  END IF;
END
$$;

BEGIN;

CREATE FUNCTION pg_temp.expect_unique(statement text, label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'Expected unique violation: %', label;
EXCEPTION
  WHEN unique_violation THEN NULL;
END
$$;

CREATE FUNCTION pg_temp.expect_check(statement text, label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'Expected check violation: %', label;
EXCEPTION
  WHEN check_violation THEN NULL;
END
$$;

INSERT INTO conversations (id, create_client_request_id, title, updated_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'Schema validation',
  now()
);

INSERT INTO turns (
  id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at
)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  1,
  'Prompt',
  'completed',
  now(),
  now()
), (
  '20000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  2,
  'Active prompt',
  'pending',
  now(),
  now()
);

INSERT INTO model_responses (
  id, turn_id, slot, role, provider, model, status, error_recoverable,
  is_stale, attempt_no, metadata, created_at, updated_at
)
VALUES (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'openai', 'base', 'openai', 'test-model', 'pending', false,
  false, 0, '{}'::jsonb, now(), now()
);

SELECT pg_temp.expect_unique($sql$
  INSERT INTO conversations (id, create_client_request_id, title, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000002',
          '10000000-0000-0000-0000-000000000001', 'Duplicate', now())
$sql$, 'conversation create request');

SELECT pg_temp.expect_unique($sql$
  INSERT INTO turns (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000003',
          '00000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000001', 3, 'Duplicate request', 'completed', now(), now())
$sql$, 'turn client request');

SELECT pg_temp.expect_unique($sql$
  INSERT INTO turns (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000004',
          '00000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000004', 1, 'Duplicate ordinal', 'completed', now(), now())
$sql$, 'turn ordinal');

SELECT pg_temp.expect_unique($sql$
  INSERT INTO turns (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000005',
          '00000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000005', 5, 'Second active turn', 'running', now(), now())
$sql$, 'one active turn per conversation');

SELECT pg_temp.expect_unique($sql$
  INSERT INTO model_responses (id, turn_id, slot, role, provider, model, status, error_recoverable, is_stale, attempt_no, created_at, updated_at)
  VALUES ('40000000-0000-0000-0000-000000000002',
          '20000000-0000-0000-0000-000000000001',
          'openai', 'base', 'openai', 'test-model', 'pending', false, false, 0, now(), now())
$sql$, 'one response per turn and slot');

SELECT pg_temp.expect_check($sql$
  INSERT INTO turns (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000006',
          '00000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000006', 0, 'Prompt', 'completed', now(), now())
$sql$, 'positive turn ordinal');

SELECT pg_temp.expect_check($sql$
  INSERT INTO turns (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000007',
          '00000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000007', 7, ' ', 'completed', now(), now())
$sql$, 'nonblank turn content');

SELECT pg_temp.expect_check($sql$
  INSERT INTO turns (id, conversation_id, client_request_id, ordinal, user_content, status, created_at, updated_at)
  VALUES ('20000000-0000-0000-0000-000000000008',
          '00000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000008', 8, 'Prompt', 'invalid', now(), now())
$sql$, 'turn status');

SELECT pg_temp.expect_check(format($sql$
  INSERT INTO model_responses (id, turn_id, slot, role, provider, model, status, content, error_code,
    error_recoverable, continued_without_at, is_stale, attempt_no, created_at, updated_at)
  VALUES (%L, '20000000-0000-0000-0000-000000000002', %L, %L, 'provider', 'model', %L, %L, %L,
    false, %s, %s, %s, now(), now())
$sql$, id, slot, role, status, content, error_code, continued_without_at, is_stale, attempt_no), label)
FROM (VALUES
  ('50000000-0000-0000-0000-000000000001', 'invalid', 'base', 'pending', NULL, NULL, 'NULL', 'false', 0, 'response slot'),
  ('50000000-0000-0000-0000-000000000002', 'google', 'invalid', 'pending', NULL, NULL, 'NULL', 'false', 0, 'response role'),
  ('50000000-0000-0000-0000-000000000003', 'openai', 'consolidator', 'pending', NULL, NULL, 'NULL', 'false', 0, 'slot and role consistency'),
  ('50000000-0000-0000-0000-000000000004', 'google', 'base', 'invalid', NULL, NULL, 'NULL', 'false', 0, 'response status'),
  ('50000000-0000-0000-0000-000000000005', 'google', 'base', 'completed', ' ', NULL, 'NULL', 'false', 0, 'completed content'),
  ('50000000-0000-0000-0000-000000000006', 'google', 'base', 'failed', NULL, NULL, 'NULL', 'false', 0, 'failed error code'),
  ('50000000-0000-0000-0000-000000000007', 'google', 'base', 'pending', NULL, NULL, 'now()', 'false', 0, 'continue without state'),
  ('50000000-0000-0000-0000-000000000008', 'google', 'base', 'pending', 'prior', NULL, 'NULL', 'true', 0, 'stale response'),
  ('50000000-0000-0000-0000-000000000009', 'google', 'base', 'pending', NULL, NULL, 'NULL', 'false', -1, 'attempt number')
) AS invalid(id, slot, role, status, content, error_code, continued_without_at, is_stale, attempt_no, label);

DELETE FROM conversations
WHERE id = '00000000-0000-0000-0000-000000000001';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM turns
    WHERE conversation_id = '00000000-0000-0000-0000-000000000001'
  ) OR EXISTS (
    SELECT 1 FROM model_responses
    WHERE turn_id IN (
      '20000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002'
    )
  ) THEN
    RAISE EXCEPTION 'Cascade delete did not remove turns and model responses';
  END IF;
END
$$;

ROLLBACK;
\endif
