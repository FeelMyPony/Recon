/**
 * Proposal PDF generator using @react-pdf/renderer.
 * Produces a polished one-page proposal personalised to a lead's pain points.
 * Returns a Buffer that can be stored in Postgres (BYTEA) or attached to emails.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
  Font,
} from "@react-pdf/renderer";

interface ProposalContext {
  leadName: string;
  category: string;
  suburb: string;
  state: string;
  rating: string;
  reviewCount: number;
  painPoints: string[];
  strengths: string[];
  opportunities: string[];
  serviceDescription: string;
  senderName: string;
  senderEmail?: string;
}

// ─── Styles (RECON brand palette) ─────────────────────────────────────

const NAVY = "#0F1B2D";
const TEAL = "#00BFA6";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: NAVY,
    lineHeight: 1.5,
  },
  header: {
    borderBottomWidth: 3,
    borderBottomColor: TEAL,
    paddingBottom: 14,
    marginBottom: 20,
  },
  brand: {
    fontSize: 10,
    color: TEAL,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    marginTop: 6,
    color: NAVY,
  },
  subtitle: {
    fontSize: 11,
    color: MUTED,
    marginTop: 4,
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 8,
  },
  listItem: {
    flexDirection: "row",
    marginBottom: 6,
  },
  bullet: {
    width: 12,
    fontSize: 11,
    color: TEAL,
    fontFamily: "Helvetica-Bold",
  },
  itemText: {
    flex: 1,
    fontSize: 10.5,
    color: NAVY,
  },
  emphasis: {
    fontSize: 11,
    color: NAVY,
    padding: 12,
    backgroundColor: "#F1F5F9",
    borderLeftWidth: 3,
    borderLeftColor: TEAL,
    marginTop: 6,
    marginBottom: 6,
  },
  twoCol: {
    flexDirection: "row",
    gap: 14,
  },
  col: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
  },
  colTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: TEAL,
    marginBottom: 6,
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 24,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 9,
    color: MUTED,
  },
  cta: {
    marginTop: 14,
    padding: 14,
    backgroundColor: NAVY,
    color: "#FFFFFF",
    borderRadius: 4,
  },
  ctaTitle: {
    color: TEAL,
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  ctaBody: {
    color: "#FFFFFF",
    fontSize: 10,
    lineHeight: 1.5,
  },
});

// ─── Document ─────────────────────────────────────────────────────────

function ProposalDocument({ ctx }: { ctx: ProposalContext }): React.ReactElement {
  const painBlurb =
    ctx.painPoints.length > 0
      ? ctx.painPoints
      : ["No specific pain points surfaced yet — but there's always room to improve operations."];

  return React.createElement(
    Document,
    {},
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.brand }, "RECON PROPOSAL"),
        React.createElement(Text, { style: styles.title }, `Tailored for ${ctx.leadName}`),
        React.createElement(
          Text,
          { style: styles.subtitle },
          `${ctx.category} · ${ctx.suburb}, ${ctx.state}  ·  ${ctx.rating}★ (${ctx.reviewCount} reviews)`,
        ),
      ),

      // Intro
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "The opportunity"),
        React.createElement(
          Text,
          { style: { fontSize: 11, color: NAVY } },
          `After analysing ${ctx.reviewCount} Google reviews for ${ctx.leadName}, we identified specific areas where our service could move the needle — without adding work to your plate.`,
        ),
      ),

      // Pain points
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "What we found in your reviews"),
        ...painBlurb.slice(0, 5).map((p, i) =>
          React.createElement(
            View,
            { key: `pain-${i}`, style: styles.listItem },
            React.createElement(Text, { style: styles.bullet }, "→"),
            React.createElement(Text, { style: styles.itemText }, p),
          ),
        ),
      ),

      // Two-column: strengths + opportunities
      (ctx.strengths.length > 0 || ctx.opportunities.length > 0) &&
        React.createElement(
          View,
          { style: [styles.section, styles.twoCol] },
          React.createElement(
            View,
            { style: styles.col },
            React.createElement(Text, { style: styles.colTitle }, "Keep doing"),
            ...ctx.strengths.slice(0, 3).map((s, i) =>
              React.createElement(
                View,
                { key: `str-${i}`, style: styles.listItem },
                React.createElement(Text, { style: styles.bullet }, "✓"),
                React.createElement(Text, { style: styles.itemText }, s),
              ),
            ),
          ),
          React.createElement(
            View,
            { style: styles.col },
            React.createElement(Text, { style: styles.colTitle }, "Where we help"),
            ...ctx.opportunities.slice(0, 3).map((o, i) =>
              React.createElement(
                View,
                { key: `opp-${i}`, style: styles.listItem },
                React.createElement(Text, { style: styles.bullet }, "◆"),
                React.createElement(Text, { style: styles.itemText }, o),
              ),
            ),
          ),
        ),

      // Our service
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, "How we can help"),
        React.createElement(
          Text,
          { style: styles.emphasis },
          ctx.serviceDescription ||
            "We help businesses improve operations, online presence, and client satisfaction — so you can focus on delivering great service instead of chasing admin.",
        ),
      ),

      // CTA
      React.createElement(
        View,
        { style: styles.cta },
        React.createElement(Text, { style: styles.ctaTitle }, "Let's have a quick chat"),
        React.createElement(
          Text,
          { style: styles.ctaBody },
          `A 10-minute call is enough to work out if this would be a fit. ${ctx.senderEmail ? `Reply to this email or contact ${ctx.senderEmail}.` : "Reply to this email to book a time."}`,
        ),
      ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer },
        React.createElement(
          Text,
          { style: styles.footerText },
          `Prepared by ${ctx.senderName}`,
        ),
        React.createElement(
          Text,
          { style: styles.footerText },
          new Date().toLocaleDateString("en-AU", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        ),
      ),
    ),
  );
}

// ─── Public API ───────────────────────────────────────────────────────

export async function generateProposalPdf(ctx: ProposalContext): Promise<Buffer> {
  const doc = ProposalDocument({ ctx });
  const buffer = await renderToBuffer(doc);
  return buffer;
}
