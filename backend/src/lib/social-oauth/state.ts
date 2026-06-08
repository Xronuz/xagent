import crypto from "crypto";
import envConfig from "../../config/env.config";

interface OAuthStateData {
  userId: string;
  redirectTo?: string;
}

export function createOAuthState(data: OAuthStateData): string {
  const payload = JSON.stringify({
    userId: data.userId,
    redirectTo: data.redirectTo ?? null,
    exp: Date.now() + 10 * 60 * 1000, // Expires in 10 minutes
  });

  const payloadBase64 = Buffer.from(payload).toString("base64url");
  const signature = crypto
    .createHmac("sha256", envConfig.GITHUB_OAUTH_STATE_SECRET)
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

export function verifyOAuthState(state: string): OAuthStateData {
  const [payloadBase64, signature] = state.split(".");

  if (!payloadBase64 || !signature) {
    throw new Error("Invalid OAuth state format");
  }

  const expectedSignature = crypto
    .createHmac("sha256", envConfig.GITHUB_OAUTH_STATE_SECRET)
    .update(payloadBase64)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("Invalid OAuth state signature");
  }

  const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf-8"));
    if (payload.exp < Date.now()) {
      throw new Error("OAuth state has expired");
    }

  return {
    userId: payload.userId,
    redirectTo: payload.redirectTo ?? undefined,
  };
}
