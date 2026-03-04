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

export async function matchesRoutes(app: FastifyInstance) {
  app.get('/v1/matches', {
    schema: {
      response: {
        200: Type.Object({
          matches: Type.Array(Type.Object({
            match_id: Type.String(),
            ad_id: Type.String(),
            score: Type.Number(),
            matched_at: Type.String({ format: 'date-time' }),
            match: Type.Object({
              title: Type.String(),
              op: Type.String(),
              price: Type.Union([Type.Number(), Type.Null()]),
              currency: Type.String(),
              description: Type.String()
            })
          }))
        }),
        401: Type.Object({ error: Type.String() })
      }
    }
  }, async (request, reply) => {
    const token = (request.headers['authorization'] ?? '').replace('Bearer ', '');
    const machine_id = await getMachineId(token);
    if (!machine_id) return reply.status(401).send({ error: 'Unauthorized' });

    // Join announcements twice to identify which side belongs to us
    const rows = await db
      .selectFrom('matches as m')
      .innerJoin('announcements as a1', 'a1.id', 'm.ad_id_1')
      .innerJoin('announcements as a2', 'a2.id', 'm.ad_id_2')
      .select([
        'm.id as match_id',
        'a1.id as ad_id_1',
        'a1.machine_id as machine_id_1',
        'a2.id as ad_id_2',
        'a2.machine_id as machine_id_2',
        'a2.title as title_2',
        'a2.op as op_2',
        'a2.price as price_2',
        'a2.currency as currency_2',
        'a2.description as description_2',
        'a1.title as title_1',
        'a1.op as op_1',
        'a1.price as price_1',
        'a1.currency as currency_1',
        'a1.description as description_1',
        'm.score',
        'm.created_at as matched_at'
      ])
      .where((eb) => eb.or([
        eb('a1.machine_id', '=', machine_id),
        eb('a2.machine_id', '=', machine_id)
      ]))
      .orderBy('m.created_at', 'desc')
      .limit(50)
      .execute();

    const matches = rows.map((r) => {
      const mine = r.machine_id_1 === machine_id;
      const them = mine
        ? { title: r.title_2, op: r.op_2, price: r.price_2, currency: r.currency_2, description: r.description_2 }
        : { title: r.title_1, op: r.op_1, price: r.price_1, currency: r.currency_1, description: r.description_1 };
      
      // Ensure price is either a number or null, not undefined
      if (them.price === undefined) them.price = null;
      // Convert price to number if it's a string (pg sometimes returns numeric as string)
      if (them.price !== null) them.price = Number(them.price);

      return {
        match_id: r.match_id,
        ad_id: String(mine ? r.ad_id_1 : r.ad_id_2),
        score: r.score,
        matched_at: new Date(String(r.matched_at)).toISOString(),
        match: them
      };
    });

    return { matches };
  });
}