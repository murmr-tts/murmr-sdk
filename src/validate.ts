import { MurmrError } from './errors';

export const MAX_INPUT_LENGTH = 4096;

export function validateId(id: string, label: string): void {
  if (!id || !/^[\w-]+$/.test(id)) {
    throw new MurmrError(
      `Invalid ${label}: must contain only alphanumeric characters, hyphens, or underscores`,
    );
  }
}

export function validateInput(input: string): void {
  if (!input?.trim()) {
    throw new MurmrError('input text is required and cannot be empty');
  }
  if (input.length > MAX_INPUT_LENGTH) {
    throw new MurmrError(
      `input text exceeds ${MAX_INPUT_LENGTH} character limit. Use createLongForm() for longer text.`,
    );
  }
}
