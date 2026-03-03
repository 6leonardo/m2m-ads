#!/usr/bin/env node

import { program } from 'commander';
import { register } from './commands/register.js';
import { publish } from './commands/publish.js';

program
  .command('register')
  .description('Register this machine')
  .action(register);

program
  .command('publish <ad>')
  .description('Publish a new ad (JSON string)')
  .action((ad: string) => publish(JSON.parse(ad)));

program.parse();