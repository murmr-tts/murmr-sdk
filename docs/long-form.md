# Long-Form Audio

Generate audio from text of any length. The SDK automatically splits text into chunks, generates audio for each chunk via streaming, retries failures, and concatenates the results into a single WAV file.

## How It Works

1. **Split** -- Text is split into chunks at sentence boundaries (max 3,500 characters per chunk by default).
2. **Generate** -- Each chunk is sent to the streaming endpoint (`/v1/audio/speech/stream`) sequentially.
3. **Retry** -- Failed chunks are retried with exponential backoff (up to 3 retries by default).
4. **Concatenate** -- PCM audio from all chunks is joined with configurable silence gaps and wrapped in a WAV header.

## SDK Example

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const longText = `
Chapter One.

It was the best of times, it was the worst of times. It was the age of wisdom,
it was the age of foolishness. It was the epoch of belief, it was the epoch of
incredulity. It was the season of Light, it was the season of Darkness.

The narrator paused, then continued with renewed vigor...
`.repeat(10); // Simulate a long document

const result = await client.speech.createLongForm({
  input: longText,
  voice: 'voice_abc123',
  language: 'English',
  onProgress: (progress) => {
    console.log(`Chunk ${progress.current}/${progress.total} (${progress.percent}%)`);
  },
});

writeFileSync('chapter.wav', result.audio);
console.log(`Generated ${result.totalChunks} chunks`);
console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
console.log(`Characters: ${result.characterCount}`);
```

## Text Chunking Strategy

The SDK splits text at natural boundaries to preserve prosody. The priority order is:

1. **Sentence boundaries** -- Splits at `.` `!` `?` and their CJK equivalents (`。` `！` `？`).
2. **Clause boundaries** -- Falls back to `,` `;` `:` `--` and CJK equivalents for long sentences.
3. **Word boundaries** -- Last resort for extremely long runs without punctuation.

Each chunk stays under the configured `chunkSize` (default: 3,500 characters, max: 4,096).

You can also use the chunker independently:

```typescript
import { splitIntoChunks } from '@murmr/sdk';

const chunks = splitIntoChunks(longText, 3000);
console.log(`Split into ${chunks.length} chunks`);
for (const chunk of chunks) {
  console.log(`  ${chunk.length} chars: ${chunk.slice(0, 50)}...`);
}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | string | (required) | Text to synthesize. Any length. |
| `voice` | string | (required) | Saved voice ID. |
| `voice_clone_prompt` | string | -- | Base64-encoded embedding data. Overrides `voice`. |
| `language` | string | `English` | Language name. See [Languages](https://murmr.dev/en/docs/languages). |
| `chunkSize` | number | `3500` | Max characters per chunk (100--4096). |
| `silenceBetweenChunksMs` | number | `400` | Silence between chunks in milliseconds. |
| `maxRetries` | number | `3` | Max retry attempts per failed chunk. |
| `startFromChunk` | number | `0` | Resume from this chunk index (zero-based). |
| `onProgress` | function | -- | Callback for progress updates. |

## Return Type

The `createLongForm()` method returns a `LongFormResult`:

```typescript
interface LongFormResult {
  /** Complete WAV audio buffer */
  audio: Buffer;
  /** Number of text chunks processed */
  totalChunks: number;
  /** Estimated audio duration in milliseconds */
  durationMs: number;
  /** Total characters synthesized */
  characterCount: number;
}
```

## Audio Format

Long-form generation always produces a **WAV file** (24kHz, 16-bit, mono PCM). The `response_format` parameter is not supported because the SDK concatenates raw PCM chunks internally before wrapping them in a WAV header.

### Silence Between Chunks

The `silenceBetweenChunksMs` parameter inserts silence between chunks for natural pacing. The default is 400ms, which works well for narration and audiobooks.

| Use Case | Recommended Silence |
|----------|-------------------|
| Narration, audiobooks | 400ms (default) |
| Conversational, dialogue | 200--300ms |
| Rapid delivery, alerts | 100ms |
| No gap (continuous) | 0ms |

## Resume After Failure

If a chunk fails after all retries, `createLongForm()` throws a `MurmrChunkError` with information about which chunk failed and how many completed. Use `startFromChunk` to resume.

```typescript
import { MurmrClient, MurmrChunkError } from '@murmr/sdk';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const text = readFileSync('manuscript.txt', 'utf-8');

try {
  const result = await client.speech.createLongForm({
    input: text,
    voice: 'voice_abc123',
    onProgress: ({ current, total, percent }) => {
      console.log(`[${percent}%] Chunk ${current}/${total}`);
    },
  });

  writeFileSync('audiobook.wav', result.audio);
} catch (error) {
  if (error instanceof MurmrChunkError) {
    console.error(`Failed at chunk ${error.chunkIndex + 1}/${error.totalChunks}`);
    console.error(`${error.completedChunks} chunks completed before failure`);
    console.error(`Cause: ${error.message}`);

    // Save progress info for retry
    writeFileSync('progress.json', JSON.stringify({
      startFromChunk: error.chunkIndex,
      completedChunks: error.completedChunks,
    }));
  }
}

// Resume from where it stopped
if (existsSync('progress.json')) {
  const progress = JSON.parse(readFileSync('progress.json', 'utf-8'));

  const result = await client.speech.createLongForm({
    input: text,
    voice: 'voice_abc123',
    startFromChunk: progress.startFromChunk,
  });

  writeFileSync('audiobook.wav', result.audio);
}
```

### MurmrChunkError Fields

| Field | Type | Description |
|-------|------|-------------|
| `chunkIndex` | number | Zero-based index of the chunk that failed |
| `completedChunks` | number | Number of chunks that completed before the failure |
| `totalChunks` | number | Total number of chunks in the input |
| `message` | string | Error description |
| `status` | number | HTTP status from the underlying error (if applicable) |
| `cause` | Error | The original error that caused the failure |

## See Also

- [Speech Generation](https://murmr.dev/en/docs/speech) -- Single-request batch and streaming
- [Streaming](https://murmr.dev/en/docs/streaming) -- How SSE streaming works under the hood
- [Audio Formats](https://murmr.dev/en/docs/audio-formats) -- WAV format details
- [Text Formatting](https://murmr.dev/en/docs/text-formatting) -- How whitespace affects prosody
- [Errors](https://murmr.dev/en/docs/errors) -- Error handling and retry patterns
