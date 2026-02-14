import { describe, it, expect } from 'vitest';
import { splitIntoChunks } from '../src/chunker';

describe('splitIntoChunks', () => {
  it('returns empty array for empty string', () => {
    expect(splitIntoChunks('')).toEqual([]);
    expect(splitIntoChunks('   ')).toEqual([]);
  });

  it('returns single chunk for short text', () => {
    const text = 'Hello world.';
    const result = splitIntoChunks(text, 100);
    expect(result).toEqual(['Hello world.']);
  });

  it('returns single chunk when text equals maxChars', () => {
    const text = 'A'.repeat(200);
    const result = splitIntoChunks(text, 200);
    expect(result).toEqual([text]);
  });

  it('splits multiple sentences into chunks', () => {
    const sentences = Array.from({ length: 10 }, (_, i) => `Sentence ${i + 1}.`);
    const text = sentences.join(' ');
    const result = splitIntoChunks(text, 100);

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('never exceeds maxChars limit', () => {
    const text = Array.from({ length: 50 }, (_, i) =>
      `This is sentence number ${i + 1} which has a moderate length.`,
    ).join(' ');
    const maxChars = 200;
    const result = splitIntoChunks(text, maxChars);

    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it('falls back to clause splitting for long sentences', () => {
    const longSentence =
      'This is a very long clause that goes on and on, ' +
      'followed by another clause with more detail, ' +
      'and yet another clause adding even more context, ' +
      'plus one more clause to really push the length.';
    const result = splitIntoChunks(longSentence, 100);

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('falls back to word splitting for very long text without punctuation', () => {
    const words = Array.from({ length: 30 }, () => 'longword').join(' ');
    const result = splitIntoChunks(words, 100);

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('handles Chinese text with sentence-ending punctuation', () => {
    const text = '这是第一句话。这是第二句话。这是第三句话！这是第四句话？';
    const result = splitIntoChunks(text, 100);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.join('')).not.toBe('');
  });

  it('handles Japanese text with sentence-ending punctuation', () => {
    const sentences = Array.from({ length: 20 }, (_, i) =>
      `これは文番号${i + 1}です。`,
    );
    const text = sentences.join('');
    const result = splitIntoChunks(text, 100);

    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it('preserves all text content after splitting', () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      `This is sentence number ${i + 1}.`,
    ).join(' ');
    const result = splitIntoChunks(text, 100);
    const rejoined = result.join(' ');
    expect(rejoined).toContain('sentence number 1.');
    expect(rejoined).toContain('sentence number 5.');
    expect(rejoined).toContain('sentence number 10.');
  });

  it('throws for maxChars < 100', () => {
    expect(() => splitIntoChunks('Hello.', 50)).toThrow('maxChars must be at least 100');
  });

  it('throws for maxChars > 4096', () => {
    expect(() => splitIntoChunks('Hello.', 5000)).toThrow('maxChars must be at most 4096');
  });

  it('uses default maxChars of 3500', () => {
    const text = 'A'.repeat(3500);
    const result = splitIntoChunks(text);
    expect(result).toEqual([text]);
  });

  it('handles text with mixed punctuation styles', () => {
    const text = 'Hello! How are you? I am fine. Thanks for asking!';
    const result = splitIntoChunks(text, 100);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(text);
  });

  it('trims whitespace from chunks', () => {
    const text = Array.from({ length: 10 }, (_, i) =>
      `Sentence ${i + 1} with extra spaces.`,
    ).join('   ');
    const result = splitIntoChunks(text, 150);
    for (const chunk of result) {
      expect(chunk).toBe(chunk.trim());
    }
  });
});
