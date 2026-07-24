import { type Response } from 'express';

/**
 * Unifies the format of all backend HTTP responses.
 *
 * This standardized format allows the frontend to consistently handle
 * the operation status, display safe messages to the user, and support multi-language.
 *
 * @param {import('express').Response} response - The Express response object.
 * @param {Object} options - Response configuration parameters.
 * @param {number} options.code - HTTP status code of the response (e.g., 200, 400, 500).
 * @param {boolean} options.success - Indicates if the operation was successful (`true`) or failed (`false`).
 * @param {string} options.message - Descriptive message of the operation for debug purpose. **Important:** If it is an error, it must NEVER reveal sensitive server details (e.g., stack traces, credentials, database details).
 * @param {string} options.responseCode - Unique identifier code of the result in `UPPER_SNAKE_CASE` and English (e.g., `INVALID_ROUTE`, `USER_NOT_FOUND`). Used by the frontend as a translation key for multi-language.
 * @param {*} [options.data=null] - Payload or data resulting from the operation. Can be empty (`null`) if no info was found or an error occurred.
 * @returns {import('express').Response} The JSON response sent to the client.
 *
 * @example
 * // Successful response with data
 * createResponse(res, {
 *   code: 200,
 *   success: true,
 *   message: "User created successfully",
 *   responseCode: "USER_CREATED",
 *   data: { id: 1, name: "John Doe" }
 * });
 *
 * @example
 * // Error response (without exposing technical details)
 * createResponse(res, {
 *   code: 400,
 *   success: false,
 *   message: "The email is already registered.",
 *   responseCode: "EMAIL_ALREADY_EXISTS",
 *   data: null
 * });
 */
export const createResponse = <T = any>(
  response: Response,
  {
    code,
    success,
    message,
    responseCode,
    data = null,
  }: {
    code: number;
    success: boolean;
    message: string;
    responseCode: string;
    data?: T | null;
  }
) => {
  return response.status(code).json({
    success,
    message,
    responseCode,
    data,
  });
};
