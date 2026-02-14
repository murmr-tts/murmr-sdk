import { describe, it, expect } from 'vitest';
import { generateSilence, createWavHeader, concatenateAudio } from '../src/audio-concat';

describe('generateSilence', () => {
  it('returns correct buffer size for given duration', () => {
    // 24000 samples/sec * 2 bytes/sample = 48000 bytes/sec
    // 1000ms = 48000 bytes
    const silence = generateSilence(1000);
    expect(silence.length).toBe(48000);
  });

  it('returns correct size for 500ms', () => {
    const silence = generateSilence(500);
    expect(silence.length).toBe(24000);
  });

  it('returns all zeros', () => {
    const silence = generateSilence(100);
    const allZeros = silence.every(byte => byte === 0);
    expect(allZeros).toBe(true);
  });

  it('returns empty buffer for 0ms', () => {
    const silence = generateSilence(0);
    expect(silence.length).toBe(0);
  });
});

describe('createWavHeader', () => {
  it('starts with RIFF marker', () => {
    const header = createWavHeader(1000);
    expect(header.toString('ascii', 0, 4)).toBe('RIFF');
  });

  it('has WAVE format marker', () => {
    const header = createWavHeader(1000);
    expect(header.toString('ascii', 8, 12)).toBe('WAVE');
  });

  it('has fmt sub-chunk', () => {
    const header = createWavHeader(1000);
    expect(header.toString('ascii', 12, 16)).toBe('fmt ');
  });

  it('has data sub-chunk', () => {
    const header = createWavHeader(1000);
    expect(header.toString('ascii', 36, 40)).toBe('data');
  });

  it('has correct header size', () => {
    const header = createWavHeader(1000);
    expect(header.length).toBe(44);
  });

  it('encodes correct PCM data size', () => {
    const pcmSize = 96000;
    const header = createWavHeader(pcmSize);
    expect(header.readUInt32LE(40)).toBe(pcmSize);
  });

  it('encodes correct file size', () => {
    const pcmSize = 96000;
    const header = createWavHeader(pcmSize);
    // file size = header + pcmSize - 8 (RIFF + size field)
    expect(header.readUInt32LE(4)).toBe(44 + pcmSize - 8);
  });

  it('uses PCM audio format (1)', () => {
    const header = createWavHeader(1000);
    expect(header.readUInt16LE(20)).toBe(1);
  });

  it('uses correct sample rate (24000)', () => {
    const header = createWavHeader(1000);
    expect(header.readUInt32LE(24)).toBe(24000);
  });

  it('uses mono channel (1)', () => {
    const header = createWavHeader(1000);
    expect(header.readUInt16LE(22)).toBe(1);
  });

  it('uses 16 bits per sample', () => {
    const header = createWavHeader(1000);
    expect(header.readUInt16LE(34)).toBe(16);
  });
});

describe('concatenateAudio', () => {
  function makeWav(pcmData: Buffer): Buffer {
    const header = createWavHeader(pcmData.length);
    return Buffer.concat([header, pcmData]);
  }

  it('returns empty buffer for empty array', () => {
    const result = concatenateAudio([], 'wav');
    expect(result.length).toBe(0);
  });

  it('returns single chunk unchanged when no silence', () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    const wav = makeWav(pcm);
    const result = concatenateAudio([wav], 'wav');
    expect(Buffer.compare(result, wav)).toBe(0);
  });

  it('strips WAV headers and concatenates PCM data', () => {
    const pcm1 = Buffer.from([1, 2, 3, 4]);
    const pcm2 = Buffer.from([5, 6, 7, 8]);
    const wav1 = makeWav(pcm1);
    const wav2 = makeWav(pcm2);

    const result = concatenateAudio([wav1, wav2], 'wav');

    // Result should be: header (44) + pcm1 (4) + pcm2 (4) = 52
    expect(result.length).toBe(52);
    // Check it starts with RIFF
    expect(result.toString('ascii', 0, 4)).toBe('RIFF');
    // Check PCM data is concatenated after header
    expect(result[44]).toBe(1);
    expect(result[45]).toBe(2);
    expect(result[48]).toBe(5);
    expect(result[49]).toBe(6);
  });

  it('inserts silence between WAV chunks', () => {
    const pcm1 = Buffer.from([1, 2]);
    const pcm2 = Buffer.from([3, 4]);
    const wav1 = makeWav(pcm1);
    const wav2 = makeWav(pcm2);

    // 100ms silence at 24000 Hz, 16-bit = 4800 bytes
    const result = concatenateAudio([wav1, wav2], 'wav', 100);

    expect(result.length).toBe(44 + 2 + 4800 + 2);
    // Check silence bytes are zeros
    const silenceStart = 44 + 2;
    for (let i = silenceStart; i < silenceStart + 4800; i++) {
      expect(result[i]).toBe(0);
    }
  });

  it('concatenates PCM without headers', () => {
    const pcm1 = Buffer.from([1, 2, 3, 4]);
    const pcm2 = Buffer.from([5, 6, 7, 8]);

    const result = concatenateAudio([pcm1, pcm2], 'pcm');
    expect(result.length).toBe(8);
    expect(result[0]).toBe(1);
    expect(result[4]).toBe(5);
  });

  it('concatenates MP3 chunks with simple binary concat', () => {
    const mp3_1 = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
    const mp3_2 = Buffer.from([0xff, 0xfb, 0x90, 0x01]);

    const result = concatenateAudio([mp3_1, mp3_2], 'mp3');
    expect(result.length).toBe(8);
    expect(result[0]).toBe(0xff);
    expect(result[4]).toBe(0xff);
  });

  it('updates WAV header data size correctly', () => {
    const pcm1 = Buffer.alloc(100, 1);
    const pcm2 = Buffer.alloc(200, 2);
    const wav1 = makeWav(pcm1);
    const wav2 = makeWav(pcm2);

    const result = concatenateAudio([wav1, wav2], 'wav');
    const dataSize = result.readUInt32LE(40);
    expect(dataSize).toBe(300);
  });
});
