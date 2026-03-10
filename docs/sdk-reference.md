# SDK Reference

Complete reference for the `@murmr/sdk` Node.js client. All methods, parameters, return types, and utility functions.

## MurmrClient

The main entry point. Create one instance and reuse it across your application.

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
  // baseUrl: 'https://api.murmr.dev', // default
  // timeout: 300_000,                 // 5 min default
});
```

### Constructor Options

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `apiKey` | `string` | Yes | -- | Your murmr API key. Sent as a Bearer token. |
| `baseUrl` | `string` | No | `https://api.murmr.dev` | Override the API base URL. |
| `timeout` | `number` | No | `300000` | Request timeout in milliseconds (5 minutes default). |

The client exposes three resource namespaces: `client.speech`, `client.voices`, and `client.jobs`.

## client.speech.create()

Submits a batch job and returns an `AsyncJobResponse` with a job ID. Use `createAndWait()` for a synchronous experience.

```typescript
const job = await client.speech.create({
  input: "Hello, world!",
  voice: "voice_abc123",            // Saved voice ID
  language: "English",              // optional, default: "English"
});

// job = { id: "job_xyz", status: "queued", created_at: "..." }

// Poll for completion
const result = await client.jobs.waitForCompletion(job.id);
writeFileSync("output.wav", Buffer.from(result.audio_base64!, "base64"));
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | `string` | Yes | -- | Text to synthesize. Max 4,096 characters. |
| `voice` | `string` | Yes | -- | Saved voice ID (e.g. `voice_abc123`). |
| `voice_clone_prompt` | `string` | No | -- | Base64 voice embedding. Takes precedence over `voice` if set. |
| `language` | `string` | No | `English` | Output language. 10 supported + "auto". |
| `response_format` | `AudioFormat` | No | `wav` | Audio format: `mp3`, `opus`, `aac`, `flac`, `wav`, or `pcm`. |
| `webhook_url` | `string` | No | -- | HTTPS URL for async delivery. Returns 202 with job ID. |

### Async Mode (Webhooks)

Pass a `webhook_url` to submit the job asynchronously. Audio will be POSTed to your webhook when ready.

```typescript
const job = await client.speech.create({
  input: "A long piece of text...",
  voice: "voice_abc123",
  webhook_url: "https://your-app.com/webhooks/murmr",
});

// job = { id: "job_xyz", status: "queued", created_at: "..." }
// Audio will be POSTed to your webhook when ready
```

## client.speech.createAndWait()

Convenience method that submits a batch job and polls until completion. Returns the completed `JobStatus` with audio data.

```typescript
const result = await client.speech.createAndWait({
  input: "Hello, world!",
  voice: "voice_abc123",
  language: "English",
  response_format: "wav",
  onPoll: (status) => console.log(status.status),
});

writeFileSync("output.wav", Buffer.from(result.audio_base64!, "base64"));
```

## client.speech.stream()

Stream audio using a saved voice via SSE. Returns an async generator of PCM audio chunks.

```typescript
const stream = await client.speech.stream({
  input: "Real-time audio streaming.",
  voice: "voice_abc123",
});

for await (const chunk of stream) {
  const audioData = chunk.audio || chunk.chunk;
  if (audioData) {
    const pcm = Buffer.from(audioData, "base64");
    // Process PCM: pipe to speaker, ffmpeg, etc.
  }
  if (chunk.done) break;
}
```

## client.speech.createLongForm()

Generate audio for text of any length. Handles sentence-boundary chunking, sequential generation, retry with exponential backoff, progress callbacks, and audio concatenation automatically.

```typescript
const result = await client.speech.createLongForm({
  input: longArticleText,          // No length limit
  voice: "voice_abc123",
  language: "English",
  chunkSize: 3500,                 // chars per chunk (default: 3500, max: 4096)
  silenceBetweenChunksMs: 400,     // silence gap (default: 400ms)
  maxRetries: 3,                   // retries per chunk (default: 3)
  onProgress: ({ current, total, percent }) => {
    console.log(`Chunk ${current}/${total} (${percent}%)`);
  },
});

