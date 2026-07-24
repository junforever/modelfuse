import { createRequestLogger } from '#utils/logger';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log: ReturnType<typeof createRequestLogger>;
    }
  }
}
