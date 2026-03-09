import { Command } from 'commander';
import { registerDeployCommand } from './agent/deploy.js';
import { registerStatusCommands } from './agent/status-cmd.js';
import { registerConfigCommand } from './agent/config-cmd.js';
import { registerSkillsCommand } from './agent/skills-deploy.js';
import { registerUsecasesCommand } from './agent/usecases-cmd.js';

export const agentCommand = new Command('agent')
  .description('AI 에이전트 배포 및 관리 (Nanobot / OpenClaw / ZeroClaw)');

// 하위호환: openclaw → agent alias
export const openclawCommand = agentCommand;

registerDeployCommand(agentCommand);
registerStatusCommands(agentCommand);
registerConfigCommand(agentCommand);
registerSkillsCommand(agentCommand);
registerUsecasesCommand(agentCommand);
