import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

function readEnvFile(envPath) {
  if (!existsSync(envPath)) return {};
  const entries = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^"(.*)"$/, "$1");
    entries[key] = value;
  }
  return entries;
}

function resolveDatabasePath(databaseUrl) {
  if (!databaseUrl?.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL for local SQLite bootstrap: ${databaseUrl}`);
  }

  const raw = databaseUrl.slice("file:".length);
  if (/^[A-Za-z]:[\\/]/.test(raw)) {
    return raw;
  }
  if (/^\/[A-Za-z]:\//.test(raw)) {
    return raw.slice(1).replace(/\//g, "\\");
  }

  return resolve(repoRoot, "prisma", raw);
}

function makeIdempotent(sql) {
  return sql
    .replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "')
    .replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "')
    .replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');
}

const envFileValues = readEnvFile(resolve(repoRoot, ".env"));
const databaseUrl = process.env.DATABASE_URL ?? envFileValues.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const prismaCliPath = join(repoRoot, "node_modules", "prisma", "build", "index.js");
const sql = execFileSync(
  process.execPath,
  [
    prismaCliPath,
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    join(repoRoot, "prisma", "schema.prisma"),
    "--script"
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...envFileValues,
      DATABASE_URL: databaseUrl
    },
    encoding: "utf8"
  }
);

const databasePath = resolveDatabasePath(databaseUrl);
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON");
db.exec(makeIdempotent(sql));
db.close();

console.log(`SQLite schema ensured at ${databasePath}`);
