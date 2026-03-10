# Audio Formats

murmr supports six audio output formats for batch generation. Streaming endpoints always deliver raw PCM. This guide covers format specifications, when to use each format, and how to convert between them.

## Format Comparison

| Format | Codec | Bitrate | Lossless | Batch | Streaming |
|--------|-------|---------|----------|-------|-----------|
| `wav` | PCM | ~384 kbps | Yes | Default | -- |
| `pcm` | Raw PCM | ~384 kbps | Yes | Yes | Always |
| `mp3` | LAME | 128 kbps | No | Yes | -- |
| `opus` | Opus | 64 kbps | No | Yes | -- |
| `aac` | AAC-LC | 64 kbps | No | Yes | -- |
| `flac` | FLAC | ~200 kbps | Yes | Yes | -- |

## Native Audio Specifications

All murmr audio is generated at these native specs regardless of output format:

| Property | Value |
|----------|-------|
| Sample rate | 24,000 Hz |
| Bit depth | 16-bit |
| Channels | Mono (1 channel) |
| PCM encoding | Signed 16-bit little-endian (`pcm_s16le`) |

## Format Details

### WAV (default)

Lossless, universally supported. Includes a 44-byte RIFF header followed by raw PCM data.

- **Best for:** Maximum quality, server-side processing, archival
- **Drawback:** Large file size

### PCM (raw)

Same audio data as WAV but without the header. Raw PCM samples in `pcm_s16le` format.

- **Best for:** Custom audio pipelines, real-time processing, feeding into other audio tools
- **Drawback:** No metadata -- you must know the sample rate and format to decode

### MP3

Lossy compression at 128 kbps. Widely supported across all platforms and browsers.

- **Best for:** Web delivery, mobile apps, bandwidth-constrained environments
- **Drawback:** Lossy compression, slight quality reduction

### Opus

Highly efficient lossy codec at 64 kbps. Excellent quality-to-size ratio.

- **Best for:** WebRTC, real-time communication, low-bandwidth scenarios
- **Drawback:** Not supported in all legacy browsers/players

### AAC

Lossy compression at 64 kbps. Native to Apple platforms and widely supported.

- **Best for:** iOS/macOS apps, podcast distribution
- **Drawback:** Requires license for some use cases

### FLAC

Lossless compression. Typically 40--60% smaller than WAV with zero quality loss.

- **Best for:** High-quality delivery with smaller file size than WAV
- **Drawback:** Not supported in all browsers

## Using response_format

The `response_format` parameter is only available on the **batch** endpoint (`/v1/audio/speech`). Streaming endpoints always return PCM.

```typescript
import { MurmrClient, isSyncResponse } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.speech.create({
  input: 'Generate in Opus format for efficient delivery.',
  voice: 'voice_abc123',
  response_format: 'opus',
});

if (isSyncResponse(result)) {
  const buffer = Buffer.from(await result.arrayBuffer());
  writeFileSync('output.opus', buffer);
}
```

## Base64 Decoding

When polling async jobs, completed audio is returned as base64-encoded data in the `audio_base64` field:

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const job = await client.jobs.get('job_abc123def456');

if (job.status === 'completed' && job.audio_base64) {
  const audio = Buffer.from(job.audio_base64, 'base64');
  const extension = job.response_format || 'wav';
  writeFileSync(`output.${extension}`, audio);
}
```

## PCM to WAV Conversion

Streaming endpoints return raw PCM. Use the SDK's `createWavHeader` utility to wrap it in a valid WAV file:

```typescript
import { MurmrClient, createWavHeader } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const stream = await client.speech.stream({
  input: 'Convert this PCM stream to a WAV file.',
  voice: 'voice_abc123',
});

const pcmChunks: Buffer[] = [];

for await (const chunk of stream) {
  const audioData = chunk.audio || chunk.chunk;
  if (audioData) {
    pcmChunks.push(Buffer.from(audioData, 'base64'));
  }
}

const pcm = Buffer.concat(pcmChunks);
const header = createWavHeader(pcm.length);
const wav = Buffer.concat([header, pcm]);

writeFileSync('from-stream.wav', wav);
```

Or use the convenience function:

```typescript
import { collectStreamAsWav } from '@murmr/sdk';

// collectStreamAsWav() does the same thing in one call
// (requires the raw Response, used internally by voices.design())
```

## File Size Estimation

Calculate approximate file size before generating:

```
WAV/PCM: sample_rate x channels x bytes_per_sample x duration_seconds
       = 24000 x 1 x 2 x seconds
       = 48,000 bytes/second (~48 KB/s)
```

| Duration | WAV/PCM | MP3 (128k) | Opus (64k) | FLAC |
|----------|---------|------------|------------|------|
| 10 sec | 480 KB | 160 KB | 80 KB | ~240 KB |
| 1 min | 2.9 MB | 960 KB | 480 KB | ~1.4 MB |
| 10 min | 28.8 MB | 9.6 MB | 4.8 MB | ~14 MB |
| 1 hour | 172.8 MB | 57.6 MB | 28.8 MB | ~86 MB |

> FLAC sizes are approximate and vary by audio content (silence compresses very well).

## See Also

- [Speech Generation](https://murmr.dev/en/docs/speech) -- Using `response_format` in batch requests
- [Streaming](https://murmr.dev/en/docs/streaming) -- PCM streaming format details
- [Async Jobs](https://murmr.dev/en/docs/async-jobs) -- Retrieving audio from completed jobs
- [Long-Form Audio](https://murmr.dev/en/docs/long-form) -- Audio format for concatenated output
