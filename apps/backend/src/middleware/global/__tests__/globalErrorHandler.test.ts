import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { globalErrorHandler } from '../globalErrorHandler.js';

describe('globalErrorHandler', () => {
  it('logs unexpected errors structurally and returns the safe generic API error', () => {
    const error = new Error('database connection failed');
    const requestLogger = { error: vi.fn() };
    const request = {
      log: requestLogger,
      method: 'POST',
      requestId: 'request-123',
    } as unknown as Request;
    const json = vi.fn();
    const response = {
      headersSent: false,
      json,
      status: vi.fn(() => ({ json })),
      statusCode: 200,
    };

    globalErrorHandler(error, request, response as unknown as Response, vi.fn() as NextFunction);

    expect(requestLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        method: 'POST',
        operation: 'global_error_handler',
        requestId: 'request-123',
      })
    );
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
      requestId: 'request-123',
    });
  });
});
