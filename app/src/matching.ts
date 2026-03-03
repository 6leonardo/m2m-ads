import { sql } from 'kysely';
import crypto from 'crypto';
import { db } from './db.js';

// Op compatibility: what ops can match with each other
const OP_COMPAT: Record<string, string[]> = {
  sell:     ['buy'],
  buy:      ['sell', 'gift'],
  exchange: ['exchange'],
  gift:     ['buy'],
};

function haversineMetres(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Checks whether two ads have overlapping acceptable price ranges.
// buy.price = max budget; sell.price = asking price.
// With tolerance:
//   seller accepts minimum: sellPrice * (1 - sellPct/100)
//   buyer pays maximum:     buyPrice  * (1 + buyPct/100)
// Match if seller's minimum fits within buyer's maximum budget.
function priceOk(
  opA: string, priceA: number | null, pctA: number,
  opB: string, priceB: number | null, pctB: number
): boolean {
  const isSellBuy = (opA === 'sell' && opB === 'buy') || (opA === 'buy' && opB === 'sell');
  if (!isSellBuy) return true; // exchange/gift — no price constraint

  if (priceA == null || priceB == null) return true;

  const [sellPrice, sellPct, buyPrice, buyPct] =
    opA === 'sell'
      ? [priceA, pctA, priceB, pctB]
      : [priceB, pctB, priceA, pctA];

  const sellMin = sellPrice * (1 - sellPct / 100);
  const buyMax  = buyPrice  * (1 + buyPct  / 100);

  return sellMin <= buyMax;
}

export async function runMatching(newAdId: string): Promise<void> {
  // Load the new ad
  const ad = await db.selectFrom('announcements')
    .selectAll()
    .where('id', '=', newAdId)
    .where('status', '=', 'active')
    .executeTakeFirst();

  if (!ad) return;

  const compatOps = OP_COMPAT[ad.op] ?? [];
  if (compatOps.length === 0) return;

  const adCoord = ad.coord as { lat: number; lon: number };
  // pgvector returns the embedding as a string "[n1,n2,...]" from DB
  const rawEmb = ad.embedding as unknown;
  const embeddingStr = typeof rawEmb === 'string' ? rawEmb : `[${(rawEmb as number[]).join(',')}]`;

  // Get top-20 candidates ordered by cosine similarity
  const candidates = await db.selectFrom('announcements as a')
    .select([
      'a.id',
      'a.machine_id',
      'a.op',
      'a.price',
      'a.price_tolerance_pct',
      'a.coord',
      'a.radius_m',
      sql<number>`1 - (a.embedding <=> ${sql.raw("'" + embeddingStr + "'")}::vector)`.as('cosine_score')
    ])
    .where('a.op', 'in', compatOps as any)
    .where('a.status', '=', 'active')
    .where('a.machine_id', '!=', ad.machine_id)
    .where('a.id', '!=', newAdId)
    .orderBy(sql`a.embedding <=> ${sql.raw("'" + embeddingStr + "'")}::vector`)
    .limit(20)
    .execute();

  // Load already-matched ad ids to skip
  const existingMatches = await db.selectFrom('matches')
    .select(['ad_id_1', 'ad_id_2'])
    .where((eb: any) => eb.or([
      eb('ad_id_1', '=', newAdId),
      eb('ad_id_2', '=', newAdId)
    ]))
    .execute();

  const alreadyMatchedIds = new Set<string>();
  for (const m of existingMatches) {
    alreadyMatchedIds.add(m.ad_id_1 === newAdId ? m.ad_id_2 : m.ad_id_1);
  }

  // Filter + build inserts
  const toInsert: Array<{ id: string; ad_id_1: string; ad_id_2: string; score: number; created_at: string }> = [];

  for (const c of candidates) {
    if (alreadyMatchedIds.has(c.id)) continue;
    if (!priceOk(ad.op, ad.price, ad.price_tolerance_pct, c.op, c.price, c.price_tolerance_pct)) continue;

    const cCoord = c.coord as { lat: number; lon: number };
    const dist = haversineMetres(adCoord.lat, adCoord.lon, cCoord.lat, cCoord.lon);
    if (dist > Math.min(ad.radius_m, c.radius_m)) continue;

    const score = c.cosine_score ?? 0;
    if (score < 0.3) continue;

    const [id1, id2] = newAdId < c.id ? [newAdId, c.id] : [c.id, newAdId]; // UUID v7: lexicographic order is also chronological
    toInsert.push({
      id: crypto.randomUUID(),
      ad_id_1: id1,
      ad_id_2: id2,
      score,
      created_at: new Date().toISOString()
    });
  }

  if (toInsert.length === 0) return;

  await db.insertInto('matches')
    .values(toInsert)
    .onConflict((oc: any) => oc.columns(['ad_id_1', 'ad_id_2']).doNothing())
    .execute();

  // Fire webhooks — one POST per machine per match, best-effort
  // Collect all unique machine IDs involved in new matches
  const machineIdToMatches = new Map<string, string[]>(); // machine_id → [match_id]
  const adIdToMachineId = new Map<string, string>();
  adIdToMachineId.set(newAdId, ad.machine_id);
  for (const c of candidates) adIdToMachineId.set(c.id, c.machine_id);

  for (const m of toInsert) {
    for (const adId of [m.ad_id_1, m.ad_id_2]) {
      const machineId = adIdToMachineId.get(adId);
      if (!machineId) continue;
      if (!machineIdToMatches.has(machineId)) machineIdToMatches.set(machineId, []);
      machineIdToMatches.get(machineId)!.push(m.id);
    }
  }

  if (machineIdToMatches.size === 0) return;

  const machines = await db.selectFrom('machines')
    .select(['machine_id', 'match_webhook_url'])
    .where('machine_id', 'in', [...machineIdToMatches.keys()])
    .execute();

  for (const machine of machines) {
    if (!machine.match_webhook_url) continue;
    const matchIds = machineIdToMatches.get(machine.machine_id) ?? [];
    for (const matchId of matchIds) {
      fireWebhook(machine.match_webhook_url, { event: 'match', match_id: matchId }).catch(() => {});
    }
  }
}

async function fireWebhook(url: string, body: unknown): Promise<void> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5_000);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal
    });
  } finally {
    clearTimeout(timer);
  }
}
