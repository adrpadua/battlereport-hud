import type { FastifyInstance } from 'fastify';

export function registerHealthRoutes(fastify: FastifyInstance): void {
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
