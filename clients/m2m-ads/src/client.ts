import crypto from 'crypto';
import { pipeline } from '@xenova/transformers';
import { signMessage, verifyMessage } from './crypto.js';

let _extractor: ReturnType<typeof pipeline> | null = null;

async function computeEmbedding(text: string): Promise<number[]> {
  if (!_extractor) {
    _extractor = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const extractor = await _extractor;
  const result = await (extractor as any)(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data) as number[];
}

export interface Config {
  baseUrl: string;
  machine_id?: string;
  access_token?: string;
  public_sign_key?: string;
}

export interface AdInput {
  op: 'buy' | 'sell' | 'exchange' | 'gift';
  title: string;
  description: string;
  price?: number;
  currency?: string;
  coord: { lat: number; lon: number };
  radius_m?: number;
  price_tolerance_pct?: number;
}

export interface AdStatus {
  id: string;
  op: string;
  title: string;
  status: string;
  price: number | null;
  currency: string;
  created_at: string;
}

export interface Match {
  match_id: string;
  ad_id: string;
  score: number;
  matched_at: string;
  match: {
    title: string;
    op: string;
    price: number | null;
    currency: string;
    description: string;
  };
}

export interface Message {
  message_id: string;
  sender_machine_id: string;
  payload: string;
  created_at: string;
  read_at: string | null;
}

/** Proof-of-Work: find nonce s.t. SHA256(challenge + nonce) has `difficulty` leading zero bits. */
function solvePoW(challenge: string, difficulty: number): number {
  const fullBytes = Math.floor(difficulty / 8);
  const remainingBits = difficulty % 8;
  let nonce = 0;
  while (true) {
    const hash = crypto.createHash('sha256').update(challenge + nonce).digest();
    let ok = true;
    for (let i = 0; i < fullBytes; i++) {
      if (hash[i] !== 0) { ok = false; break; }
    }
    if (ok && remainingBits > 0) {
      const mask = 0xff << (8 - remainingBits) & 0xff;
      if ((hash[fullBytes] & mask) !== 0) ok = false;
    }
    if (ok) return nonce;
    nonce++;
  }
}

export class M2MClient {
  constructor(private config: Config) {}

  async register(options: { country?: string } = {}): Promise<{ machine_id: string; access_token: string }> {
    // Step 1: get challenge
    const initRes = await fetch(`${this.config.baseUrl}/v1/register/init`, { method: 'POST' });
    if (!initRes.ok) throw new Error('register/init failed');
    const { id, challenge, difficulty } = await initRes.json() as { id: string; challenge: string; difficulty: number };

    // Step 2: generate key pair
    const { publicKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    // Step 3: solve PoW
    const nonce = solvePoW(challenge, difficulty);

    // Step 4: complete registration
    const completeRes = await fetch(`${this.config.baseUrl}/v1/register/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        nonce,
        public_sign_key: publicKey,
        country: options.country ?? 'IT'
      })
    });
    if (!completeRes.ok) throw new Error(`register/complete failed: ${completeRes.status}`);
    return completeRes.json() as Promise<{ machine_id: string; access_token: string }>;
  }

  async publish(ad: AdInput): Promise<{ ad_id: string; status: string }> {
    const embedding = await computeEmbedding(`${ad.title} ${ad.description}`);
    const res = await fetch(`${this.config.baseUrl}/v1/ads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.access_token}`
      },
      body: JSON.stringify({ ...ad, embedding })
    });
    if (!res.ok) throw new Error(`publish failed: ${res.status}`);
    return res.json() as Promise<{ ad_id: string; status: string }>;
  }

  async listAds(): Promise<AdStatus[]> {
    const res = await fetch(`${this.config.baseUrl}/v1/ads`, {
      headers: { authorization: `Bearer ${this.config.access_token}` }
    });
    if (!res.ok) throw new Error(`list-ads failed: ${res.status}`);
    return res.json() as Promise<AdStatus[]>;
  }

  async getAd(id: string): Promise<AdStatus> {
    const res = await fetch(`${this.config.baseUrl}/v1/ads/${id}`, {
      headers: { authorization: `Bearer ${this.config.access_token}` }
    });
    if (!res.ok) throw new Error(`get-ad failed: ${res.status}`);
    return res.json() as Promise<AdStatus>;
  }

  async updateAdStatus(id: string, status: 'active' | 'frozen' | 'ended'): Promise<{ id: string; status: string }> {
    const res = await fetch(`${this.config.baseUrl}/v1/ads/${id}/status`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.access_token}`
      },
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error(`ad-status failed: ${res.status}`);
    return res.json() as Promise<{ id: string; status: string }>;
  }

  async setHook(url: string | null, secret?: string | null): Promise<void> {
    const res = await fetch(`${this.config.baseUrl}/v1/hooks`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.access_token}`
      },
      body: JSON.stringify({ webhook_url: url, webhook_secret: secret ?? null })
    });
    if (!res.ok) throw new Error(`set-hook failed: ${res.status}`);
  }

  async getHook(): Promise<{ webhook_url: string | null; webhook_secret: string | null }> {
    const res = await fetch(`${this.config.baseUrl}/v1/hooks`, {
      headers: { authorization: `Bearer ${this.config.access_token}` }
    });
    if (!res.ok) throw new Error(`get-hook failed: ${res.status}`);
    return res.json() as Promise<{ webhook_url: string | null; webhook_secret: string | null }>;
  }

  async getMatches(): Promise<{ matches: Match[] }> {
    const res = await fetch(`${this.config.baseUrl}/v1/matches`, {
      headers: { authorization: `Bearer ${this.config.access_token}` }
    });
    if (!res.ok) throw new Error(`get-matches failed: ${res.status}`);
    return res.json() as Promise<{ matches: Match[] }>;
  }

  async getMessages(matchId: string): Promise<{ messages: Message[] }> {
    const res = await fetch(`${this.config.baseUrl}/v1/messages/${matchId}`, {
      headers: { authorization: `Bearer ${this.config.access_token}` }
    });
    if (!res.ok) throw new Error(`get-messages failed: ${res.status}`);
    return res.json() as Promise<{ messages: Message[] }>;
  }

  async sendMessage(matchId: string, payload: string): Promise<{ message_id: string }> {
    const res = await fetch(`${this.config.baseUrl}/v1/messages/${matchId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.access_token}`
      },
      body: JSON.stringify({ payload })
    });
    if (!res.ok) throw new Error(`send-message failed: ${res.status}`);
    return res.json() as Promise<{ message_id: string }>;
  }

  signMessage(message: string, privateKey: string) {
    return signMessage(message, privateKey);
  }

  verifyMessage(message: string, signature: string, publicKey: string) {
    return verifyMessage(message, signature, publicKey);
  }
}