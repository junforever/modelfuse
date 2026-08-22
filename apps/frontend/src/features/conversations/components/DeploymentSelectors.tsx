import { useId } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select';

import {
  RESPONSE_SLOTS,
  type DeploymentCatalogItem,
  type DeploymentIds,
  type ResponseSlot,
} from '../types/conversation';

const SLOT_LABELS: Readonly<Record<ResponseSlot, string>> = {
  'base-1': 'Base 1',
  'base-2': 'Base 2',
  'base-3': 'Base 3',
  consolidator: 'Consolidador',
};

const EMPTY_DEPLOYMENT_SELECTION: DeploymentIds = {
  'base-1': '',
  'base-2': '',
  'base-3': '',
  consolidator: '',
};

const DEFAULT_DEPLOYMENT_SELECTION: DeploymentIds = {
  'base-1': 'openai-5.6-sol',
  'base-2': 'gemini-3.7-flash',
  'base-3': 'openrouter-minimax-m3',
  consolidator: 'openrouter-qwen-3.8-max',
};

export function getDefaultDeploymentSelection(
  items: readonly DeploymentCatalogItem[]
): DeploymentIds {
  const availableDeploymentIds = new Set(items.map(item => item.deploymentId));
  return Object.values(DEFAULT_DEPLOYMENT_SELECTION).every(deploymentId =>
    availableDeploymentIds.has(deploymentId)
  )
    ? DEFAULT_DEPLOYMENT_SELECTION
    : EMPTY_DEPLOYMENT_SELECTION;
}

export function getDuplicateDeploymentIds(selection: DeploymentIds): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const deploymentId of Object.values(selection)) {
    if (!deploymentId) continue;
    if (seen.has(deploymentId)) duplicates.add(deploymentId);
    else seen.add(deploymentId);
  }

  return duplicates;
}

interface DeploymentSelectorsProps {
  readonly items: readonly DeploymentCatalogItem[];
  readonly selection: DeploymentIds;
  readonly isLoading: boolean;
  readonly isError?: boolean;
  readonly disabled: boolean;
  readonly onChange: (selection: DeploymentIds) => void;
}

export function DeploymentSelectors({
  items,
  selection,
  isLoading,
  isError = false,
  disabled,
  onChange,
}: DeploymentSelectorsProps) {
  const duplicateErrorId = useId();
  const availableDeploymentIds = new Set(items.map(item => item.deploymentId));
  const duplicateDeploymentIds = getDuplicateDeploymentIds(selection);
  const isEmpty = !isLoading && !isError && items.length === 0;
  const isDefaultUnavailable =
    !isLoading &&
    !isError &&
    items.length > 0 &&
    Object.values(getDefaultDeploymentSelection(items)).some(deploymentId => !deploymentId);
  const hasUnavailableSelection = RESPONSE_SLOTS.some(
    slot => selection[slot] && !availableDeploymentIds.has(selection[slot])
  );
  const selectorsDisabled = disabled || isLoading || isError || isEmpty;

  return (
    <fieldset className="grid gap-3" aria-busy={isLoading} disabled={selectorsDisabled}>
      <legend className="mb-1 text-sm font-medium">Deployments</legend>
      {isLoading && (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando deployments…
        </p>
      )}
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          No se pudo cargar el catálogo de deployments.
        </p>
      )}
      {isEmpty && (
        <p role="status" className="text-sm text-muted-foreground">
          No hay deployments disponibles.
        </p>
      )}
      {hasUnavailableSelection && !isLoading && !isError && (
        <p role="alert" className="text-sm text-destructive">
          Una selección ya no está disponible. Elige otro deployment para continuar.
        </p>
      )}
      {duplicateDeploymentIds.size > 0 && (
        <p id={duplicateErrorId} role="alert" className="text-sm text-destructive">
          Cada slot debe usar un deployment distinto.
        </p>
      )}
      {isDefaultUnavailable && !hasUnavailableSelection && (
        <p role="status" className="text-sm text-muted-foreground">
          El perfil predeterminado no está disponible. Selecciona un deployment para cada slot.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {RESPONSE_SLOTS.map(slot => {
          const selectedUnavailable = Boolean(
            selection[slot] && !availableDeploymentIds.has(selection[slot])
          );
          const selectedDuplicate = duplicateDeploymentIds.has(selection[slot]);

          return (
            <Select
              key={slot}
              value={selection[slot] || null}
              disabled={selectorsDisabled}
              onValueChange={deploymentId => {
                if (deploymentId) onChange({ ...selection, [slot]: deploymentId });
              }}
            >
              <SelectLabel>{SLOT_LABELS[slot]}</SelectLabel>
              <SelectTrigger
                aria-invalid={selectedUnavailable || selectedDuplicate}
                aria-describedby={selectedDuplicate ? duplicateErrorId : undefined}
              >
                <SelectValue placeholder="Selecciona un deployment" />
              </SelectTrigger>
              <SelectContent>
                {items.map(item => (
                  <SelectItem key={item.deploymentId} value={item.deploymentId}>
                    {item.displayName} · {item.providerId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })}
      </div>
    </fieldset>
  );
}
