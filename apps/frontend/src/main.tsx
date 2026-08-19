import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@workspace/ui/globals.css';
import { App } from './App.tsx';
import { ThemeProvider } from '@workspace/ui/components/theme-provider';
import { Toaster } from '@workspace/ui/components/sonner';
import { QueryProvider } from './providers/query-provider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <ThemeProvider>
        <Toaster />
        <App />
      </ThemeProvider>
    </QueryProvider>
  </StrictMode>
);
