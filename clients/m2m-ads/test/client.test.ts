import { strict as assert } from 'assert';
import crypto from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { M2MClient } from '../src/client.js';
import { signMessage, verifyMessage } from '../src/crypto.js';
import { saveConfig, loadConfig } from '../src/config.js';

// Il server deve essere in esecuzione: npm run dev (nella cartella app/)
// Oppure BASE_URL=http://... npm test
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

const sampleAd = {
  op: 'sell' as const,
  title: 'Test widget',
  description: 'A test ad from the client test suite',
  coord: { lat: 41.9028, lon: 12.4964 },
  embedding: Array(384).fill(0.1) as number[]
};

// ── M2MClient.register() ────────────────────────────────────────────

describe('M2MClient.register()', () => {
  it('should return machine_id and access_token', async () => {
    const client = new M2MClient({ baseUrl: BASE_URL });
    const result = await client.register();
    assert.ok(result.machine_id);
    assert.ok(result.access_token);
  });

  it('should return different credentials for different machines', async () => {
    const a = await new M2MClient({ baseUrl: BASE_URL }).register();
    const b = await new M2MClient({ baseUrl: BASE_URL }).register();
    assert.notEqual(a.machine_id, b.machine_id);
    assert.notEqual(a.access_token, b.access_token);
  });
});

// ── M2MClient.publish() ─────────────────────────────────────────────

describe('M2MClient.publish()', () => {
  it('should return an ad id after registration', async () => {
    const { access_token } = await new M2MClient({ baseUrl: BASE_URL }).register();
    const client = new M2MClient({ baseUrl: BASE_URL, access_token });
    const result = await client.publish(sampleAd);
    assert.ok(result.ad_id);
  });

  it('should throw on missing access_token', async () => {
    const client = new M2MClient({ baseUrl: BASE_URL });
    await assert.rejects(
      () => client.publish(sampleAd),
      /publish failed: 401/
    );
  });

  it('should throw on invalid access_token', async () => {
    const client = new M2MClient({ baseUrl: BASE_URL, access_token: 'bogus' });
    await assert.rejects(
      () => client.publish(sampleAd),
      /publish failed: 401/
    );
  });
});

// ── signMessage / verifyMessage ─────────────────────────────────────

describe('signMessage / verifyMessage', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privPem = privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
  const pubPem  = publicKey.export({ type: 'pkcs1', format: 'pem' }) as string;

  it('should produce a hex signature', () => {
    const sig = signMessage('hello world', privPem);
    assert.match(sig, /^[0-9a-f]+$/);
  });

  it('should verify a correct signature', () => {
    const sig = signMessage('hello world', privPem);
    assert.equal(verifyMessage('hello world', sig, pubPem), true);
  });

  it('should reject a tampered message', () => {
    const sig = signMessage('hello world', privPem);
    assert.equal(verifyMessage('tampered', sig, pubPem), false);
  });

  it('should reject a tampered signature', () => {
    const sig = signMessage('hello world', privPem);
    const bad = sig.slice(0, -4) + 'dead';
    assert.equal(verifyMessage('hello world', bad, pubPem), false);
  });
});

// ── saveConfig / loadConfig ─────────────────────────────────────────

describe('saveConfig / loadConfig', () => {
  it('should persist and reload config', async () => {
    process.env.M2M_ADS_HOME = join(tmpdir(), `m2m-test-${Date.now()}`);
    try {
      const cfg = { machine_id: 'abc', access_token: 'tok', baseUrl: BASE_URL };
      await saveConfig(cfg);
      const loaded = await loadConfig();
      assert.deepEqual(loaded, cfg);
    } finally {
      delete process.env.M2M_ADS_HOME;
    }
  });

  it('should throw when config file does not exist', async () => {
    process.env.M2M_ADS_HOME = join(tmpdir(), `m2m-missing-${Date.now()}`);
    try {
      await assert.rejects(() => loadConfig());
    } finally {
      delete process.env.M2M_ADS_HOME;
    }
  });
});
