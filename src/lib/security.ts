const SECRET = process.env.INTERNAL_SYSTEM_KEY || 'fallback_secret_at_least_32_chars_long';
const MAX_AGE_MS = 300000; // 5 minute expiry to prevent replay attacks

export async function signPayload(payload: string): Promise<{ signature: string; timestamp: number }> {
  const timestamp = Date.now();
  const data = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SECRET);
  const dataData = encoder.encode(data);

  // Using a simple HMAC-SHA256 for internal service verification
  const hash = await crypto.subtle.importKey(
    "raw", 
    keyData, 
    { name: "HMAC", hash: "SHA-256" }, 
    false, 
    ["sign"]
  );
  
  const signed = await crypto.subtle.sign("HMAC", hash, dataData);
  
  return { 
    signature: Buffer.from(signed).toString('hex'), 
    timestamp 
  };
}

export async function verifySignature(payload: string, signature: string, timestamp: number): Promise<boolean> {
  // 1. Check age
  if (Date.now() - timestamp > MAX_AGE_MS) return false;

  // 2. Re-sign and compare
  const data = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SECRET);
  const dataData = encoder.encode(data);

  const hash = await crypto.subtle.importKey(
    "raw", 
    keyData, 
    { name: "HMAC", hash: "SHA-256" }, 
    false, 
    ["verify"]
  );

  const signatureBytes = new Uint8Array(signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  return await crypto.subtle.verify("HMAC", hash, signatureBytes, dataData);
}
