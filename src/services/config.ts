import Conf from 'conf';

interface FreestackConfig {
  domain?: string;
  cloudflare?: {
    apiToken: string;
    accountId: string;
    zoneId?: string;
  };
  resend?: {
    apiKey: string;
  };
  mail?: {
    fromName: string;
    fromEmail: string;
  };
}

const config = new Conf<FreestackConfig>({
  projectName: 'freestack',
  schema: {
    domain: { type: 'string' },
    cloudflare: {
      type: 'object',
      properties: {
        apiToken: { type: 'string' },
        accountId: { type: 'string' },
        zoneId: { type: 'string' },
      },
    },
    resend: {
      type: 'object',
      properties: {
        apiKey: { type: 'string' },
      },
    },
    mail: {
      type: 'object',
      properties: {
        fromName: { type: 'string' },
        fromEmail: { type: 'string' },
      },
    },
  },
});

export { config, type FreestackConfig };
