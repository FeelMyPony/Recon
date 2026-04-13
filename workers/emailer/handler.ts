import type { SQSEvent, SQSHandler } from "aws-lambda";

/**
 * Emailer worker: sends outreach emails via AWS SES.
 * Processes queued emails from sequences and one-off sends.
 *
 * TODO: Implement SES email sending
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    const message = JSON.parse(body.Message ?? body);

    console.log("[emailer] Processing email:", {
      emailId: message.payload?.emailId,
      workspaceId: message.workspaceId,
    });

    // TODO:
    // 1. Fetch email record from DB
    // 2. Render template with merge fields
    // 3. Send via SES
    // 4. Update email status to 'sent'
    // 5. Store SES message ID for tracking
    // 6. Emit 'outreach.email.sent' event
  }
};
