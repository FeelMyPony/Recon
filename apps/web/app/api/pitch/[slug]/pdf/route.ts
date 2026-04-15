import { eq } from "drizzle-orm";
import { getDb } from "@recon/db/client";
import { pitchPages } from "@recon/outreach/schema/pitch-pages";

export const dynamic = "force-dynamic";

/**
 * Public route that serves the PDF version of a pitch page.
 * Returns the stored pdf_bytes bytea with application/pdf content type.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  try {
    const db = getDb();
    const [page] = await db
      .select({ pdfBytes: pitchPages.pdfBytes, html: pitchPages.html })
      .from(pitchPages)
      .where(eq(pitchPages.urlSlug, slug))
      .limit(1);

    if (!page) {
      return new Response("Pitch page not found", { status: 404 });
    }

    if (!page.pdfBytes) {
      return new Response("PDF not generated for this pitch page", { status: 404 });
    }

    // pdfBytes from Drizzle bytea is a Buffer
    const buf = Buffer.isBuffer(page.pdfBytes)
      ? page.pdfBytes
      : Buffer.from(page.pdfBytes as unknown as ArrayBuffer);

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${slug}.pdf"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[pitch/pdf] Error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
