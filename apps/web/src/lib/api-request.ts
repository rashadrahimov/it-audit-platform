import 'server-only';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const CLOUD_RUN_API_AUDIENCE = process.env.CLOUD_RUN_API_AUDIENCE;

let cachedIdentityToken: { token: string; expiresAtMs: number } | null = null;

function jwtExpiryMs(token: string): number {
  try {
    const payload = token.split('.')[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as {
      exp?: number;
    };
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function getCloudRunIdentityToken(): Promise<string | null> {
  if (!CLOUD_RUN_API_AUDIENCE) return null;

  if (cachedIdentityToken && cachedIdentityToken.expiresAtMs - Date.now() > 60_000) {
    return cachedIdentityToken.token;
  }

  const metadataUrl = new URL(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity',
  );
  metadataUrl.searchParams.set('audience', CLOUD_RUN_API_AUDIENCE);

  const response = await fetch(metadataUrl, {
    headers: { 'Metadata-Flavor': 'Google' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Cloud Run identity token request failed: ${response.status}`);
  }

  const token = (await response.text()).trim();
  if (!token) throw new Error('Cloud Run identity token response was empty');

  cachedIdentityToken = { token, expiresAtMs: jwtExpiryMs(token) };
  return token;
}

/** Server-only request to the API, authenticated with the web service identity on Cloud Run. */
export async function apiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const identityToken = await getCloudRunIdentityToken();
  return fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(identityToken ? { 'X-Serverless-Authorization': `Bearer ${identityToken}` } : {}),
    },
  });
}
