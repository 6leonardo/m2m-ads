import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import crypto from 'crypto';
import { db } from '../db.js';

async function getMachineId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const machine = await db.selectFrom('machines')
    .select('machine_id')
    .where('access_token', '=', token)
    .executeTakeFirst();
  return machine?.machine_id ?? null;
}

async function fireWebhook(url: string, body: unknown, secret?: string): Promise<void> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5_000);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) headers['X-Webhook-Secret'] = secret;
  try {
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function messagesRoutes(app: FastifyInstance) {
  // POST /v1/messages/:match_id — send a message
  app.post('/v1/messages/:match_id', {
    schema: {
      params: Type.Object({ match_id: Type.String() }),
      body: Type.Object({
        payload: Type.String({ minLength: 1 })
      }),
      response: {
        201: Type.Object({ message_id: Type.String() }),
        401: Type.Object({ error: Type.String() }),
        403: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    const { match_id } = request.params as { match_id: string };
    const { payload } = request.body as { payload: string };

    // Verify sender is part of this match
    const match = await db.selectFrom('matches as m')
      .innerJoin('announcements as a1', 'a1.id', 'm.ad_id_1')
      .innerJoin('announcements as a2', 'a2.id', 'm.ad_id_2')
      .select(['m.id', 'a1.machine_id as machine_id_1', 'a2.machine_id as machine_id_2'])
      .where('m.id', '=', match_id)
      .executeTakeFirst();

    if (!match) return reply.status(404).send({ error: 'Match not found' });

    const isParticipant = match.machine_id_1 === machine_id || match.machine_id_2 === machine_id;
    if (!isParticipant) return reply.status(403).send({ error: 'Forbidden' });

    const message_id = crypto.randomUUID();
    await db.insertInto('messages').values({
      id: message_id,
      match_id,
      sender_machine_id: machine_id,
      payload,
      created_at: new Date().toISOString()
    }).execute();

    // Fire webhook to the counterpart — best effort
    const counterpart_machine_id =
      match.machine_id_1 === machine_id ? match.machine_id_2 : match.machine_id_1;

    const counterpart = await db.selectFrom('machines')
      .select(['webhook_url', 'webhook_secret'])
      .where('machine_id', '=', counterpart_machine_id)
      .executeTakeFirst();

    if (counterpart?.webhook_url) {
      fireWebhook(counterpart.webhook_url, {
        event: 'message',
        match_id,
        message_id
      }, counterpart.webhook_secret ?? undefined).catch(() => {});
    }

    return reply.status(201).send({ message_id });
  });

  // GET /v1/messages/:match_id — list messages for a match
  app.get('/v1/messages/:match_id', {
    schema: {
      params: Type.Object({ match_id: Type.String() }),
      response: {
        200: Type.Object({
          messages: Type.Array(Type.Object({
            message_id: Type.String(),
            sender_machine_id: Type.String(),
            payload: Type.String(),
            created_at: Type.String({ format: 'date-time' }),
            read_at: Type.Union([Type.String({ format: 'date-time' }), Type.Null()])
          }))
        }),
        401: Type.Object({ error: Type.String() }),
        403: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    const { match_id } = request.params as { match_id: string };

    // Verify caller is part of this match
    const match = await db.selectFrom('matches as m')
      .innerJoin('announcements as a1', 'a1.id', 'm.ad_id_1')
      .innerJoin('announcements as a2', 'a2.id', 'm.ad_id_2')
      .select(['m.id', 'a1.machine_id as machine_id_1', 'a2.machine_id as machine_id_2'])
      .where('m.id', '=', match_id)
      .executeTakeFirst();

    if (!match) return reply.status(404).send({ error: 'Match not found' });

    const isParticipant = match.machine_id_1 === machine_id || match.machine_id_2 === machine_id;
    if (!isParticipant) return reply.status(403).send({ error: 'Forbidden' });

    const rows = await db.selectFrom('messages')
      .select(['id', 'sender_machine_id', 'payload', 'created_at', 'read_at'])
      .where('match_id', '=', match_id)
      .orderBy('created_at', 'asc')
      .execute();

    // Mark unread messages from counterpart as read
    const unread = rows
      .filter((r) => r.sender_machine_id !== machine_id && r.read_at === null)
      .map((r) => r.id);

    if (unread.length > 0) {
      await db.updateTable('messages')
        .set({ read_at: new Date().toISOString() })
        .where('id', 'in', unread)
        .execute();
    }

    return {
      messages: rows.map((r) => ({
        message_id: r.id,
        sender_machine_id: r.sender_machine_id,
        payload: r.payload,
        created_at: new Date(String(r.created_at)).toISOString(),
        read_at: r.read_at ? new Date(String(r.read_at)).toISOString() : null
      }))
    };
  });
}
