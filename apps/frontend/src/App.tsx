import { AppShell } from './components/layout/AppShell';
import { ConversationWorkspace } from './features/conversations/components/ConversationWorkspace';

export function App() {
  return (
    <AppShell sidebar={null}>
      <ConversationWorkspace />
    </AppShell>
  );
}
