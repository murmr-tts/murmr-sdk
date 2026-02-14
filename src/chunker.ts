/**
 * Split text into chunks at sentence boundaries.
 * Never splits mid-sentence. Falls back to clause boundaries for long sentences.
 */

const SENTENCE_SPLIT = /(?<=[.!?])\s+|(?<=[。！？])/;
const CLAUSE_SPLIT = /(?<=[,;:—])\s+|(?<=[、；：])/;

export function splitIntoChunks(text: string, maxChars: number = 3500): string[] {
  if (maxChars < 100) {
    throw new Error('maxChars must be at least 100');
  }
  if (maxChars > 4096) {
    throw new Error('maxChars must be at most 4096 (API limit)');
  }

  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const sentences = trimmed.split(SENTENCE_SPLIT);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if (trimmedSentence.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = '';
      }
      const subChunks = splitLongSentence(trimmedSentence, maxChars);
      chunks.push(...subChunks);
      continue;
    }

    const combined = current ? `${current} ${trimmedSentence}` : trimmedSentence;

    if (combined.length > maxChars) {
      chunks.push(current.trim());
      current = trimmedSentence;
    } else {
      current = combined;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

function splitLongSentence(sentence: string, maxChars: number): string[] {
  const clauses = sentence.split(CLAUSE_SPLIT);

  // If clause splitting produced multiple parts, greedily accumulate them
  if (clauses.length > 1) {
    const chunks: string[] = [];
    let current = '';

    for (const clause of clauses) {
      const trimmedClause = clause.trim();
      if (!trimmedClause) continue;

      // If a single clause still exceeds maxChars, split at word boundaries
      if (trimmedClause.length > maxChars) {
        if (current) {
          chunks.push(current.trim());
          current = '';
        }
        chunks.push(...splitAtWords(trimmedClause, maxChars));
        continue;
      }

      const combined = current ? `${current} ${trimmedClause}` : trimmedClause;
      if (combined.length > maxChars) {
        chunks.push(current.trim());
        current = trimmedClause;
      } else {
        current = combined;
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }

  return splitAtWords(sentence, maxChars);
}

function splitAtWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const combined = current ? `${current} ${word}` : word;
    if (combined.length > maxChars && current) {
      chunks.push(current.trim());
      current = word;
    } else {
      current = combined;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}
