export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@recon/db/client';
import { outreachEmails } from '@recon/outreach/schema/emails';
import { eq } from 'drizzle-orm';

// Type definitions for SNS messages
interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertUrl: string;
  UnsubscribeUrl: string;
  SubscribeUrl?: string;
}

interface SESEvent {
  eventType: 'Send' | 'Delivery' | 'Open' | 'Click' | 'Bounce' | 'Complaint' | 'Reject' | 'Delivery';
  mail: {
    messageId: string;
    source: string;
    sourceArn: string;
    sendingAccountId: string;
    timestamp: string;
    destination: string[];
    headersTruncated: boolean;
    headers: Array<{ name: string; value: string }>;
    commonHeaders: {
      returnPath: string[];
      from: string[];
      date: string;
      to: string[];
      messageId: string;
      subject: string;
    };
  };
  delivery?: {
    timestamp: string;
    processingTimeMillis: number;
    recipients: string[];
    smtpResponse: string;
    remoteMtaIp: string;
    reportingMTA: string;
  };
  open?: {
    timestamp: string;
    userAgent: string;
    ip: string;
  };
  click?: {
    timestamp: string;
    userAgent: string;
    ip: string;
    link: string;
    linkTags?: Record<string, string[]>;
  };
  bounce?: {
    bounceType: 'Transient' | 'Permanent' | 'Undetermined';
    bounceSubType: string;
    bouncedsRecipients: Array<{
      emailAddress: string;
      status: string;
      diagnosticCode: string;
    }>;
    timestamp: string;
    feedbackId: string;
    remoteMtaIp?: string;
  };
  complaint?: {
    complaintsRecipients: Array<{
      emailAddress: string;
      complaintFeedbackType?: string;
    }>;
    timestamp: string;
    userAgent?: string;
    complaintFeedbackType?: string;
    arnNotification?: string;
  };
}

/**
 * Handles SNS subscription confirmation
 * Auto-confirms the subscription by fetching the SubscribeURL
 */
async function handleSubscriptionConfirmation(message: SNSMessage): Promise<void> {
  if (!message.SubscribeUrl) {
    console.error('Missing SubscribeUrl in subscription confirmation');
    return;
  }

  try {
    console.log('Confirming SNS subscription:', message.SubscribeUrl);
    const response = await fetch(message.SubscribeUrl, { method: 'GET' });

    if (!response.ok) {
      console.error('Failed to confirm subscription:', {
        status: response.status,
        statusText: response.statusText,
      });
      return;
    }

    console.log('Successfully confirmed SNS subscription');
  } catch (error) {
    console.error('Error confirming SNS subscription:', error);
  }
}

/**
 * Handles SES Delivery events
 * Already marked as sent, so we just log it
 */
async function handleDeliveryEvent(event: SESEvent): Promise<void> {
  console.log('Email delivered:', {
    messageId: event.mail.messageId,
    recipients: event.delivery?.recipients,
    timestamp: event.delivery?.timestamp,
  });
  // No-op: email is already marked as 'sent'
}

/**
 * Handles SES Open events
 * Updates email status to 'opened' and sets openedAt
 */
async function handleOpenEvent(event: SESEvent): Promise<void> {
  const messageId = event.mail.messageId;

  try {
    console.log('Email opened:', {
      messageId,
      timestamp: event.open?.timestamp,
    });

    const db = getDb();

    // Find email by providerMessageId (SES message ID)
    const emailRecords = await db
      .select()
      .from(outreachEmails)
      .where(eq(outreachEmails.providerMessageId, messageId));

    if (!emailRecords || emailRecords.length === 0) {
      console.warn(`Email not found for messageId: ${messageId}`);
      return;
    }

    const emailRecord = emailRecords[0]!;

    // Update status to 'opened' and set openedAt
    await db
      .update(outreachEmails)
      .set({
        status: 'opened',
        openedAt: new Date(event.open?.timestamp || new Date()),
      })
      .where(eq(outreachEmails.id, emailRecord.id));

    console.log(`Updated email ${emailRecord.id} status to 'opened'`);
  } catch (error) {
    console.error('Error handling open event:', error);
    throw error;
  }
}

/**
 * Handles SES Click events
 * Currently a no-op, but can be extended to track link clicks
 */
async function handleClickEvent(event: SESEvent): Promise<void> {
  console.log('Email link clicked:', {
    messageId: event.mail.messageId,
    link: event.click?.link,
    timestamp: event.click?.timestamp,
  });
  // No-op for now
}

/**
 * Handles SES Bounce events
 * Updates email status to 'bounced'
 */
