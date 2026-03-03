import { M2MClient } from '../client.js';
import { loadConfig, saveConfig } from '../config.js';

export async function register(options: { server?: string }) {
  const config = await loadConfig();
  if (options.server) config.baseUrl = options.server;

  const client = new M2MClient(config);
  const result = await client.register();

  await saveConfig({ ...config, ...result });
  console.log('Registered:', result.machine_id);
}