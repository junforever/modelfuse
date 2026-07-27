# Consolidation Evaluation Contract

## Scope

SC-005 uses one versioned JSON fixture with at most five cases. It is an
acceptance check for Qwen consolidation, not a ranking or scoring framework.

Target implementation path:

`apps/backend/src/services/conversations/__tests__/fixtures/consolidation-evaluation.json`

## Fixture Shape

```json
{
  "version": 1,
  "cases": [
    {
      "id": "complementary-facts",
      "prompt": "Pregunta del caso",
      "baseResponses": {
        "openai": "Respuesta OpenAI",
        "google": "Respuesta Google",
        "minimax": "Respuesta MiniMax"
      },
      "missingSlots": [],
      "checks": [
        {"type": "includes", "pattern": "hecho observable"},
        {"type": "excludes", "pattern": "contradicción concreta"},
        {"type": "no_duplicate_paragraphs"}
      ]
    }
  ]
}
```

Rules:

- `cases.length` must be between 1 and 5.
- Each case has at least one check.
- `includes` and `excludes` use case-insensitive regular expressions declared in
  the fixture.
- `no_duplicate_paragraphs` normalizes whitespace/case and fails when an identical
  non-empty paragraph appears more than once.
- Checks inspect only the Qwen response string.
- The fixture contains no credentials or production conversation data.

## Execution

An explicit acceptance command:

1. validates fixture shape;
2. invokes the configured Qwen adapter once per case;
3. executes every declared check;
4. prints passed/total checks and failing case/check ids;
5. exits non-zero when the overall pass rate is below 90%.

This command is separate from default unit/integration tests because it makes up
to five real provider calls. No historical results, rankings or dashboards are
persisted.
