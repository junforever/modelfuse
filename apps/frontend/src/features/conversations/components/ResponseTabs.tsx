import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';

import { RESPONSE_SLOT_LABELS } from '../types/conversation';
import type { DeploymentSummaryTuple, ResponseSlot, TurnResponses } from '../types/conversation';
import { ResponsePanel } from './ResponsePanel';

interface ResponseTabsProps {
  readonly deployments: DeploymentSummaryTuple;
  readonly responses: TurnResponses;
  readonly runtimeStages: Partial<Record<ResponseSlot, string>>;
  readonly hasWorkInProgress: boolean;
  readonly collapseThreshold?: number;
  readonly onRetry: (slot: ResponseSlot) => void;
  readonly onContinueWithout: (slot: ResponseSlot) => void;
}

export function ResponseTabs({
  deployments,
  responses,
  runtimeStages,
  hasWorkInProgress,
  collapseThreshold,
  onRetry,
  onContinueWithout,
}: ResponseTabsProps) {
  const responseLabel = (slot: ResponseSlot) => {
    const deployment = deployments.find(item => item.slot === slot);
    return deployment
      ? `${RESPONSE_SLOT_LABELS[slot]} · ${deployment.displayName}`
      : RESPONSE_SLOT_LABELS[slot];
  };

  return (
    <Tabs defaultValue="base-1">
      <TabsList aria-label="Respuestas de modelos">
        {responses.map(response => (
          <TabsTrigger key={response.slot} value={response.slot}>
            {responseLabel(response.slot)}
          </TabsTrigger>
        ))}
      </TabsList>
      {responses.map(response => (
        <TabsContent key={response.slot} value={response.slot} className="rounded-xl border p-4">
          <ResponsePanel
            response={response}
            responseLabel={responseLabel(response.slot)}
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
