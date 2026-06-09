/**
 * Resolve an Audible ASIN from a title + author using the public Audible catalog
 * search API. Audnexus is ASIN-keyed, so this is the bridge from parsed
 * folder-name metadata to rich Audnexus data (book details, cover, chapters).
 *
 * Network-tolerant like scanner/enrichment.ts: 5s timeout, returns null on any
 * failure (no auth required for catalog search).
 */

const REGION_TLD: Record<string, string> = {
  us: "com",
  ca: "ca",
  uk: "co.uk",
  au: "com.au",
  fr: "fr",
  de: "de",
  jp: "co.jp",
  it: "it",
  in: "co.in",
  es: "es",
};

interface AudibleProduct {
  asin?: string;
  title?: string;
  authors?: { name: string }[];
}

interface AudibleCatalogResponse {
  products?: AudibleProduct[];
}

/**
 * Search Audible's catalog and return the best-matching ASIN, or null.
 * @param region two-letter region key (default "us")
 */
export async function searchAudibleAsin(
  title: string | null,
  author: string | null,
  region: string = process.env["AUDIBLE_REGION"] ?? "us"
): Promise<string | null> {
  if (!title && !author) return null;

  const tld = REGION_TLD[region.toLowerCase()] ?? "com";
  const keywords = [author, title].filter(Boolean).join(" ").trim();
  if (!keywords) return null;

  const params = new URLSearchParams({
    keywords,
    num_results: "1",
    products_sort_by: "Relevance",
    response_groups: "product_desc,contributors",
  });
  const url = `https://api.audible.${tld}/1.0/catalog/products?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "spine/1.0" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AudibleCatalogResponse;
    const asin = data.products?.[0]?.asin;
    return asin && asin.trim() ? asin.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
