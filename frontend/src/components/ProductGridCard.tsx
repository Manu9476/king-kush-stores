"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FiHeart, FiShoppingCart, FiStar } from "react-icons/fi";
import { useCart } from "@/context/CartContext";
import {
  formatCurrency,
  getProductDefaultSaleOption,
  getUnitAwareEffectivePrice,
  getUnitAwareOriginalPrice,
} from "@/lib/utils";
import { Product } from "@/types";

const PLACEHOLDER_IMAGE = "/product-placeholder.svg";

type ProductGridCardProps = {
  product: Product;
  badgeText?: string;
  onOpen?: () => void;
};

function getProductBadge(product: Product, fallbackBadge: string | undefined): string | null {
  if (fallbackBadge?.trim()) return fallbackBadge.trim();
  if (product.promotion_active) return product.promotion_badge || "Discount";

  const createdAt = new Date(product.created_at);
  const createdTime = createdAt.getTime();
  const ageDays = Number.isFinite(createdTime) ? (Date.now() - createdTime) / (1000 * 60 * 60 * 24) : 999;

  if (ageDays <= 14) return "New";
  if (product.stock <= 8) return "Bestseller";
  return "Trending";
}

function getProductRating(productId: number): number {
  const value = 3.8 + ((productId * 37) % 12) / 10;
  return Math.min(4.9, Math.max(3.8, value));
}

function getProductReviewCount(productId: number): number {
  return 10 + ((productId * 29) % 190);
}

function getImageSrc(product: Product): string {
  if (product.image?.trim()) return product.image;
  if (Array.isArray(product.images) && product.images.length > 0 && product.images[0]?.image) return product.images[0].image;
  return PLACEHOLDER_IMAGE;
}

function badgeClasses(badge: string | null): string {
  if (!badge) return "bg-slate-900/90 text-white";
  const label = badge.toLowerCase();
  if (label.includes("discount") || label.includes("sale")) return "bg-rose-600 text-white";
  if (label.includes("new")) return "bg-emerald-600 text-white";
  if (label.includes("bestseller")) return "bg-amber-500 text-white";
  if (label.includes("flash")) return "bg-orange-600 text-white";
  return "bg-slate-900/90 text-white";
}

