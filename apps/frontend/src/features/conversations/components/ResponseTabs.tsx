import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

import type { ResponseSlot, TurnResponses } from '../types/conversation';
import { ResponsePanel } from './ResponsePanel';

const MODEL_LABELS: Record<ResponseSlot, string> = {
  openai: 'OpenAI',
  google: 'Google',
  minimax: 'MiniMax',
  qwen: 'Qwen',
};

interface ResponseTabsProps {
  readonly responses: TurnResponses;
  readonly runtimeStages: Partial<Record<ResponseSlot, string>>;
  readonly hasWorkInProgress: boolean;
  readonly onRetry: (slot: ResponseSlot) => void;
  readonly onContinueWithout: (slot: ResponseSlot) => void;
}

export function ResponseTabs({
  responses,
  runtimeStages,
  hasWorkInProgress,
  onRetry,
  onContinueWithout,
}: ResponseTabsProps) {
  return (
    <Tabs defaultValue="openai">
      <TabsList aria-label="Respuestas de modelos">
        {responses.map(response => (
          <TabsTrigger key={response.slot} value={response.slot}>
            {MODEL_LABELS[response.slot]}
          </TabsTrigger>
        ))}
      </TabsList>
      {responses.map(response => (
        <TabsContent key={response.slot} value={response.slot} className="rounded-xl border p-4">
          <ResponsePanel
            response={response}
            modelLabel={MODEL_LABELS[response.slot]}
            runtimeStage={runtimeStages[response.slot]}
            hasWorkInProgress={hasWorkInProgress}
            onRetry={onRetry}
            onContinueWithout={onContinueWithout}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
