import { getProducts } from "@/services/api";
import AdSlot from "@/components/ads/AdSlot";
import ProductScrollGallery from "@/components/ProductScrollGallery";

type SearchParamRecord = { [key: string]: string | string[] | undefined };

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function similarity(aRaw: string, bRaw: string): number {
  const a = normalizeText(aRaw);
  const b = normalizeText(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenSimilarity(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
  const total = queryTokens.reduce((sum, queryToken) => {
    let best = 0;
    for (const candidate of candidateTokens) {
      best = Math.max(best, similarity(queryToken, candidate));
    }
    return sum + best;
  }, 0);
  return total / queryTokens.length;
}

function fieldScore(queryNorm: string, queryTokens: string[], rawField: string): number {
  const fieldNorm = normalizeText(rawField || "");
  if (!queryNorm || !fieldNorm) return 0;

  let score = 0;
  if (fieldNorm === queryNorm) score = 130;
  else if (fieldNorm.startsWith(queryNorm)) score = 112;
  else if (fieldNorm.includes(queryNorm)) score = 95;
  else if (queryTokens.length > 1 && queryTokens.every((token) => fieldNorm.includes(token))) score = 90;

  const fieldTokens = tokenize(fieldNorm);
  const bestSimilarity = Math.max(
    similarity(queryNorm, fieldNorm),
    tokenSimilarity(queryTokens, fieldTokens),
  );
  if (bestSimilarity >= 0.92) score = Math.max(score, 96);
  else if (bestSimilarity >= 0.84) score = Math.max(score, 82);
  else if (bestSimilarity >= 0.76) score = Math.max(score, 68);
  else if (bestSimilarity >= 0.68) score = Math.max(score, 54);
  else if (bestSimilarity >= 0.58) score = Math.max(score, 40);

  const closestToken = fieldTokens.reduce((best, token) => Math.max(best, similarity(queryNorm, token)), 0);
  if (closestToken >= 0.86) score = Math.max(score, 70);

  return score;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamRecord> | SearchParamRecord;
}) {
  const resolvedParams: SearchParamRecord = searchParams ? await searchParams : {};
  const rawQuery = resolvedParams.q;
  const query = Array.isArray(rawQuery) ? rawQuery.join(" ").trim() : String(rawQuery || "").trim();
  const queryNorm = normalizeText(query);
  const queryTokens = tokenize(queryNorm);

  let allProducts = [];
  try {
    allProducts = await getProducts();
  } catch {
    allProducts = [];
  }
  const scored = allProducts
    .map((product) => {
      const titleScore = fieldScore(queryNorm, queryTokens, product.title || "");
      const categoryScore = fieldScore(queryNorm, queryTokens, product.category?.name || "");
      const vendorScore = fieldScore(queryNorm, queryTokens, product.vendor_name || "");
      const optionScore = Math.max(
        0,
        ...(Array.isArray(product.sale_options)
          ? product.sale_options.map((option) => fieldScore(queryNorm, queryTokens, option.label || ""))
          : [0]),
      );
      const totalScore = queryNorm
        ? titleScore * 1.45 + categoryScore * 1.2 + vendorScore + optionScore * 1.1
        : 1;

      return {
        product,
        totalScore,
      };
    })
    .sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      return a.product.title.localeCompare(b.product.title);
    });

  const strictMatches = scored.filter((entry) => entry.totalScore >= 40);
  const closestMatches = scored.filter((entry) => entry.totalScore >= 22).slice(0, 24);
  const combined = [...strictMatches];
  for (const entry of closestMatches) {
    if (!combined.some((item) => item.product.id === entry.product.id)) combined.push(entry);
  }
  const rankedProducts = (queryNorm ? combined : scored).map((entry) => entry.product);

  const searchableTerms = Array.from(
    new Set(
      allProducts.flatMap((product) => [
        product.title || "",
        product.category?.name || "",
        product.vendor_name || "",
        ...(Array.isArray(product.sale_options) ? product.sale_options.map((option) => option.label || "") : []),
      ]),
    ),
  ).filter(Boolean);
  const closestTerm = queryNorm
    ? searchableTerms
        .map((term) => ({ term, score: similarity(queryNorm, term) }))
        .sort((a, b) => b.score - a.score)[0]
    : null;
  const showDidYouMean =
    Boolean(queryNorm) &&
    Boolean(closestTerm?.term) &&
    (closestTerm?.score || 0) >= 0.72 &&
    !normalizeText(closestTerm?.term || "").includes(queryNorm) &&
    !queryNorm.includes(normalizeText(closestTerm?.term || ""));

  return (
    <main className="min-h-screen bg-neutral-bg pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="pt-6">
          <AdSlot placementKey="category_page_banner" category={query} pagePath="/search" />
        </div>

        <h1 className="py-8 font-heading text-h2 text-primary">
          Search Results for &quot;{query || "All Products"}&quot;
        </h1>

        {showDidYouMean ? (
          <p className="mb-6 rounded-modern border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Did you mean <strong>{closestTerm?.term}</strong>? Showing closest matches.
          </p>
        ) : null}

        {rankedProducts.length === 0 ? (
          <div className="rounded-modern border border-gray-100 bg-white py-20 text-center shadow-modern">
            <p className="font-body text-body-lg text-gray-500">
              No products found matching your search.
            </p>
            <div className="mt-6">
              <AdSlot placementKey="sponsored_grid_card" category={query} pagePath="/search" />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <AdSlot placementKey="sponsored_grid_card" category={query} pagePath="/search" />
            <ProductScrollGallery
              items={rankedProducts.map((product) => ({ product, keyId: product.id }))}
            />
          </div>
        )}
      </div>
    </main>
  );
}
