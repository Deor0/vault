import { describe, expect, it } from "vitest";
import catalog from "@/data/cancel-links.json";
import { CANCEL_ENTRY_COUNT, cancelCatalogSchema, cancelRoutes, descriptorWords, websiteUrl } from "./cancel-links";

describe("data/cancel-links.json", () => {
  it("is valid, uses https only, and has unique ids", () => {
    const { entries } = cancelCatalogSchema.parse(catalog);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(new URL(entry.url).protocol).toBe("https:");
      for (const link of entry.links ?? []) expect(new URL(link.url).protocol).toBe("https:");
    }
    expect(CANCEL_ENTRY_COUNT).toBeGreaterThanOrEqual(40);
  });

  it("covers the four billing platforms", () => {
    const platforms = cancelCatalogSchema
      .parse(catalog)
      .entries.filter((entry) => entry.kind === "platform")
      .map((entry) => entry.id);
    expect(platforms.sort()).toEqual(["amazon", "apple", "google", "paypal"]);
  });
});

describe("descriptorWords", () => {
  it("reads + as plus and other punctuation as spaces", () => {
    expect(descriptorWords("Disney+")).toBe(" disney plus ");
    expect(descriptorWords("APPLE.COM/BILL 866-712-7753 CA")).toBe(" apple com bill 866 712 7753 ca ");
  });
});

describe("cancelRoutes", () => {
  const routeIds = (descriptor: string, website: string | null = null) =>
    cancelRoutes({ descriptor, label: "Thing", website }).map((route) => route.id);

  it("links a known merchant's cancel page, then a web search", () => {
    const routes = cancelRoutes({ descriptor: "netflix netflix.com", label: "Netflix", website: "netflix.com" });
    expect(routes.map((route) => route.id)).toEqual(["netflix", "search"]);
    expect(routes[0]).toMatchObject({ url: "https://www.netflix.com/cancelplan", source: "merchant" });
    expect(routes[1].url).toBe("https://duckduckgo.com/?q=how%20to%20cancel%20Netflix%20subscription");
  });

  it("routes platform billing to the platform first", () => {
    expect(routeIds("apple.com/bill")).toEqual(["apple", "search"]);
    expect(routeIds("paypal *spotify")).toEqual(["paypal", "spotify", "search"]);
    expect(routeIds("google *youtubepremium")).toEqual(["google", "youtube", "search"]);
    expect(routeIds("amazon prime*2k4")).toEqual(["amazon", "search"]);
  });

  it("matches whole words only", () => {
    expect(routeIds("applebee's grill")).toEqual(["search"]);
    expect(routeIds("hulu llc")).toEqual(["hulu", "search"]);
  });

  it("falls back to the merchant website Plaid reports", () => {
    expect(cancelRoutes({ descriptor: "acme widgets club", label: "Acme", website: "acme.example" })[0]).toMatchObject({
      id: "website",
      url: "https://acme.example",
    });
  });
});

describe("websiteUrl", () => {
  it("accepts bare domains only", () => {
    expect(websiteUrl("netflix.com")).toBe("https://netflix.com");
    expect(websiteUrl("https://www.Spotify.com/us/")).toBe("https://www.spotify.com");
    expect(websiteUrl("javascript:alert(1)")).toBeNull();
    expect(websiteUrl("not a domain")).toBeNull();
    expect(websiteUrl(null)).toBeNull();
  });
});
