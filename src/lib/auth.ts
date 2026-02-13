import { SignJWT } from "jose";
import { env } from "./config";

/**
 * Signs a service token for internal communication.
 * This is a local implementation of what was previously expected from a shared module.
 */
export async function signServiceToken(payload: { service: string }): Promise<string> {
  const secretString = env.TABLESTACK_INTERNAL_API_KEY || "fallback-secret-for-dev-only";
  const secret = new TextEncoder().encode(secretString);

  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secret);
}
