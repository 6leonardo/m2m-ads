import { Kysely, PostgresDialect } from 'kysely';
import type { Generated } from 'kysely';
import pg from 'pg';
import { config } from 'dotenv';

config();

// Force node-postgres to parse TIMESTAMP WITHOUT TIME ZONE as UTC
// (otherwise it interprets them as local time, causing off-by-timezone errors)
pg.types.setTypeParser(1114, (str: string) => new Date(str + 'Z'));

// Define the database schema
export interface Database {
  machines: {
    machine_id: string;
    public_sign_key: string;
    access_token: string;
    country: string | null;
    webhook_url: string | null;
    webhook_secret: string | null;
    created_at: string;
  };
  challenges: {
    id: string;
    challenge: string;
    difficulty: number;
    expires_at: string;
    used: boolean;
  };
  announcements: {
    id: Generated<string>;
    machine_id: string;
    op: 'buy' | 'sell' | 'exchange' | 'gift';
    title: string;
    description: string;
    price: number | null;
    price_tolerance_pct: number;
    currency: string;
    coord: { lat: number; lon: number };
    radius_m: number;
    embedding: number[];
    status: 'active' | 'frozen' | 'ended';
    created_at: string;
  };
  matches: {
    id: string;
    ad_id_1: string;
    ad_id_2: string;
    score: number;
    created_at: string;
  };
  machine_blocks: {
    source_machine_id: string;
    target_machine_id: string;
    blocked_at: string;
  };
  messages: {
    id: string;
    match_id: string;
    sender_machine_id: string;
    payload: string;
    created_at: string;
    read_at: string | null;
  };
}

// Initialize the database connection
export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({
      connectionString: process.env.DATABASE_URL
    })
  })
});