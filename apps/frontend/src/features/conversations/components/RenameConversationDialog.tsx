import { useRef, useState, type RefObject } from 'react';

import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';

import type { ConversationSummary } from '../types/conversation';
import { countTitleGraphemes } from '../utils/titleGraphemes';

interface RenameConversationDialogProps {
  readonly conversation: ConversationSummary;
  readonly finalFocus: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onRename: (title: string) => Promise<ConversationSummary>;
  readonly onRenamed?: (conversation: ConversationSummary) => void;
}

export function RenameConversationDialog({
  conversation,
  finalFocus,
  onClose,
  onRename,
  onRenamed,
}: RenameConversationDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef(false);
  const [title, setTitle] = useState(conversation.title);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const trimmedTitle = title.trim();
  const graphemes = countTitleGraphemes(trimmedTitle);
  const invalid = graphemes < 1 || graphemes > 80;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (invalid || pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setFailed(false);
    try {
      const canonical = await onRename(title);
      onRenamed?.(canonical);
      onClose();
    } catch {
      pendingRef.current = false;
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <Dialog open onOpenChange={open => !open && !pending && onClose()}>
      <DialogContent showCloseButton={false} initialFocus={inputRef} finalFocus={finalFocus}>
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Renombrar conversación</DialogTitle>
            <DialogDescription>Usa un nombre de entre 1 y 80 caracteres.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`conversation-title-${conversation.id}`}>
              Nombre de la conversación
            </Label>
            <Input
              ref={inputRef}
              id={`conversation-title-${conversation.id}`}
              value={title}
              aria-invalid={invalid}
              disabled={pending}
              onChange={event => setTitle(event.target.value)}
            />
            <p
              role="status"
              aria-label="Longitud del título"
              className={invalid ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
            >
              {graphemes}/80
            </p>
          </div>
          {failed && (
            <Alert variant="destructive">
              <AlertDescription>No se pudo renombrar. Inténtalo de nuevo.</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />} disabled={pending}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={invalid || pending}>
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
