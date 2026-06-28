export interface Chunk {
  content: string;
  tokenCount: number;
  metadata?: Record<string, any>;
}

export interface ChunkerOptions {
  maxChunkSize?: number;
  chunkOverlap?: number;
  enableSemanticBoundaries?: boolean;
  semanticThreshold?: number;
}

interface Block {
  type: 'heading' | 'table' | 'paragraph' | 'code';
  content: string;
}

/**
 * Estimate token count for a given text.
 * Rule of thumb: 1 token ≈ 4 characters or 0.75 words.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const charCount = text.length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(Math.max(charCount / 4, words * 1.3)));
}

/**
 * Standard recursive character splitter.
 * Used for breaking down large paragraphs or blocks that exceed maxChunkSize.
 */
export function splitTextRecursively(
  text: string,
  maxChunkSize: number = 1000,
  chunkOverlap: number = 200,
  separators: string[] = ['\n\n', '\n', '. ', '? ', '! ', ' ', '']
): string[] {
  if (chunkOverlap > maxChunkSize / 2) {
    chunkOverlap = Math.floor(maxChunkSize / 2);
  }
  function recursiveSplit(textToSplit: string, separatorIndex: number): string[] {
    if (textToSplit.length <= maxChunkSize) {
      return [textToSplit];
    }

    if (separatorIndex >= separators.length) {
      // Base case: cannot split further, chunk size hard limit
      const result: string[] = [];
      let start = 0;
      while (start < textToSplit.length) {
        result.push(textToSplit.substring(start, start + maxChunkSize));
        start += maxChunkSize - chunkOverlap;
        if (start >= textToSplit.length || maxChunkSize - chunkOverlap <= 0) {
          break;
        }
      }
      return result;
    }

    const separator = separators[separatorIndex];
    const parts = textToSplit.split(separator);
    const result: string[] = [];
    let currentChunk = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      // Keep the separator at the end of the split segment if it's not the last one
      const segment = i < parts.length - 1 ? part + separator : part;

      if (segment.length > maxChunkSize) {
        if (currentChunk) {
          result.push(currentChunk);
          currentChunk = '';
        }
        // Split recursively with next separator
        const subParts = recursiveSplit(segment, separatorIndex + 1);
        result.push(...subParts);
      } else if ((currentChunk + segment).length > maxChunkSize) {
        if (currentChunk) {
          result.push(currentChunk);
          const overlap = getOverlapText(currentChunk, chunkOverlap);
          if (overlap && (overlap + segment).length <= maxChunkSize) {
            currentChunk = overlap + segment;
          } else {
            currentChunk = segment;
          }
        } else {
          currentChunk = segment;
        }
      } else {
        currentChunk += segment;
      }
    }

    if (currentChunk) {
      result.push(currentChunk);
    }

    return result;
  }

  return recursiveSplit(text, 0);
}

/**
 * Identify logical blocks in a document (headings, tables, paragraphs, code blocks).
 */
export function parseBlocks(text: string): Block[] {
  const lines = text.split(/\r?\n/);
  const blocks: Block[] = [];
  let currentBlock: string[] = [];
  let currentType: 'heading' | 'table' | 'paragraph' | 'code' | null = null;
  let inCodeBlock = false;

  const flush = () => {
    if (currentBlock.length > 0 && currentType) {
      blocks.push({
        type: currentType,
        content: currentBlock.join('\n'),
      });
      currentBlock = [];
      currentType = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for code blocks
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        currentBlock.push(line);
        inCodeBlock = false;
        blocks.push({
          type: 'code',
          content: currentBlock.join('\n'),
        });
        currentBlock = [];
        currentType = null;
      } else {
        flush();
        inCodeBlock = true;
        currentType = 'code';
        currentBlock.push(line);
      }
      continue;
    }

    if (inCodeBlock) {
      currentBlock.push(line);
      continue;
    }

    // Check for headings
    if (trimmed.startsWith('#')) {
      flush();
      blocks.push({
        type: 'heading',
        content: line,
      });
      continue;
    }

    // Check for markdown tables
    const isTableLine = line.includes('|');
    if (isTableLine) {
      if (currentType === 'table') {
        currentBlock.push(line);
      } else {
        const nextLine = lines[i + 1];
        const isNextSeparator = nextLine && nextLine.includes('|') && nextLine.includes('-');
        if (isNextSeparator) {
          flush();
          currentType = 'table';
          currentBlock.push(line);
        } else {
          if (currentType !== 'paragraph') {
            flush();
            currentType = 'paragraph';
          }
          currentBlock.push(line);
        }
      }
      continue;
    }

    // Empty lines flush current block
    if (trimmed === '') {
      flush();
      continue;
    }

    // Paragraph block content accumulation
    if (currentType !== 'paragraph') {
      flush();
      currentType = 'paragraph';
    }
    currentBlock.push(line);
  }

  flush();
  return blocks;
}

