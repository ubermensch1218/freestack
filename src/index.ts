#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { dnsCommand } from './commands/dns.js';
import { mailCommand } from './commands/mail.js';
import { serverCommand } from './commands/server.js';
import { openclawCommand } from './commands/openclaw.js';
import { vpnCommand } from './commands/vpn.js';
import { keysCommand } from './commands/keys.js';
import { teamCommand } from './commands/team.js';
import { calendarCommand } from './commands/calendar.js';
import { filesCommand } from './commands/files.js';
import { aiCommand } from './commands/ai.js';
import { doctorCommand } from './commands/doctor.js';
import { statusCommand } from './commands/status.js';
import { hubCommand } from './commands/hub.js';

const program = new Command();

program
  .name('freestack')
  .description('Free-tier workspace bootstrap CLI for startups')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(dnsCommand);
program.addCommand(mailCommand);
program.addCommand(serverCommand);
program.addCommand(openclawCommand);
program.addCommand(vpnCommand);
program.addCommand(keysCommand);
program.addCommand(teamCommand);
program.addCommand(calendarCommand);
program.addCommand(filesCommand);
program.addCommand(aiCommand);
program.addCommand(doctorCommand);
program.addCommand(statusCommand);
program.addCommand(hubCommand);

program.parse();
