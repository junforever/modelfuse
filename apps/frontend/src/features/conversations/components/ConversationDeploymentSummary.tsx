import type { DeploymentSummaryTuple } from '../types/conversation';
import { RESPONSE_SLOT_LABELS } from '../types/conversation';

export function ConversationDeploymentSummary({
  deployments,
}: {
  readonly deployments: DeploymentSummaryTuple;
}) {
  return (
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
            <dd className="mt-1 text-sm text-card-foreground">{deployment.displayName}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
