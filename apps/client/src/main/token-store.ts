import { safeStorage, app } from "electron";
import { promises as fs } from "node:fs";
import { join } from "node:path";

const FILENAME = "session.enc";

function tokenPath(): string {
  return join(app.getPath("userData"), FILENAME);
}

export async function saveToken(token: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS keychain unavailable; cannot persist session securely");
  }
  const encrypted = safeStorage.encryptString(token);
  await fs.writeFile(tokenPath(), encrypted);
}

export async function getToken(): Promise<string | null> {
  try {
    const bytes = await fs.readFile(tokenPath());
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(bytes);
  } catch (err: unknown) {
    // File missing or decryption failed — treat as "no session"
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

export async function clearToken(): Promise<void> {
  await fs.rm(tokenPath(), { force: true });
}