async function handleBounceEvent(event: SESEvent): Promise<void> {
  const messageId = event.mail.messageId;

  try {
    console.log('Email bounced:', {
      messageId,
      bounceType: event.bounce?.bounceType,
      bounceSubType: event.bounce?.bounceSubType,
      recipients: event.bounce?.bouncedsRecipients,
    });

    const db = getDb();

    // Find email by providerMessageId (SES message ID)
    const emailRecords = await db
      .select()
      .from(outreachEmails)
      .where(eq(outreachEmails.providerMessageId, messageId));

    if (!emailRecords || emailRecords.length === 0) {
      console.warn(`Email not found for messageId: ${messageId}`);
      return;
    }

    const emailRecord = emailRecords[0]!;

    // Update status to 'bounced'
    await db
      .update(outreachEmails)
      .set({
        status: 'bounced',
      })
      .where(eq(outreachEmails.id, emailRecord.id));

    console.log(`Updated email ${emailRecord.id} status to 'bounced'`);
  } catch (error) {
    console.error('Error handling bounce event:', error);
    throw error;
  }
}

/**
 * Handles SES Complaint events
 * Updates email status to 'bounced' when users mark email as spam
 */
async function handleComplaintEvent(event: SESEvent): Promise<void> {
  const messageId = event.mail.messageId;

  try {
    console.log('Email complaint received:', {
      messageId,
      complaintFeedbackType: event.complaint?.complaintFeedbackType,
      recipients: event.complaint?.complaintsRecipients,
    });

    const db = getDb();

    // Find email by providerMessageId (SES message ID)
    const emailRecords = await db
      .select()
      .from(outreachEmails)
      .where(eq(outreachEmails.providerMessageId, messageId));

    if (!emailRecords || emailRecords.length === 0) {
      console.warn(`Email not found for messageId: ${messageId}`);
      return;
    }

    const emailRecord = emailRecords[0]!;

    // Update status to 'bounced' (treating complaints as bounces for list management)
    await db
      .update(outreachEmails)
      .set({
        status: 'bounced',
      })
      .where(eq(outreachEmails.id, emailRecord.id));

    console.log(`Updated email ${emailRecord.id} status to 'bounced' due to complaint`);
  } catch (error) {
    console.error('Error handling complaint event:', error);
    throw error;
  }
}

/**
 * Main POST handler for SES webhook notifications via SNS
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json() as SNSMessage;

    // Log incoming message
    console.log('Received SNS message:', {
      type: body.Type,
      messageId: body.MessageId,
      topicArn: body.TopicArn,
    });

    // Handle subscription confirmation
    if (body.Type === 'SubscriptionConfirmation') {
      await handleSubscriptionConfirmation(body);
      return NextResponse.json({ success: true, message: 'Subscription confirmed' }, { status: 200 });
    }

    // Handle notifications
    if (body.Type !== 'Notification') {
      console.warn('Unexpected SNS message type:', body.Type);
      return NextResponse.json({ success: false, message: 'Unexpected message type' }, { status: 400 });
    }

    // Parse the SES event from the SNS message
    let sesEvent: SESEvent;
    try {
      sesEvent = JSON.parse(body.Message);
    } catch (error) {
      console.error('Failed to parse SES event from SNS message:', error);
      return NextResponse.json({ success: false, message: 'Invalid SES event' }, { status: 400 });
    }

    // Validate SES event has required fields
    if (!sesEvent.mail || !sesEvent.mail.messageId) {
      console.error('SES event missing required fields', { sesEvent });
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    console.log('Processing SES event:', {
      eventType: sesEvent.eventType,
      messageId: sesEvent.mail.messageId,
    });

    // Route to appropriate handler based on event type
    switch (sesEvent.eventType) {
      case 'Delivery':
        await handleDeliveryEvent(sesEvent);
        break;

      case 'Open':
        await handleOpenEvent(sesEvent);
        break;

      case 'Click':
        await handleClickEvent(sesEvent);
        break;

      case 'Bounce':
        await handleBounceEvent(sesEvent);
        break;

      case 'Complaint':
        await handleComplaintEvent(sesEvent);
        break;

      case 'Send':
      case 'Reject':
        // No-op for Send and Reject events
        console.log(`No-op event: ${sesEvent.eventType}`);
        break;

      default:
        console.warn(`Unknown SES event type: ${sesEvent.eventType}`);
    }

    // Always return 200 OK for SNS to mark message as processed
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Error processing SES webhook:', error);
    // Return 200 OK even on error to prevent SNS retry storms
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 200 });
  }
}
