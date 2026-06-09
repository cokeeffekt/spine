/**
 * Resolve an Audible ASIN from a title + author using the public Audible catalog
 * search API. Audnexus is ASIN-keyed, so this is the bridge from parsed
 * folder-name metadata to rich Audnexus data (book details, cover, chapters).
 *
 * Network-tolerant like scanner/enrichment.ts: 5s timeout, returns null on any
 * failure (no auth required for catalog search).
 *
 * When a duration is provided, the best match is chosen by **runtime proximity**
 * rather than blind relevance — Audible's top relevance result for a popular
 * series is often book 1 / an omnibus, so matching the file's length picks the
 * correct entry (and thus the correct series position).
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
  runtime_length_min?: number;
}

interface AudibleCatalogResponse {
  products?: AudibleProduct[];
}

export interface SearchOptions {
  region?: string;
  /** Actual file duration; used to pick the runtime-closest candidate. */
  durationSec?: number;
}

/** Pick the best product from candidates: runtime-closest when a duration is given, else first. */
export function pickBestProduct(
  products: AudibleProduct[],
  durationSec?: number
): AudibleProduct | null {
  const valid = products.filter((p) => p.asin);
  if (valid.length === 0) return null;
  if (durationSec && durationSec > 0) {
    const targetMin = durationSec / 60;
    let best: AudibleProduct | null = null;
    let bestDiff = Infinity;
    for (const p of valid) {
      if (typeof p.runtime_length_min === "number" && p.runtime_length_min > 0) {
        const diff = Math.abs(p.runtime_length_min - targetMin);
        if (diff < bestDiff) { bestDiff = diff; best = p; }
      }
    }
    if (best) return best;
  }
  return valid[0];
}

/**
 * Search Audible's catalog and return the best-matching ASIN, or null.
 */
export async function searchAudibleAsin(
  title: string | null,
  author: string | null,
  opts: SearchOptions = {}
): Promise<string | null> {
  if (!title && !author) return null;

  const region = opts.region ?? process.env["AUDIBLE_REGION"] ?? "us";
  const tld = REGION_TLD[region.toLowerCase()] ?? "com";
  const keywords = [author, title].filter(Boolean).join(" ").trim();
  if (!keywords) return null;

  const params = new URLSearchParams({
    keywords,
    num_results: "10",
    products_sort_by: "Relevance",
    response_groups: "product_desc,product_attrs,contributors",
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
    const best = pickBestProduct(data.products ?? [], opts.durationSec);
    return best?.asin?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
