import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * scrypt from node:crypto rather than argon2 or bcrypt: both need native
 * compilation, and the team is on Windows where a failed node-gyp build is a
 * bad first-day experience. scrypt is a memory-hard KDF and is more than
 * adequate for a handful of accounts.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = (await scryptAsync(plain, salt, KEY_LEN)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [scheme, saltHex, keyHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(keyHex, "hex");
    if (expected.length !== KEY_LEN) return false;
    const actual = (await scryptAsync(plain, salt, KEY_LEN)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
