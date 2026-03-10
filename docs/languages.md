# Languages

murmr supports 10 languages for text-to-speech generation. This guide covers supported languages, auto-detection, cross-lingual synthesis, and best practices.

## Supported Languages

| Language | Parameter Value |
|----------|----------------|
| Chinese (Mandarin) | `Chinese` |
| English | `English` |
| French | `French` |
| German | `German` |
| Italian | `Italian` |
| Japanese | `Japanese` |
| Korean | `Korean` |
| Portuguese | `Portuguese` |
| Russian | `Russian` |
| Spanish | `Spanish` |

> Use full language names, not ISO codes. The `language` parameter is case-insensitive.

## Setting the Language

Pass the `language` parameter in any TTS request:

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

const wav = await client.voices.design({
  input: 'Bonjour, comment allez-vous aujourd\'hui?',
  voice_description: 'A warm French woman, mid-30s, Parisian accent',
  language: 'French',
});

writeFileSync('french.wav', wav);
```

The `language` parameter is available on all endpoints: batch, streaming, voice design, and WebSocket.

## Auto-Detection

When `language` is omitted or set to `Auto`, murmr detects the language from the input text.

```typescript
// Language auto-detected as Japanese
const wav = await client.voices.design({
  input: 'こんにちは、元気ですか？',
  voice_description: 'A polite Japanese woman',
});
```

> **When to set language explicitly:** Auto-detection works well for monolingual text but can misidentify short phrases or text with mixed-language content. Always set the language explicitly when you know it.

## Cross-Lingual Synthesis

murmr supports cross-lingual synthesis: you can generate speech in one language using a voice designed with a description in another language. The voice characteristics (tone, pace, timbre) transfer across languages.

```typescript
import { MurmrClient } from '@murmr/sdk';
import { writeFileSync } from 'node:fs';

const client = new MurmrClient({
  apiKey: process.env.MURMR_API_KEY!,
});

// Design a voice with an English description
const refText = 'This is the reference audio for my multilingual voice.';
const wav = await client.voices.design({
  input: refText,
  voice_description: 'A professional male narrator, deep voice, calm delivery',
  language: 'English',
});

// Save it
const saved = await client.voices.save({
  name: 'Multilingual Narrator',
  description: 'Deep, calm male voice for multilingual content',
  audio: wav,
  ref_text: refText,
});

// Use the same voice in different languages
const languages = [
  { lang: 'Spanish', text: 'Bienvenidos a nuestra plataforma.' },
  { lang: 'German', text: 'Willkommen auf unserer Plattform.' },
  { lang: 'Japanese', text: 'プラットフォームへようこそ。' },
  { lang: 'Korean', text: '우리 플랫폼에 오신 것을 환영합니다.' },
];

for (const { lang, text } of languages) {
  const stream = await client.speech.stream({
    input: text,
    voice: saved.id,
    language: lang,
  });

  for await (const chunk of stream) {
    // Process audio
  }

  console.log(`Generated ${lang} audio`);
}
```

## Language-Specific Tips

### Chinese (Mandarin)

- Input should be in simplified or traditional Chinese characters
- Pinyin is not supported as input
- The model handles tone marks natively

```typescript
await client.voices.design({
  input: '欢迎使用我们的语音合成服务。',
  voice_description: 'A professional Chinese male announcer',
  language: 'Chinese',
});
```

### Japanese

- Supports kanji, hiragana, and katakana
- Furigana is not needed; the model reads kanji correctly in context

```typescript
await client.voices.design({
  input: '本日はお越しいただきありがとうございます。',
  voice_description: 'A polite Japanese woman in her 30s',
  language: 'Japanese',
});
```

### Korean

- Standard hangul input
- Hanja (Chinese characters) may not be read correctly; use hangul equivalents

```typescript
await client.voices.design({
  input: '오늘 발표를 시작하겠습니다.',
  voice_description: 'A confident Korean male presenter',
  language: 'Korean',
});
```

### European Languages

English, French, German, Italian, Portuguese, Russian, and Spanish all work with standard Unicode text. For best results:

- Use proper diacritics (e.g., `resume` vs `resume` in French)
- Write numbers as words for critical pronunciation
- Use native punctuation conventions

```typescript
// Portuguese with proper diacritics
await client.voices.design({
  input: 'Bem-vindos a nossa plataforma de sintese de voz.',
  voice_description: 'A friendly Brazilian Portuguese woman',
  language: 'Portuguese',
});
```

## Best Practices

| Practice | Reason |
|----------|--------|
| Always set `language` explicitly | Avoids auto-detection errors, especially for short text |
| Use native script | `Chinese` expects Chinese characters, not pinyin or romanization |
| Write numbers as words | "twenty-five" is more reliable than "25" across languages |
| Test voice descriptions in English | Voice Design descriptions work best in English, even for non-English output |
| Keep sentences natural length | Very short fragments (under 5 words) may have inconsistent prosody |

## Mixed-Language Text

For text containing multiple languages (e.g., English with occasional French words), set the `language` to the dominant language. The model handles common loanwords and proper nouns naturally.

```typescript
await client.voices.design({
  input: 'The restaurant serves excellent creme brulee and pain au chocolat.',
  voice_description: 'An American woman with good French pronunciation',
  language: 'English', // Dominant language
});
```

> For content that alternates significantly between languages, consider splitting into separate requests with the appropriate language set for each segment.

## See Also

- [Voice Design](https://murmr.dev/en/docs/voicedesign) -- Voice descriptions and language
- [Speech Generation](https://murmr.dev/en/docs/speech) -- The `language` parameter in API calls
- [Text Formatting](https://murmr.dev/en/docs/text-formatting) -- How text structure affects prosody
- [Long-Form Audio](https://murmr.dev/en/docs/long-form) -- Chunking behavior with CJK text
