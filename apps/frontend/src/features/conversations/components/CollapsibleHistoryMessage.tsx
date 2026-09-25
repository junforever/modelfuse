import { useState } from 'react';
import Markdown, { type Components } from 'react-markdown';

import { Button } from '@workspace/ui/components/button';

interface CollapsibleHistoryMessageProps {
  readonly content: string;
  readonly threshold?: number;
  readonly renderMarkdown?: boolean;
}

const markdownComponents = {
  h1: ({ children }) => <h1 className="mb-3 mt-5 text-2xl font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-4 text-xl font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 mt-4 text-lg font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-3 font-semibold">{children}</h4>,
  h5: ({ children }) => <h5 className="mb-2 mt-3 text-sm font-semibold">{children}</h5>,
  h6: ({ children }) => <h6 className="mb-2 mt-3 text-sm font-medium">{children}</h6>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a className="underline underline-offset-2" href={href}>
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-border pl-4 text-muted-foreground">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    <code className={`rounded bg-muted px-1 py-0.5 font-mono text-sm ${className ?? ''}`}>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 text-sm [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
} satisfies Components;

function MessageContent({
  content,
  renderMarkdown,
}: Pick<CollapsibleHistoryMessageProps, 'content' | 'renderMarkdown'>) {
  if (renderMarkdown) {
    return <Markdown components={markdownComponents}>{content}</Markdown>;
  }

  return <p className="whitespace-pre-wrap">{content}</p>;
}

export function CollapsibleHistoryMessage({
  content,
  threshold,
  renderMarkdown,
}: CollapsibleHistoryMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const characters = Array.from(content);

  if (!threshold || characters.length <= threshold) {
    return <MessageContent content={content} renderMarkdown={renderMarkdown} />;
  }

  const visibleContent = expanded ? content : `${characters.slice(0, threshold).join('')}…`;

  return (
    <div className="grid gap-2">
      <MessageContent content={visibleContent} renderMarkdown={renderMarkdown} />
      <Button
        className="w-fit"
        variant="link"
        size="sm"
        onClick={() => setExpanded(value => !value)}
      >
        {expanded ? 'Mostrar menos' : 'Mostrar más'}
      </Button>
    </div>
  );
}
