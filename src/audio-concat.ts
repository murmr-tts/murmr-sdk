/**
 * Audio concatenation utilities.
 * Handles WAV header manipulation and format-specific concatenation.
 */

import type { AudioFormat } from './types';

export const WAV_HEADER_SIZE = 44;
export const SAMPLE_RATE = 24000;
export const CHANNELS = 1;
export const BITS_PER_SAMPLE = 16;
export const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

/** Generate silence as raw PCM (16-bit, little-endian, all zeros) */
export function generateSilence(durationMs: number): Buffer {
  const numSamples = Math.floor((durationMs / 1000) * SAMPLE_RATE);
  return Buffer.alloc(numSamples * BYTES_PER_SAMPLE);
}

/** Create a WAV header for the given PCM data size */
export function createWavHeader(pcmDataSize: number): Buffer {
  const header = Buffer.alloc(WAV_HEADER_SIZE);
  const fileSize = WAV_HEADER_SIZE + pcmDataSize - 8;
  const byteRate = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE;
  const blockAlign = CHANNELS * BYTES_PER_SAMPLE;

  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);

  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);

  header.write('data', 36);
  header.writeUInt32LE(pcmDataSize, 40);

  return header;
}

/** Extract raw PCM data from a WAV buffer (walks sub-chunks to find 'data') */
function extractPcm(wavBuffer: Buffer): Buffer {
  if (wavBuffer.length < 12 || wavBuffer.toString('ascii', 0, 4) !== 'RIFF') {
    return wavBuffer;
  }
  // Walk sub-chunks to find 'data'
  let offset = 12;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      return wavBuffer.subarray(offset + 8, offset + 8 + chunkSize);
    }
    offset += 8 + chunkSize;
  }
  // Fallback: strip standard header
  return wavBuffer.subarray(WAV_HEADER_SIZE);
}

/**
 * Concatenate audio chunks with optional silence between them.
 * For WAV: strips headers, concatenates PCM, adds single header.
 * For PCM: concatenates raw samples directly.
 * For MP3/opus/aac/flac: simple binary concatenation (frames are independently decodable).
 *
 * Note: `silenceBetweenMs` is only applied for WAV and PCM formats. For compressed
 * formats (mp3/opus/aac/flac), chunks are binary-concatenated without silence since
 * inserting silence in compressed streams would require re-encoding.
 */
export function concatenateAudio(
  chunks: Buffer[],
  format: AudioFormat,
  silenceBetweenMs: number = 0,
): Buffer {
  if (chunks.length === 0) return Buffer.alloc(0);
  if (chunks.length === 1 && silenceBetweenMs === 0) return chunks[0];

  if (format === 'wav' || format === 'pcm') {
    const withSilence: Buffer[] = [];
    const silence = silenceBetweenMs > 0 ? generateSilence(silenceBetweenMs) : null;

    for (let i = 0; i < chunks.length; i++) {
      withSilence.push(format === 'wav' ? extractPcm(chunks[i]) : chunks[i]);
      if (silence && i < chunks.length - 1) {
        withSilence.push(silence);
      }
    }

    if (format === 'pcm') {
      return Buffer.concat(withSilence);
    }

    const totalPcmSize = withSilence.reduce((sum, c) => sum + c.length, 0);
    return Buffer.concat([createWavHeader(totalPcmSize), ...withSilence]);
  }

  return Buffer.concat(chunks);
}
