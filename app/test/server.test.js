import { strict as assert } from 'assert';
import { buildApp } from '../src/app.ts';

let app;
let base;
let accessToken;

before(async () => {
  app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address();
  base = `http://127.0.0.1:${port}`;

  // Register a machine to get a valid access token
  const initRes = await fetch(`${base}/v1/register/init`, { method: 'POST' });
  const { id } = await initRes.json();

  const completeRes = await fetch(`${base}/v1/register/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, nonce: 42, public_sign_key: 'test-key', country: 'IT' })
  });

  if (completeRes.ok) {
    const data = await completeRes.json();
    accessToken = data.access_token;
  }
});

after(async () => {
  await app.close();
});

// ──────────────────────────────────────────────
// Swagger / Docs
// ──────────────────────────────────────────────
describe('GET /docs', () => {
  it('should serve the API reference', async () => {
    const res = await fetch(`${base}/docs`);
    assert.equal(res.status, 200);
  });
});

describe('GET /docs/json', () => {
  it('should return the OpenAPI JSON spec', async () => {
    const res = await fetch(`${base}/docs/openapi.json`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.info.title, 'M2M Classified Service API');
  });
});

// ──────────────────────────────────────────────
// Registration
// ──────────────────────────────────────────────
describe('POST /v1/register/init', () => {
  it('should return a challenge', async () => {
    const res = await fetch(`${base}/v1/register/init`, { method: 'POST' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.id);
    assert.ok(body.challenge);
    assert.ok(typeof body.difficulty === 'number');
    assert.ok(body.expires_at);
  });
});

describe('POST /v1/register/complete', () => {
  it('should return 400 for an invalid challenge id', async () => {
    const res = await fetch(`${base}/v1/register/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', nonce: 0, public_sign_key: 'k', country: 'IT' })
    });
    assert.equal(res.status, 400);
  });

  it('should complete registration with a valid challenge', async () => {
    const initRes = await fetch(`${base}/v1/register/init`, { method: 'POST' });
    const { id } = await initRes.json();

    const res = await fetch(`${base}/v1/register/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, nonce: 42, public_sign_key: 'test-key', country: 'IT' })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.machine_id);
    assert.ok(body.access_token);
  });
});

// ──────────────────────────────────────────────
// Ads
// ──────────────────────────────────────────────
describe('GET /v1/ads', () => {
  it('should return an array', async () => {
    const res = await fetch(`${base}/v1/ads`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
  });
});

// ──────────────────────────────────────────────
// Matches
// ──────────────────────────────────────────────
describe('GET /v1/matches', () => {
  it('should return a matches object', async () => {
    const res = await fetch(`${base}/v1/matches`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.matches));
  });
});

// ──────────────────────────────────────────────
// Hooks
// ──────────────────────────────────────────────
describe('GET /v1/hooks', () => {
  it('should return hooks config', async () => {
    const res = await fetch(`${base}/v1/hooks`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(res.status, 200);
  });
});

describe('PUT /v1/hooks', () => {
  it('should accept null webhook urls and return 204', async () => {
    const res = await fetch(`${base}/v1/hooks`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ webhook_url: null, webhook_secret: null })
    });
    assert.equal(res.status, 204);
  });
});

// ──────────────────────────────────────────────
// Ad lifecycle (GET + PATCH status)
// ──────────────────────────────────────────────
describe('GET /v1/ads/:id', () => {
  it('should return the ad for the owner', async () => {
    // publish an ad first
    const embedding = Array(384).fill(0.5);
    const postRes = await fetch(`${base}/v1/ads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        op: 'sell', title: 'Test bike', description: 'A test ad',
        price: 100, currency: 'EUR',
        coord: { lat: 41.9, lon: 12.4 }, radius_m: 10000, embedding
      })
    });
    assert.equal(postRes.status, 201);
    const { ad_id } = await postRes.json();

    const res = await fetch(`${base}/v1/ads/${ad_id}`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, ad_id);
    assert.equal(body.status, 'active');
  });

  it('should return 404 for unknown id', async () => {
    const res = await fetch(`${base}/v1/ads/00000000-0000-0000-0000-000000000000`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(res.status, 404);
  });
});

