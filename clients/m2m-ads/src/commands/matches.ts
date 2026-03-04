import { M2MClient } from '../client.js';
import { loadConfig } from '../config.js';

export async function listMatches() {
  const config = await loadConfig();
  const client = new M2MClient(config);
  const { matches } = await client.getMatches();
  if (matches.length === 0) {
    console.log('No matches yet.');
    return;
  }
  for (const m of matches) {
    console.log(JSON.stringify(m));
  }
}
