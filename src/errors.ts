export class MurmrError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options?: { status?: number; code?: string; cause?: Error }) {
    super(message, { cause: options?.cause });
    this.name = 'MurmrError';
    this.status = options?.status;
    this.code = options?.code;
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
    super(message, { cause: options.cause });
    this.name = 'MurmrChunkError';
    this.chunkIndex = options.chunkIndex;
    this.completedChunks = options.completedChunks;
    this.totalChunks = options.totalChunks;
  }
}
