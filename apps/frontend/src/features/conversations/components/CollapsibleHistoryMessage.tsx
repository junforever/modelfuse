import { useState } from 'react';

import { Button } from '@workspace/ui/components/button';

interface CollapsibleHistoryMessageProps {
  readonly content: string;
  readonly threshold?: number;
}

export function CollapsibleHistoryMessage({ content, threshold }: CollapsibleHistoryMessageProps) {
  const [expanded, setExpanded] = useState(false);
  const characters = Array.from(content);

  if (!threshold || characters.length <= threshold) {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }

  return (
    <div className="grid gap-2">
      <p className="whitespace-pre-wrap">
        {expanded ? content : `${characters.slice(0, threshold).join('')}…`}
      </p>
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
