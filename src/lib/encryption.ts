// Field-level encryption for borrower SSNs.
//
// Server-only: this module uses node:crypto and reads ENCRYPTION_KEY. Never
// import it from a client component.
//
// ENCRYPTION_KEY must be 32 random bytes, encoded as 64 hex characters or as
// base64 (44 chars). Generate one with `npm run gen:key`.
//
// Ciphertext format: "v1:<iv>:<authTag>:<ciphertext>", each part base64.
// The version prefix leaves room for key rotation later.

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12; // 96-bit IV, the recommended size for GCM
const AUTH_TAG_LENGTH = 16;
const VERSION = "v1";

let cachedKeys: { encryptionKey: Buffer; hashKey: Buffer } | null = null;

function parseKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === KEY_LENGTH) {
    return decoded;
  }
  throw new Error(
    "ENCRYPTION_KEY must be 32 bytes, encoded as 64 hex characters or base64. Run `npm run gen:key`."
  );
}

function getKeys() {
  if (cachedKeys) return cachedKeys;

  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set.");
  }
  const masterKey = parseKey(raw);

  // Derive separate subkeys so the encryption key is never reused as an HMAC key.
  const encryptionKey = Buffer.from(
    hkdfSync("sha256", masterKey, Buffer.alloc(0), "scra:ssn:encrypt:v1", KEY_LENGTH)
  );
  const hashKey = Buffer.from(
    hkdfSync("sha256", masterKey, Buffer.alloc(0), "scra:ssn:blind-index:v1", KEY_LENGTH)
  );

  cachedKeys = { encryptionKey, hashKey };
  return cachedKeys;
}

/** For tests only: forget the cached key so a changed ENCRYPTION_KEY takes effect. */
export function resetKeyCache() {
  cachedKeys = null;
}

/** Generates a new random key, hex encoded, suitable for ENCRYPTION_KEY. */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString("hex");
}

/**
 * Encrypts a string with AES-256-GCM. `aad` (additional authenticated data) is
 * optional; if given at encryption it must be given unchanged at decryption.
 */
export function encrypt(plaintext: string, aad?: string): string {
  const { encryptionKey } = getKeys();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [VERSION, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Decrypts a value produced by `encrypt`. Throws if it was tampered with or the key is wrong. */
export function decrypt(payload: string, aad?: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognized encrypted payload format.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Unrecognized encrypted payload format.");
  }

  const { encryptionKey } = getKeys();
  const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));

  try {
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // Don't leak crypto internals; GCM auth failure means tampering or wrong key.
    throw new Error("Failed to decrypt value: authentication failed.");
  }
}

// ---------------------------------------------------------------------------
// SSN helpers
// ---------------------------------------------------------------------------

/**
 * Strips formatting and validates an SSN. Returns the 9-digit string.
 * Rejects structurally invalid SSNs (area 000/666/9xx, group 00, serial 0000).
 */
export function normalizeSsn(input: string): string {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^\d{9}$/.test(digits)) {
    throw new Error("SSN must contain exactly 9 digits.");
  }
  const area = digits.slice(0, 3);
  const group = digits.slice(3, 5);
  const serial = digits.slice(5);
  if (area === "000" || area === "666" || area.startsWith("9") || group === "00" || serial === "0000") {
    throw new Error("SSN is not a valid number.");
  }
  return digits;
}

export function isValidSsn(input: string): boolean {
  try {
    normalizeSsn(input);
    return true;
  } catch {
    return false;
  }
}

export function getSsnLastFour(ssn: string): string {
  return normalizeSsn(ssn).slice(-4);
}

/** Masks for display. Accepts a full SSN or just the last four digits. */
export function maskSsn(ssnOrLastFour: string): string {
  const digits = ssnOrLastFour.replace(/\D/g, "");
  const lastFour = digits.slice(-4).padStart(4, "*");
  return `***-**-${lastFour}`;
}

/**
 * Deterministic keyed hash (blind index) of an SSN. Same SSN always gives the
 * same hash under the same key, so it can back a unique index and match DMDC
 * response rows without decrypting. It cannot be reversed without the key.
 */
export function hashSsn(ssn: string): string {
  const { hashKey } = getKeys();
  return createHmac("sha256", hashKey).update(normalizeSsn(ssn)).digest("hex");
}

/** Constant-time check that a plaintext SSN matches a stored blind index. */
export function ssnMatchesHash(ssn: string, storedHash: string): boolean {
  const a = Buffer.from(hashSsn(ssn), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function encryptSsn(ssn: string): string {
  return encrypt(normalizeSsn(ssn));
}

export function decryptSsn(payload: string): string {
  return decrypt(payload);
}

/** Everything needed to store an SSN on a Borrower row. */
export function prepareSsnFields(ssn: string): {
  ssnEncrypted: string;
  ssnHash: string;
  ssnLastFour: string;
} {
  const normalized = normalizeSsn(ssn);
  return {
    ssnEncrypted: encrypt(normalized),
    ssnHash: hashSsn(normalized),
    ssnLastFour: normalized.slice(-4),
  };
}
