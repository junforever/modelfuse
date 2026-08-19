import { useId, useRef, useState } from 'react';
import { MoreHorizontalIcon } from 'lucide-react';

import { Button } from '@workspace/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@workspace/ui/components/dropdown-menu';

import type { ConversationSummary } from '../types/conversation';
import { DeleteConversationDialog } from './DeleteConversationDialog';
import { RenameConversationDialog } from './RenameConversationDialog';

interface ConversationMenuProps {
  readonly conversation: ConversationSummary;
  readonly deleteFinalFocus: () => HTMLElement | null;
  readonly onDelete: (conversationId: string) => Promise<void>;
  readonly onDeleted?: (conversationId: string) => void;
  readonly onRename: (conversationId: string, title: string) => Promise<ConversationSummary>;
  readonly onRenamed?: (conversation: ConversationSummary) => void;
}

export function ConversationMenu({
  conversation,
  deleteFinalFocus,
  onDelete,
  onDeleted,
  onRename,
  onRenamed,
}: ConversationMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const busyReasonId = useId();
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={triggerRef}
          render={<Button variant="ghost" size="icon-sm" />}
          aria-label={`Acciones de ${conversation.title}`}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog('rename')}>Renombrar</DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={conversation.hasWorkInProgress}
            aria-describedby={conversation.hasWorkInProgress ? busyReasonId : undefined}
            onClick={() => setDialog('delete')}
          >
            Eliminar
          </DropdownMenuItem>
          {conversation.hasWorkInProgress && (
            <p id={busyReasonId} className="max-w-56 px-3 py-2 text-xs text-muted-foreground">
              No puedes eliminar mientras se procesan respuestas; no se puede eliminar durante el
              procesamiento.
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === 'rename' && (
        <RenameConversationDialog
          conversation={conversation}
          finalFocus={triggerRef}
          onClose={() => setDialog(null)}
          onRename={title => onRename(conversation.id, title)}
          onRenamed={onRenamed}
        />
      )}
      {dialog === 'delete' && (
        <DeleteConversationDialog
          conversation={conversation}
          finalFocus={deleteFinalFocus}
          onClose={() => setDialog(null)}
          onDelete={() => onDelete(conversation.id)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}
