#!/usr/bin/env node

import { program } from 'commander';
import { register } from './commands/register.js';
import { publish } from './commands/publish.js';
import { deleteConfig } from './config.js';

program
  .command('register')
  .description('Register this machine with the M2M server')
  .option('--server <url>', 'Server base URL (overrides M2M_ADS_BASE_URL and config)')
  .action(register);

program
  .command('publish <ad>')
  .description('Publish a new ad (JSON string)')
  .action((ad: string) => publish(JSON.parse(ad)));

program
  .command('logout')
  .description('Remove local credentials (deletes config.json)')
  .action(async () => {
    await deleteConfig();
    console.log('Logged out: credentials removed.');
  });

program.parse();