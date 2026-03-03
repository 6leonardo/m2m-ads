import { M2MClient } from '../client.js';
import { loadConfig, saveConfig } from '../config.js';

export async function register() {
  const config = await loadConfig();
  const client = new M2MClient(config);

  const result = await client.register();

  await saveConfig(result);
  console.log('Registered:', result.machine_id);
}