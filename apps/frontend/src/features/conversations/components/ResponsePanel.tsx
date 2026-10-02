import { useId, useState } from 'react';

import { Button } from '@workspace/ui/components/button';

import { type ModelResponse, type ResponseSlot } from '../types/conversation';
import { responseFailureMessage } from '../utils/responseFailure';
import { CollapsibleHistoryMessage } from './CollapsibleHistoryMessage';
import { ContinueWithoutDialog } from './ContinueWithoutDialog';

interface ResponsePanelProps {
  readonly response: ModelResponse;
  readonly responseLabel: string;
  readonly runtimeStage?: string;
  readonly hasWorkInProgress: boolean;
  readonly collapseThreshold?: number;
  readonly onRetry: (slot: ResponseSlot) => void;
  readonly onContinueWithout: (slot: ResponseSlot) => void;
}

export function ResponsePanel({
  response,
  responseLabel,
  runtimeStage,
  hasWorkInProgress,
  collapseThreshold,
  onRetry,
  onContinueWithout,
}: ResponsePanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const errorId = useId();

  if (response.status === 'completed') {
    if (!response.content?.trim()) return null;

    return (
      <div className="grid gap-3">
        {response.isStale && (
          <p className="text-sm text-muted-foreground">Consolidación pendiente</p>
        )}
        <CollapsibleHistoryMessage
          content={response.content}
          threshold={collapseThreshold}
          renderMarkdown
          showCopyAction
        />
      </div>
    );
  }

  if (response.status !== 'failed') {
    return (
      <p
        className="motion-safe:animate-response-shimmer bg-linear-to-r from-blue-800 via-amber-600 to-blue-800 bg-size-[200%_100%] bg-clip-text text-transparent dark:from-blue-300 dark:via-violet-600 dark:to-blue-300"
        role="status"
      >
        {runtimeStage ?? (response.status === 'pending' ? 'En espera…' : 'Generando respuesta…')}
      </p>
    );
  }

  if (response.continuedWithout) {
    return <p>Se continuó sin {responseLabel} de forma permanente.</p>;
  }

  const canContinueWithout = response.slot !== 'consolidator';

  return (
    <div className="grid gap-4">
      <p id={errorId} role="alert" className="text-destructive">
        {responseFailureMessage(response)}
      </p>
      <div className="flex flex-wrap gap-2">
        {response.recoverable && (
          <Button
            variant="outline"
            disabled={hasWorkInProgress}
            aria-describedby={errorId}
            onClick={() => onRetry(response.slot)}
          >
            Reintentar {responseLabel}
          </Button>
        )}
        {canContinueWithout && (
          <Button
            variant="destructive"
            aria-describedby={errorId}
            onClick={() => setConfirmOpen(true)}
          >
            Continuar sin {responseLabel}
          </Button>
        )}
      </div>
      {canContinueWithout && (
        <ContinueWithoutDialog
          modelLabel={responseLabel}
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          onConfirm={() => onContinueWithout(response.slot)}
        />
      )}
    </div>
  );
}
