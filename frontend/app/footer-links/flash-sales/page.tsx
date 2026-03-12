import Link from "next/link";
import ProductScrollGallery from "@/components/ProductScrollGallery";
import { getProducts } from "@/services/api";

function getFlashSaleProducts(products: Awaited<ReturnType<typeof getProducts>>) {
  if (!Array.isArray(products)) return [];
  const promoProducts = products.filter((product) => {
    const hasPromoFlag = Boolean(product.promotion_active);
    const hasSavingsPercent = Number(product.savings_percent || 0) > 0;
    const hasSavingsAmount = Number(product.savings_amount || 0) > 0;
    return hasPromoFlag || hasSavingsPercent || hasSavingsAmount;
  });

  if (promoProducts.length > 0) return promoProducts;

  return [...products]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 24);
}

export const dynamic = "force-dynamic";

export default async function FlashSalesPage() {
  let products: Awaited<ReturnType<typeof getProducts>> = [];
  try {
    products = await getProducts();
  } catch {
    products = [];
  }
  const flashSaleProducts = getFlashSaleProducts(products);

  return (
    <main className="min-h-screen bg-neutral-bg pb-16">
      <section className="bg-red-600 text-white">
        <div className="mx-auto max-w-7xl px-4 py-14 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Flash Sales</h1>
          <p className="mt-3 text-base sm:text-lg">
            Limited-time product drops with strong discounts and fast-moving stock.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/search?q="
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
            >
              Browse All Products
            </Link>
            <Link
              href="/footer-links/black-friday"
              className="rounded-xl border border-white/60 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              View Black Friday
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Live Flash Deals</h2>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            {flashSaleProducts.length} items
          </p>
        </div>

        {flashSaleProducts.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-600">No flash deals are active right now. Check back shortly.</p>
            <Link
              href="/search?q="
              className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
            >
              Continue Shopping
            </Link>
          </div>
        ) : (
          <ProductScrollGallery
            items={flashSaleProducts.map((product) => ({
              product,
              badgeText: "Flash Sale",
              keyId: product.id,
            }))}
          />
        )}
      </section>
    </main>
  );
}
