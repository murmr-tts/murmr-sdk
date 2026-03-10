# Authentication

All requests to the murmr API require an API key. This guide covers key formats, authentication methods, usage limits, and security best practices.

## API Key Format

murmr API keys follow a predictable format:

| Prefix | Environment | Example |
|--------|-------------|---------|
| `murmr_sk_live_` | Production | `murmr_sk_live_abc123def456...` |
| `murmr_sk_test_` | Testing | `murmr_sk_test_abc123def456...` |

Test keys have the same rate limits as your plan but do not count toward your monthly character usage. Use test keys during development and CI.

## Bearer Token Authentication

Every API request requires the `Authorization` header with a Bearer token:

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});
```

The SDK sets the header automatically. If you call the REST API directly:

```bash
curl -X POST https://api.murmr.dev/v1/voices/design \
  -H "Authorization: Bearer murmr_sk_live_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "voice_description": "A calm voice"}'
```

## Usage Limit Headers

Every API response includes headers that report your current usage:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum characters allowed per billing period |
| `X-RateLimit-Remaining` | Characters remaining in the current period |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the limit resets |

```typescript
import { MurmrClient, isSyncResponse } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.speech.create({
  input: 'Check my usage.',
  voice: 'voice_abc123',
});

if (isSyncResponse(result)) {
  const remaining = result.headers.get('X-RateLimit-Remaining');
  const limit = result.headers.get('X-RateLimit-Limit');
  console.log(`${remaining}/${limit} characters remaining`);
}
```

## Plans and Limits

| Plan | Price | Characters/Month | Saved Voices | API Keys |
|------|-------|-------------------|--------------|----------|
| Free | $0 | 50,000 | 3 | 1 |
| Starter | $10 | 1,000,000 | 10 | 3 |
| Pro | $25 | 3,000,000 | 25 | 5 |
| Realtime | $49 | 3,000,000 | 50 | 10 |
| Scale | $99 | 10,000,000 | 100 | 25 |

> The Realtime plan includes WebSocket access (`/v1/realtime`). All other plans are limited to HTTP endpoints. See [Rate Limits](https://murmr.dev/en/docs/rate-limits) for concurrent request limits and overage pricing.

## Security Best Practices

### Use Environment Variables

Never commit API keys to source control.

```typescript
// Correct: environment variable
const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// Wrong: hardcoded key
const client = new MurmrClient({
  apiKey: 'murmr_sk_live_abc123...',  // DO NOT DO THIS
});
```

### Separate Keys by Environment

Use different API keys for development, staging, and production. Rotate keys immediately if one is exposed.

### Server-Side Only

API keys should only be used in server-side code. Never expose them in client-side JavaScript, mobile apps, or public repositories. If you need browser playback, proxy requests through your backend.

```typescript
// Your backend endpoint
app.post('/api/tts', async (req, res) => {
  const client = new MurmrClient({
    apiKey: process.env.MURMR_API_KEY!,
  });

  const result = await client.speech.create({
    input: req.body.text,
    voice: req.body.voice,
  });

  // Forward audio to the browser
  // ...
});
```

### Rotate Compromised Keys

If a key is exposed:

1. Generate a new key in the [murmr dashboard](https://murmr.dev)
2. Update your environment variables
3. Delete the compromised key
4. Check your usage logs for unauthorized activity

## Client Configuration

The `MurmrClient` constructor accepts these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | (required) | Your murmr API key |
| `baseUrl` | `string` | `https://api.murmr.dev` | API base URL |
| `timeout` | `number` | `300000` | Request timeout in milliseconds (5 min) |

```typescript
import { MurmrClient } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
  timeout: 60_000, // 1 minute timeout
});
```

## See Also

- [Quickstart](https://murmr.dev/en/docs/quickstart) -- Get started in 5 minutes
- [Rate Limits](https://murmr.dev/en/docs/rate-limits) -- Concurrent limits and overage pricing
- [Errors](https://murmr.dev/en/docs/errors) -- Handling 401 and 429 responses
