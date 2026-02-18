import { describe, it, expect } from 'vitest';
import { validateInput, validateId, MAX_INPUT_LENGTH } from '../src/validate';
import { MurmrError } from '../src/errors';

describe('validateInput', () => {
  it('throws for empty string', () => {
    expect(() => validateInput('')).toThrow(MurmrError);
    expect(() => validateInput('')).toThrow('input text is required and cannot be empty');
  });

  it('throws for whitespace-only string', () => {
    expect(() => validateInput('   ')).toThrow(MurmrError);
    expect(() => validateInput('\t\n')).toThrow(MurmrError);
  });

  it('throws for input exceeding 4096 characters', () => {
    const longInput = 'a'.repeat(MAX_INPUT_LENGTH + 1);
    expect(() => validateInput(longInput)).toThrow(MurmrError);
    expect(() => validateInput(longInput)).toThrow(
      `input text exceeds ${MAX_INPUT_LENGTH} character limit`,
    );
  });

  it('passes for valid input at exact limit', () => {
    const exactLimit = 'a'.repeat(MAX_INPUT_LENGTH);
    expect(() => validateInput(exactLimit)).not.toThrow();
  });

  it('passes for normal valid input', () => {
    expect(() => validateInput('Hello, world!')).not.toThrow();
  });

  it('passes for input with leading/trailing whitespace but content', () => {
    expect(() => validateInput('  hello  ')).not.toThrow();
  });
});

describe('validateId', () => {
  it('throws for empty string', () => {
    expect(() => validateId('', 'jobId')).toThrow(MurmrError);
    expect(() => validateId('', 'jobId')).toThrow('Invalid jobId');
  });

  it('throws for string with special characters', () => {
    expect(() => validateId('job@123', 'jobId')).toThrow(MurmrError);
    expect(() => validateId('job 123', 'jobId')).toThrow(MurmrError);
    expect(() => validateId('job/123', 'jobId')).toThrow(MurmrError);
    expect(() => validateId('job.123', 'jobId')).toThrow(MurmrError);
  });

  it('passes for alphanumeric with hyphens', () => {
    expect(() => validateId('job-123', 'jobId')).not.toThrow();
  });

  it('passes for alphanumeric with underscores', () => {
    expect(() => validateId('job_123', 'jobId')).not.toThrow();
  });

  it('passes for pure alphanumeric', () => {
    expect(() => validateId('abc123', 'jobId')).not.toThrow();
  });

  it('includes label in error message', () => {
    expect(() => validateId('', 'voiceId')).toThrow('Invalid voiceId');
  });
});
