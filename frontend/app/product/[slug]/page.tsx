import Link from "next/link";
import ProductDetailClient from "@/components/ProductDetailClient";
import { getProductBySlug, getProducts } from "@/services/api";

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  const product = await getProductBySlug(resolvedParams.slug);

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Product Not Found</h1>
          <p className="text-gray-500 mb-6">We could not load the details for this item.</p>
          <Link href="/" className="text-green-600 hover:text-green-700 font-medium bg-white px-6 py-3 rounded-lg shadow-sm border border-gray-200">
            &larr; Return to Store
          </Link>
        </div>
      </div>
    );
  }

  let allProducts: Awaited<ReturnType<typeof getProducts>> = [];
  try {
    allProducts = await getProducts();
  } catch {
    allProducts = [];
  }
  const relatedProducts = allProducts
    .filter((candidate) => candidate.id !== product.id)
    .filter((candidate) => {
      if (product.category?.id && candidate.category?.id) return candidate.category.id === product.category.id;
      if (product.vendor_name && candidate.vendor_name) return candidate.vendor_name === product.vendor_name;
      return true;
    })
    .slice(0, 12);

  return <ProductDetailClient product={product} relatedProducts={relatedProducts} />;
}
