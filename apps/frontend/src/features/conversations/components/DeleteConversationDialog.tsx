import { useRef, useState } from 'react';

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

import type { ConversationSummary } from '../types/conversation';

interface DeleteConversationDialogProps {
  readonly conversation: ConversationSummary;
  readonly finalFocus: () => HTMLElement | null;
  readonly onClose: () => void;
  readonly onDelete: () => Promise<void>;
  readonly onDeleted?: (conversationId: string) => void;
}

export function DeleteConversationDialog({
  conversation,
  finalFocus,
  onClose,
  onDelete,
  onDeleted,
}: DeleteConversationDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    if (pendingRef.current) return;

    pendingRef.current = true;
    setPending(true);
    setFailed(false);
    try {
      await onDelete();
      finalFocus()?.focus();
      onDeleted?.(conversation.id);
      onClose();
    } catch {
      pendingRef.current = false;
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <Dialog open onOpenChange={open => !open && !pending && onClose()}>
      <DialogContent showCloseButton={false} initialFocus={confirmRef} finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle>Eliminar conversación</DialogTitle>
          <DialogDescription>
            Se eliminarán “{conversation.title}” y todos sus turnos. Esta acción no se puede
            deshacer.
          </DialogDescription>
        </DialogHeader>
        {failed && (
          <Alert variant="destructive">
            <AlertDescription>No se pudo eliminar. Inténtalo de nuevo.</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />} disabled={pending}>
            Cancelar
          </DialogClose>
          <Button ref={confirmRef} variant="destructive" disabled={pending} onClick={remove}>
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
