import type { DomainEvent, EventHandler } from "./types";
import type { EventBus } from "./bus";

/**
 * AWS SNS event bus for production.
 * Publishes events to an SNS topic. SQS queues subscribe to the topic
 * for fan-out to different consumers.
 *
 * Note: SNS SDK import is dynamic to avoid bundling in development.
 */
export class SnsEventBus implements EventBus {
  private topicArn: string;
  private handlers = new Map<string, EventHandler[]>();

  constructor(topicArn: string) {
    this.topicArn = topicArn;
  }

  subscribe(eventType: string, handler: EventHandler): void {
    // In Lambda, subscriptions are handled by SQS -> Lambda triggers.
    // This is only used if you want in-process handling alongside SNS.
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  async publish(event: DomainEvent): Promise<void> {
    const { SNSClient, PublishCommand } = await import(
      "@aws-sdk/client-sns"
    );

    const client = new SNSClient({
      region: process.env.AWS_REGION ?? "ap-southeast-2",
    });

    await client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Message: JSON.stringify(event),
        MessageAttributes: {
          eventType: {
            DataType: "String",
            StringValue: event.type,
          },
          sourceModule: {
            DataType: "String",
            StringValue: event.sourceModule,
          },
          workspaceId: {
            DataType: "String",
            StringValue: event.workspaceId,
          },
        },
      }),
    );
  }
}
