import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Database client with lazy initialization.
 * Returns null during build time when DATABASE_URL is not set.
 */

let _db: PostgresJsDatabase | null = null;
let _dbRead: PostgresJsDatabase | null = null;

function createDb(url: string): PostgresJsDatabase {
  const client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return drizzle(client);
}

export function getDb(): PostgresJsDatabase {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is required");
    _db = createDb(url);
  }
  return _db;
}

export function getDbRead(): PostgresJsDatabase {
  if (!_dbRead) {
    const url = process.env.DATABASE_READ_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL environment variable is required");
    _dbRead = createDb(url);
  }
  return _dbRead;
}

// For compatibility — these will throw if DATABASE_URL is missing
// Use getDb() for lazy initialization
export const db = (() => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Return a placeholder during build - will be replaced at runtime
    return null as unknown as PostgresJsDatabase;
  }
  return createDb(url);
})();

export const dbRead = (() => {
  const url = process.env.DATABASE_READ_URL ?? process.env.DATABASE_URL;
  if (!url) return null as unknown as PostgresJsDatabase;
  return createDb(url);
})();
