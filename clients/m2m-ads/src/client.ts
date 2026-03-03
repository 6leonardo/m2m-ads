import { signMessage, verifyMessage } from './crypto.js';

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
  embedding: number[];
  radius_m?: number;
}

export class M2MClient {
  constructor(private config: Config) {}

  async register(): Promise<{ machine_id: string; access_token: string }> {
    const initRes = await fetch(`${this.config.baseUrl}/v1/register/init`, { method: 'POST' });
    if (!initRes.ok) throw new Error('register/init failed');
    const { id } = await initRes.json() as { id: string };

    const completeRes = await fetch(`${this.config.baseUrl}/v1/register/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        nonce: 0,
        public_sign_key: this.config.public_sign_key ?? 'default',
        country: 'IT'
      })
    });
    if (!completeRes.ok) throw new Error('register/complete failed');
    return completeRes.json() as Promise<{ machine_id: string; access_token: string }>;
  }

  async publish(ad: AdInput): Promise<{ ad_id: number; status: string }> {
    const res = await fetch(`${this.config.baseUrl}/v1/ads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.access_token}`
      },
      body: JSON.stringify(ad)
    });
    if (!res.ok) throw new Error(`publish failed: ${res.status}`);
    return res.json() as Promise<{ ad_id: number; status: string }>;
  }

  signMessage(message: string, privateKey: string) {
    return signMessage(message, privateKey);
  }

  verifyMessage(message: string, signature: string, publicKey: string) {
    return verifyMessage(message, signature, publicKey);
  }
}