# Browser Client

Connect to the real-time WebSocket endpoint from the browser. No dependencies -- just the native WebSocket API and Web Audio.

## Quick Start

```javascript
const ws = new WebSocket('wss://api.murmr.dev/v1/realtime');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'config',
    api_key: 'murmr_sk_live_xxx',
    voice_description: 'A warm, friendly narrator',
    language: 'English'
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'config_ack') {
    // Ready -- send text and flush to trigger generation
    ws.send(JSON.stringify({ type: 'text', text: 'Hello, world!' }));
    ws.send(JSON.stringify({ type: 'flush' }));
  }

  if (msg.type === 'audio') {
    // msg.chunk is base64 PCM (24kHz, 16-bit, mono)
    playAudioChunk(msg.chunk, msg.sample_rate);
  }

  if (msg.type === 'done') {
    console.log('TTFC:', msg.first_chunk_latency_ms, 'ms');
  }
};
```

For saved voices, use `voice_clone_prompt` instead of `voice_description`:

```javascript
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'config',
    api_key: 'murmr_sk_live_xxx',
    voice_clone_prompt: savedVoice.prompt_data,  // Base64 tensor data
    language: 'English'
  }));
};
```

## Web Audio Playback

Decode base64 PCM chunks and schedule seamless playback with the Web Audio API:

```javascript
class AudioPlayer {
  constructor(sampleRate = 24000) {
    this.ctx = new AudioContext({ sampleRate });
    this.nextTime = 0;
  }

  playChunk(base64Chunk) {
    // Decode base64 -> Uint8Array -> Int16Array
    const binary = atob(base64Chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const int16 = new Int16Array(bytes.buffer);

    // Convert Int16 -> Float32 for Web Audio (-1.0 to 1.0)
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    // Create audio buffer and schedule playback
    const buffer = this.ctx.createBuffer(1, float32.length, this.ctx.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    // Schedule after previous chunk for gapless playback
    const startTime = Math.max(this.ctx.currentTime, this.nextTime);
    source.start(startTime);
    this.nextTime = startTime + buffer.duration;
  }

  // Play raw PCM bytes directly (binary mode)
  playBinaryChunk(arrayBuffer) {
    const int16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    const buffer = this.ctx.createBuffer(1, float32.length, this.ctx.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);

    const startTime = Math.max(this.ctx.currentTime, this.nextTime);
    source.start(startTime);
    this.nextTime = startTime + buffer.duration;
  }
}
```

## Binary Mode

Binary mode sends raw PCM bytes instead of base64 JSON, saving ~50-100ms per chunk. Enable it after receiving `config_ack`:

```javascript
const player = new AudioPlayer(24000);
const ws = new WebSocket('wss://api.murmr.dev/v1/realtime');
ws.binaryType = 'arraybuffer';  // Required for binary frames

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'config',
    api_key: API_KEY,
    voice_description: 'A warm narrator',
  }));
};

ws.onmessage = (event) => {
  if (event.data instanceof ArrayBuffer) {
    // Binary frame -- raw PCM audio
    player.playBinaryChunk(event.data);
    return;
  }

  // Text frame -- JSON control message
  const msg = JSON.parse(event.data);

  if (msg.type === 'config_ack') {
    // Enable binary mode
    ws.send(JSON.stringify({ type: 'binary_mode' }));
  }

  if (msg.type === 'binary_mode_ack') {
    // Binary mode active -- send text
    ws.send(JSON.stringify({ type: 'text', text: 'Hello in binary mode!' }));
    ws.send(JSON.stringify({ type: 'flush' }));
  }

  if (msg.type === 'done') {
    console.log('TTFC:', msg.first_chunk_latency_ms, 'ms');
  }

  if (msg.type === 'error') {
    console.error('Error:', msg.message);
  }
};
```

> Set `ws.binaryType = 'arraybuffer'` before connecting. The default `blob` type requires an extra async conversion step.

## LLM Integration

Pipe streaming LLM tokens directly into the WebSocket. The server buffers text and generates audio at natural sentence/clause boundaries (50+ characters):

### OpenAI-Compatible

```javascript
const player = new AudioPlayer(24000);

// 1. Connect to murmr WebSocket
const ws = new WebSocket('wss://api.murmr.dev/v1/realtime');
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'config',
    api_key: MURMR_API_KEY,
    voice_description: 'A helpful, clear assistant voice',
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'audio') player.playChunk(msg.chunk);
  if (msg.type === 'done') console.log('Audio complete');
};

// 2. Stream from OpenAI-compatible API
async function speak(prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      const delta = JSON.parse(line.slice(6)).choices?.[0]?.delta?.content;
      if (delta) {
        // Send each token to murmr -- server handles buffering
        ws.send(JSON.stringify({ type: 'text', text: delta }));
      }
    }
  }

  // Flush remaining buffered text
  ws.send(JSON.stringify({ type: 'flush' }));
}

speak('Tell me a short story about a curious robot.');
```

### Generic Streaming