/**
 * Extracts key keywords to perform Jaccard similarity semantic check.
 */
function getKeywords(text: string): Set<string> {
  const stopWords = new Set([
    'the', 'and', 'this', 'that', 'with', 'from', 'they', 'them', 'these', 'those',
    'have', 'been', 'were', 'what', 'your', 'about', 'their', 'there', 'which', 'would',
    'should', 'could', 'other', 'some'
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/);
  
  const keywords = new Set<string>();
  for (const w of words) {
    if (w.length > 3 && !stopWords.has(w)) {
      keywords.add(w);
    }
  }
  return keywords;
}

/**
 * Calculates similarity metric between keyword sets.
 */
function getKeywordSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 1.0;
  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) {
      intersectionSize++;
    }
  }
  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Splitting utility for large Markdown tables, preserving the grid/headers in sub-chunks.
 */
function splitTable(tableContent: string, maxChunkSize: number): string[] {
  const lines = tableContent.split('\n');
  if (lines.length < 3) return [tableContent];
  const header = lines[0];
  const separator = lines[1];
  const rows = lines.slice(2);

  const headerSize = header.length + 1 + separator.length + 1;
  if (headerSize >= maxChunkSize) {
    // Header alone is too large, fallback to characters split
    return splitTextRecursively(tableContent, maxChunkSize, 0);
  }

  const tableChunks: string[] = [];
  let currentTableRows: string[] = [];
  let currentSize = headerSize;

  for (const row of rows) {
    const rowSize = row.length + 1;
    if (currentSize + rowSize > maxChunkSize) {
      if (currentTableRows.length > 0) {
        tableChunks.push([header, separator, ...currentTableRows].join('\n'));
        currentTableRows = [row];
        currentSize = headerSize + rowSize;
      } else {
        // Fallback for extremely wide single rows
        tableChunks.push([header, separator, row].join('\n'));
      }
    } else {
      currentTableRows.push(row);
      currentSize += rowSize;
    }
  }

  if (currentTableRows.length > 0) {
    tableChunks.push([header, separator, ...currentTableRows].join('\n'));
  }

  return tableChunks;
}

/**
 * Gets clean overlap text from previous string.
 */
function getOverlapText(text: string, overlapSize: number): string {
  if (text.length <= overlapSize) return text;
  const startIndex = text.length - overlapSize;
  const substring = text.substring(startIndex);
  
  // Try to cut at sentence boundary
  const boundaryIndex = substring.indexOf('. ');
  if (boundaryIndex !== -1 && boundaryIndex < overlapSize / 2) {
    return substring.substring(boundaryIndex + 2);
  }
  
  // Try to cut at newline
  const lineIndex = substring.indexOf('\n');
  if (lineIndex !== -1 && lineIndex < overlapSize / 2) {
    return substring.substring(lineIndex + 1);
  }
  
  // Cut at space
  const spaceIndex = substring.indexOf(' ');
  if (spaceIndex !== -1 && spaceIndex < overlapSize / 2) {
    return substring.substring(spaceIndex + 1);
  }
  
  return substring;
}

/**
 * Intelligent Document Chunker entrypoint.
 */
