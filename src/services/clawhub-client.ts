// ClawHub (OpenClaw 스킬 마켓플레이스) 연동 클라이언트
// GitHub API 기반으로 스킬 검색/조회

import { config } from './config.js';

export interface ClawHubSearchResult {
  id: string;
  name: string;
  description: string;
  score: number;
}

/**
 * clawhub CLI를 이용한 스킬 검색
 * clawhub가 설치되어 있으면 활용, 없으면 GitHub API 폴백
 */
export async function searchClawHub(query: string): Promise<ClawHubSearchResult[]> {
  // 1차: clawhub CLI 시도
  try {
    const { execSync } = await import('child_process');
    const output = execSync(`clawhub search "${query.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return parseClawHubOutput(output);
  } catch {
    // clawhub CLI 없으면 GitHub API 폴백
  }

  // 2차: GitHub API
  try {
    const keys = (config.get('keys') as any) || {};
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
    };
    if (keys.githubToken) {
      headers['Authorization'] = `Bearer ${keys.githubToken}`;
    }

    const res = await fetch(
      `https://api.github.com/search/code?q=${encodeURIComponent(query)}+repo:openclaw/clawhub+filename:SKILL.md&per_page=10`,
      { headers },
    );

    if (!res.ok) return [];

    const json = await res.json() as any;
    return (json.items || []).map((item: any) => {
      const pathParts = item.path.split('/');
      const skillId = pathParts[pathParts.length - 2] || item.path;
      return {
        id: skillId,
        name: skillId.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        description: `ClawHub: ${item.path}`,
        score: item.score || 0,
      };
    });
  } catch {
    return [];
  }
}

/**
 * clawhub CLI 출력 파싱
 * 형식: "skill-id  Skill Name  (score)"
 */
function parseClawHubOutput(output: string): ClawHubSearchResult[] {
  return output.trim().split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^(\S+)\s+(.+?)\s+\(([0-9.]+)\)\s*$/);
      if (!match) return null;
      return {
        id: match[1],
        name: match[2].trim(),
        description: `ClawHub 스킬 (점수: ${match[3]})`,
        score: parseFloat(match[3]),
      };
    })
    .filter((r): r is ClawHubSearchResult => r !== null);
}

/**
 * ClawHub에서 특정 스킬의 SKILL.md 가져오기
 */
export async function fetchSkillMd(skillId: string): Promise<string | null> {
  try {
    const keys = (config.get('keys') as any) || {};
    const headers: Record<string, string> = {};
    if (keys.githubToken) {
      headers['Authorization'] = `Bearer ${keys.githubToken}`;
    }

    const res = await fetch(
      `https://raw.githubusercontent.com/openclaw/clawhub/main/skills/${skillId}/SKILL.md`,
      { headers },
    );

    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * clawhub CLI가 설치되어 있는지 확인
 */
export function isClawHubInstalled(): boolean {
  try {
    const { execSync } = await_import_child_process();
    execSync('clawhub --version', { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

// Sync import helper (avoid top-level await)
function await_import_child_process() {
  return require('child_process');
}