export default function ProductGridCard({ product, badgeText, onOpen }: ProductGridCardProps) {
  const { addToCart } = useCart();
  const [imageSrc, setImageSrc] = useState<string>(getImageSrc(product));
  const [wishlisted, setWishlisted] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(
    getProductDefaultSaleOption(product)?.id ?? null,
  );

  const routeSegment = encodeURIComponent(String(product.slug || product.id));
  const productHref = `/product/${routeSegment}`;
  const rating = useMemo(() => getProductRating(product.id), [product.id]);
  const reviewCount = useMemo(() => getProductReviewCount(product.id), [product.id]);
  const roundedRating = Math.round(rating);
  const effectivePrice = getUnitAwareEffectivePrice(product, selectedOptionId);
  const originalPrice = getUnitAwareOriginalPrice(product, selectedOptionId);
  const hasSavings = originalPrice > effectivePrice;
  const badge = getProductBadge(product, badgeText);
  const activeOption = product.sale_options?.find((row) => row.id === selectedOptionId) || getProductDefaultSaleOption(product);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wishlistItems");
      const existing: Product[] = raw ? JSON.parse(raw) : [];
      setWishlisted(existing.some((row) => row.id === product.id));
    } catch {
      setWishlisted(false);
    }
  }, [product.id]);

  useEffect(() => {
    const fallback = getProductDefaultSaleOption(product)?.id ?? null;
    setSelectedOptionId(fallback);
  }, [product]);

  const toggleWishlist = () => {
    setWishlisted((prev) => !prev);
    try {
      const raw = localStorage.getItem("wishlistItems");
      const existing: Product[] = raw ? JSON.parse(raw) : [];
      const already = existing.some((row) => row.id === product.id);
      const next = already ? existing.filter((row) => row.id !== product.id) : [...existing, product];
      localStorage.setItem("wishlistItems", JSON.stringify(next));
    } catch {
      // Ignore localStorage errors in restricted environments.
    }
  };

  const onAddToCart = () => {
    addToCart(product, selectedOptionId);
    setAdding(true);
    setTimeout(() => setAdding(false), 650);
  };

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:-translate-y-0.5">
      <div className="relative overflow-hidden bg-gray-100">
        <Link href={productHref} onClick={onOpen} className="block w-full text-left" aria-label={`Open ${product.title}`}>
          <div className="relative aspect-square">
            <Image
              src={imageSrc}
              alt={product.images?.[0]?.alt_text || product.title}
              fill
              loading="lazy"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              onError={() => setImageSrc(PLACEHOLDER_IMAGE)}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.04] group-active:scale-[1.03]"
            />
          </div>
        </Link>

        {product.category?.name ? (
          <span className="absolute left-2 top-2 rounded-full bg-white/92 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm">
            {product.category.name}
          </span>
        ) : null}

        {badge ? (
          <span className={`absolute left-2 bottom-2 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide shadow-sm ${badgeClasses(badge)}`}>
            {badge}
          </span>
        ) : null}

        <button
          type="button"
          onClick={toggleWishlist}
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          className={`absolute right-2 top-2 rounded-full border p-2 shadow-sm transition-colors ${
            wishlisted
              ? "border-rose-300 bg-white text-rose-600"
              : "border-gray-200 bg-white text-gray-600 hover:text-rose-600"
          }`}
        >
          <FiHeart className={`h-3.5 w-3.5 ${wishlisted ? "fill-current" : ""}`} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <p className="line-clamp-1 text-[11px] uppercase tracking-[0.08em] text-gray-500">
          {product.vendor_name || "King-Kush Store"}
        </p>

        <Link
          href={productHref}
          onClick={onOpen}
          className="line-clamp-2 min-h-10 text-[15px] font-bold leading-5 text-gray-900 transition-colors hover:text-primary"
        >
          {product.title}
        </Link>

        <div className="flex items-center gap-1 text-[11px] text-amber-500">
          {Array.from({ length: 5 }).map((_, index) => (
            <FiStar
              key={`${product.id}-star-${index}`}
              className={`h-3 w-3 ${index < roundedRating ? "fill-current" : "text-gray-300"}`}
            />
          ))}
          <span className="ml-1 text-gray-500">
            {rating.toFixed(1)} ({reviewCount})
          </span>
        </div>

        <div className="mt-0.5">
          <p className="text-[19px] font-black leading-none text-primary">
            {formatCurrency(effectivePrice)}
          </p>
          <p className="mt-1 text-[11px] text-gray-500">
            / {activeOption?.label || product.base_unit_label || "unit"}
          </p>
          {hasSavings ? (
            <p className="mt-1 text-[11px] text-gray-500 line-through">
              {formatCurrency(originalPrice)}
            </p>
          ) : null}
        </div>

        {Array.isArray(product.sale_options) && product.sale_options.length > 1 ? (
          <select
            value={selectedOptionId ?? ""}
            onChange={(event) => setSelectedOptionId(event.target.value ? Number(event.target.value) : null)}
            className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs font-semibold text-gray-700"
          >
            {product.sale_options
              .filter((row) => row.is_active)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
          </select>
        ) : null}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onAddToCart}
            className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-white transition-all ${
              adding
                ? "scale-[0.98] bg-primary-hover"
                : "bg-primary hover:bg-primary-hover active:scale-[0.98]"
            }`}
          >
            <FiShoppingCart className="h-3.5 w-3.5" />
            {adding ? "Added" : "Add to Cart"}
          </button>
          <Link
            href={productHref}
            onClick={onOpen}
            className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-3 py-2.5 text-[12px] font-semibold text-gray-700 transition-colors hover:bg-gray-100"
          >
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}
