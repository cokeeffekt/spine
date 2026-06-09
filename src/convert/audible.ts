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

export interface MatchHints {
  title?: string | null;
  author?: string | null;
}

/** Normalize a name/title for comparison: lowercase, drop apostrophes, fold punctuation. */
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether a query author matches any of a product's authors (shared last name or ≥2 tokens). */
export function authorMatches(queryAuthor: string, productAuthors?: { name: string }[]): boolean {
  if (!productAuthors || productAuthors.length === 0) return false; // can't confirm → no match
  const q = norm(queryAuthor);
  if (!q) return false;
  const qTokens = q.split(" ").filter((t) => t.length >= 2);
  const qLast = qTokens[qTokens.length - 1];
  for (const a of productAuthors) {
    const p = norm(a?.name);
    if (!p) continue;
    if (p === q || p.includes(q) || q.includes(p)) return true;
    const pTokens = p.split(" ").filter((t) => t.length >= 2);
    if (qLast && qLast.length >= 3 && pTokens[pTokens.length - 1] === qLast) return true;
    const shared = pTokens.filter((t) => qTokens.includes(t));
    if (shared.length >= 2) return true;
  }
  return false;
}

/** Fraction of the query title's words that appear in the candidate title (0..1). */
export function titleSimilarity(queryTitle: string, productTitle: string | null | undefined): number {
  const q = norm(queryTitle).split(" ").filter(Boolean);
  const p = new Set(norm(productTitle).split(" ").filter(Boolean));
  if (q.length === 0 || p.size === 0) return 0;
  let hit = 0;
  for (const t of q) if (p.has(t)) hit++;
  return hit / q.length;
}

/**
 * Pick the best product. When title/author hints are given, candidates must resemble BOTH
 * (so a same-title parody by a different author, or a different book with a close runtime,
 * is rejected); among those, the runtime-closest wins (else relevance-first). Returns null
 * when hints are given but nothing matches — the caller then keeps the source metadata
 * rather than applying a wrong match.
 */
export function pickBestProduct(
  products: AudibleProduct[],
  durationSec?: number,
  hints?: MatchHints
): AudibleProduct | null {
  const valid = products.filter((p) => p.asin);
  if (valid.length === 0) return null;

  let pool = valid;
  const qTitle = hints?.title?.trim() || null;
  const qAuthor = hints?.author?.trim() || null;
  if (qTitle || qAuthor) {
    pool = valid.filter((p) => {
      const authorOk = qAuthor ? authorMatches(qAuthor, p.authors) : true;
      const titleOk = qTitle ? titleSimilarity(qTitle, p.title) >= 0.5 : true;
      return authorOk && titleOk;
    });
    if (pool.length === 0) return null; // no confident match
  }

  if (durationSec && durationSec > 0) {
    const targetMin = durationSec / 60;
    let best: AudibleProduct | null = null;
    let bestDiff = Infinity;
    for (const p of pool) {
      if (typeof p.runtime_length_min === "number" && p.runtime_length_min > 0) {
        const diff = Math.abs(p.runtime_length_min - targetMin);
        if (diff < bestDiff) { bestDiff = diff; best = p; }
      }
    }
    if (best) return best;
  }
  return pool[0];
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
    const best = pickBestProduct(data.products ?? [], opts.durationSec, { title, author });
    return best?.asin?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
