/**
 * Resend webhook handler.
 * Receives delivery/open/click/bounce/complaint events and updates
 * outreach_emails status + lead engagement signals.
 *
 * Setup: In Resend dashboard → Webhooks → Add endpoint:
 *   https://recon-platform.vercel.app/api/webhooks/resend
 * Select events: email.sent, email.delivered, email.opened,
 *                email.clicked, email.bounced, email.complained
 */

import { eq } from "drizzle-orm";
import { getDb } from "@recon/db/client";
import { outreachEmails } from "@recon/outreach/schema/emails";

export const dynamic = "force-dynamic";

type ResendEventType =
  | "email.sent"
  | "email.delivered"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained"
  | "email.delivery_delayed";

interface ResendWebhookPayload {
  type: ResendEventType;
  created_at: string;
  data: {
    email_id: string;
    from?: string;
    to?: string[];
    subject?: string;
    click?: { link?: string };
    bounce?: { message?: string };
  };
}

export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as ResendWebhookPayload;
    const messageId = payload.data?.email_id;

    if (!messageId) {
      return new Response("Missing email_id", { status: 400 });
    }

    const db = getDb();
    const now = new Date();

    // Find the email record by provider message ID
    const [email] = await db
      .select()
      .from(outreachEmails)
      .where(eq(outreachEmails.providerMessageId, messageId))
      .limit(1);

    if (!email) {
      // Might be a test send or an email we didn't originate — no-op, return 200
      console.log("[resend-webhook] No email record for message", messageId);
      return new Response("ok", { status: 200 });
    }

    // Update based on event type
    switch (payload.type) {
      case "email.delivered":
        // Already marked as sent; no-op
        break;

      case "email.opened":
        if (email.status !== "replied" && email.status !== "bounced") {
          await db
            .update(outreachEmails)
            .set({ status: "opened", openedAt: email.openedAt ?? now })
            .where(eq(outreachEmails.id, email.id));
        }
        break;

      case "email.clicked":
        // Log click but don't change status (clicked implies opened)
        console.log("[resend-webhook] Click on email", email.id, payload.data.click?.link);
        break;

      case "email.bounced":
      case "email.complained":
        await db
          .update(outreachEmails)
          .set({ status: "bounced" })
          .where(eq(outreachEmails.id, email.id));
        console.warn(
          "[resend-webhook]",
          payload.type,
          "for",
          email.toEmail,
          payload.data.bounce?.message,
        );
        break;

      default:
        // email.sent, email.delivery_delayed — no-op
        break;
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[resend-webhook] Error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}
