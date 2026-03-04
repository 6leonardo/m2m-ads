#!/usr/bin/env node

import { program } from 'commander';
import { register } from './commands/register.js';
import { publish } from './commands/publish.js';
import { listAds, adStatus } from './commands/ads.js';
import { setHook } from './commands/set-hook.js';
import { listMatches } from './commands/matches.js';
import { listMessages, sendMessage } from './commands/messages.js';
import { M2MClient } from './client.js';
import { loadConfig } from './config.js';

program
  .command('register')
  .description('Register this machine with the M2M server')
  .option('--server <url>', 'Server base URL (overrides M2M_ADS_BASE_URL and config)')
  .option('--country <cc>', 'ISO 3166-1 alpha-2 country code (default: IT)')
  .action(register);

program
  .command('publish <ad>')
  .description('Publish a new ad (JSON string)')
  .action((ad: string) => publish(JSON.parse(ad)));

program
  .command('ads')
  .description('List your ads')
  .action(listAds);

program
  .command('ad-status <id> <status>')
  .description('Update ad status: active | frozen | ended')
  .action(adStatus);

program
  .command('set-hook [url]')
  .description('Set webhook URL (omit url to remove)')
  .option('--secret <token>', 'Secret token sent in X-Webhook-Secret header on every POST')
  .action((url?: string, options?: { secret?: string }) => setHook(url ?? null, options));

program
  .command('get-hook')
  .description('Show current webhook configuration')
  .action(async () => {
    const config = await loadConfig();
    const client = new M2MClient(config);
    const hook = await client.getHook();
    console.log(JSON.stringify(hook));
  });

program
  .command('matches')
  .description('List your matches')
  .action(listMatches);

program
  .command('messages <match_id>')
  .description('List messages for a match (marks counterpart messages as read)')
  .action(listMessages);

program
  .command('send <match_id> <payload>')
  .description('Send a message to a match counterpart')
  .action(sendMessage);

program.parse();