import * as jose from 'jose';

const JWT_SECRET = process.env.INTERNAL_SERVICE_SECRET || process.env.INTERNAL_SYSTEM_KEY || 'fallback_secret_at_least_32_chars_long';
const secret = new TextEncoder().encode(JWT_SECRET);

/**
 * Signs a service token for internal communication.
 */
export async function signServiceToken(payload: any = {}) {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .setIssuer('internal-service')
    .sign(secret);
}

/**
 * Verifies a service token.
 */
export async function verifyServiceToken(token: string) {
  try {
    const { payload } = await jose.jwtVerify(token, secret, {
      issuer: 'internal-service',
      algorithms: ['HS256'],
    });
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Validates the API key or JWT service token.
 */
export async function validateRequest(req: any): Promise<{
  error?: string;
  status?: number;
  isInternal?: boolean;
}> {
  const getHeader = (name: string) => {
    if (typeof req.headers?.get === 'function') return req.headers.get(name);
    return req.headers?.[name.toLowerCase()] || req.headers?.[name];
  };

  const authHeader = getHeader('authorization');
  const apiKey = getHeader('x-api-key') || getHeader('x-internal-system-key') || getHeader('INTERNAL_SYSTEM_KEY');
  const internalKey = process.env.INTERNAL_SYSTEM_KEY || process.env.INTERNAL_API_KEY || process.env.TABLESTACK_INTERNAL_API_KEY;

  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = await verifyServiceToken(token);
    if (payload) {
      return { isInternal: true };
    }
  }

  if (!apiKey) {
    return { error: 'Missing API key or valid Bearer token', status: 401 };
  }

  if (internalKey && apiKey === internalKey) {
    return { isInternal: true };
  }

  return { error: 'Invalid API key', status: 403 };
}