writeFileSync("article.wav", Buffer.from(result.audio));
console.log(`${result.totalChunks} chunks, ${result.durationMs}ms total`);
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | `string` | Yes | -- | Text of any length. Automatically chunked at sentence boundaries. |
| `voice` | `string` | Yes | -- | Saved voice ID. |
| `chunkSize` | `number` | No | `3500` | Max characters per chunk. Range: 100-4096. |
| `silenceBetweenChunksMs` | `number` | No | `400` | Milliseconds of silence between chunks (WAV/PCM only). |
| `maxRetries` | `number` | No | `3` | Retry count per chunk. Backoff: 1s, 2s, 4s. |
| `startFromChunk` | `number` | No | `0` | Resume from a specific chunk index after failure. |
| `onProgress` | `(progress) => void` | No | -- | Callback after each chunk. Receives `{ current, total, percent }`. |

### Return Value

```typescript
interface LongFormResult {
  audio: Buffer;          // WAV audio with silence gaps
  totalChunks: number;    // Number of chunks processed
  durationMs: number;     // Total audio duration
  characterCount: number; // Total characters processed
}
```

### Resuming After Failure

If a chunk fails after all retries, a `MurmrChunkError` is thrown with the chunk index. Use `startFromChunk` to resume.

```typescript
import { MurmrChunkError } from '@murmr/sdk';

try {
  const result = await client.speech.createLongForm({ input, voice });
} catch (err) {
  if (err instanceof MurmrChunkError) {
    console.log(`Failed at chunk ${err.chunkIndex}/${err.totalChunks}`);
    console.log(`${err.completedChunks} chunks completed`);

    // Retry from the failed chunk
    const result = await client.speech.createLongForm({
      input,
      voice,
      startFromChunk: err.chunkIndex,
    });
  }
}
```

## client.voices.design()

Generate audio with a natural-language voice description. Returns audio as a `Buffer`.

```typescript
const audio = await client.voices.design({
  input: "Welcome to the show.",
  voice_description: "A deep, gravelly male voice, slow and deliberate",
  language: "English",
});
```

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | `string` | Yes | -- | Text to synthesize. Max 4,096 characters. |
| `voice_description` | `string` | Yes | -- | Natural language voice description. Max 500 characters. |
| `language` | `string` | No | `English` | Output language. |

## client.voices.designStream()

Stream audio with a voice description via SSE. Returns an async generator of PCM audio chunks.

```typescript
const stream = await client.voices.designStream({
  input: "Streaming with a designed voice.",
  voice_description: "A deep, authoritative male news anchor",
  language: "English",
});

for await (const chunk of stream) {
  const audioData = chunk.audio || chunk.chunk;
  if (audioData) {
    const pcm = Buffer.from(audioData, "base64");
  }
  if (chunk.done) break;
}
```

## client.voices.list()

List all saved voices for the authenticated user. Returns voice metadata and plan limits.

```typescript
const { voices, saved_count, saved_limit } = await client.voices.list();
for (const voice of voices) {
  console.log(`${voice.name} (${voice.id})`);
}
```

## client.voices.save()

Save a VoiceDesign output for reuse. Accepts WAV audio (`Buffer` or `Uint8Array`), base64-encodes it, and extracts embeddings server-side.

```typescript
const wav = await client.voices.design({
  input: "Sample text",
  voice_description: "A warm narrator",
});

const saved = await client.voices.save({
  name: "My Narrator",
  audio: wav,
  description: "A warm narrator",
});
console.log(saved.id);  // voice_abc123def456
```

Voice limits by plan: Free: 3, Starter: 10, Pro: 25, Realtime: 50, Scale: 100.

## client.voices.delete()

Delete a saved voice by ID.

```typescript
await client.voices.delete("voice_abc123def456");
```

## client.voices.extractEmbeddings()

Extract portable voice embeddings from audio. Store the returned `prompt_data` in your own database and pass it via `voice_clone_prompt` in any TTS request. See [Portable Embeddings](./portable-embeddings.md).

