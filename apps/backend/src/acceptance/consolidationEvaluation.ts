import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { createFakeLlmProviders } from '../test/fakes/fakeLlmProvider.js';

const THRESHOLD_PERCENT = 90;
const BASE_SLOTS = ['base-1', 'base-2', 'base-3'] as const;
const fixtureUrl = new URL(
  '../services/conversations/__tests__/fixtures/consolidation-evaluation.json',
  import.meta.url,
);

const checkSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('includes'), pattern: z.string().trim().min(1) }).strict(),
  z.object({ type: z.literal('excludes'), pattern: z.string().trim().min(1) }).strict(),
  z.object({ type: z.literal('no_duplicate_paragraphs') }).strict(),
]);

const caseSchema = z.object({
  id: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  baseResponses: z.object({
    'base-1': z.string().trim().min(1),
    'base-2': z.string().trim().min(1),
    'base-3': z.string().trim().min(1),
  }).strict(),
  missingSlots: z.array(z.enum(BASE_SLOTS)).max(BASE_SLOTS.length)
    .refine(slots => new Set(slots).size === slots.length, 'missingSlots must be unique'),
  checks: z.array(checkSchema).min(1),
}).strict();

const fixtureSchema = z.object({
  version: z.literal(1),
  cases: z.array(caseSchema).min(1).max(5)
    .refine(cases => new Set(cases.map(testCase => testCase.id)).size === cases.length, 'case IDs must be unique'),
}).strict();

type EvaluationCase = z.infer<typeof caseSchema>;
type Check = z.infer<typeof checkSchema>;

function checkResponse(content: string, check: Check): boolean {
  const normalizedContent = content.toLowerCase();
  if (check.type === 'includes') return normalizedContent.includes(check.pattern.toLowerCase());
  if (check.type === 'excludes') return !normalizedContent.includes(check.pattern.toLowerCase());

  const paragraphs = content
    .split(/\r?\n\s*\r?\n/)
    .map(paragraph => paragraph.replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean);
  return new Set(paragraphs).size === paragraphs.length;
}

async function consolidate(testCase: EvaluationCase): Promise<string> {
  const available = BASE_SLOTS.filter(slot => !testCase.missingSlots.includes(slot));
  const fakeContent = available.map(slot => testCase.baseResponses[slot]).join('\n\n');
  const consolidator = createFakeLlmProviders({ consolidator: { content: fakeContent } }).consolidator;
  const result = await consolidator.generate({
    operationId: `consolidation-evaluation-${testCase.id}`,
    slot: 'consolidator',
    messages: [
      {
        role: 'system',
        content: 'Consolidate only the available answers. Do not recover missing slots.',
      },
      {
        role: 'user',
        content: [
          `Prompt:\n${testCase.prompt}`,
          ...available.map(slot => `${slot}:\n${testCase.baseResponses[slot]}`),
          `Missing slots: ${testCase.missingSlots.join(', ') || 'none'}`,
        ].join('\n\n'),
      },
    ],
    signal: new AbortController().signal,
  });
  return result.content;
}

async function main(): Promise<void> {
  const fixture = fixtureSchema.parse(JSON.parse(await readFile(fixtureUrl, 'utf8')));
  let total = 0;
  let passed = 0;
  const failedCaseIds = new Set<string>();

  for (const testCase of fixture.cases) {
    const content = await consolidate(testCase);
    for (const check of testCase.checks) {
      total += 1;
      if (checkResponse(content, check)) passed += 1;
      else failedCaseIds.add(testCase.id);
    }
  }

  const percentage = Number(((passed / total) * 100).toFixed(2));
  const status = percentage >= THRESHOLD_PERCENT ? 'pass' : 'fail';
  console.log(JSON.stringify({ total, passed, percentage, status, failedCaseIds: [...failedCaseIds] }));
  if (status === 'fail') process.exitCode = 1;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Consolidation evaluation failed.');
  process.exitCode = 1;
});
