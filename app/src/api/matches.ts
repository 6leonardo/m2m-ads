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
            your_ad_id: Type.String(),
            their_ad_id: Type.String(),
            their_machine_id: Type.String(),
            score: Type.Number(),
            matched_at: Type.String({ format: 'date-time' })
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
      return {
        match_id: r.match_id,
        your_ad_id: String(mine ? r.ad_id_1 : r.ad_id_2),
        their_ad_id: String(mine ? r.ad_id_2 : r.ad_id_1),
        their_machine_id: mine ? r.machine_id_2 : r.machine_id_1,
        score: r.score,
        matched_at: new Date(String(r.matched_at)).toISOString()
      };
    });

    return { matches };
  });
}