import { emitEvent } from "@recon/events";

const MODULE = "outreach";

export const outreachEvents = {
  async searchCompleted(
    workspaceId: string,
    searchId: string,
    resultCount: number,
  ) {
    await emitEvent("outreach.search.completed", workspaceId, MODULE, {
      searchId,
      resultCount,
    });
  },

  async leadCreated(
    workspaceId: string,
    leadId: string,
    name: string,
    category: string | null,
  ) {
    await emitEvent("outreach.lead.created", workspaceId, MODULE, {
      leadId,
      name,
      category,
    });
  },

  async leadScored(
    workspaceId: string,
    leadId: string,
    score: string,
    previousScore: string,
  ) {
    await emitEvent("outreach.lead.scored", workspaceId, MODULE, {
      leadId,
      score,
      previousScore,
    });
  },

  async emailSent(
    workspaceId: string,
    emailId: string,
    leadId: string,
    toEmail: string,
  ) {
    await emitEvent("outreach.email.sent", workspaceId, MODULE, {
      emailId,
      leadId,
      toEmail,
    });
  },
};
