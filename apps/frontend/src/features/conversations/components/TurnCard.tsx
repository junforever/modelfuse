import type { ResponseSlot, Turn } from '../types/conversation';
import { ResponseTabs } from './ResponseTabs';

interface TurnCardProps {
  readonly turn: Turn;
  readonly hasWorkInProgress: boolean;
  readonly runtimeStages: Partial<Record<ResponseSlot, string>>;
  readonly onRetry: (slot: ResponseSlot) => void;
  readonly onContinueWithout: (slot: ResponseSlot) => void;
}

export function TurnCard({
  turn,
  hasWorkInProgress,
  runtimeStages,
  onRetry,
  onContinueWithout,
}: TurnCardProps) {
  const headingId = `turn-${turn.id}-heading`;

  return (
    <article aria-labelledby={headingId} className="grid gap-4 rounded-2xl border bg-card p-4">
      <header className="grid gap-1">
        <h2 id={headingId} className="text-sm font-medium text-muted-foreground">
          Turno {turn.ordinal}
        </h2>
        <p className="text-base whitespace-pre-wrap text-card-foreground">{turn.prompt}</p>
      </header>
      <ResponseTabs
        responses={turn.responses}
        runtimeStages={runtimeStages}
        hasWorkInProgress={hasWorkInProgress}
        onRetry={onRetry}
        onContinueWithout={onContinueWithout}
      />
    </article>
  );
}
