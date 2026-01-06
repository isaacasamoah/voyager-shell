/**
 * Environment loader
 * Loads variables from .env.local
 */

import * as fs from "fs";
import * as path from "path";

export function loadEnv(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)="?([^"]*)"?$/);
      if (match) {
        process.env[match[1]] = match[2];
      }
    }
  }
}

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
