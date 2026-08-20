import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

import type { ResponseSlot, TurnResponses } from '../types/conversation';
import { ResponsePanel } from './ResponsePanel';

const MODEL_LABELS: Record<ResponseSlot, string> = {
  'base-1': 'Base 1',
  'base-2': 'Base 2',
  'base-3': 'Base 3',
  consolidator: 'Consolidador',
};

interface ResponseTabsProps {
  readonly responses: TurnResponses;
  readonly runtimeStages: Partial<Record<ResponseSlot, string>>;
  readonly hasWorkInProgress: boolean;
  readonly collapseThreshold?: number;
  readonly onRetry: (slot: ResponseSlot) => void;
  readonly onContinueWithout: (slot: ResponseSlot) => void;
}

export function ResponseTabs({
  responses,
  runtimeStages,
  hasWorkInProgress,
  collapseThreshold,
  onRetry,
  onContinueWithout,
}: ResponseTabsProps) {
  return (
    <Tabs defaultValue="base-1">
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
            collapseThreshold={collapseThreshold}
            onRetry={onRetry}
            onContinueWithout={onContinueWithout}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
