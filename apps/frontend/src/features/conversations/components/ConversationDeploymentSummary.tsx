import { TriangleAlert } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip';

import type { DeploymentSummaryTuple } from '../types/conversation';
import { RESPONSE_SLOT_LABELS } from '../types/conversation';

const WEB_SEARCH_UNSUPPORTED_MESSAGE = 'La búsqueda web no está soportada por este modelo.';

export function WebSearchUnsupportedWarning() {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={WEB_SEARCH_UNSUPPORTED_MESSAGE}
        className="inline-flex shrink-0 rounded-sm text-yellow-500 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <TriangleAlert aria-hidden="true" className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{WEB_SEARCH_UNSUPPORTED_MESSAGE}</TooltipContent>
    </Tooltip>
  );
}

export function ConversationDeploymentSummary({
  deployments,
  webSearchEnabled,
}: {
  readonly deployments: DeploymentSummaryTuple;
  readonly webSearchEnabled: boolean;
}) {
  return (
    <TooltipProvider>
      <section aria-labelledby="conversation-deployments-title" className="grid gap-3">
        <h2 id="conversation-deployments-title" className="text-sm font-medium">
          Deployments de la conversación
        </h2>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {deployments.map(deployment => (
            <div key={deployment.slot} className="rounded-xl border bg-card p-3">
              <dt className="text-xs font-medium text-muted-foreground">
                {RESPONSE_SLOT_LABELS[deployment.slot]}
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm text-card-foreground">
                <span>{deployment.displayName}</span>
                {webSearchEnabled && !deployment.supportsWebSearch && (
                  <WebSearchUnsupportedWarning />
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </TooltipProvider>
  );
}
