import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';

interface ConversationProcessingNoticeProps {
  readonly isBusy: boolean;
  readonly sseError: string | null;
}

export function ConversationProcessingNotice({
  isBusy,
  sseError,
}: ConversationProcessingNoticeProps) {
  if (!isBusy && !sseError) return null;

  return (
    <div className="grid gap-2">
      {isBusy && (
        <Alert role="status" aria-live="polite">
          <AlertTitle>Procesando respuestas</AlertTitle>
          <AlertDescription>
            Puedes seguir navegando mientras los modelos terminan.
          </AlertDescription>
        </Alert>
      )}
      {sseError && (
        <Alert variant="destructive">
          <AlertTitle>Error de conexión en tiempo real</AlertTitle>
          <AlertDescription>{sseError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
