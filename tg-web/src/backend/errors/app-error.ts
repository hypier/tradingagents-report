export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly publicMessage: string,
    cause?: unknown,
  ) {
    super(publicMessage);
    this.name = 'AppError';
    this.cause = cause;
  }
}
