export class NeuroStoreError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'NeuroStoreError';
  }

  static fromResponse(status: number, body: unknown): NeuroStoreError {
    if (body && typeof body === 'object' && 'error' in body) {
      const err = (body as { error: { message?: string; details?: unknown } }).error;
      return new NeuroStoreError(status, err.message || 'Unknown error', err.details);
    }
    return new NeuroStoreError(status, `HTTP ${status}`);
  }
}