describe('PATCH /v1/ads/:id/status', () => {
  it('should freeze then end an ad', async () => {
    const embedding = Array(384).fill(0.5);
    const postRes = await fetch(`${base}/v1/ads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        op: 'sell', title: 'Lifecycle test', description: 'Testing status transitions',
        coord: { lat: 41.9, lon: 12.4 }, radius_m: 10000, embedding
      })
    });
    const { ad_id } = await postRes.json();

    // active → frozen
    const r1 = await fetch(`${base}/v1/ads/${ad_id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ status: 'frozen' })
    });
    assert.equal(r1.status, 200);
    assert.equal((await r1.json()).status, 'frozen');

    // frozen → ended
    const r2 = await fetch(`${base}/v1/ads/${ad_id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ status: 'ended' })
    });
    assert.equal(r2.status, 200);
    assert.equal((await r2.json()).status, 'ended');
  });

  it('should return 409 for invalid transition (ended → active)', async () => {
    const embedding = Array(384).fill(0.5);
    const postRes = await fetch(`${base}/v1/ads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        op: 'sell', title: 'Invalid transition test', description: 'Testing',
        coord: { lat: 41.9, lon: 12.4 }, radius_m: 10000, embedding
      })
    });
    const { ad_id } = await postRes.json();

    // end the ad first
    await fetch(`${base}/v1/ads/${ad_id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ status: 'ended' })
    });

    // try to reactivate — should fail
    const r = await fetch(`${base}/v1/ads/${ad_id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ status: 'active' })
    });
    assert.equal(r.status, 409);
  });
});

// ──────────────────────────────────────────────
// Matching engine
// ──────────────────────────────────────────────
async function registerMachine() {
  const initRes = await fetch(`${base}/v1/register/init`, { method: 'POST' });
  const { id } = await initRes.json();
  const completeRes = await fetch(`${base}/v1/register/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, nonce: 42, public_sign_key: 'test-key', country: 'IT' })
  });
  const { access_token } = await completeRes.json();
  return access_token;
}

async function publishAd(token, ad) {
  const res = await fetch(`${base}/v1/ads`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(ad)
  });
  return res.json();
}

const EMBEDDING_A = Array(384).fill(0).map((_, i) => i % 2 === 0 ? 0.9 : 0.1);
const EMBEDDING_B = Array(384).fill(0).map((_, i) => i % 2 === 0 ? 0.85 : 0.12);
const COORD = { lat: 41.9028, lon: 12.4964 };

describe('Matching engine', () => {
  it('should create a match between a sell and a buy ad', async () => {
    const sellerToken = await registerMachine();
    const buyerToken  = await registerMachine();

    // seller publishes a sell ad (price 500)
    const sellResult = await publishAd(sellerToken, {
      op: 'sell',
      title: 'Road bike Bianchi 2022',
      description: 'Carbon frame, Shimano 105, excellent condition',
      price: 500,
      currency: 'EUR',
      coord: COORD,
      radius_m: 100_000,
      embedding: EMBEDDING_A
    });
    assert.ok(sellResult.ad_id, 'sell ad should be created');

    // buyer publishes a buy ad (willing to pay up to 800 — covers seller price)
    const buyResult = await publishAd(buyerToken, {
      op: 'buy',
      title: 'Looking for a road bike',
      description: 'Carbon frame, Shimano groupset, good condition',
      price: 800,
      currency: 'EUR',
      coord: COORD,
      radius_m: 100_000,
      embedding: EMBEDDING_B
    });
    assert.ok(buyResult.ad_id, 'buy ad should be created');

    // matching is fire-and-forget — give it a moment
    await new Promise(r => setTimeout(r, 1500));

    // seller should see a match
    const matchRes = await fetch(`${base}/v1/matches`, {
      headers: { authorization: `Bearer ${sellerToken}` }
    });
    assert.equal(matchRes.status, 200);
    const { matches } = await matchRes.json();
    assert.ok(matches.length > 0, 'seller should have at least one match');

    const match = matches[0];
    assert.ok(match.match_id);
    assert.ok(match.ad_id);
    assert.ok(match.match);
    assert.ok(typeof match.score === 'number' && match.score >= 0.3);
  });
});

