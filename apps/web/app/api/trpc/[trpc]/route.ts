import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createTRPCContext } from "@/lib/trpc/server";

export const dynamic = "force-dynamic";

// Vercel: extend function lifetime so background work (scraping, analysis)
// has time to complete. Max 60s on Pro, 300s on Enterprise. Hobby = 10s (hard cap).
export const maxDuration = 60;

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });

export { handler as GET, handler as POST };
