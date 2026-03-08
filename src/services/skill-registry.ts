// 스킬 검색, 설치, 제거, 내보내기 서비스

import { config } from './config.js';
import { SKILLS, SKILL_CATEGORIES, type Skill, type InstalledSkill, type SkillCategory } from '../data/skills.js';
import { searchClawHub, type ClawHubSearchResult } from './clawhub-client.js';

/**
 * 로컬 레지스트리에서 스킬 검색 (name, description, tags 매칭)
 */
export function searchLocal(query: string): Skill[] {
  const q = query.toLowerCase();
  return SKILLS.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.tags.some(t => t.toLowerCase().includes(q)) ||
    s.id.toLowerCase().includes(q)
  ).sort((a, b) => {
    // 이름 매칭 우선
    const aName = a.name.toLowerCase().includes(q) ? 0 : 1;
    const bName = b.name.toLowerCase().includes(q) ? 0 : 1;
    return aName - bName;
  });
}

/**
 * 통합 검색: 로컬 + ClawHub
 */
export async function searchAll(query: string): Promise<{
  local: Skill[];
  clawhub: ClawHubSearchResult[];
}> {
  const local = searchLocal(query);
  let clawhub: ClawHubSearchResult[] = [];

  try {
    clawhub = await searchClawHub(query);
    // 로컬에 이미 있는 것 제외
    const localIds = new Set(local.map(s => s.clawHubId || s.id));
    clawhub = clawhub.filter(r => !localIds.has(r.id));
  } catch {
    // ClawHub 연결 실패는 무시
  }

  return { local, clawhub };
}

/**
 * ID로 스킬 조회
 */
export function getById(id: string): Skill | null {
  return SKILLS.find(s => s.id === id) || null;
}

/**
 * 카테고리별 스킬 목록
 */
export function getByCategory(category: SkillCategory): Skill[] {
  return SKILLS.filter(s => s.category === category);
}

/**
 * 설치된 스킬 목록
 */
export function getInstalled(): InstalledSkill[] {
  return ((config.get('hub') as any)?.installed as InstalledSkill[]) || [];
}

/**
 * 스킬 설치 여부 확인
 */
export function isInstalled(id: string): boolean {
  return getInstalled().some(s => s.id === id);
}

/**
 * 스킬 설치 (config에 저장)
 */
export function installSkill(
  id: string,
  source: 'freestack' | 'clawhub' | 'community',
  version: string,
  configValues?: Record<string, string>,
): void {
  const hub = (config.get('hub') as any) || { installed: [] };
  const installed: InstalledSkill[] = hub.installed || [];

  // 이미 설치된 경우 업데이트
  const existing = installed.findIndex(s => s.id === id);
  const entry: InstalledSkill = {
    id,
    version,
    source,
    installedAt: new Date().toISOString(),
    configValues,
    enabled: true,
  };

  if (existing >= 0) {
    installed[existing] = entry;
  } else {
    installed.push(entry);
  }

  hub.installed = installed;
  config.set('hub' as any, hub);
}

/**
 * 스킬 제거
 */
export function removeSkill(id: string): boolean {
  const hub = (config.get('hub') as any) || { installed: [] };
  const installed: InstalledSkill[] = hub.installed || [];
  const idx = installed.findIndex(s => s.id === id);

  if (idx < 0) return false;

  installed.splice(idx, 1);
  hub.installed = installed;
  config.set('hub' as any, hub);
  return true;
}

/**
 * 스킬 활성화/비활성화
 */
export function toggleSkill(id: string, enabled: boolean): boolean {
  const hub = (config.get('hub') as any) || { installed: [] };
  const installed: InstalledSkill[] = hub.installed || [];
  const skill = installed.find(s => s.id === id);

  if (!skill) return false;

  skill.enabled = enabled;
  hub.installed = installed;
  config.set('hub' as any, hub);
  return true;
}

/**
 * 설치된 스킬의 프롬프트를 placeholder 치환해서 반환
 */
export function getFilledPrompt(id: string): string | null {
  const skill = getById(id);
  if (!skill) return null;

  const installedList = getInstalled();
  const installed = installedList.find(s => s.id === id);
  if (!installed) return skill.prompt;

  let prompt = skill.prompt;
  if (installed.configValues) {
    for (const q of skill.questions || []) {
      const value = installed.configValues[q.id];
      if (value) {
        prompt = prompt.split(q.placeholder).join(value);
      }
    }
  }
  return prompt;
}

/**
 * 모든 활성 스킬의 통합 프롬프트 생성
 */
export function exportMasterPrompt(): string {
  const installed = getInstalled().filter(s => s.enabled);
  if (installed.length === 0) return '';

  const sections = installed.map(inst => {
    const skill = getById(inst.id);
    if (!skill) return null;

    const prompt = getFilledPrompt(inst.id) || skill.prompt;
    return `## ${skill.emoji} ${skill.name}\n\n${prompt}`;
  }).filter(Boolean);

  return `# Freestack 스킬 통합 프롬프트

아래 프롬프트를 AI 에이전트(Nanobot/OpenClaw)에 붙여넣어서 모든 스킬을 한번에 설정하세요.

---

${sections.join('\n\n---\n\n')}
`;
}

/**
 * SKILL.md 형식으로 변환
 */
export function toSkillMd(skill: Skill, filledPrompt: string): string {
  return `---
name: ${skill.id}
version: ${skill.version}
description: "${skill.description}"
author: ${skill.author}
category: ${skill.category}
tags: [${skill.tags.join(', ')}]
channels: [${skill.channels.join(', ')}]
${skill.envVars?.length ? `envVars: [${skill.envVars.join(', ')}]` : ''}
source: ${skill.source}
${skill.clawHubId ? `clawHubId: ${skill.clawHubId}` : ''}
---

# ${skill.emoji} ${skill.name}

${skill.description}

## 프롬프트

${filledPrompt}
`;
}
