import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Database } from '../db/connection.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerUnitRoutes } from './routes/units.js';
import { registerStratagemRoutes } from './routes/stratagems.js';
import { registerEnhancementRoutes } from './routes/enhancements.js';
import { registerValidationRoutes } from './routes/validation.js';
import { registerObjectivesRoutes } from './routes/objectives.js';
import { registerWebExtractionRoutes } from './routes/web-extraction.js';
import { registerRulesRoutes } from './routes/rules.js';
import { registerAbilityRoutes } from './routes/abilities.js';

const HTTP_PORT = 40401;

export async function createHttpServer(db: Database) {
  const fastify = Fastify({
    logger: false, // Disable logger for MCP stdio compatibility
  });

  // Register CORS for browser extension and local service access
  await fastify.register(cors, {
    origin: [
      /^chrome-extension:\/\//,
      /^moz-extension:\/\//,
      /^http:\/\/localhost/,
    ],
    methods: ['GET', 'POST'],
  });

  // Register routes
  registerHealthRoutes(fastify);
  registerUnitRoutes(fastify, db);
  registerStratagemRoutes(fastify, db);
  registerEnhancementRoutes(fastify, db);
  registerValidationRoutes(fastify, db);
  registerObjectivesRoutes(fastify, db);
  registerWebExtractionRoutes(fastify, db);
  registerRulesRoutes(fastify, db);
  registerAbilityRoutes(fastify, db);

  return fastify;
}

export async function startHttpServer(db: Database): Promise<void> {
  const server = await createHttpServer(db);

  try {
    await server.listen({ port: HTTP_PORT, host: '127.0.0.1' });
    console.error(`HTTP API server running on http://localhost:${HTTP_PORT}`);
  } catch (err) {
    console.error('Failed to start HTTP server:', err);
    throw err;
  }
}
