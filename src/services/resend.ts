import { Resend } from 'resend';
import Conf from 'conf';
import { config } from './config.js';

function getClient(): Resend {
  const resendConfig = config.get('resend');
  if (!resendConfig?.apiKey) throw new Error('Resend API key not configured. Run: freestack init');
  return new Resend(resendConfig.apiKey);
}

// Local sent mail store (since Resend doesn't have a list API)
const sentStore = new Conf<{ emails: SentEmail[] }>({
  projectName: 'freestack-sent',
  schema: {
    emails: {
      type: 'array',
      default: [],
    },
  },
});

interface SentEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  created_at: string;
  last_event: string;
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}) {
  const client = getClient();
  const mailConfig = config.get('mail');
  const domain = config.get('domain');

  const from = mailConfig?.fromEmail
    ? `${mailConfig.fromName || 'Freestack'} <${mailConfig.fromEmail}>`
    : `noreply@${domain}`;

  const toArr = Array.isArray(opts.to) ? opts.to : [opts.to];

  const payload: any = {
    from,
    to: toArr,
    subject: opts.subject,
  };
  if (opts.html) payload.html = opts.html;
  else if (opts.text) payload.text = opts.text;
  else payload.text = '';

  const { data, error } = await client.emails.send(payload);

  if (error) throw new Error(`Failed to send email: ${error.message}`);

  // Store locally
  const emails = sentStore.get('emails') || [];
  emails.unshift({
    id: data!.id,
    from,
    to: toArr,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    created_at: new Date().toISOString(),
    last_event: 'sent',
  });
  sentStore.set('emails', emails.slice(0, 200)); // keep last 200

  return data;
}

export async function listEmails(): Promise<{ data: SentEmail[] }> {
  const emails = sentStore.get('emails') || [];

  // Try to update status from Resend for recent emails
  const client = getClient();
  for (const email of emails.slice(0, 10)) {
    try {
      const { data } = await client.emails.get(email.id);
      if (data) email.last_event = (data as any).last_event || email.last_event;
    } catch {}
  }
  sentStore.set('emails', emails);

  return { data: emails };
}

export async function getEmail(emailId: string) {
  // Check local store first
  const emails = sentStore.get('emails') || [];
  const local = emails.find(e => e.id === emailId || e.id.startsWith(emailId));

  // Get from Resend for latest status
  const client = getClient();
  const fullId = local?.id || emailId;
  const { data, error } = await client.emails.get(fullId);
  if (error) {
    if (local) return local; // fallback to local
    throw new Error(`Failed to get email: ${error.message}`);
  }

  // Merge local content with remote status
  if (local && data) {
    return { ...local, last_event: (data as any).last_event || local.last_event };
  }
  return data;
}

export async function listDomains() {
  const client = getClient();
  const { data, error } = await client.domains.list();
  if (error) throw new Error(`Failed to list domains: ${error.message}`);
  return data;
}

export async function addDomain(domain: string) {
  const client = getClient();
  const { data, error } = await client.domains.create({ name: domain });
  if (error) throw new Error(`Failed to add domain: ${error.message}`);
  return data;
}

export async function verifyDomain(domainId: string) {
  const client = getClient();
  const { data, error } = await client.domains.verify(domainId);
  if (error) throw new Error(`Failed to verify domain: ${error.message}`);
  return data;
}

export async function getDomain(domainId: string) {
  const client = getClient();
  const { data, error } = await client.domains.get(domainId);
  if (error) throw new Error(`Failed to get domain: ${error.message}`);
  return data;
}
