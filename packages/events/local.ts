import type { DomainEvent, EventHandler } from "./types";
import type { EventBus } from "./bus";

/**
 * In-memory event bus for local development.
 * Events are dispatched directly to registered handlers.
 * No network calls, no AWS dependencies.
 */
export class LocalEventBus implements EventBus {
  private handlers = new Map<string, EventHandler[]>();

  subscribe(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    const wildcardHandlers = this.handlers.get("*") ?? [];

    const allHandlers = [...handlers, ...wildcardHandlers];

    if (process.env.NODE_ENV === "development") {
      console.log(
        `[EventBus:local] ${event.type} → ${allHandlers.length} handler(s)`,
        { workspaceId: event.workspaceId, payload: event.payload },
      );
    }

    // Execute handlers concurrently but catch individual failures
    await Promise.allSettled(allHandlers.map((h) => h(event)));
  }
}
