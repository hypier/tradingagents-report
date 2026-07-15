import type { ApiFailure } from '../../shared/contracts';

import { AppError } from './app-error';

export function toErrorResponse(error: unknown, requestId: string): ApiFailure {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.publicMessage,
        requestId,
      },
    };
  }

  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId,
    },
  };
}
