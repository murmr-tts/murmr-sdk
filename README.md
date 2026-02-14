# @murmr/sdk

Official Node.js SDK for the [murmr](https://murmr.dev) TTS API.

**Zero runtime dependencies** | **TypeScript-first** | **Node 18+**

## Install

```bash
npm install @murmr/sdk
```

## Quick Start

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({ apiKey: process.env.MURMR_API_KEY! });

// Generate speech with a saved voice
const audio = await client.speech.create({
  input: 'Hello from murmr!',
  voice: 'voice_abc123',
}) as Buffer;

writeFileSync('hello.wav', audio);

// Generate speech with VoiceDesign (describe any voice)
const designed = await client.voices.design({
  input: 'Hello from murmr!',
  voice_description: 'A warm, friendly female narrator with a calm tone',
});

writeFileSync('designed.wav', designed);
```

## Long-Form Audio

Generate audio from text of any length. The SDK automatically splits text at sentence boundaries, generates each chunk sequentially with retries, and concatenates the results into a single file.

```typescript
const result = await client.speech.createLongForm({
  input: longArticleText,
  voice: 'voice_abc123',
  language: 'English',
  response_format: 'wav',
  chunkSize: 3500,              // Characters per chunk (default: 3500, max: 4096)
  silenceBetweenChunksMs: 400,  // Silence gap between chunks (default: 400)
  maxRetries: 3,                // Retries per chunk with exponential backoff (default: 3)
  onProgress: ({ current, total, percent }) => {
    console.log(`Chunk ${current}/${total} (${percent}%)`);
  },
});

writeFileSync('article.wav', result.audio);

console.log(`Generated ${result.totalChunks} chunks`);
console.log(`Duration: ${result.durationMs}ms`);
console.log(`Characters: ${result.characterCount}`);
```

> **Note:** `silenceBetweenChunksMs` only applies to WAV and PCM formats. For compressed formats (mp3, opus, aac, flac), chunks are binary-concatenated without silence since inserting silence would require re-encoding.

## Resume After Failure

If a long-form generation fails mid-way, `MurmrChunkError` tells you exactly where it stopped. Use `startFromChunk` to resume from the failed chunk without re-generating earlier chunks:

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
    console.log(`Successfully completed: ${err.completedChunks} chunks`);

    // Resume from the failed chunk
    const result = await client.speech.createLongForm({
      input: longText,
      voice: 'voice_abc123',
      startFromChunk: err.chunkIndex,
    });
  }
}
```

> **Important:** When resuming, the result only contains audio from `startFromChunk` onward. You are responsible for concatenating it with any audio you saved from the earlier run.

## Async / Webhook Mode

For long-running generations, use a webhook to receive the result asynchronously instead of waiting for the response:

```typescript
// Submit with a webhook URL (must be HTTPS)
const job = await client.speech.create({
  input: 'A longer passage of text...',
  voice: 'voice_abc123',
  webhook_url: 'https://your-app.com/api/tts-webhook',
});

// Returns immediately with a job ID (HTTP 202)
console.log(`Job queued: ${job.id}`);
```

Your webhook endpoint receives a POST request with:

```typescript
import type { WebhookPayload } from '@murmr/sdk';

// POST body delivered to your webhook_url
const payload: WebhookPayload = {
  id: 'job_abc123',
  status: 'completed',       // or 'failed'
  audio: '<base64-encoded>',
  content_type: 'audio/wav',
  response_format: 'wav',
  duration_ms: 2340,
  total_time_ms: 1520,
  error: undefined,          // Present if status is 'failed'
};
```

### Polling (alternative to webhooks)

If you prefer polling over webhooks, use `jobs.waitForCompletion`:

```typescript
const job = await client.speech.create({
  input: 'Hello!',
  voice: 'voice_abc123',
  webhook_url: 'https://your-app.com/webhook', // Required to trigger async mode
});

const status = await client.jobs.waitForCompletion(job.id, {
  pollIntervalMs: 3000,   // How often to check (default: 3000, min: 1000)
  timeoutMs: 900_000,     // Give up after 15 minutes (default)
  onPoll: (status) => {
    console.log(`Job ${status.id}: ${status.status}`);
  },
});
```

## Voice Management

```typescript
// List all saved voices
const { voices, saved_count, saved_limit } = await client.voices.list();
console.log(`Using ${saved_count}/${saved_limit} voice slots`);

// Design a voice (generates audio with a described voice)
const audio = await client.voices.design({
  input: 'Sample text to hear the voice',
  voice_description: 'A deep, authoritative male news anchor',
  language: 'English',
  response_format: 'wav',
});

// Save the designed voice for reuse
const saved = await client.voices.save({
  name: 'News Anchor',
  audio,                          // The Buffer from voices.design()
  description: 'Deep male news anchor voice',
  language: 'English',
});

console.log(`Saved as ${saved.id}`); // Use this ID in speech.create()

// Delete a saved voice
await client.voices.delete(saved.id);
```

## Response Formats

| Format | Content Type       | Notes                                    |
|--------|--------------------|------------------------------------------|
| `wav`  | `audio/wav`        | Default. Lossless, supports silence gaps. |
| `pcm`  | `audio/pcm`        | Raw 24kHz 16-bit mono. Supports silence gaps. |
| `mp3`  | `audio/mpeg`       | Compressed. No silence insertion.        |
| `opus` | `audio/opus`       | Compressed. No silence insertion.        |
| `aac`  | `audio/aac`        | Compressed. No silence insertion.        |
| `flac` | `audio/flac`       | Lossless compressed. No silence insertion. |

Specify the format with `response_format`:

```typescript
const mp3 = await client.speech.create({
  input: 'Hello!',
  voice: 'voice_abc123',
  response_format: 'mp3',
}) as Buffer;
```

## Error Handling

The SDK throws typed errors with contextual information:

```typescript
import { MurmrError, MurmrChunkError } from '@murmr/sdk';

try {
  const audio = await client.speech.create({
    input: 'Hello!',
    voice: 'voice_abc123',
  });
} catch (err) {
  if (err instanceof MurmrChunkError) {
    // Long-form chunk failure — includes resume info
    console.log(err.chunkIndex);      // Which chunk failed (0-indexed)
    console.log(err.completedChunks); // How many succeeded before failure
    console.log(err.totalChunks);     // Total chunks in the generation
  } else if (err instanceof MurmrError) {
    // API or validation error
    console.log(err.message);         // Human-readable message
    console.log(err.status);          // HTTP status (e.g. 401, 429)
    console.log(err.code);            // Error code (e.g. 'JOB_FAILED', 'TIMEOUT')
  }
}
```

## API Reference

### `new MurmrClient(options)`

| Option    | Type     | Default                   | Description           |
|-----------|----------|---------------------------|-----------------------|
| `apiKey`  | `string` | *required*                | Your murmr API key    |
| `baseUrl` | `string` | `https://api.murmr.dev`   | API base URL          |
| `timeout` | `number` | `300000`                  | Request timeout in ms |

### `client.speech`

| Method                      | Returns                          | Description                                    |
|-----------------------------|----------------------------------|------------------------------------------------|
| `create(options)`           | `Promise<Buffer \| AsyncJobResponse>` | Generate speech. Returns `Buffer` for sync, `AsyncJobResponse` with `webhook_url`. |
| `createLongForm(options)`   | `Promise<LongFormResult>`        | Generate long-form audio with chunking and retries. |

### `client.voices`

| Method              | Returns                       | Description                             |
|---------------------|-------------------------------|-----------------------------------------|
| `list()`            | `Promise<VoiceListResponse>`  | List all saved voices.                  |
| `design(options)`   | `Promise<Buffer>`             | Generate speech with a voice description. |
| `save(options)`     | `Promise<SavedVoice>`         | Save a generated voice for reuse.       |
| `delete(voiceId)`   | `Promise<void>`               | Delete a saved voice.                   |

### `client.jobs`

| Method                               | Returns                | Description                                |
|---------------------------------------|------------------------|--------------------------------------------|
| `get(jobId)`                          | `Promise<JobStatus>`   | Get the status of an async job.            |
| `waitForCompletion(jobId, options?)`  | `Promise<JobStatus>`   | Poll until job completes or fails.         |

### Supported Languages

Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian

## Requirements

- **Node.js 18+** (uses native `fetch` and `AbortSignal.timeout`)
- **Zero runtime dependencies** -- only devDependencies for building and testing

## License

MIT
