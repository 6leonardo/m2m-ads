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
        match_webhook_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
        message_webhook_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()])
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

    const { match_webhook_url, message_webhook_url } = request.body as {
      match_webhook_url: string | null;
      message_webhook_url: string | null;
    };

    // Update hooks in the database
    await db.updateTable('machines')
      .set({ match_webhook_url, message_webhook_url })
      .where('machine_id', '=', machine_id)
      .execute();

    reply.status(204).send();
  });

  app.get('/v1/hooks', {
    schema: {
      response: {
        200: Type.Object({
          match_webhook_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
          message_webhook_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()])
        }),
        401: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    const hooks = await db.selectFrom('machines')
      .select(['match_webhook_url', 'message_webhook_url'])
      .where('machine_id', '=', machine_id)
      .executeTakeFirst();

    return hooks || { match_webhook_url: null, message_webhook_url: null };
  });
}