```typescript
const { prompt_data, prompt_size_bytes } = await client.voices.extractEmbeddings({
  audio: wavBuffer,
  ref_text: "Transcript of the reference audio.",
});

// Use the embedding in a TTS request
const stream = await client.speech.stream({
  input: "Hello from a portable voice!",
  voice: "inline",
  voice_clone_prompt: prompt_data,
});
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `audio` | `Buffer \| Uint8Array` | Yes | WAV audio to extract embeddings from. |
| `ref_text` | `string` | Yes | Transcript of the reference audio (improves extraction quality). |

## Async Jobs

`speech.create()` always returns a job ID. Use these methods to poll for completion, or pass a `webhook_url` for async delivery.

### client.jobs.get()

```typescript
const status = await client.jobs.get("job_xyz");
// status = { id, status: "queued"|"processing"|"completed"|"failed", ... }
```

### client.jobs.waitForCompletion()

Polls until the job reaches `completed` or `failed`.

```typescript
const result = await client.jobs.waitForCompletion("job_xyz", {
  pollIntervalMs: 3000,    // default: 3s (min: 1s)
  timeoutMs: 900_000,      // default: 15 min
  onPoll: (status) => {
    console.log(`Job status: ${status.status}`);
  },
});
```

Throws `MurmrError` with `code: 'JOB_FAILED'` if the job fails, or `code: 'TIMEOUT'` if the deadline is exceeded.

## Error Handling

```typescript
import { MurmrError, MurmrChunkError } from '@murmr/sdk';

try {
  const audio = await client.speech.create({ input, voice });
} catch (err) {
  if (err instanceof MurmrError) {
    console.error(err.message);    // "Usage limit exceeded..."
    console.error(err.status);     // 429
    console.error(err.code);       // "JOB_FAILED", "TIMEOUT", etc.
  }
}
```

| Class | When Thrown | Extra Properties |
|-------|------------|------------------|
| `MurmrError` | API errors, validation, timeouts | `status`, `code`, `cause` |
| `MurmrChunkError` | Long-form chunk failure after retries | `chunkIndex`, `completedChunks`, `totalChunks` |

## Utility Functions

Standalone exports for advanced use cases.

### splitIntoChunks()

Split text at sentence boundaries. Supports Latin and CJK punctuation.

```typescript
import { splitIntoChunks } from '@murmr/sdk';

const chunks = splitIntoChunks(longText, 3500);
// Splits at .!? and CJK equivalents
// Falls back to clause boundaries, then word boundaries
```

### concatenateAudio()

Concatenate multiple audio buffers with optional silence gaps.

```typescript
import { concatenateAudio } from '@murmr/sdk';

const combined = concatenateAudio(audioBuffers, 'wav', 400);
// WAV: strips headers, concatenates PCM, adds silence, writes new header
// PCM: concatenates raw data with silence
// MP3/Opus/AAC/FLAC: binary concatenation (no silence)
```

### Audio Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `SAMPLE_RATE` | `24000` | 24 kHz (Qwen3-TTS native rate) |
| `CHANNELS` | `1` | Mono |
| `BITS_PER_SAMPLE` | `16` | 16-bit PCM |
| `BYTES_PER_SAMPLE` | `2` | 2 bytes per sample |
| `WAV_HEADER_SIZE` | `44` | Standard RIFF/WAV header |

## Type Reference

All types are exported for use in your TypeScript code.

```typescript
import type {
  MurmrClientOptions,
  AudioFormat,          // 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  SpeechCreateOptions,
  SpeechStreamOptions,
  CreateAndWaitOptions,
  VoiceDesignOptions,
  VoiceDesignStreamOptions,
  AsyncJobResponse,
  JobStatus,
  LongFormOptions,
  LongFormProgress,
  LongFormResult,
  WebhookPayload,
} from '@murmr/sdk';
```

## See Also

- [Quickstart](./quickstart.md) -- Get started in 5 minutes
- [Async Jobs](./async-jobs.md) -- Webhooks, polling, and job lifecycle
- [Audio Formats](./audio-formats.md) -- Format specs and encoding details
- [Errors](./errors.md) -- All HTTP and WebSocket error codes
