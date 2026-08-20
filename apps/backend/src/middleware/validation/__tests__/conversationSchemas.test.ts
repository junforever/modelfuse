import { describe, expect, it } from 'vitest';

import {
  conversationIdParamsSchema,
  createConversationBodySchema,
  createTurnBodySchema,
  listConversationsQuerySchema,
  listTurnsQuerySchema,
  renameConversationBodySchema,
  responseSlotParamsSchema,
  turnIdParamsSchema,
} from '../conversationSchemas.js';

const conversationId = '123e4567-e89b-42d3-a456-426614174000';
const turnId = '223e4567-e89b-42d3-a456-426614174000';
const clientRequestId = '323e4567-e89b-42d3-a456-426614174000';

describe('conversation request schemas', () => {
  it('rejects malformed creation IDs and empty prompts for both creation endpoints', () => {
    const schemas = [createConversationBodySchema, createTurnBodySchema];

    for (const schema of schemas) {
      expect(schema.safeParse({ clientRequestId: 'not-a-uuid', prompt: 'Hello' }).success).toBe(false);
      expect(schema.safeParse({ clientRequestId, prompt: '' }).success).toBe(false);
      expect(schema.safeParse({ clientRequestId, prompt: '   ' }).success).toBe(false);
      expect(schema.safeParse({ clientRequestId, prompt: 'Hello' }).success).toBe(true);
    }
  });

  it('accepts only UUID route IDs and the four contracted response slots', () => {
    expect(conversationIdParamsSchema.safeParse({ conversationId }).success).toBe(true);
    expect(conversationIdParamsSchema.safeParse({ conversationId: 'invalid' }).success).toBe(false);

    expect(turnIdParamsSchema.safeParse({ conversationId, turnId }).success).toBe(true);
    expect(turnIdParamsSchema.safeParse({ conversationId, turnId: 'invalid' }).success).toBe(false);
    expect(turnIdParamsSchema.safeParse({ conversationId: 'invalid', turnId }).success).toBe(false);

    for (const slot of ['base-1', 'base-2', 'base-3', 'consolidator']) {
      expect(responseSlotParamsSchema.safeParse({ conversationId, turnId, slot }).success).toBe(true);
    }

    for (const slot of ['openai', 'google', 'minimax', 'qwen', 'unknown']) {
      expect(responseSlotParamsSchema.safeParse({ conversationId, turnId, slot }).success).toBe(false);
    }
  });

  it('accepts only a complete strict four-slot deployment assignment', () => {
    const deploymentIds = {
      'base-1': 'deployment-1',
      'base-2': 'deployment-2',
      'base-3': 'deployment-3',
      consolidator: 'deployment-4',
    };
    const request = { clientRequestId, prompt: 'Compare this', deploymentIds };

    expect(createConversationBodySchema.parse(request)).toEqual(request);

    const invalidAssignments = [
      { ...deploymentIds, 'base-1': undefined },
      { ...deploymentIds, extra: 'deployment-5' },
      { ...deploymentIds, 'base-2': '' },
      { ...deploymentIds, 'base-3': '   ' },
      { ...deploymentIds, consolidator: null },
      { ...deploymentIds, openai: 'legacy-deployment' },
    ];
    for (const invalid of invalidAssignments) {
      expect(createConversationBodySchema.safeParse({ ...request, deploymentIds: invalid }).success)
        .toBe(false);
    }
  });

  it('accepts omitted or base64url cursors and rejects malformed cursor values', () => {
    const validCursor = 'eyJvcmRpbmFsIjozfQ';

    expect(listConversationsQuerySchema.safeParse({}).success).toBe(true);
    expect(listConversationsQuerySchema.safeParse({ cursor: validCursor }).success).toBe(true);
    expect(listTurnsQuerySchema.safeParse({}).success).toBe(true);
    expect(listTurnsQuerySchema.safeParse({ before: validCursor }).success).toBe(true);

    for (const cursor of ['', '   ', '*not-base64url*', 123]) {
      expect(listConversationsQuerySchema.safeParse({ cursor }).success).toBe(false);
      expect(listTurnsQuerySchema.safeParse({ before: cursor }).success).toBe(false);
    }
  });

  it('counts emoji and combining characters by grapheme and canonicalizes title whitespace', () => {
    const singleGraphemes = ['👍', '👨‍👩‍👧‍👦', 'e\u0301'];

    for (const grapheme of singleGraphemes) {
      const eightyGraphemes = grapheme.repeat(80);
      const eightyOneGraphemes = grapheme.repeat(81);

      expect(renameConversationBodySchema.parse({ title: `  ${eightyGraphemes}  ` })).toEqual({
        title: eightyGraphemes,
      });
      expect(renameConversationBodySchema.safeParse({ title: eightyOneGraphemes }).success).toBe(
        false,
      );
    }
  });

  it('preserves valid Unicode and literal special characters after trim without normalization', () => {
    const validTitles = [
      'Simple ASCII',
      'Español 😀',
      'Equipo 👩‍💻',
      'ASCII + 漢字 + 🧑‍🚀',
      `Comillas "dobles" y 'simples'`,
      '< >',
      '<strong>HTML literal</strong>',
    ];

    for (const title of validTitles) {
      expect(renameConversationBodySchema.parse({ title: `  ${title}  ` })).toEqual({ title });
    }
  });
});
