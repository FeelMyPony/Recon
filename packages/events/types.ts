/**
 * Domain event type for cross-module communication.
 * Every significant business action emits a domain event.
 * Modules subscribe to events they care about without direct coupling.
 */
export interface DomainEvent<TPayload = unknown> {
  /** Dot-separated event type: "module.entity.action" */
  type: string;
  /** The workspace this event belongs to */
  workspaceId: string;
  /** Event-specific payload */
  payload: TPayload;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Which module emitted this event */
  sourceModule: string;
}

/** Type-safe event handler */
export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void>;

/** Outreach module events */
export interface OutreachEvents {
  "outreach.search.completed": {
    searchId: string;
    resultCount: number;
  };
  "outreach.lead.created": {
    leadId: string;
    name: string;
    category: string | null;
  };
  "outreach.lead.scored": {
    leadId: string;
    score: "hot" | "warm" | "cold" | "unscored";
    previousScore: string;
  };
  "outreach.lead.statusChanged": {
    leadId: string;
    status: string;
    previousStatus: string;
  };
  "outreach.review.analysed": {
    leadId: string;
    analysisId: string;
    aiScore: string;
  };
  "outreach.email.sent": {
    emailId: string;
    leadId: string;
    toEmail: string;
  };
  "outreach.email.opened": {
    emailId: string;
    leadId: string;
  };
  "outreach.email.replied": {
    emailId: string;
    leadId: string;
  };
}
