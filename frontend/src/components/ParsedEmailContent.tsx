import React, { useMemo } from 'react';
import { parseEmailQuotes, type EmailSegment } from '@/utils/emailQuoteParser';
import { CollapsibleQuote } from '@/components/CollapsibleQuote';

interface ParsedEmailContentProps {
  textContent: string;
}

/**
 * ParsedEmailContent Component
 * Lazily parses email content to separate original text from quoted replies.
 * Renders original content directly and quoted content as collapsible sections.
 */
export function ParsedEmailContent({ textContent }: ParsedEmailContentProps) {
  // Lazy parsing with useMemo - only parses when textContent changes
  const segments = useMemo(() => {
    if (!textContent) return [];
    return parseEmailQuotes(textContent);
  }, [textContent]);

  // If no segments or only one original segment, render as plain text
  if (segments.length === 0) {
    return (
      <div 
        className="text-sm text-foreground whitespace-pre-wrap leading-relaxed"
        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
      >
        {textContent}
      </div>
    );
  }

  // Check if we only have one original segment (no quotes)
  if (segments.length === 1 && segments[0].type === 'original') {
    return (
      <div 
        className="text-sm text-foreground whitespace-pre-wrap leading-relaxed"
        style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
      >
        {segments[0].content}
      </div>
    );
  }

  // Group segments by depth for proper nesting
  const originalSegments = segments.filter((s: EmailSegment) => s.type === 'original');
  const quoteSegments = segments.filter((s: EmailSegment) => s.type === 'quote');

  return (
    <div className="space-y-1">
      {/* Render original content first */}
      {originalSegments.map((segment: EmailSegment, index: number) => (
        <div 
          key={`original-${index}-${segment.depth}`}
          className="text-sm text-foreground whitespace-pre-wrap leading-relaxed"
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
          {segment.content}
        </div>
      ))}

      {/* Render quotes as nested collapsible sections */}
      {quoteSegments.length > 0 && (
        <CollapsibleQuote 
          key={`quotes-${quoteSegments[0].depth}`}
          segments={quoteSegments}
        />
      )}
    </div>
  );
}
