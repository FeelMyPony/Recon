/**
 * Lightweight website email extractor.
 * Fetches the homepage + /contact page, extracts emails via regex.
 * Handles common obfuscations like [at] and (dot).
 */

const EMAIL_REGEX =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const OBFUSCATED_REGEX =
  /\b[A-Za-z0-9._%+-]+\s*(?:\[at\]|\(at\)|@)\s*[A-Za-z0-9.-]+\s*(?:\[dot\]|\(dot\)|\.)\s*[A-Za-z]{2,}\b/gi;

const BLOCKLIST_DOMAINS = [
  "sentry.io",
  "wixpress.com",
  "squarespace.com",
  "godaddy.com",
  "example.com",
  "yoursite.com",
];

const BLOCKLIST_PREFIXES = [
  "u003e",
  "noreply",
  "no-reply",
  "mailer-daemon",
];

function deobfuscate(s: string): string {
  return s
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s*\(at\)\s*/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".")
    .replace(/\s*\(dot\)\s*/gi, ".");
}

function isPlausibleEmail(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.length > 80) return false;
  const domain = lower.split("@")[1];
  if (!domain) return false;
  if (BLOCKLIST_DOMAINS.some((d) => domain.endsWith(d))) return false;
  if (BLOCKLIST_PREFIXES.some((p) => lower.startsWith(p))) return false;
  // Exclude image URLs that often contain tracking pixels
  if (/\.(png|jpg|jpeg|gif|svg|webp)@/i.test(email)) return false;
  return true;
}

async function fetchPage(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function extractEmailFromWebsite(
  websiteUrl: string,
): Promise<string | null> {
  try {
    const base = new URL(websiteUrl);
    const candidates = [
      base.toString(),
      new URL("/contact", base).toString(),
      new URL("/contact-us", base).toString(),
      new URL("/about", base).toString(),
    ];

    const emails = new Set<string>();

    for (const url of candidates) {
      const html = await fetchPage(url);
      if (!html) continue;

      // Strip script/style blocks first
      const cleaned = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ");

      const matches = cleaned.match(EMAIL_REGEX) ?? [];
      for (const m of matches) {
        if (isPlausibleEmail(m)) emails.add(m.toLowerCase());
      }

      const obfuscated = cleaned.match(OBFUSCATED_REGEX) ?? [];
      for (const m of obfuscated) {
        const deob = deobfuscate(m).replace(/\s+/g, "").toLowerCase();
        if (EMAIL_REGEX.test(deob) && isPlausibleEmail(deob)) emails.add(deob);
      }

      if (emails.size > 0) break; // First page with hits is enough
    }

    if (emails.size === 0) return null;

    // Prefer info@/hello@/contact@ over personal addresses
    const preferred = Array.from(emails).sort((a, b) => {
      const aPref = /^(info|hello|contact|enquiries|admin)@/i.test(a) ? 0 : 1;
      const bPref = /^(info|hello|contact|enquiries|admin)@/i.test(b) ? 0 : 1;
      return aPref - bPref;
    });

    return preferred[0] ?? null;
  } catch {
    return null;
  }
}
