import { describe, it, expect } from 'vitest';
import { MurmrError, MurmrChunkError } from '../src/errors';

describe('MurmrError', () => {
  it('preserves message', () => {
    const err = new MurmrError('something went wrong');
    expect(err.message).toBe('something went wrong');
    expect(err.name).toBe('MurmrError');
  });

  it('preserves status', () => {
    const err = new MurmrError('rate limited', { status: 429 });
    expect(err.status).toBe(429);
  });

  it('preserves code', () => {
    const err = new MurmrError('not found', { code: 'NOT_FOUND' });
    expect(err.code).toBe('NOT_FOUND');
  });

  it('preserves type', () => {
    const err = new MurmrError('rate limited', { type: 'rate_limit_exceeded' });
    expect(err.type).toBe('rate_limit_exceeded');
  });

  it('preserves all fields together', () => {
    const err = new MurmrError('rate limited', {
      status: 429,
      code: 'RATE_LIMIT',
      type: 'rate_limit_exceeded',
      concurrentLimit: 5,
      concurrentActive: 5,
    });
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.type).toBe('rate_limit_exceeded');
    expect(err.concurrentLimit).toBe(5);
    expect(err.concurrentActive).toBe(5);
  });

  it('extends Error', () => {
    const err = new MurmrError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MurmrError);
  });

  it('preserves cause', () => {
    const cause = new Error('original');
    const err = new MurmrError('wrapped', { cause });
    expect(err.cause).toBe(cause);
  });

  it('has undefined fields when not provided', () => {
    const err = new MurmrError('simple');
    expect(err.status).toBeUndefined();
    expect(err.code).toBeUndefined();
    expect(err.type).toBeUndefined();
    expect(err.concurrentLimit).toBeUndefined();
    expect(err.concurrentActive).toBeUndefined();
  });
});

describe('MurmrChunkError', () => {
  it('preserves chunk metadata', () => {
    const err = new MurmrChunkError('chunk 3 failed', {
      chunkIndex: 2,
      completedChunks: 2,
      totalChunks: 5,
    });
    expect(err.chunkIndex).toBe(2);
    expect(err.completedChunks).toBe(2);
    expect(err.totalChunks).toBe(5);
    expect(err.name).toBe('MurmrChunkError');
  });

  it('extracts status/type/code from MurmrError cause', () => {
    const cause = new MurmrError('rate limited', {
      status: 429,
      type: 'rate_limit_exceeded',
      code: 'RATE_LIMIT',
      concurrentLimit: 3,
      concurrentActive: 3,
    });

    const err = new MurmrChunkError('chunk failed', {
      chunkIndex: 1,
      completedChunks: 1,
      totalChunks: 4,
      cause,
    });

    expect(err.status).toBe(429);
    expect(err.type).toBe('rate_limit_exceeded');
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.concurrentLimit).toBe(3);
    expect(err.concurrentActive).toBe(3);
    expect(err.cause).toBe(cause);
  });

  it('handles non-MurmrError cause gracefully', () => {
    const cause = new Error('generic error');

    const err = new MurmrChunkError('chunk failed', {
      chunkIndex: 0,
      completedChunks: 0,
      totalChunks: 3,
      cause,
    });

    expect(err.status).toBeUndefined();
    expect(err.type).toBeUndefined();
    expect(err.code).toBeUndefined();
    expect(err.concurrentLimit).toBeUndefined();
    expect(err.concurrentActive).toBeUndefined();
    expect(err.cause).toBe(cause);
  });

  it('handles undefined cause', () => {
    const err = new MurmrChunkError('chunk failed', {
      chunkIndex: 0,
      completedChunks: 0,
      totalChunks: 1,
    });

    expect(err.status).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it('extends MurmrError', () => {
    const err = new MurmrChunkError('test', {
      chunkIndex: 0,
      completedChunks: 0,
      totalChunks: 1,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MurmrError);
    expect(err).toBeInstanceOf(MurmrChunkError);
  });
});
