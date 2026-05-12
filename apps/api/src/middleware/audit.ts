import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

// Tag a route as auditable by attaching this middleware
export function audit(action: string, entityType?: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const originalJson = res.json.bind(res);

    res.json = function (body: unknown) {
      // Log after response is sent
      setImmediate(async () => {
        try {
          await prisma.auditLog.create({
            data: {
              userId: req.user?.sub,
              action,
              entityType,
              entityId: (req.params.id as string) || undefined,
              after: body as object,
              ip: req.ip,
            },
          });
        } catch (err) {
          logger.error('Failed to write audit log', { err, action });
        }
      });

      return originalJson(body);
    };

    next();
  };
}
