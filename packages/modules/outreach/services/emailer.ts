/**
 * Email sending service via Resend.
 * Works identically in local dev and Vercel production —
 * no SMTP server, SES domain verification, or AWS credentials required.
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  /** Each attachment's `content` should be base64-encoded */
  attachments?: Array<{ filename: string; content: string }>;
}

interface SendEmailResult {
  messageId: string;
  provider: "resend";
}

/**
 * Send an email via Resend's REST API.
 * @throws if RESEND_API_KEY is missing or the API call fails.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RESEND_API_KEY is not set. Get a free key at https://resend.com/api-keys " +
        "and add it to your .env.local (or Vercel env).",
    );
  }

  const from = process.env.EMAIL_FROM ?? "RECON <onboarding@resend.dev>";

  const body: Record<string, unknown> = {
    from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
  };

  if (opts.attachments && opts.attachments.length > 0) {
    body.attachments = opts.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    }));
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Resend API error ${response.status}: ${errText.slice(0, 300)}`,
    );
  }

  const data = await response.json();
  const messageId = data?.id ?? "unknown";

  console.log("[emailer] Resend sent", {
    to: opts.to,
    messageId,
    subject: opts.subject.slice(0, 60),
  });

  return { messageId, provider: "resend" };
}
