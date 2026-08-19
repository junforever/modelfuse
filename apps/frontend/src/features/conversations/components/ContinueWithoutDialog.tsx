import { useRef } from 'react';

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

interface ContinueWithoutDialogProps {
  readonly modelLabel: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: () => void;
}

export function ContinueWithoutDialog({
  modelLabel,
  open,
  onOpenChange,
  onConfirm,
}: ContinueWithoutDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  function confirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} initialFocus={confirmRef}>
        <DialogHeader>
          <DialogTitle>Continuar sin {modelLabel}</DialogTitle>
          <DialogDescription>
            Esta decisión es permanente y no podrás reintentar {modelLabel} en este turno.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button ref={confirmRef} onClick={confirm}>
            Confirmar continuar sin {modelLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