export function chunkText(text: string, options: ChunkerOptions = {}): Chunk[] {
  const maxChunkSize = options.maxChunkSize ?? 1000;
  let chunkOverlap = options.chunkOverlap ?? 200;

  if (chunkOverlap > maxChunkSize / 2) {
    chunkOverlap = Math.floor(maxChunkSize / 2);
  }

  const enableSemanticBoundaries = options.enableSemanticBoundaries ?? true;
  const semanticThreshold = options.semanticThreshold ?? 0.15;

  if (!text || text.trim() === '') {
    return [];
  }

  const blocks = parseBlocks(text);
  const chunks: Chunk[] = [];

  let currentChunkContent = '';
  let currentKeywords = new Set<string>();
  let lastFlushedContent = '';

  const flush = () => {
    if (currentChunkContent.trim() !== '') {
      chunks.push({
        content: currentChunkContent.trim(),
        tokenCount: estimateTokens(currentChunkContent.trim()),
      });
      lastFlushedContent = currentChunkContent;
      currentChunkContent = '';
      currentKeywords = new Set<string>();
    }
  };

  for (const block of blocks) {
    if (block.type === 'heading') {
      // Hard boundary
      flush();
      
      // Seed the heading chunk with overlap if appropriate
      let overlapPrefix = '';
      if (lastFlushedContent && chunkOverlap > 0) {
        overlapPrefix = getOverlapText(lastFlushedContent, chunkOverlap) + '\n';
      }
      
      currentChunkContent = overlapPrefix + block.content;
      flush(); // Heading gets processed immediately
    } 
    else if (block.type === 'table') {
      flush();
      if (block.content.length > maxChunkSize) {
        const tableSplits = splitTable(block.content, maxChunkSize);
        for (const split of tableSplits) {
          chunks.push({
            content: split,
            tokenCount: estimateTokens(split),
            metadata: { isTable: true }
          });
        }
      } else {
        chunks.push({
          content: block.content,
          tokenCount: estimateTokens(block.content),
          metadata: { isTable: true }
        });
      }
    } 
    else if (block.type === 'code') {
      flush();
      if (block.content.length > maxChunkSize) {
        const codeSplits = splitTextRecursively(block.content, maxChunkSize, chunkOverlap);
        for (const split of codeSplits) {
          chunks.push({
            content: split,
            tokenCount: estimateTokens(split),
            metadata: { isCode: true }
          });
        }
      } else {
        chunks.push({
          content: block.content,
          tokenCount: estimateTokens(block.content),
          metadata: { isCode: true }
        });
      }
    } 
    else {
      // Paragraph block
      const paragraphKeywords = getKeywords(block.content);
      let skipOverlap = false;
      
      // Check for keyword shifts (semantic boundary check)
      if (enableSemanticBoundaries && currentChunkContent.trim() !== '') {
        const similarity = getKeywordSimilarity(currentKeywords, paragraphKeywords);
        if (similarity < semanticThreshold) {
          flush();
          skipOverlap = true;
        }
      }

      // Calculate size with overlap prepended if accumulator is empty
      let potentialContent = currentChunkContent;
      if (potentialContent === '') {
        if (lastFlushedContent && chunkOverlap > 0 && !skipOverlap) {
          potentialContent = getOverlapText(lastFlushedContent, chunkOverlap) + '\n';
        }
      }
      
      const newPotentialContent = potentialContent === '' ? block.content : potentialContent + '\n\n' + block.content;

      if (newPotentialContent.length > maxChunkSize) {
        // Does the single paragraph block exceed maxChunkSize by itself?
        if (block.content.length > maxChunkSize) {
          flush();
          const paraSplits = splitTextRecursively(block.content, maxChunkSize, chunkOverlap);
          for (const split of paraSplits) {
            chunks.push({
              content: split,
              tokenCount: estimateTokens(split),
            });
            lastFlushedContent = split;
          }
        } else {
          // Flush the accumulator and start a new chunk containing this paragraph
          flush();
          let overlapPrefix = '';
          if (lastFlushedContent && chunkOverlap > 0 && !skipOverlap) {
            overlapPrefix = getOverlapText(lastFlushedContent, chunkOverlap) + '\n';
          }
          currentChunkContent = overlapPrefix + block.content;
          currentKeywords = paragraphKeywords;
        }
      } else {
        // Fits in the current chunk
        currentChunkContent = newPotentialContent;
        // Merge keywords
        for (const kw of paragraphKeywords) {
          currentKeywords.add(kw);
        }
      }
    }
  }

  flush();
  return chunks;
}
