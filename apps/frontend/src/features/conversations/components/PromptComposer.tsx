import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@workspace/ui/components/button';
import { Switch } from '@workspace/ui/components/switch';
import { Textarea } from '@workspace/ui/components/textarea';

import type { CreateConversationRequest, DeploymentIds } from '../types/conversation';

interface PromptComposerProps {
  readonly isBusy: boolean;
  readonly isDisabled?: boolean;
  readonly isPending: boolean;
  readonly canUseWebSearch?: boolean;
  readonly webSearchEnabled?: boolean;
  readonly deploymentIds?: DeploymentIds;
  readonly onWebSearchEnabledChange?: (enabled: boolean) => void;
  readonly onSubmit: (payload: CreateConversationRequest) => void;
}

export function PromptComposer({
  isBusy,
  isDisabled = false,
  isPending,
  canUseWebSearch = false,
  webSearchEnabled,
  deploymentIds,
  onWebSearchEnabledChange,
  onSubmit,
}: PromptComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [localWebSearchEnabled, setLocalWebSearchEnabled] = useState(false);
  const [previousCanUseWebSearch, setPreviousCanUseWebSearch] = useState(canUseWebSearch);
  const submitLocked = useRef(false);
  const trimmedPrompt = prompt.trim();
  const submitDisabled = !trimmedPrompt || isBusy || isDisabled || isPending;
  const toggleDisabled = isBusy || isPending || !canUseWebSearch;
  const requestedWebSearchEnabled = webSearchEnabled ?? localWebSearchEnabled;
  const checkedWebSearchEnabled = !toggleDisabled && requestedWebSearchEnabled;

  useEffect(() => {
    if (!isPending) submitLocked.current = false;
  });

  if (canUseWebSearch !== previousCanUseWebSearch) {
    setPreviousCanUseWebSearch(canUseWebSearch);
    if (!canUseWebSearch) setLocalWebSearchEnabled(false);
  }

  function changeWebSearchEnabled(enabled: boolean) {
    if (webSearchEnabled === undefined) setLocalWebSearchEnabled(enabled);
    onWebSearchEnabledChange?.(enabled);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled || submitLocked.current) return;

    submitLocked.current = true;
    onSubmit({
      clientRequestId: crypto.randomUUID(),
      prompt: trimmedPrompt,
      webSearchEnabled: checkedWebSearchEnabled,
      ...(deploymentIds ? { deploymentIds } : {}),
    });
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <label htmlFor="conversation-prompt" className="text-sm font-medium">
        Prompt
      </label>
      <Textarea
        id="conversation-prompt"
        value={prompt}
        onChange={event => setPrompt(event.target.value)}
        placeholder="Escribe la consulta que quieres comparar"
        rows={4}
      />
      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={submitDisabled}>
          Enviar
        </Button>
        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <Switch
            checked={checkedWebSearchEnabled}
            disabled={toggleDisabled}
            onCheckedChange={changeWebSearchEnabled}
          />
          <span>Búsqueda web</span>
        </label>
      </div>
    </form>
  );
}
