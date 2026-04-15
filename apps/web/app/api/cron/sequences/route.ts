/**
 * Vercel Cron endpoint — processes due sequence enrollments.
 *
 * Scheduled hourly via vercel.json. Secured by CRON_SECRET when set
 * (Vercel also injects the `x-vercel-cron` header for internal crons).
 */

import { runDueSequenceSteps } from "@recon/outreach/services/sequences";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Auth: Vercel cron OR bearer CRON_SECRET
  const isVercelCron = req.headers.get("x-vercel-cron") != null;
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!isVercelCron && expected && auth !== `Bearer ${expected}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runDueSequenceSteps();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/sequences] Error:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
