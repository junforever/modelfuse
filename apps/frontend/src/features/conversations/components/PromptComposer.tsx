import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button } from '@workspace/ui/components/button';
import { Textarea } from '@workspace/ui/components/textarea';

import type { CreateConversationRequest } from '../types/conversation';

interface PromptComposerProps {
  readonly isBusy: boolean;
  readonly isPending: boolean;
  readonly onSubmit: (payload: CreateConversationRequest) => void;
}

export function PromptComposer({ isBusy, isPending, onSubmit }: PromptComposerProps) {
  const [prompt, setPrompt] = useState('');
  const submitLocked = useRef(false);
  const trimmedPrompt = prompt.trim();
  const submitDisabled = !trimmedPrompt || isBusy || isPending;

  useEffect(() => {
    if (!isPending) submitLocked.current = false;
  }, [isPending]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled || submitLocked.current) return;

    submitLocked.current = true;
    onSubmit({ clientRequestId: crypto.randomUUID(), prompt: trimmedPrompt });
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
      <div className="flex justify-end">
        <Button type="submit" disabled={submitDisabled}>
          Enviar
        </Button>
      </div>
    </form>
  );
}
