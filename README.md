# @murmr/sdk

Official Node.js SDK for the [murmr](https://murmr.dev) TTS API.

**Zero runtime dependencies** | **TypeScript-first** | **Node 18+**

## Install

```bash
npm install @murmr/sdk
```

## Quick Start

### Generate speech with a saved voice

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({ apiKey: process.env.MURMR_API_KEY! });

const result = await client.speech.createAndWait({
  input: 'Hello from murmr!',
  voice: 'voice_abc123',
});

writeFileSync('hello.wav', Buffer.from(result.audio_base64!, 'base64'));
```

### Generate speech with VoiceDesign

Describe any voice in natural language -- no pre-saved voice required.

```typescript
const audio = await client.voices.design({
  input: 'Hello from murmr!',
  voice_description: 'A warm, friendly female narrator with a calm tone',
  language: 'English',
});

writeFileSync('designed.wav', audio);
```

## Streaming

### Saved voice streaming

```typescript
const stream = await client.speech.stream({
  input: 'Real-time audio streaming.',
  voice: 'voice_abc123',
});

for await (const chunk of stream) {
  const audioData = chunk.audio || chunk.chunk;
  if (audioData) {
    const pcm = Buffer.from(audioData, 'base64');
    // Write PCM to speaker, pipe to ffmpeg, etc.
  }
  if (chunk.done) break;
}
```

### VoiceDesign streaming

```typescript
const stream = await client.voices.designStream({
  input: 'Streaming with a designed voice.',
  voice_description: 'A deep, authoritative male news anchor',
  language: 'English',
});

for await (const chunk of stream) {
  const audioData = chunk.audio || chunk.chunk;
  if (audioData) {
    const pcm = Buffer.from(audioData, 'base64');
  }
  if (chunk.done) break;
}
```

## Batch Jobs

`speech.create()` submits a batch job and returns immediately with a job ID. Use webhooks or polling to get the result.

### With webhook

```typescript
const job = await client.speech.create({
  input: 'A longer passage of text...',
  voice: 'voice_abc123',
  webhook_url: 'https://your-app.com/api/tts-webhook',
});

console.log(`Job queued: ${job.id}`);
```

Your webhook endpoint receives a POST with:

```typescript
import type { WebhookPayload } from '@murmr/sdk';

const payload: WebhookPayload = {
  id: 'job_abc123',
  status: 'completed',
  audio: '<base64-encoded>',
  content_type: 'audio/wav',
  response_format: 'wav',
  duration_ms: 2340,
  total_time_ms: 1520,
};
```

### With polling

```typescript
const job = await client.speech.create({
  input: 'Hello!',
  voice: 'voice_abc123',
});

const status = await client.jobs.waitForCompletion(job.id, {
  pollIntervalMs: 3000,
  timeoutMs: 900_000,
  onPoll: (s) => console.log(`Job ${s.id}: ${s.status}`),
});

writeFileSync('output.wav', Buffer.from(status.audio_base64!, 'base64'));
```

### Convenience: createAndWait

Combines `create()` + `waitForCompletion()` in one call:

```typescript
const result = await client.speech.createAndWait({
  input: 'Hello!',
  voice: 'voice_abc123',
});

writeFileSync('output.wav', Buffer.from(result.audio_base64!, 'base64'));
```

## Long-Form Audio

Generate audio from text of any length. The SDK splits text at sentence boundaries, generates each chunk via streaming with retries, and concatenates into a single WAV file.

```typescript
const result = await client.speech.createLongForm({
  input: longArticleText,
  voice: 'voice_abc123',
  language: 'English',
  chunkSize: 3500,
  silenceBetweenChunksMs: 400,
  maxRetries: 3,
  onProgress: ({ current, total, percent }) => {
    console.log(`Chunk ${current}/${total} (${percent}%)`);
  },
});

writeFileSync('article.wav', result.audio);
console.log(`Generated ${result.totalChunks} chunks in ${result.durationMs}ms`);
```

## Resume After Failure

If a long-form generation fails partway through, `MurmrChunkError` tells you exactly where it stopped. Use `startFromChunk` to resume without re-generating earlier chunks:

```typescript
import { MurmrChunkError } from '@murmr/sdk';

try {
  const result = await client.speech.createLongForm({
    input: longText,
    voice: 'voice_abc123',
  });
} catch (err) {
  if (err instanceof MurmrChunkError) {
    console.log(`Failed at chunk ${err.chunkIndex} of ${err.totalChunks}`);
    console.log(`Completed: ${err.completedChunks} chunks`);

    // Resume from the failed chunk
    const result = await client.speech.createLongForm({
      input: longText,
      voice: 'voice_abc123',
      startFromChunk: err.chunkIndex,
    });
  }
}
```

When resuming, the result only contains audio from `startFromChunk` onward. You are responsible for concatenating it with any audio saved from the earlier run.

## Error Handling

```typescript
import { MurmrError, MurmrChunkError } from '@murmr/sdk';

try {
  const result = await client.speech.createAndWait({
    input: 'Hello!',
    voice: 'voice_abc123',
  });
} catch (err) {
  if (err instanceof MurmrChunkError) {
    // Long-form chunk failure with resume info
    console.log(err.chunkIndex);
    console.log(err.completedChunks);
    console.log(err.totalChunks);
  } else if (err instanceof MurmrError) {
    // API or validation error
    console.log(err.message);
    console.log(err.status);  // HTTP status (401, 429, etc.)
    console.log(err.code);    // 'JOB_FAILED', 'TIMEOUT', etc.
  }
}
```

## API Reference

### `new MurmrClient(options)`

| Option    | Type     | Default                 | Description           |
|-----------|----------|-------------------------|-----------------------|
| `apiKey`  | `string` | *required*              | Your murmr API key    |
| `baseUrl` | `string` | `https://api.murmr.dev` | API base URL          |
| `timeout` | `number` | `300000`                | Request timeout in ms |

### `client.speech`

| Method                    | Returns                        | Description                                           |
|---------------------------|--------------------------------|-------------------------------------------------------|
| `create(options)`         | `Promise<AsyncJobResponse>`    | Submit a batch job. Returns job ID for polling.        |
| `createAndWait(options)`  | `Promise<JobStatus>`           | Submit a batch job and poll until completion.           |
| `stream(options)`         | `AsyncGenerator<AudioStreamChunk>` | Stream speech via SSE (saved voice).              |
| `createLongForm(options)` | `Promise<LongFormResult>`      | Generate long-form audio with chunking and retries.    |

### `client.voices`

| Method                  | Returns                            | Description                                    |
|-------------------------|------------------------------------|-------------------------------------------------|
| `design(options)`       | `Promise<Buffer>`                  | Generate speech with a natural language voice description. Returns WAV. |
| `designStream(options)` | `AsyncGenerator<AudioStreamChunk>` | Stream speech with a voice description via SSE. |

### `client.jobs`

| Method                              | Returns              | Description                           |
|-------------------------------------|----------------------|---------------------------------------|
| `get(jobId)`                        | `Promise<JobStatus>` | Get the status of an async job.       |
| `waitForCompletion(jobId, options?)` | `Promise<JobStatus>` | Poll until job completes or fails.    |

## Supported Languages

Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian

## Requirements

- **Node.js 18+** (uses native `fetch` and `AbortSignal.timeout`)
- **Zero runtime dependencies** -- only devDependencies for building and testing

## License

MIT
