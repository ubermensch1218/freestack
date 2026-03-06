import { config } from './config.js';

function getHeaders(): Record<string, string> {
  const cf = config.get('cloudflare');
  if (!cf?.apiToken) throw new Error('Cloudflare API token not configured. Run: freestack init');
  return {
    'Authorization': `Bearer ${cf.apiToken}`,
    'Content-Type': 'application/json',
  };
}

function getAccountId(): string {
  const cf = config.get('cloudflare');
  if (!cf?.accountId) throw new Error('Cloudflare account ID not configured. Run: freestack init');
  return cf.accountId;
}

function getZoneId(): string {
  const cf = config.get('cloudflare');
  if (!cf?.zoneId) throw new Error('Cloudflare zone ID not configured. Run: freestack dns setup');
  return cf.zoneId;
}

const CF_API = 'https://api.cloudflare.com/client/v4';

export async function listZones() {
  const res = await fetch(`${CF_API}/zones`, { headers: getHeaders() });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  return data.result;
}

export async function getZoneByDomain(domain: string) {
  const res = await fetch(`${CF_API}/zones?name=${domain}`, { headers: getHeaders() });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  return data.result[0] || null;
}

export async function createZone(domain: string) {
  const res = await fetch(`${CF_API}/zones`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      name: domain,
      account: { id: getAccountId() },
      type: 'full',
    }),
  });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Failed to create zone: ${JSON.stringify(data.errors)}`);
  return data.result;
}

export async function listDnsRecords(zoneId: string) {
  const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, { headers: getHeaders() });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  return data.result;
}

export async function createDnsRecord(zoneId: string, record: {
  type: string;
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
}) {
  const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ ttl: 1, ...record }),
  });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Failed to create DNS record: ${JSON.stringify(data.errors)}`);
  return data.result;
}

export async function listEmailRoutingRules(zoneId: string) {
  const res = await fetch(`${CF_API}/zones/${zoneId}/email/routing/rules`, { headers: getHeaders() });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  return data.result;
}

export async function enableEmailRouting(zoneId: string) {
  const res = await fetch(`${CF_API}/zones/${zoneId}/email/routing/enable`, {
    method: 'POST',
    headers: getHeaders(),
  });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Failed to enable email routing: ${JSON.stringify(data.errors)}`);
  return data.result;
}

export async function createEmailRoutingRule(zoneId: string, rule: {
  name: string;
  matchers: Array<{ type: string; field?: string; value?: string }>;
  actions: Array<{ type: string; value: string[] }>;
}) {
  const res = await fetch(`${CF_API}/zones/${zoneId}/email/routing/rules`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ ...rule, enabled: true, priority: 0 }),
  });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Failed to create routing rule: ${JSON.stringify(data.errors)}`);
  return data.result;
}

export async function createEmailDestination(accountId: string, email: string) {
  const res = await fetch(`${CF_API}/accounts/${accountId}/email/routing/addresses`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ email }),
  });
  const data = await res.json() as any;
  if (!data.success) throw new Error(`Failed to add destination: ${JSON.stringify(data.errors)}`);
  return data.result;
}
