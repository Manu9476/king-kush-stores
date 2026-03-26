// frontend/app/page.tsx
import { getProducts } from "../src/services/api";
import AdSlot from "../src/components/ads/AdSlot";
import ProductScrollGallery from "../src/components/ProductScrollGallery";

export default async function Home() {
  let products: Awaited<ReturnType<typeof getProducts>> = [];
  try {
    products = await getProducts();
  } catch {
    products = [];
  }

  return (
    <main className="min-h-screen bg-neutral-bg pb-20">
      <section className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <AdSlot placementKey="announcement_bar" pagePath="/" />
      </section>

      {/* PRODUCTS GRID SECTION */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <AdSlot placementKey="homepage_hero_banner" pagePath="/" />
        </div>

        <div className="mb-8 flex items-center justify-between">
          <h2 className="font-heading text-h2 text-primary">Trending Products</h2>
        </div>

        {products.length === 0 ? (
          <div className="rounded-modern border border-gray-100 bg-white py-20 text-center shadow-modern">
            <p className="font-body text-body-lg text-gray-500">No products found. Add some in the Django admin.</p>
          </div>
        ) : (
          <ProductScrollGallery
            items={products.map((product) => ({ product, keyId: product.id }))}
          />
        )}
      </section>

      <section className="mx-auto mt-10 max-w-7xl px-4 sm:px-6 lg:px-8">
        <AdSlot placementKey="promotional_strip" pagePath="/" />
      </section>

    </main>
  );
}
