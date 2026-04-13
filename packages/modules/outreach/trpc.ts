/**
 * Shared tRPC initialisation for the RECON platform.
 *
 * This file is the single source of truth for the tRPC instance,
 * context type, router builder, and protected procedure. Module
 * routers import from here; the web app re-exports the same
 * builders so there is exactly ONE initTRPC call across the
 * entire monorepo.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

export interface TRPCContext {
  db: PostgresJsDatabase;
  userId: string;
  workspaceId: string;
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;

/** Middleware: ensures the user is authenticated and has a workspace */
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.userId || !ctx.workspaceId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx });
});

export const protectedProcedure = t.procedure.use(enforceAuth);
