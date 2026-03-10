# Rate Limits

murmr enforces rate limits to ensure fair usage and platform stability. This guide covers per-plan limits, overage pricing, character counting, concurrent request limits, and how to handle 429 responses.

## Per-Plan Limits

| Plan | Characters/Month | Concurrent Requests | Saved Voices | API Keys | WebSocket |
|------|-------------------|---------------------|--------------|----------|-----------|
| Free | 50,000 | 2 | 3 | 1 | No |
| Starter | 1,000,000 | 5 | 10 | 3 | No |
| Pro | 3,000,000 | 10 | 25 | 5 | No |
| Realtime | 3,000,000 | 10 | 50 | 10 | Yes |
| Scale | 10,000,000 | 25 | 100 | 25 | Yes |

> WebSocket access (`/v1/realtime`) requires the Realtime or Scale plan.

## Overage Pricing

When you exceed your monthly character allocation, additional characters are billed at the overage rate:

| Plan | Overage Rate |
|------|-------------|
| Starter | $12 per 1M characters |
| Pro | $10 per 1M characters |
| Realtime | $10 per 1M characters |
| Scale | $8 per 1M characters |

The Free plan does not allow overages. Requests are rejected with a `429` error when the limit is reached.

## Character Counting

Characters are counted from the `text` (or `input`) field in each request.

**Rules:**
- Whitespace characters (spaces, newlines, tabs) are counted
- Leading and trailing whitespace is trimmed before counting
- Each API call counts the full `text` length, even if the request fails during generation
- Long-form SDK calls count the sum of all chunk texts
- Voice Design and Speech endpoints count characters the same way

```typescript
// This request consumes 45 characters
await client.voices.design({
  input: 'Hello, world! This is a forty-five char test.',
  voice_description: 'A calm voice',
});
```

## Concurrent Request Limits

Each plan limits how many requests can be in-flight simultaneously. If you exceed the concurrent limit, the server returns `429` with concurrent limit metadata.

```typescript
import { MurmrClient, MurmrError } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

try {
  await client.speech.stream({ input: 'Hello', voice: 'voice_abc123' });
} catch (error) {
  if (error instanceof MurmrError && error.status === 429) {
    if (error.code === 'concurrent_limit') {
      console.error(
        `Concurrent limit: ${error.concurrentActive}/${error.concurrentLimit} active`
      );
    }
  }
}
```

### 429 Response Example

```json
{
  "error": {
    "type": "rate_limit_exceeded",
    "code": "concurrent_limit",
    "message": "Too many concurrent requests. Your plan allows 5 concurrent requests."
  }
}
```

Headers:

```
X-Concurrent-Limit: 5
X-Concurrent-Active: 5
```

## WebSocket Limits

The Realtime WebSocket endpoint has additional limits:

| Limit | Value |
|-------|-------|
| Concurrent connections per API key | 10 |
| Generations per minute per API key | 100 |

Exceeding the connection limit closes the oldest connection with WebSocket close code `4003`. Exceeding generations per minute returns an `error` message on the WebSocket.

## Rate Limit Headers

Every API response includes these headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Total characters allowed this billing period |
| `X-RateLimit-Remaining` | Characters remaining |
| `X-RateLimit-Reset` | ISO 8601 timestamp when the limit resets |

```typescript
import { MurmrClient, isSyncResponse } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const result = await client.speech.create({
  input: 'Check remaining quota.',
  voice: 'voice_abc123',
});

if (isSyncResponse(result)) {
  const remaining = parseInt(result.headers.get('X-RateLimit-Remaining') || '0');
  const limit = parseInt(result.headers.get('X-RateLimit-Limit') || '0');
  const resetAt = new Date(result.headers.get('X-RateLimit-Reset') || '');

  console.log(`${remaining.toLocaleString()}/${limit.toLocaleString()} chars remaining`);
  console.log(`Resets at: ${resetAt.toISOString()}`);
}
```

## Handling 429 with Exponential Backoff

```typescript
import { MurmrClient, MurmrError } from '@murmr/sdk';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

async function generateWithBackoff(
  input: string,
  voice: string,
  maxRetries: number = 5,
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const stream = await client.speech.stream({ input, voice });
      for await (const chunk of stream) {
        const audio = chunk.audio || chunk.chunk;
        if (audio) {
          // Process audio chunk
        }
      }
      return; // Success
    } catch (error) {
      if (!(error instanceof MurmrError) || error.status !== 429) {
        throw error; // Non-retryable error
      }

      if (attempt === maxRetries) {
        throw error; // Exhausted retries
      }

      const delay = Math.min(1000 * Math.pow(2, attempt), 60_000);

      if (error.code === 'monthly_limit') {
        console.error('Monthly limit reached. Upgrade your plan or wait for reset.');
        throw error; // Do not retry monthly limits
      }

      console.log(`Rate limited (${error.code}). Retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

## Monthly Reset

Character usage resets on the same day each month, aligned with your subscription start date. The reset timestamp is available in the `X-RateLimit-Reset` header.

> After reset, your full monthly allocation is restored. Unused characters do not roll over.

## See Also

- [Authentication](https://murmr.dev/en/docs/authentication) -- Plan details and API key management
- [Errors](https://murmr.dev/en/docs/errors) -- Full error reference including 429 sub-types
- [Realtime WebSocket](https://murmr.dev/en/docs/realtime) -- WebSocket-specific rate limits
- [Async Jobs](https://murmr.dev/en/docs/async-jobs) -- Concurrent limits for batch jobs
