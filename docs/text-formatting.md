# Text Formatting

How you format input text directly affects the prosody (rhythm, pacing, and pauses) of the generated speech. This guide covers whitespace behavior, best practices, and common pitfalls.

## How Newlines Affect Prosody

The TTS model interprets whitespace as cues for pausing and phrasing.

| Input | Effect |
|-------|--------|
| No newline (continuous text) | Rushed delivery, minimal pauses |
| `\n` (single newline) | Sentence-level pause |
| `\n\n` (double newline) | Paragraph-level pause (longer, more distinct) |

### Example: Before and After

**Without formatting (rushed):**

```typescript
const input = 'Welcome to the platform. We have three plans available. The free plan includes fifty thousand characters per month. The starter plan costs ten dollars.';
```

This produces a continuous stream with minimal pauses between sentences. It sounds unnatural for narration or instructional content.

**With formatting (natural pacing):**

```typescript
const input = `Welcome to the platform.

We have three plans available.

The free plan includes fifty thousand characters per month.
The starter plan costs ten dollars.`;
```

The double newline between the welcome and the plan introduction creates a clear paragraph break. Single newlines between plan descriptions create natural sentence pauses.

## Best Practices

| Do | Do Not |
|----|--------|
| Use `\n\n` between paragraphs | Run all text together in one line |
| Use `\n` between distinct sentences | Use `\n` for every line of a hard-wrapped document |
| Add punctuation at sentence endings | Omit periods, commas, and question marks |
| Write numbers as words ("fifty") | Use digits for spoken content ("50") |
| Clean text before sending | Send raw markdown, HTML, or formatting codes |
| Spell out abbreviations ("Doctor Smith") | Rely on abbreviation expansion ("Dr. Smith") |

## Common Pitfalls

### Hard-Wrapped Text

Text from PDFs, emails, or terminals often has hard line breaks at 72-80 characters. These cause unintended sentence pauses.

**Problem:**

```typescript
// Hard-wrapped at 80 chars -- causes pauses at each line break
const input = `The murmr text-to-speech API provides natural sounding speech\ngeneration with support for multiple languages and custom voice\ndescriptions using natural language.`;
```

**Fix:**

```typescript
// Unwrap into natural sentences
const input = `The murmr text-to-speech API provides natural sounding speech generation with support for multiple languages and custom voice descriptions using natural language.`;
```

### Markdown Left in Text

Markdown syntax (`#`, `**`, `*`, `` ` ``, `[]()`) is read aloud or causes garbled output.

**Problem:**

```typescript
const input = '## Getting Started\n\nVisit [murmr.dev](https://murmr.dev) to **create** an account.';
```

**Fix:**

```typescript
const input = 'Getting Started.\n\nVisit murmr.dev to create an account.';
```

### Excessive Newlines

Too many blank lines create awkwardly long pauses.

**Problem:**

```typescript
const input = 'First paragraph.\n\n\n\n\nSecond paragraph.';
```

**Fix:**

```typescript
const input = 'First paragraph.\n\nSecond paragraph.';
```

### Missing Punctuation

Without sentence-ending punctuation, the model does not know where to pause.

**Problem:**

```typescript
const input = 'Welcome to the app Click the button to continue Then enter your name';
```

**Fix:**

```typescript
const input = 'Welcome to the app. Click the button to continue. Then enter your name.';
```

## Preprocessing Function

Use this function to clean text before sending to the API:

```typescript
function preprocessText(raw: string): string {
  return raw
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, '')
    // Remove markdown bold/italic
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    // Remove markdown links, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove HTML tags
    .replace(/<[^>]+>/g, '')
    // Collapse 3+ newlines to 2
    .replace(/\n{3,}/g, '\n\n')
    // Unwrap hard-wrapped lines (single \n not preceded by sentence-ending punctuation)
    .replace(/([^.!?\n])\n([^\n])/g, '$1 $2')
    // Trim whitespace
    .trim();
}

// Usage
const cleaned = preprocessText(rawMarkdown);
const wav = await client.voices.design({
  input: cleaned,
  voice_description: 'A clear narrator',
});
```

## Quick Reference

| Character | Effect on Speech |
|-----------|-----------------|
| `.` | End of sentence, natural pause |
| `!` | End of sentence, emphasis |
| `?` | End of sentence, rising intonation |
| `,` | Brief pause within a sentence |
| `;` | Medium pause within a sentence |
| `:` | Medium pause, introduces what follows |
| `--` | Dramatic pause, parenthetical aside |
| `\n` | Sentence-level pause |
| `\n\n` | Paragraph-level pause |
| `...` | Trailing off, hesitation |

## See Also

- [Speech Generation](https://murmr.dev/en/docs/speech) -- Sending text to the API
- [Voice Design](https://murmr.dev/en/docs/voicedesign) -- Voice description best practices
- [Long-Form Audio](https://murmr.dev/en/docs/long-form) -- Automatic text chunking for long content
- [Languages](https://murmr.dev/en/docs/languages) -- Language-specific text considerations
