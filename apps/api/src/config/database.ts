import { PrismaClient, Prisma } from '@prisma/client';
import { config } from '../config/env';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

if (config.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Re-export Prisma namespace so other modules can use types like Prisma.InputJsonValue
export { Prisma };
