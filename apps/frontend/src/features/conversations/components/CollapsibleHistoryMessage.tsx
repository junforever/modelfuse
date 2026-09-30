import { Copy } from 'lucide-react';
import { useState } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Button } from '@workspace/ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@workspace/ui/components/tooltip';

interface CollapsibleHistoryMessageProps {
  readonly content: string;
  readonly threshold?: number;
  readonly renderMarkdown?: boolean;
  readonly showCopyAction?: boolean;
}

const markdownComponents = {
  h1: ({ className, node: _node, ...props }) => (
    <h1 {...props} className={`mb-3 mt-5 text-2xl font-semibold ${className ?? ''}`} />
  ),
  h2: ({ className, node: _node, ...props }) => (
    <h2 {...props} className={`mb-2 mt-4 text-xl font-semibold ${className ?? ''}`} />
  ),
  h3: ({ className, node: _node, ...props }) => (
    <h3 {...props} className={`mb-2 mt-4 text-lg font-semibold ${className ?? ''}`} />
  ),
  h4: ({ className, node: _node, ...props }) => (
    <h4 {...props} className={`mb-2 mt-3 font-semibold ${className ?? ''}`} />
  ),
  h5: ({ className, node: _node, ...props }) => (
    <h5 {...props} className={`mb-2 mt-3 text-sm font-semibold ${className ?? ''}`} />
  ),
  h6: ({ className, node: _node, ...props }) => (
    <h6 {...props} className={`mb-2 mt-3 text-sm font-medium ${className ?? ''}`} />
  ),
  p: ({ className, node: _node, ...props }) => (
    <p {...props} className={`my-2 first:mt-0 last:mb-0 ${className ?? ''}`} />
  ),
  ul: ({ className, node: _node, ...props }) => (
    <ul
      {...props}
      className={`my-2 list-disc space-y-1 pl-6 [&.contains-task-list]:list-none [&.contains-task-list]:pl-1 ${className ?? ''}`}
    />
  ),
  ol: ({ className, node: _node, ...props }) => (
    <ol {...props} className={`my-2 list-decimal space-y-1 pl-6 ${className ?? ''}`} />
  ),
  li: ({ className, node: _node, ...props }) => (
    <li {...props} className={`[&.task-list-item]:list-none ${className ?? ''}`} />
  ),
  a: ({ className, node: _node, ...props }) => (
    <a {...props} className={`underline underline-offset-2 ${className ?? ''}`} />
  ),
  blockquote: ({ className, node: _node, ...props }) => (
    <blockquote
      {...props}
      className={`my-3 border-l-4 border-border pl-4 text-muted-foreground ${className ?? ''}`}
    />
  ),
  code: ({ className, node: _node, ...props }) => (
    <code
      {...props}
      className={`rounded bg-muted px-1 py-0.5 font-mono text-sm ${className ?? ''}`}
    />
  ),
  pre: ({ className, node: _node, ...props }) => (
    <pre
      {...props}
      className={`my-3 overflow-x-auto rounded-md bg-muted p-3 text-sm [&>code]:bg-transparent [&>code]:p-0 ${className ?? ''}`}
    />
  ),
  table: ({ className, node: _node, ...props }) => (
    <div className="my-3 max-w-full overflow-x-auto">
      <table
        {...props}
        className={`w-full min-w-max border-collapse text-left ${className ?? ''}`}
      />
    </div>
  ),
  th: ({ className, node: _node, ...props }) => (
    <th
      {...props}
      className={`border border-border bg-muted px-3 py-2 font-semibold ${className ?? ''}`}
    />
  ),
  td: ({ className, node: _node, ...props }) => (
    <td {...props} className={`border border-border px-3 py-2 ${className ?? ''}`} />
  ),
  del: ({ className, node: _node, ...props }) => (
    <del {...props} className={`line-through ${className ?? ''}`} />
  ),
  input: ({ className, node: _node, ...props }) => (
    <input {...props} className={`mr-2 align-middle ${className ?? ''}`} disabled />
  ),
} satisfies Components;

function MessageContent({
  content,
  renderMarkdown,
}: Pick<CollapsibleHistoryMessageProps, 'content' | 'renderMarkdown'>) {
  if (renderMarkdown) {
    return (
      <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </Markdown>
    );
  }

  return <p className="whitespace-pre-wrap">{content}</p>;
}

export function CollapsibleHistoryMessage({
  content,
  threshold,
  renderMarkdown,
  showCopyAction = false,
}: CollapsibleHistoryMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const characters = Array.from(content);
  const canCollapse = Boolean(threshold && characters.length > threshold);

  if (!canCollapse && !showCopyAction) {
    return <MessageContent content={content} renderMarkdown={renderMarkdown} />;
  }

  const visibleContent =
    canCollapse && !expanded ? `${characters.slice(0, threshold).join('')}…` : content;

  return (
    <div className="grid gap-2">
      <MessageContent content={visibleContent} renderMarkdown={renderMarkdown} />
      <div className="flex items-center gap-2">
        {canCollapse && (
          <Button
            className="w-fit"
            variant="link"
            size="sm"
            onClick={() => setExpanded(value => !value)}
          >
            {expanded ? 'Mostrar menos' : 'Mostrar más'}
          </Button>
        )}
        {showCopyAction && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copiar"
                    onClick={() => void navigator.clipboard.writeText(content)}
                  >
                    <Copy aria-hidden="true" />
                  </Button>
                }
              />
              <TooltipContent>Copiar</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
