import type { NextFunction, Request, Response } from 'express';

export const haltOnTimedout = (req: Request, res: Response, next: NextFunction) => {
  if (!req.timedout) next();
};
