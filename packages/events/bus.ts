import type { DomainEvent, EventHandler } from "./types";

/**
 * Event bus interface.
 * Implementations: LocalEventBus (dev), SnsEventBus (production).
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe(eventType: string, handler: EventHandler): void;
}

/** Singleton event bus instance */
let _bus: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!_bus) {
    throw new Error(
      "Event bus not initialised. Call initEventBus() at app startup.",
    );
  }
  return _bus;
}

export function initEventBus(bus: EventBus): void {
  _bus = bus;
}

/**
 * Helper to create and publish a domain event.
 */
export async function emitEvent<T>(
  type: string,
  workspaceId: string,
  sourceModule: string,
  payload: T,
): Promise<void> {
  const event: DomainEvent<T> = {
    type,
    workspaceId,
    payload,
    timestamp: new Date().toISOString(),
    sourceModule,
  };
  await getEventBus().publish(event);
}
