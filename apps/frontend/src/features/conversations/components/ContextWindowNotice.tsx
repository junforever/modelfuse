import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';

import type { ContextWindowMetadata } from '../types/conversation';

interface ContextWindowNoticeProps {
  readonly contextWindow?: ContextWindowMetadata;
}

export function ContextWindowNotice({ contextWindow }: ContextWindowNoticeProps) {
  if (!contextWindow?.truncated) return null;

  return (
    <Alert role="status" aria-live="polite">
      <AlertTitle>Ventana acotada del contexto</AlertTitle>
      <AlertDescription>
        Se usó solo el historial relevante disponible para responder este turno.
      </AlertDescription>
    </Alert>
  );
}