```javascript
// Works with any streaming text source
async function pipeToTTS(textStream, ws) {
  for await (const token of textStream) {
    ws.send(JSON.stringify({ type: 'text', text: token }));
  }
  ws.send(JSON.stringify({ type: 'flush' }));
}
```

> **Text buffering:** The server accumulates tokens until a natural break (sentence end with `.!?` or clause with `,;:` at 50+ chars) or 200 chars. You don't need to batch tokens client-side -- just send each one as it arrives.

## React Hook

```tsx
import { useState, useRef, useCallback } from 'react';

function useRealtimeTTS(apiKey: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);

  const connect = useCallback((voiceDescription: string) => {
    const ws = new WebSocket('wss://api.murmr.dev/v1/realtime');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'config',
        api_key: apiKey,
        voice_description: voiceDescription,
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'config_ack') {
        setIsConnected(true);
        playerRef.current = new AudioPlayer(24000);
      }

      if (msg.type === 'audio') {
        setIsPlaying(true);
        playerRef.current?.playChunk(msg.chunk);
      }

      if (msg.type === 'done') {
        setLatency(msg.first_chunk_latency_ms);
        setIsPlaying(false);
      }

      if (msg.type === 'error') {
        console.error('[TTS]', msg.message);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsPlaying(false);
    };
  }, [apiKey]);

  const speak = useCallback((text: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'text', text }));
    wsRef.current?.send(JSON.stringify({ type: 'flush' }));
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  return { connect, speak, disconnect, isConnected, isPlaying, latency };
}
```

## Error Handling and Reconnection

```javascript
function createReconnectingWS(config) {
  let ws = null;
  let retries = 0;
  const maxRetries = 5;
  const player = new AudioPlayer(24000);

  function connect() {
    ws = new WebSocket('wss://api.murmr.dev/v1/realtime');

    ws.onopen = () => {
      retries = 0;  // Reset on successful connect
      ws.send(JSON.stringify({
        type: 'config',
        api_key: config.apiKey,
        voice_description: config.voiceDescription,
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'audio') player.playChunk(msg.chunk);

      if (msg.type === 'error') {
        console.error('[TTS Error]', msg.message, 'code:', msg.code);
        // Non-fatal: connection stays open, can send more text
      }
    };

    ws.onclose = (event) => {
      switch (event.code) {
        case 1000:
        case 1001:
          // Normal close or server shutdown -- reconnect
          break;
        case 4001:
          console.error('Auth timeout -- send config within 10s');
          return;  // Don't retry
        case 4002:
          console.error('Auth failed -- check API key and plan');
          return;  // Don't retry
        case 4003:
          console.error('Invalid message format');
          return;  // Don't retry
        case 4004:
          console.error('Rate limited');
          break;  // Retry with backoff
        case 4005:
          console.error('Server error');
          break;  // Retry with backoff
      }

      // Exponential backoff
      if (retries < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, retries), 30000);
        retries++;
        console.log(`Reconnecting in ${delay}ms (attempt ${retries})`);
        setTimeout(connect, delay);
      }
    };
  }

  connect();
  return {
    send: (text) => {
      ws?.send(JSON.stringify({ type: 'text', text }));
    },
    flush: () => {
      ws?.send(JSON.stringify({ type: 'flush' }));
    },
    close: () => {
      retries = maxRetries;  // Prevent reconnection
      ws?.close();
    },
  };
}
```

## Security: Proxy Pattern

Never expose your API key in client-side code. Proxy through your backend and inject the key server-side:

```typescript
// Backend WebSocket proxy (Node.js)
import { WebSocket, WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (clientWs, req) => {
  // Authenticate with your own auth system
  const user = authenticateUser(req);
  if (!user) {
    clientWs.close(4002, 'Unauthorized');
    return;
  }

  const murmrWs = new WebSocket('wss://api.murmr.dev/v1/realtime');

  murmrWs.on('open', () => {
    clientWs.on('message', (data, isBinary) => {
      if (isBinary) {
        murmrWs.send(data);
        return;
      }

      const msg = JSON.parse(data.toString());
      if (msg.type === 'config') {
        // Inject your API key -- client never sees it
        msg.api_key = process.env.MURMR_API_KEY;
      }
      murmrWs.send(JSON.stringify(msg));
    });
  });

  // Forward all responses (binary + text)
  murmrWs.on('message', (data, isBinary) => {
    clientWs.send(data, { binary: isBinary });
  });

  murmrWs.on('close', (code, reason) => {
    clientWs.close(code, reason.toString());
  });

  clientWs.on('close', () => murmrWs.close());
});
```

> API keys starting with `murmr_sk_live_` must never appear in client-side code. Use the proxy pattern for production apps.

## See Also

- [WebSocket Protocol](./websocket-protocol.md) -- Full message type reference, text buffering rules, close codes
- [Streaming](./streaming.md) -- Simpler alternative for one-shot generation
- [Voice Management](./voices.md) -- Get `voice_clone_prompt` for saved voice WebSocket
