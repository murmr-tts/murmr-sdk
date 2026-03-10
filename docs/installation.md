# Installation

Install the `@murmr/sdk` package and configure your client in under two minutes. The SDK is TypeScript-first with zero runtime dependencies.

## Requirements

- **Node.js 18+** (uses native `fetch` and `AbortSignal.timeout`)
- A **murmr API key** ([sign up at murmr.dev](https://murmr.dev))
- **TypeScript** is recommended but not required

## Install

```bash
npm install @murmr/sdk
```

Or with your preferred package manager:

```bash
pnpm add @murmr/sdk
yarn add @murmr/sdk
```

## Set Your API Key

Store your API key as an environment variable. Never hardcode it.

```bash
# .env or shell profile
export MURMR_API_KEY="murmr_sk_live_..."
```

## Initialize the Client

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});
```

The client accepts optional configuration:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | (required) | Your murmr API key. Sent as a Bearer token. |
| `baseUrl` | `string` | `https://api.murmr.dev` | Override the API base URL. |
| `timeout` | `number` | `300000` | Request timeout in milliseconds (5 min default). |

## Verify It Works

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const wav = await client.voices.design({
  input: 'Hello from murmr!',
  voice_description: 'A warm, friendly narrator',
  language: 'English',
});

writeFileSync('hello.wav', wav);
console.log(`Generated ${wav.length} bytes`);
```

If this runs without errors and produces a valid WAV file, the SDK is installed and your API key is working.

## Project Structure

The client exposes three resource namespaces:

- **`client.speech`** -- Generate audio from text (batch, streaming, long-form)
- **`client.voices`** -- Design voices, save/list/delete, extract embeddings
- **`client.jobs`** -- Track async batch jobs

## See Also

- [Quickstart](./quickstart.md) -- Full walkthrough with voice design, streaming, and saving
- [Authentication](./authentication.md) -- API key formats, plans, and security
- [SDK Reference](./sdk-reference.md) -- All methods, parameters, and types
