# Realtime WebSocket

The WebSocket endpoint provides the lowest-latency path for text-to-speech. It maintains a persistent connection, supports text buffering for natural prosody, and delivers audio as binary frames or base64 JSON. Ideal for voice agents, conversational AI, and interactive applications.

> **Plan requirement:** The Realtime endpoint requires a **Realtime** ($49/mo) or **Scale** ($99/mo) plan.

## Endpoint

```
wss://api.murmr.dev/v1/realtime
```

Authentication is via query parameter:

```
wss://api.murmr.dev/v1/realtime?api_key=murmr_sk_live_xxx
```

## Protocol Overview

The WebSocket protocol uses JSON messages in both directions. Audio is delivered either as base64 in JSON messages or as raw binary WebSocket frames.

### Client to Server Messages

| Type | Description |
|------|-------------|
| `config` | Configure the session (voice, language, etc.) |
| `text` | Send text to synthesize |
| `flush` | Force generation of any buffered text |
| `binary_mode` | Switch between base64 JSON and raw binary audio |
| `ping` | Keep-alive heartbeat |

### Server to Client Messages

| Type | Description |
|------|-------------|
| `config_ack` | Confirms session configuration |
| `binary_mode_ack` | Confirms binary mode change |
| `audio` | Base64-encoded PCM audio chunk (JSON mode) |
| (binary frame) | Raw PCM audio bytes (binary mode) |
| `done` | Generation complete for the current utterance |
| `error` | Error message |
| `pong` | Response to ping |

## Session Configuration

Send a `config` message after connecting to set up the session.

```typescript
const ws = new WebSocket(
  `wss://api.murmr.dev/v1/realtime?api_key=${process.env.MURMR_API_KEY}`
);

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    type: 'config',
    voice: 'voice_abc123',
    language: 'English',
  }));
});

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data as string);
  if (msg.type === 'config_ack') {
    console.log('Session configured, ready to send text');
  }
});
```

### Config Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `voice` | string | Yes* | Saved voice ID |
| `voice_description` | string | Yes* | Natural language voice description (Voice Design mode) |
| `voice_clone_prompt` | string | No | Base64-encoded embedding data. Overrides `voice`. |
| `language` | string | No | Language name (default: `Auto`) |

> *Provide either `voice` or `voice_description`, not both.

## Sending Text

Send text incrementally. The server buffers text and generates speech when it detects a natural boundary (sentence end, paragraph break).

```typescript
// Text is buffered until a sentence boundary
ws.send(JSON.stringify({ type: 'text', text: 'Hello, ' }));
ws.send(JSON.stringify({ type: 'text', text: 'how are you today?' }));
// Audio generation starts after the question mark

// Force generation of any remaining buffered text
ws.send(JSON.stringify({ type: 'flush' }));
```

### Text Buffering Rules

| Input | Behavior |
|-------|----------|
| Text ending with `.` `!` `?` | Generates immediately |
| Text ending with `,` `;` `:` | Buffered until sentence end or flush |
| Text with `\n\n` | Generates with paragraph pause |
| `flush` message | Forces generation of all buffered text |

## Receiving Audio

### JSON Mode (Default)

Audio arrives as base64-encoded PCM in JSON messages:

```typescript
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data as string);

  if (msg.type === 'audio') {
    const pcm = Buffer.from(msg.audio, 'base64');
    // PCM: 24kHz, 16-bit, mono
  }

  if (msg.type === 'done') {
    console.log('Utterance complete');
  }

  if (msg.type === 'error') {
    console.error(`Error: ${msg.message}`);
  }
});
```

### Binary Mode

Binary mode sends raw PCM bytes as WebSocket binary frames, reducing bandwidth by ~33% (no base64 overhead). Enable it after configuration:

```typescript
ws.send(JSON.stringify({ type: 'binary_mode', enabled: true }));

