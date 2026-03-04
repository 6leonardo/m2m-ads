import { M2MClient } from '../client.js';
import { loadConfig } from '../config.js';

export async function listAds() {
  const config = await loadConfig();
  const client = new M2MClient(config);
  const ads = await client.listAds();
  if (ads.length === 0) {
    console.log('No ads yet.');
    return;
  }
  for (const ad of ads) {
    console.log(JSON.stringify(ad));
  }
}

export async function adStatus(id: string, status: string) {
  const config = await loadConfig();
  const client = new M2MClient(config);
  const result = await client.updateAdStatus(id, status as 'active' | 'frozen' | 'ended');
  console.log(`Ad ${result.id}: ${result.status}`);
}
