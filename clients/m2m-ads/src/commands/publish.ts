import { M2MClient, type AdInput } from '../client.js';
import { loadConfig } from '../config.js';

export async function publish(ad: AdInput) {
  const config = await loadConfig();
  const client = new M2MClient(config);

  const result = await client.publish(ad);

  console.log('Ad published:', result.ad_id);
}