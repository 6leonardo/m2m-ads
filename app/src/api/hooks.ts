import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { db } from '../db.js';

async function getMachineId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const machine = await db.selectFrom('machines')
    .select('machine_id')
    .where('access_token', '=', token)
    .executeTakeFirst();
  return machine?.machine_id ?? null;
}

export async function hooksRoutes(app: FastifyInstance) {
  app.put('/v1/hooks', {
    schema: {
      body: Type.Object({
        webhook_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
        webhook_secret: Type.Optional(Type.Union([Type.String(), Type.Null()]))
      }),
      response: {
        204: Type.Null(),
        401: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    const { webhook_url, webhook_secret } = request.body as { webhook_url: string | null; webhook_secret?: string | null };

    // Update hook in the database
    const update: Record<string, unknown> = { webhook_url };
    if (webhook_secret !== undefined) update.webhook_secret = webhook_secret;
    await db.updateTable('machines')
      .set(update as any)
      .where('machine_id', '=', machine_id)
      .execute();

    reply.status(204).send();
  });

  app.get('/v1/hooks', {
    schema: {
      response: {
        200: Type.Object({
          webhook_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
          webhook_secret: Type.Union([Type.String(), Type.Null()])
        }),
        401: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    const hooks = await db.selectFrom('machines')
      .select(['webhook_url', 'webhook_secret'])
      .where('machine_id', '=', machine_id)
      .executeTakeFirst();

    return hooks || { webhook_url: null, webhook_secret: null };
  });
}