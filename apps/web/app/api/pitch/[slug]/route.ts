import { eq } from "drizzle-orm";
import { getDb } from "@recon/db/client";
import { pitchPages } from "@recon/outreach/schema/pitch-pages";

export const dynamic = "force-dynamic";

/**
 * Public route that serves AI-generated pitch pages by URL slug.
 * No authentication required — these are meant to be shared with leads.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const db = getDb();
    const [page] = await db
      .select({ html: pitchPages.html })
      .from(pitchPages)
      .where(eq(pitchPages.urlSlug, slug))
      .limit(1);

    if (!page) {
      return new Response("Page not found", { status: 404 });
    }

    return new Response(page.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[pitch] Error serving page:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
