import { M2MClient } from '../client.js';
import { loadConfig, saveConfig } from '../config.js';

export async function register(options: { server?: string; country?: string }) {
  const config = await loadConfig();
  if (options.server) config.baseUrl = options.server;

  const client = new M2MClient(config);
  console.log('Solving proof-of-work...');
  const result = await client.register({ country: options.country });

  await saveConfig({ ...config, ...result });
  console.log('Registered:', result.machine_id);
}
