export class MurmrError extends Error {
  readonly status?: number;
  readonly code?: string;
  /** For structured rate limit errors: 'rate_limit_exceeded' */
  readonly type?: string;
  /** For rate limit errors: max concurrent requests allowed */
  readonly concurrentLimit?: number;
  /** For rate limit errors: current in-flight requests */
  readonly concurrentActive?: number;

  constructor(message: string, options?: {
    status?: number;
    code?: string;
    type?: string;
    concurrentLimit?: number;
    concurrentActive?: number;
    cause?: Error;
  }) {
    super(message, { cause: options?.cause });
    this.name = 'MurmrError';
    this.status = options?.status;
    this.code = options?.code;
    this.type = options?.type;
    this.concurrentLimit = options?.concurrentLimit;
    this.concurrentActive = options?.concurrentActive;
  }
}

export class MurmrChunkError extends MurmrError {
  readonly chunkIndex: number;
  readonly completedChunks: number;
  readonly totalChunks: number;

  constructor(
    message: string,
    options: { chunkIndex: number; completedChunks: number; totalChunks: number; cause?: Error },
  ) {
    const causeError = options.cause instanceof MurmrError ? options.cause : undefined;
    super(message, {
      status: causeError?.status,
      type: causeError?.type,
      code: causeError?.code,
      concurrentLimit: causeError?.concurrentLimit,
      concurrentActive: causeError?.concurrentActive,
      cause: options.cause,
    });
    this.name = 'MurmrChunkError';
    this.chunkIndex = options.chunkIndex;
    this.completedChunks = options.completedChunks;
    this.totalChunks = options.totalChunks;
  }
}
