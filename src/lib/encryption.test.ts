import { beforeEach, describe, expect, it } from "vitest";
import {
  decrypt,
  decryptSsn,
  encrypt,
  encryptSsn,
  generateEncryptionKey,
  hashSsn,
  maskSsn,
  normalizeSsn,
  prepareSsnFields,
  resetKeyCache,
  ssnMatchesHash,
} from "./encryption";

// Test-only key and fake SSNs. Never put real values in tests.
const TEST_KEY = "0".repeat(63) + "1";
const FAKE_SSN = "123-45-6789";

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
  resetKeyCache();
});

describe("encrypt / decrypt", () => {
  it("round-trips a value", () => {
    const payload = encrypt("hello");
    expect(payload.startsWith("v1:")).toBe(true);
    expect(decrypt(payload)).toBe("hello");
  });

  it("uses a fresh IV so the same input encrypts differently", () => {
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, data] = encrypt("hello").split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 0xff;
    expect(() => decrypt([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow(/authentication failed/);
  });

  it("rejects decryption with a different key", () => {
    const payload = encrypt("hello");
    process.env.ENCRYPTION_KEY = generateEncryptionKey();
    resetKeyCache();
    expect(() => decrypt(payload)).toThrow(/authentication failed/);
  });

  it("enforces AAD when given", () => {
    const payload = encrypt("hello", "borrower-1");
    expect(decrypt(payload, "borrower-1")).toBe("hello");
    expect(() => decrypt(payload, "borrower-2")).toThrow();
  });

  it("accepts base64 keys", () => {
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    resetKeyCache();
    expect(decrypt(encrypt("x"))).toBe("x");
  });

  it("rejects missing or short keys", () => {
    delete process.env.ENCRYPTION_KEY;
    resetKeyCache();
    expect(() => encrypt("x")).toThrow(/not set/);
    process.env.ENCRYPTION_KEY = "abc123";
    resetKeyCache();
    expect(() => encrypt("x")).toThrow(/32 bytes/);
  });
});

describe("SSN helpers", () => {
  it("normalizes and validates", () => {
    expect(normalizeSsn(FAKE_SSN)).toBe("123456789");
    expect(normalizeSsn("123 45 6789")).toBe("123456789");
    for (const bad of ["12345678", "000-12-3456", "666-12-3456", "900-12-3456", "123-00-4567", "123-45-0000"]) {
      expect(() => normalizeSsn(bad)).toThrow();
    }
  });

  it("masks", () => {
    expect(maskSsn(FAKE_SSN)).toBe("***-**-6789");
    expect(maskSsn("6789")).toBe("***-**-6789");
  });

  it("encrypts and decrypts an SSN to its normalized form", () => {
    expect(decryptSsn(encryptSsn(FAKE_SSN))).toBe("123456789");
  });

  it("hashes deterministically regardless of formatting", () => {
    expect(hashSsn(FAKE_SSN)).toBe(hashSsn("123456789"));
    expect(hashSsn(FAKE_SSN)).not.toBe(hashSsn("123-45-6780"));
    expect(ssnMatchesHash("123456789", hashSsn(FAKE_SSN))).toBe(true);
  });

  it("prepares Borrower fields without plaintext", () => {
    const fields = prepareSsnFields(FAKE_SSN);
    expect(fields.ssnLastFour).toBe("6789");
    expect(fields.ssnEncrypted).not.toContain("123456789");
    expect(fields.ssnHash).not.toContain("123456789");
    expect(decryptSsn(fields.ssnEncrypted)).toBe("123456789");
  });
});
