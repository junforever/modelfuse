import type { RuntimeStages } from '../hooks/useTurnEvents';
import type { ResponseSlot, Turn } from '../types/conversation';
import { TurnCard } from './TurnCard';

interface TurnListProps {
  readonly turns: readonly Turn[];
  readonly activeTurnId?: string;
  readonly hasWorkInProgress: boolean;
  readonly runtimeStages?: RuntimeStages;
  readonly onRetry: (turnId: string, slot: ResponseSlot) => void;
  readonly onContinueWithout: (turnId: string, slot: ResponseSlot) => void;
}

export function TurnList({
  turns,
  activeTurnId,
  hasWorkInProgress,
  runtimeStages = {},
  onRetry,
  onContinueWithout,
}: TurnListProps) {
  return (
    <ol aria-label="Turnos de la conversación" className="grid gap-4">
      {turns.map(turn => (
        <li key={turn.id}>
          <TurnCard
            turn={turn}
            hasWorkInProgress={hasWorkInProgress}
            runtimeStages={turn.id === activeTurnId ? runtimeStages : {}}
            onRetry={slot => onRetry(turn.id, slot)}
            onContinueWithout={slot => onContinueWithout(turn.id, slot)}
          />
        </li>
      ))}
    </ol>
  );
}
