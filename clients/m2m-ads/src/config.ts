import os from 'os';
import path from 'path';
import fs from 'fs/promises';

function getBase(): string {
  return process.env.M2M_ADS_HOME ?? path.join(os.homedir(), '.m2m-ads');
}

/**
 * Load config from disk, then overlay any ENV var overrides.
 * Precedence: ENV > config file > defaults.
 */
export async function loadConfig(): Promise<Record<string, string> & { baseUrl: string }> {
  const file = path.join(getBase(), 'config.json');
  let config: Record<string, string> = {};
  try {
    const data = await fs.readFile(file, 'utf-8');
    config = JSON.parse(data);
  } catch {
    // no config file yet — env vars or explicit options must provide credentials
  }

  // ENV overrides (allow fully stateless usage, e.g. CI)
  if (process.env.M2M_ADS_BASE_URL)     config.baseUrl      = process.env.M2M_ADS_BASE_URL;
  if (process.env.M2M_ADS_MACHINE_ID)   config.machine_id   = process.env.M2M_ADS_MACHINE_ID;
  if (process.env.M2M_ADS_ACCESS_TOKEN) config.access_token = process.env.M2M_ADS_ACCESS_TOKEN;

  if (!config.baseUrl) config.baseUrl = 'https://m2m-ads.com';

  return config as Record<string, string> & { baseUrl: string };
}

export async function ensureConfigDir() {
  await fs.mkdir(getBase(), { recursive: true });
}

export async function saveConfig(config: any) {
  await ensureConfigDir();
  const file = path.join(getBase(), 'config.json');
  await fs.writeFile(file, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export async function deleteConfig() {
  const file = path.join(getBase(), 'config.json');
  try {
    await fs.unlink(file);
  } catch {
    // already gone
  }
}

export function getConfigPath(): string {
  return path.join(getBase(), 'config.json');
}