import { z } from 'zod';

import { RESPONSE_SLOTS } from '../../types/conversations.js';
import {
  countTitleGraphemes,
  TITLE_MAX_GRAPHEMES,
} from '../../utils/titleGraphemes.js';

const uuidSchema = z.uuid({ error: 'Must be a valid UUID.' });
const cursorSchema = z
  .string()
  .min(1, { error: 'Cursor is required.' })
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'Must be a valid base64url cursor.' });
const promptSchema = z
  .string()
  .refine((prompt) => prompt.trim().length > 0, { error: 'Prompt must not be empty.' });

export const createTurnBodySchema = z.strictObject({
  clientRequestId: uuidSchema,
  prompt: promptSchema,
});

export const createConversationBodySchema = createTurnBodySchema;

export const conversationIdParamsSchema = z.strictObject({
  conversationId: uuidSchema,
});

export const turnIdParamsSchema = z.strictObject({
  conversationId: uuidSchema,
  turnId: uuidSchema,
});

export const responseSlotParamsSchema = z.strictObject({
  conversationId: uuidSchema,
  turnId: uuidSchema,
  slot: z.enum(RESPONSE_SLOTS, { error: 'Must be a contracted response slot.' }),
});

export const listConversationsQuerySchema = z.strictObject({
  cursor: cursorSchema.optional(),
});

export const listTurnsQuerySchema = z.strictObject({
  before: cursorSchema.optional(),
});

export const renameConversationBodySchema = z.strictObject({
  title: z
    .string()
    .transform((title) => title.trim())
    .refine((title) => countTitleGraphemes(title) >= 1, {
      error: 'Title must not be empty.',
    })
    .refine((title) => countTitleGraphemes(title) <= TITLE_MAX_GRAPHEMES, {
      error: `Title must contain at most ${TITLE_MAX_GRAPHEMES} grapheme clusters.`,
    }),
});

export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;
export type CreateTurnBody = z.infer<typeof createTurnBodySchema>;
export type RenameConversationBody = z.infer<typeof renameConversationBodySchema>;
