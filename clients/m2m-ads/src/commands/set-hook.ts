import { M2MClient } from '../client.js';
import { loadConfig } from '../config.js';

export async function setHook(url: string | null, options: { secret?: string } = {}) {
  const config = await loadConfig();
  const client = new M2MClient(config);
  await client.setHook(url, options.secret ?? null);
  if (url) {
    console.log(`Webhook set: ${url}${options.secret ? ' (with secret)' : ''}`);
  } else {
    console.log('Webhook removed.');
  }
}
