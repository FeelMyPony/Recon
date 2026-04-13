import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Sets the workspace context for the current database transaction.
 * This enables Postgres RLS policies that use current_setting('app.workspace_id').
 *
 * Usage in tRPC middleware:
 *   await withWorkspaceContext(db, workspaceId, async (tx) => {
 *     return tx.select().from(leads).where(...);
 *   });
 */
export async function withWorkspaceContext<T>(
  db: PostgresJsDatabase,
  workspaceId: string,
  fn: (tx: PostgresJsDatabase) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Set the workspace context for RLS policies
    await tx.execute(
      sql`SELECT set_config('app.workspace_id', ${workspaceId}, true)`,
    );
    return fn(tx as unknown as PostgresJsDatabase);
  });
}
