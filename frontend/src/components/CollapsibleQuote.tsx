import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { EmailSegment } from '@/utils/emailQuoteParser';

interface CollapsibleQuoteProps {
  segments: EmailSegment[]; // Array of quote segments at increasing depth levels
}

/**
 * CollapsibleQuote Component
 * Renders quoted email sections that can be expanded/collapsed.
 * Handles nested quotes by recursively rendering deeper segments.
 */
export function CollapsibleQuote({ segments }: CollapsibleQuoteProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  if (segments.length === 0) {
    return null;
  }

  // Get the first (shallowest) segment
  const currentSegment = segments[0];
  const remainingSegments = segments.slice(1);

  // Get first line as preview (max 80 chars)
  const getPreview = () => {
    const firstLine = currentSegment.content.split('\n')[0]?.trim() || '';
    return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors group cursor-pointer w-full text-left">
        <ChevronRight 
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} 
        />
        <span className="font-medium shrink-0">
          {currentSegment.header || 'Zitierte Nachricht'}
        </span>
        {!isOpen && (
          <span className="ml-2 text-muted-foreground/60 truncate">
            {getPreview()}
          </span>
        )}
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pl-4 border-l-2 border-muted-foreground/20 ml-1.5 mt-1">
        <div 
          className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed py-1"
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
          {currentSegment.content}
        </div>
        
        {/* Render remaining nested quotes */}
        {remainingSegments.length > 0 && (
          <CollapsibleQuote segments={remainingSegments} />
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
