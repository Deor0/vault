import { z } from "zod";
import catalog from "@/data/cancel-links.json";

/**
 * Where to cancel a subscription: the curated list in `data/cancel-links.json`
 * (billing platforms first, then the merchant); failing that, the merchant's
 * website as Plaid reports it; and always a web search last. Vault only ever
 * links to these pages; it never contacts a merchant itself.
 */

const CHANNELS = ["web", "app", "phone", "chat", "in_person", "mail"] as const;

const httpsUrl = z.url({ protocol: /^https$/ });

const entrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  kind: z.enum(["platform", "merchant"]),
  match: z.array(z.string().regex(/^[a-z0-9 ]+$/)).min(1),
  url: httpsUrl,
  links: z.array(z.object({ label: z.string().min(1), url: httpsUrl })).optional(),
  steps: z.array(z.string().min(1)).min(1),
  channels: z.array(z.enum(CHANNELS)).min(1),
});

export const cancelCatalogSchema = z.object({ note: z.string(), entries: z.array(entrySchema) });

export type CancelEntry = z.infer<typeof entrySchema>;
export type CancelChannel = (typeof CHANNELS)[number];

export interface CancelRoute {
  id: string;
  name: string;
  source: "platform" | "merchant" | "website" | "search";
  url: string;
  links: { label: string; url: string }[];
  steps: string[];
  channels: CancelChannel[];
}

const ENTRIES: CancelEntry[] = cancelCatalogSchema.parse(catalog).entries;

/** Lower case, "+" as " plus", other punctuation as spaces: "Disney+" → "disney plus", "APPLE.COM/BILL" → "apple com bill". */
export function descriptorWords(value: string): string {
  return ` ${value
    .toLowerCase()
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

function matches(entry: CancelEntry, words: string): boolean {
  return entry.match.some((pattern) => words.includes(` ${pattern} `));
}

/** Plaid's `website` ("netflix.com") as an https URL, or null if it does not look like a bare domain. */
export function websiteUrl(website: string | null): string | null {
  if (!website) return null;
  const host = website
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ? `https://${host}` : null;
}

export function searchUrl(name: string): string {
  return `https://duckduckgo.com/?q=${encodeURIComponent(`how to cancel ${name} subscription`)}`;
}

/**
 * Cancel routes for a stream, most specific first. The last route is always a
 * web search, so there is always somewhere to go.
 */
export function cancelRoutes(stream: { descriptor: string; label: string; website: string | null }): CancelRoute[] {
  const words = descriptorWords(stream.descriptor);
  const found = ENTRIES.filter((entry) => matches(entry, words)).sort(
    (a, b) => Number(a.kind === "merchant") - Number(b.kind === "merchant"),
  );
  const routes: CancelRoute[] = found.map((entry) => ({
    id: entry.id,
    name: entry.name,
    source: entry.kind,
    url: entry.url,
    links: entry.links ?? [],
    steps: entry.steps,
    channels: entry.channels,
  }));

  if (routes.length === 0) {
    const site = websiteUrl(stream.website);
    if (site) {
      routes.push({
        id: "website",
        name: site.replace("https://", ""),
        source: "website",
        url: site,
        links: [],
        steps: ["Sign in on the merchant's website and look under Account, Membership, Subscription, or Billing."],
        channels: ["web"],
      });
    }
  }
  routes.push({
    id: "search",
    name: "Web search",
    source: "search",
    url: searchUrl(stream.label),
    links: [],
    steps: [],
    channels: ["web"],
  });
  return routes;
}

export const CANCEL_ENTRY_COUNT = ENTRIES.length;
