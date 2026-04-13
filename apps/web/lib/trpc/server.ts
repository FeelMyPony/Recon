import { eq } from "drizzle-orm";
import { auth } from "@recon/auth";
import { getDb } from "@recon/db/client";
import { workspaces } from "@recon/shared/schema/workspaces";
import { createTRPCRouter, type TRPCContext } from "@recon/outreach/trpc";
import { outreachRouter } from "@recon/outreach/router";

// Root application router — merges every module router under a namespaced key
export const appRouter = createTRPCRouter({
  outreach: outreachRouter,
});

export type AppRouter = typeof appRouter;

// Context creator — called once per request by the fetch adapter
export async function createTRPCContext(): Promise<TRPCContext> {
  const session = await auth();
  const db = getDb();

  const userId = session?.user?.id ?? "";
  let workspaceId = "";

  if (userId) {
    const [ws] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerId, userId))
      .limit(1);

    workspaceId = ws?.id ?? "";
  }

  return { db, userId, workspaceId };
}
