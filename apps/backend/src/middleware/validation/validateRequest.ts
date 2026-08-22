import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodIssue, ZodType } from 'zod';

import type { ApiError } from '../../types/apiError.js';

export interface RequestValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

export interface ValidatedRequest extends Request {
  validatedBody?: unknown;
  validatedParams?: unknown;
  validatedQuery?: unknown;
}

type RequestPart = keyof RequestValidationSchemas;

function addFieldError(
  fieldErrors: Record<string, string[]>,
  part: RequestPart,
  issue: ZodIssue
): void {
  const field = issue.path.length > 0 ? issue.path.join('.') : part;
  (fieldErrors[field] ??= []).push(issue.message);
}

export function validateRequest(schemas: RequestValidationSchemas): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const validatedRequest = request as ValidatedRequest;
    const parsed: Partial<Record<RequestPart, unknown>> = {};
    const fieldErrors: Record<string, string[]> = {};

    for (const part of ['body', 'params', 'query'] as const) {
      const schema = schemas[part];

      if (!schema) {
        continue;
      }

      const result = schema.safeParse(request[part]);

      if (!result.success) {
        for (const issue of result.error.issues) {
          addFieldError(fieldErrors, part, issue);
        }
        continue;
      }

      parsed[part] = result.data;
    }

    if (Object.keys(fieldErrors).length > 0) {
      const error: ApiError = {
        code: 'VALIDATION_ERROR',
        message: 'The request contains invalid fields.',
        requestId: request.requestId,
        fieldErrors,
      };

      response.status(422).json(error);
      return;
    }

    validatedRequest.validatedBody = parsed.body;
    validatedRequest.validatedParams = parsed.params;
    validatedRequest.validatedQuery = parsed.query;
    next();
  };
}
