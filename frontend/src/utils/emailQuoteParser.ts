/**
 * Email Quote Parser
 * Parses email text content to identify and separate quoted replies from original content.
 * Currently supports:
 * - "------ Originalnachricht ------"
 * - "Am ... schrieb ...:\" (German Gmail style)
 */

export interface EmailSegment {
  type: 'original' | 'quote';
  content: string;
  depth: number;
  header?: string;
  children?: EmailSegment[]; // Nested quotes within this quote
}

// Quote delimiter patterns
const QUOTE_DELIMITERS = [
  // German Outlook style: ------ Originalnachricht ------
  /^>*\s*-{3,}\s*Originalnachricht\s*-{3,}/m,
  // German Gmail style: Am Sa., 20. Dez. 2025 um 12:12 Uhr schrieb Name <email>:
  // Also matches with > prefix for nested quotes
  /^>*\s*Am\s+.+?\s+schrieb\s+.+?:\s*$/m,
];

/**
 * Extracts a human-readable header from a quote delimiter match
 */
function extractHeaderFromMatch(matchedText: string): string | undefined {
  // Check if it's an "Am ... schrieb ..." pattern - extract the name
  const schriebMatch = matchedText.match(/schrieb\s+([^<:]+)/i);
  if (schriebMatch) {
    return schriebMatch[1]?.trim();
  }

  return undefined;
}

/**
 * Extracts header from text following the delimiter (for Originalnachricht style)
 */
function extractHeaderFromFollowingText(text: string): string | undefined {
  // Try to find "Von" block after the delimiter
  const vonMatch = text.match(/Von\s+["']?([^"'\n<]+)/i);
  if (vonMatch) {
    return vonMatch[1]?.trim();
  }

  return undefined;
}

/**
 * Finds the first quote delimiter in the text
 * Returns the index, matched pattern, and extracted header, or null if none found
 */
function findQuoteStart(text: string): { index: number; match: string; header?: string } | null {
  let earliest: { index: number; match: string; header?: string } | null = null;

  for (const pattern of QUOTE_DELIMITERS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      if (earliest === null || match.index < earliest.index) {
        // Extract header from the match itself or the following text
        let header = extractHeaderFromMatch(match[0]);
        if (!header) {
          header = extractHeaderFromFollowingText(text.slice(match.index, match.index + 500));
        }
        
        earliest = { 
          index: match.index, 
          match: match[0],
          header
        };
      }
    }
  }

  return earliest;
}

/**
 * Parses email text content into segments of original and quoted content.
 * Each quoted segment can contain nested children quotes.
 * 
 * @param textContent - The raw text content of the email
 * @returns Array of segments with type, content, depth, header, and children
 */
export function parseEmailQuotes(textContent: string): EmailSegment[] {
  if (!textContent || typeof textContent !== 'string') {
    return [];
  }

  return parseAtDepth(textContent, 0);
}

/**
 * Recursively parses text at a given depth level
 */
function parseAtDepth(text: string, depth: number): EmailSegment[] {
  if (depth > 10 || !text.trim()) {
    return [];
  }

  const quoteStart = findQuoteStart(text);
  
  if (!quoteStart) {
    // No quotes found at this level
    if (depth === 0) {
      return [{ type: 'original', content: text, depth: 0 }];
    } else {
      return [{ type: 'quote', content: text, depth, header: `Zitierte Nachricht` }];
    }
  }

  const segments: EmailSegment[] = [];
  
  // Content before the quote delimiter
  const beforeQuote = text.slice(0, quoteStart.index).trim();
  
  // Content after the quote delimiter (the quoted content)
  const afterDelimiter = text.slice(quoteStart.index + quoteStart.match.length).trim();

  // Add the content before the quote
  if (beforeQuote) {
    segments.push({
      type: depth === 0 ? 'original' : 'quote',
      content: beforeQuote,
      depth,
      header: depth > 0 ? `Zitierte Nachricht` : undefined
    });
  }

  // Now parse the quoted content recursively
  if (afterDelimiter) {
    const nestedSegments = parseAtDepth(afterDelimiter, depth + 1);
    
    // The first nested segment gets the header from the delimiter
    if (nestedSegments.length > 0 && nestedSegments[0].type === 'quote') {
      nestedSegments[0].header = quoteStart.header || `Zitierte Nachricht`;
    }
    
    segments.push(...nestedSegments);
  }

  return segments;
}

/**
 * Utility to check if an email likely contains quoted content
 * Useful for deciding whether to show quote indicators in UI
 */
export function hasQuotedContent(textContent: string): boolean {
  if (!textContent) return false;
  
  // Check all delimiter patterns
  for (const pattern of QUOTE_DELIMITERS) {
    if (pattern.test(textContent)) return true;
  }
  
  return false;
}
