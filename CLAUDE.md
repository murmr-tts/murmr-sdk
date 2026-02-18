# murmr-sdk

Official Node.js SDK for the murmr TTS API. Published as `@murmr/sdk@0.1.0` on npm.

## Project Structure

```
murmr-sdk/
├── src/
│   ├── index.ts           # Public exports
│   ├── client.ts          # MurmrClient — base HTTP client with auth + timeout
│   ├── types.ts           # TypeScript interfaces
│   ├── errors.ts          # MurmrError, MurmrChunkError (preserves status/type/code from cause)
│   ├── validate.ts        # validateInput(), validateId() — shared input validation
│   ├── chunker.ts         # Sentence-boundary text chunking (multi-language)
│   ├── streaming.ts       # SSE parsing, collectStreamAsWav(), collectStreamAsPcm()
│   ├── audio-concat.ts    # WAV header manipulation + concatenation
│   ├── long-form.ts       # Long-form engine via streaming endpoint
│   └── resources/
│       ├── speech.ts      # create(), createAndWait(), stream(), createLongForm()
│       ├── voices.ts      # design(), designStream()
│       └── jobs.ts        # get(), waitForCompletion()
├── test/
│   ├── validate.test.ts
│   ├── errors.test.ts
│   ├── chunker.test.ts
│   ├── audio-concat.test.ts
│   ├── speech.test.ts
│   ├── voices.test.ts
│   ├── jobs.test.ts
│   └── long-form.test.ts
├── package.json
└── tsconfig.json
```

## Development

```bash
pnpm install
pnpm run build        # CJS + ESM + type declarations via tsup
pnpm run test         # vitest (130 tests across 8 files)
pnpm run typecheck    # tsc --noEmit
```

## API Surface

### `speech.create(params)` — Batch TTS (async)
Calls `/v1/audio/speech` via RunPod Serverless. Always returns `AsyncJobResponse` (HTTP 202). Use `speech.createAndWait()` or `jobs.waitForCompletion()` to get the result.

### `speech.createAndWait(params)` — Batch TTS (blocking)
Convenience wrapper: calls `create()` then polls until the job completes. Returns the audio `ArrayBuffer`.

### `speech.stream(params)` — SSE Streaming
Calls `/v1/audio/speech/stream`. Returns an async generator of audio chunks via SSE.

### `speech.createLongForm(params)` — Long-form Generation
Chunks text at sentence boundaries, streams each chunk via `/v1/audio/speech/stream`, concatenates into a single WAV. Always produces WAV (no `response_format` param).

### `voices.design(params)` — Voice Design
Calls `/v1/voices/design/stream`, parses the SSE stream, returns the complete WAV buffer.

### `voices.designStream(params)` — Voice Design (streaming)
Returns an async generator of audio chunks from `/v1/voices/design/stream`.

### `jobs.get(jobId)` / `jobs.waitForCompletion(jobId)` — Job Management
Poll or wait for async batch jobs.

## Key Patterns

### Input Validation (`validate.ts`)
`validateInput()` checks text length (max 4096 chars), required fields. `validateId()` validates ID format (e.g., `voice_xxx`). Used across all resource methods.

### Sentence-Boundary Chunking
`splitIntoChunks()` splits at sentence endings (`.!?` and CJK equivalents), falls back to clause boundaries, then word boundaries. Max chunk size respects the 4096-char API limit.

### SSE Streaming (`streaming.ts`)
Parses Server-Sent Events from fetch responses. `collectStreamAsWav()` and `collectStreamAsPcm()` consume the full stream into a single buffer.

### WAV Concatenation
`concatenateAudio()` strips WAV headers from chunks, concatenates raw PCM with optional silence gaps, writes a single valid WAV header.

### Error Handling
`MurmrChunkError` preserves `status`, `type`, and `code` from the cause error, plus the chunk index for partial-failure recovery in long-form generation.

## Important Constraints

- Node.js >= 18 (native `fetch`, `AbortSignal.timeout`)
- Zero runtime dependencies
- Audio: 24kHz, mono, 16-bit PCM (matches Qwen3-TTS output)
- API limit: 4096 chars per request; long-form handles chunking automatically
- `speech.create()` always returns 202 (RunPod Serverless is queue-based)
- Streaming endpoints (`stream()`, `createLongForm()`) go to the dedicated pod via Cloudflare Tunnel

## Known Gaps (v0.2.0)

- **Voice management (list/save/delete) not exposed.** These routes only exist on the Next.js frontend, not the Cloudflare Worker. Requires adding routes to `murmr-worker` first.

## See Also

- **Monorepo context:** [../CLAUDE.md](../CLAUDE.md)
- **API Gateway:** [../murmr-worker/CLAUDE.md](../murmr-worker/CLAUDE.md)
- **Backend:** [../murmr-api/CLAUDE.md](../murmr-api/CLAUDE.md)