ws.addEventListener('message', (event) => {
  if (event.data instanceof ArrayBuffer) {
    // Raw PCM: 24kHz, 16-bit signed LE, mono
    const pcm = new Int16Array(event.data);
    // Feed to audio player
  } else {
    const msg = JSON.parse(event.data);
    if (msg.type === 'binary_mode_ack') {
      console.log(`Binary mode: ${msg.enabled}`);
    }
    if (msg.type === 'done') {
      console.log('Utterance complete');
    }
  }
});
```

> In binary mode, control messages (`done`, `error`, `pong`) are still sent as JSON text frames. Only audio data is sent as binary.

## Examples

### Voice Design Mode

```typescript
const ws = new WebSocket(
  `wss://api.murmr.dev/v1/realtime?api_key=${process.env.MURMR_API_KEY}`
);

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    type: 'config',
    voice_description: 'A friendly customer service representative',
    language: 'English',
  }));
});
```

### Saved Voice Mode

```typescript
ws.addEventListener('open', () => {
  ws.send(JSON.stringify({
    type: 'config',
    voice: 'voice_abc123',
  }));
});
```

### LLM Integration

Pipe token-by-token output from an LLM directly into the WebSocket for real-time voice responses:

```typescript
import { WebSocket } from 'ws';

const ttsWs = new WebSocket(
  `wss://api.murmr.dev/v1/realtime?api_key=${process.env.MURMR_API_KEY}`
);

ttsWs.on('open', () => {
  ttsWs.send(JSON.stringify({
    type: 'config',
    voice: 'voice_abc123',
  }));
});

// As LLM tokens arrive:
function onLLMToken(token: string): void {
  ttsWs.send(JSON.stringify({ type: 'text', text: token }));
}

// When LLM response is complete:
function onLLMDone(): void {
  ttsWs.send(JSON.stringify({ type: 'flush' }));
}

// Handle audio output
ttsWs.on('message', (data) => {
  if (typeof data === 'string') {
    const msg = JSON.parse(data);
    if (msg.type === 'audio') {
      const pcm = Buffer.from(msg.audio, 'base64');
      // Stream to user's audio device
    }
  }
});
```

### Reconnection with Exponential Backoff

```typescript
function createRealtimeConnection(apiKey: string): WebSocket {
  let reconnectAttempts = 0;
  const maxReconnectDelay = 30_000;

  function connect(): WebSocket {
    const ws = new WebSocket(
      `wss://api.murmr.dev/v1/realtime?api_key=${apiKey}`
    );

    ws.addEventListener('open', () => {
      reconnectAttempts = 0;
      // Re-send config...
    });

    ws.addEventListener('close', (event) => {
      if (event.code !== 1000) {
        const delay = Math.min(
          1000 * Math.pow(2, reconnectAttempts),
          maxReconnectDelay
        );
        reconnectAttempts++;
        console.log(`Reconnecting in ${delay}ms...`);
        setTimeout(connect, delay);
      }
    });

    return ws;
  }

  return connect();
}
```

### Proxy Pattern for Browser Clients

Never expose your API key in browser code. Proxy WebSocket connections through your server:

```typescript
// Server-side (Node.js)
import { WebSocketServer, WebSocket } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (clientWs) => {
  // Authenticate client via your own auth system first

  const murmrWs = new WebSocket(
    `wss://api.murmr.dev/v1/realtime?api_key=${process.env.MURMR_API_KEY}`
  );

  clientWs.on('message', (data) => {
    if (murmrWs.readyState === WebSocket.OPEN) {
      murmrWs.send(data);
    }
  });

  murmrWs.on('message', (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(data);
    }
  });

  clientWs.on('close', () => murmrWs.close());
  murmrWs.on('close', () => clientWs.close());
});
```

## Close Codes

| Code | Meaning |
|------|---------|
| 4001 | Authentication failed (invalid or missing API key) |
| 4002 | Plan does not include realtime access |
| 4003 | Rate limit exceeded (too many concurrent connections) |
| 4004 | Invalid message format |
| 4005 | Server error during generation |

## Rate Limits

| Limit | Value |
|-------|-------|
| Concurrent WebSocket connections | 10 per API key |
| Generations per minute | 100 per API key |

Exceeding the concurrent connection limit closes the oldest connection with code `4003`. Exceeding generations per minute returns an `error` message.

## See Also

- [Streaming](https://murmr.dev/en/docs/streaming) -- SSE streaming for HTTP-based workflows
- [Speech Generation](https://murmr.dev/en/docs/speech) -- Batch and SSE endpoints
- [Authentication](https://murmr.dev/en/docs/authentication) -- Plan requirements for realtime
- [Rate Limits](https://murmr.dev/en/docs/rate-limits) -- WebSocket-specific limits
