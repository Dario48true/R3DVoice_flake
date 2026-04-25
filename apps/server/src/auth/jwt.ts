import jwt from "jsonwebtoken";

export interface SessionTokenClaims {
  userId: string;
  sessionId: string;
}

export interface SessionTokenPayload extends SessionTokenClaims {
  iat: number;
  exp: number;
}

export interface TwoFactorTokenClaims {
  userId: string;
  intent: "totp";
}

export interface TwoFactorTokenPayload extends TwoFactorTokenClaims {
  iat: number;
  exp: number;
}

const EXPIRES_IN_SECONDS = 30 * 24 * 60 * 60; // 30 days
const TWO_FACTOR_EXPIRES_IN_SECONDS = 5 * 60; // 5 minutes

export function signSessionToken(claims: SessionTokenClaims, secret: string): string {
  return jwt.sign(claims, secret, { expiresIn: EXPIRES_IN_SECONDS, algorithm: "HS256" });
}

export function verifySessionToken(token: string, secret: string): SessionTokenPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (typeof decoded === "string") {
    throw new Error("unexpected string JWT payload");
  }
  if (typeof decoded.userId !== "string" || typeof decoded.sessionId !== "string") {
    throw new Error("JWT missing required claims");
  }
  return decoded as SessionTokenPayload;
}

export function signTwoFactorToken(claims: TwoFactorTokenClaims, secret: string): string {
  return jwt.sign(claims, secret, { expiresIn: TWO_FACTOR_EXPIRES_IN_SECONDS, algorithm: "HS256" });
}

export function verifyTwoFactorToken(token: string, secret: string): TwoFactorTokenPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (typeof decoded === "string") throw new Error("unexpected string JWT payload");
  if (typeof decoded.userId !== "string" || decoded.intent !== "totp") {
    throw new Error("JWT missing required 2FA claims");
  }
  return decoded as TwoFactorTokenPayload;
}
