# murmr-sdk

Official Node.js SDK for the murmr TTS API (`@murmr/sdk`).

## Purpose

Provides a typed client for all murmr API endpoints: batch TTS, voice design, saved voices, async jobs, and long-form audio generation. Zero runtime dependencies.

## Project Structure

```
murmr-sdk/
├── src/
│   ├── index.ts           # Public exports
│   ├── client.ts          # MurmrClient — base HTTP client with auth + timeout
│   ├── types.ts           # All TypeScript interfaces and types
│   ├── errors.ts          # MurmrError, MurmrChunkError
│   ├── chunker.ts         # Sentence-boundary text chunking (multi-language)
│   ├── audio-concat.ts    # WAV header manipulation + format-aware concatenation
│   ├── long-form.ts       # Long-form engine: chunk → generate → retry → concatenate
│   └── resources/
│       ├── speech.ts      # client.speech.create(), client.speech.createLongForm()
│       ├── voices.ts      # client.voices.design(), .list(), .save(), .delete()
│       └── jobs.ts        # client.jobs.get(), client.jobs.waitForCompletion()
├── test/
│   ├── chunker.test.ts
│   ├── audio-concat.test.ts
│   └── long-form.test.ts
├── package.json
└── tsconfig.json
```

## Development

```bash
# Install dependencies
npm install

# Build (CJS + ESM + type declarations)
npx tsup src/index.ts --format cjs,esm --dts --clean

# Run tests
npx vitest run

# Type check
npx tsc --noEmit
```

## Key Patterns

### Sentence-Boundary Chunking
`splitIntoChunks()` splits text at sentence endings (`.!?` and CJK equivalents), falling back to clause boundaries, then word boundaries. Max chunk size respects the 4096-char API limit.

### WAV Header Manipulation
`concatenateAudio()` strips WAV headers from individual chunks, concatenates raw PCM with optional silence gaps, then writes a single valid WAV header. For compressed formats (mp3/opus/aac/flac), chunks are binary-concatenated.

### Exponential Backoff Retry
Long-form generation retries failed chunks with `1s * 2^attempt` backoff. `MurmrChunkError` preserves the chunk index and progress for partial recovery.

### Async Jobs (Webhook + Polling)
`speech.create()` with `webhook_url` returns `AsyncJobResponse` (202). `jobs.waitForCompletion()` polls with configurable interval and timeout.

## Important Constraints

- Node.js >= 18 (uses native `fetch` and `AbortSignal.timeout`)
- Zero runtime dependencies (only devDependencies: tsup, vitest, typescript)
- Audio constants: 24kHz, mono, 16-bit PCM (matches Qwen3-TTS output)
- API limit: 4096 chars per request; long-form handles chunking automatically

## See Also

- **Monorepo context:** [../CLAUDE.md](../CLAUDE.md)
- **API Gateway:** [../murmr-worker/CLAUDE.md](../murmr-worker/CLAUDE.md)
- **Backend:** [../murmr-api/CLAUDE.md](../murmr-api/CLAUDE.md)
