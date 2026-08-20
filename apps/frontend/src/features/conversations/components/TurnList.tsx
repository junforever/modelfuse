import type { ReactNode } from 'react';

import type { RuntimeStages } from '../hooks/useTurnEvents';
import type { DeploymentSummaryTuple, ResponseSlot, Turn } from '../types/conversation';
import { TurnCard } from './TurnCard';

interface TurnListProps {
  readonly deployments: DeploymentSummaryTuple;
  readonly turns: readonly Turn[];
  readonly activeTurnId?: string;
  readonly hasWorkInProgress: boolean;
  readonly runtimeStages?: RuntimeStages;
  readonly historyTopSentinel?: ReactNode;
  readonly collapseThreshold?: number;
  readonly onRetry: (turnId: string, slot: ResponseSlot) => void;
  readonly onContinueWithout: (turnId: string, slot: ResponseSlot) => void;
}

export function TurnList({
  deployments,
  turns,
  activeTurnId,
  hasWorkInProgress,
  runtimeStages = {},
  historyTopSentinel,
  collapseThreshold,
  onRetry,
  onContinueWithout,
}: TurnListProps) {
  return (
    <>
      {historyTopSentinel}
      <ol aria-label="Turnos de la conversación" className="grid gap-4">
        {turns.map(turn => (
          <li key={turn.id}>
            <TurnCard
              deployments={deployments}
              turn={turn}
              hasWorkInProgress={hasWorkInProgress}
              runtimeStages={turn.id === activeTurnId ? runtimeStages : {}}
              collapseThreshold={collapseThreshold}
              onRetry={slot => onRetry(turn.id, slot)}
              onContinueWithout={slot => onContinueWithout(turn.id, slot)}
            />
          </li>
        ))}
      </ol>
    </>
  );
}
