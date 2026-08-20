import type { DeploymentSummaryTuple, ResponseSlot, Turn } from '../types/conversation';
import { CollapsibleHistoryMessage } from './CollapsibleHistoryMessage';
import { ContextWindowNotice } from './ContextWindowNotice';
import { ResponseTabs } from './ResponseTabs';

interface TurnCardProps {
  readonly deployments: DeploymentSummaryTuple;
  readonly turn: Turn;
  readonly hasWorkInProgress: boolean;
  readonly runtimeStages: Partial<Record<ResponseSlot, string>>;
  readonly collapseThreshold?: number;
  readonly onRetry: (slot: ResponseSlot) => void;
  readonly onContinueWithout: (slot: ResponseSlot) => void;
}

export function TurnCard({
  deployments,
  turn,
  hasWorkInProgress,
  runtimeStages,
  collapseThreshold,
  onRetry,
  onContinueWithout,
}: TurnCardProps) {
  const headingId = `turn-${turn.id}-heading`;
  const contextWindow = turn.responses.find(response => response.metadata?.contextWindow?.truncated)
    ?.metadata?.contextWindow;

  return (
    <article aria-labelledby={headingId} className="grid gap-4 rounded-2xl border bg-card p-4">
      <header className="grid gap-1">
        <h2 id={headingId} className="text-sm font-medium text-muted-foreground">
          Turno {turn.ordinal}
        </h2>
        <div className="text-base text-card-foreground">
          <CollapsibleHistoryMessage content={turn.prompt} threshold={collapseThreshold} />
        </div>
      </header>
      <ContextWindowNotice contextWindow={contextWindow} />
      <ResponseTabs
        deployments={deployments}
        responses={turn.responses}
        runtimeStages={runtimeStages}
        collapseThreshold={collapseThreshold}
        hasWorkInProgress={hasWorkInProgress}
        onRetry={onRetry}
        onContinueWithout={onContinueWithout}
      />
    </article>
  );
}
