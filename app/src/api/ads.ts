import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { sql } from 'kysely';
import { db } from '../db.js';
import { runMatching } from '../matching.js';

async function getMachineId(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const machine = await db.selectFrom('machines')
    .select('machine_id')
    .where('access_token', '=', token)
    .executeTakeFirst();
  return machine?.machine_id ?? null;
}

export async function adsRoutes(app: FastifyInstance) {
  app.post('/v1/ads', {
    schema: {
      body: Type.Object({
        op: Type.Union([
          Type.Literal('buy'),
          Type.Literal('sell'),
          Type.Literal('exchange'),
          Type.Literal('gift')
        ]),
        title: Type.String(),
        description: Type.String(),
        price: Type.Optional(Type.Number()),
        price_tolerance_pct: Type.Optional(Type.Number({ minimum: 0, maximum: 100, default: 0, description: 'Private: acceptable price deviation in %. Never shared.' })),
        currency: Type.Optional(Type.String({ default: 'EUR' })),
        coord: Type.Object({
          lat: Type.Number(),
          lon: Type.Number()
        }),
        radius_m: Type.Optional(Type.Integer({ minimum: 100, maximum: 500_000, default: 10_000 })),
        embedding: Type.Array(Type.Number(), { minItems: 384, maxItems: 384 })
      }),
      response: {
        201: Type.Object({
          ad_id: Type.String(),
          status: Type.String()
        }),
        401: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    const { op, title, description, price, price_tolerance_pct, currency, coord, radius_m, embedding } = request.body as {
      op: 'buy' | 'sell' | 'exchange' | 'gift';
      title: string;
      description: string;
      price?: number;
      price_tolerance_pct?: number;
      currency?: string;
      coord: { lat: number; lon: number };
      radius_m?: number;
      embedding: number[];
    };

    // pgvector requires '[n1,n2,...]'::vector syntax
    const embeddingStr = `[${embedding.join(',')}]`;
    const embeddingLiteral = sql<number[]>`${embeddingStr}::vector`;

    const result = await db.insertInto('announcements').values({
      machine_id,
      op,
      title,
      description,
      price: price ?? null,
      price_tolerance_pct: price_tolerance_pct ?? 0,
      currency: currency ?? 'EUR',
      coord,
      radius_m: radius_m ?? 10_000,
      embedding: embeddingLiteral as any,
      status: 'active',
      created_at: new Date().toISOString()
    }).returning(['id', 'status']).executeTakeFirstOrThrow();

    // Fire-and-forget: run matching engine asynchronously
    runMatching(result.id).catch((err) =>
      app.log.error({ err, adId: result.id }, 'matching engine error')
    );

    return reply.status(201).send({ ad_id: String(result.id), status: result.status });
  });

  app.get('/v1/ads', {
    schema: {
      response: {
        200: Type.Array(Type.Object({
          id: Type.String(),
          op: Type.String(),
          title: Type.String(),
          status: Type.String(),
          price: Type.Union([Type.Number(), Type.Null()]),
          currency: Type.String(),
          created_at: Type.String()
        })),
        401: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    const ads = await db.selectFrom('announcements')
      .select(['id', 'op', 'title', 'status', 'price', 'currency', 'created_at'])
      .where('machine_id', '=', machine_id)
      .execute();

    return ads.map((a) => ({ ...a, id: String(a.id) }));
  });

  // GET /v1/ads/:id — fetch a single ad (owner only)
  app.get('/v1/ads/:id', {
    schema: {
      params: Type.Object({ id: Type.String() }),
      response: {
        401: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const ad = await db.selectFrom('announcements')
      .select(['id', 'op', 'title', 'description', 'status', 'price', 'currency', 'coord', 'radius_m', 'created_at'])
      .where('id', '=', id)
      .where('machine_id', '=', machine_id)
      .executeTakeFirst();

    if (!ad) return reply.status(404).send({ error: 'Not found' });
    return { ...ad, id: String(ad.id), coord: ad.coord as { lat: number; lon: number } };
  });

  // PATCH /v1/ads/:id/status — change ad status (owner only)
  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    active: ['frozen', 'ended'],
    frozen: ['active', 'ended'],
    ended:  []
  };

  app.patch('/v1/ads/:id/status', {
    schema: {
      params: Type.Object({ id: Type.String() }),
      body: Type.Object({
        status: Type.Union([Type.Literal('active'), Type.Literal('frozen'), Type.Literal('ended')])
      }),
      response: {
        200: Type.Object({ id: Type.String(), status: Type.String() }),
        400: Type.Object({ error: Type.String() }),
        401: Type.Object({ error: Type.String() }),
        404: Type.Object({ error: Type.String() }),
        409: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const { status: newStatus } = request.body as { status: 'active' | 'frozen' | 'ended' };

    const ad = await db.selectFrom('announcements')
      .select(['id', 'status'])
      .where('id', '=', id)
      .where('machine_id', '=', machine_id)
      .executeTakeFirst();

    if (!ad) return reply.status(404).send({ error: 'Not found' });

    const allowed = ALLOWED_TRANSITIONS[ad.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return reply.status(409).send({ error: `Cannot transition from '${ad.status}' to '${newStatus}'` });
    }

    await db.updateTable('announcements')
      .set({ status: newStatus })
      .where('id', '=', id)
      .execute();

    return { id, status: newStatus };
  });
}