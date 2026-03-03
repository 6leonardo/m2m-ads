import os from 'os';
import path from 'path';
import fs from 'fs/promises';

function getBase(): string {
  return process.env.M2M_ADS_HOME ?? path.join(os.homedir(), '.m2m-ads');
}

export async function loadConfig() {
  const file = path.join(getBase(), 'config.json');
  const data = await fs.readFile(file, 'utf-8');
  return JSON.parse(data);
}

export async function ensureConfigDir() {
  await fs.mkdir(getBase(), { recursive: true });
}

export async function saveConfig(config: any) {
  await ensureConfigDir();
  const file = path.join(getBase(), 'config.json');
  await fs.writeFile(file, JSON.stringify(config, null, 2));
}