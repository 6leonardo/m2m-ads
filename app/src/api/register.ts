import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import crypto from 'crypto';
import { db } from '../db.js';

export async function registerRoutes(app: FastifyInstance) {
  app.post('/v1/register/init', {
    schema: {
      response: {
        200: Type.Object({
          id: Type.String(),
          challenge: Type.String(),
          difficulty: Type.Number(),
          expires_at: Type.String({ format: 'date-time' })
        })
      }
    }
  }, async (request, reply) => {
    const difficulty = 22; // Example difficulty level
    const challenge = crypto.randomBytes(16).toString('base64');
    const expires_at = new Date(Date.now() + 3600 * 1000).toISOString();
    const id = crypto.randomUUID();

    // Store the challenge in the database
    await db.insertInto('challenges').values({
      id,
      challenge,
      difficulty,
      expires_at,
      used: false
    }).execute();

    return { id, challenge, difficulty, expires_at };
  });

  app.post('/v1/register/complete', {
    schema: {
      body: Type.Object({
        id: Type.String(),
        nonce: Type.Number(),
        public_sign_key: Type.String(),
        country: Type.String()
      }),
      response: {
        200: Type.Object({
          machine_id: Type.String(),
          access_token: Type.String()
        }),
        400: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { id, nonce, public_sign_key, country } = request.body as {
      id: string;
      nonce: number;
      public_sign_key: string;
      country: string;
    };

    // Validate challenge
    const challenge = await db.selectFrom('challenges')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!challenge || challenge.used || new Date(challenge.expires_at) < new Date()) {
      return reply.status(400).send({ error: 'Invalid or expired challenge' });
    }

    // Mark challenge as used
    await db.updateTable('challenges')
      .set({ used: true })
      .where('id', '=', id)
      .execute();

    const machine_id = crypto.randomUUID();
    const access_token = crypto.randomBytes(32).toString('hex');

    // Insert into the database
    await db.insertInto('machines').values({
      machine_id,
      public_sign_key,
      access_token,
      created_at: new Date().toISOString()
    }).execute();

    return { machine_id, access_token };
  });
}