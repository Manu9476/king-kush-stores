"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiMessageCircle,
  FiMaximize2,
  FiRotateCcw,
  FiShield,
  FiShoppingCart,
  FiStar,
  FiTruck,
  FiX,
} from "react-icons/fi";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import {
  formatCurrency,
  getProductDefaultSaleOption,
  getUnitAwareEffectivePrice,
  getUnitAwareOriginalPrice,
} from "@/lib/utils";
import {
  ProductReviewListResponse,
  createProductReview,
  createProductReviewComment,
  deleteMyProductReviewComment,
  deleteMyProductReview,
  getProductReviews,
  updateMyProductReviewComment,
  updateMyProductReview,
} from "@/services/api";
import { Product } from "@/types";
import AdSlot from "./ads/AdSlot";
import ProductScrollGallery from "./ProductScrollGallery";

const PLACEHOLDER_IMAGE = "/product-placeholder.svg";

interface ProductDetailClientProps {
  product: Product;
  relatedProducts: Product[];
}

function getGalleryImages(product: Product): string[] {
  const candidates = [
    product.image,
    ...(Array.isArray(product.images) ? product.images.map((img) => img.image) : []),
  ].filter((value): value is string => Boolean(value && value.trim()));

  const unique = Array.from(new Set(candidates));
  return unique.length > 0 ? unique : [PLACEHOLDER_IMAGE];
}

function normalizeDescription(raw: string): { isHtml: boolean; text: string } {
  const text = (raw || "").trim();
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(text);
  return { isHtml, text: text || "No description available yet." };
}

function formatReviewDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

function renderRatingStars(
  selectedRating: number,
  onSelect?: (value: number) => void,
  disabled: boolean = false,
) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => {
        const value = index + 1;
        const active = value <= selectedRating;
        const buttonClasses = onSelect
          ? `transition-transform ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:scale-110"}`
          : "";

        return (
          <button
            key={`rating-input-${value}`}
            type="button"
            disabled={!onSelect || disabled}
            onClick={() => onSelect?.(value)}
            className={buttonClasses}
            aria-label={`Rate ${value} star${value === 1 ? "" : "s"}`}
          >
            <FiStar className={`h-5 w-5 ${active ? "fill-current text-amber-500" : "text-gray-300"}`} />
          </button>
        );
      })}
    </div>
  );
}

export default function ProductDetailClient({ product, relatedProducts }: ProductDetailClientProps) {
  const router = useRouter();
  const { addToCart } = useCart();
  const { isAuthenticated, token, userRole } = useAuth();

  const galleryImages = useMemo(() => getGalleryImages(product), [product]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, true>>({});
  const [adding, setAdding] = useState(false);
  const [buyingNow, setBuyingNow] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(
    getProductDefaultSaleOption(product)?.id ?? null,
  );
  const [reviewData, setReviewData] = useState<ProductReviewListResponse | null>(null);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewError, setReviewError] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [commentSubmittingId, setCommentSubmittingId] = useState<number | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", content: "" });
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  const [commentEditDrafts, setCommentEditDrafts] = useState<Record<number, string>>({});
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);

  const rating = useMemo(
    () => Number(reviewData?.summary?.average_rating ?? product.rating_average ?? 0),
    [reviewData?.summary?.average_rating, product.rating_average],
  );
  const roundedRating = Math.round(rating);
  const reviewCount = useMemo(
    () => Number(reviewData?.summary?.review_count ?? product.review_count ?? 0),
    [reviewData?.summary?.review_count, product.review_count],
  );

  const selectedOption =
    product.sale_options?.find((row) => row.id === selectedOptionId) || getProductDefaultSaleOption(product);
  const effectivePrice = getUnitAwareEffectivePrice(product, selectedOptionId);
  const originalPrice = getUnitAwareOriginalPrice(product, selectedOptionId);
  const hasPromotion = Boolean(product.promotion_active && originalPrice > effectivePrice);
  const normalizedDescription = normalizeDescription(product.description || "");

  const selectedImageSrc = brokenImages[galleryImages[selectedIndex]] ? PLACEHOLDER_IMAGE : galleryImages[selectedIndex];
  const hasMultipleImages = galleryImages.length > 1;

  const stockUnitsPerPurchase = selectedOption?.stock_units_consumed || 1;
  const availablePurchasableUnits = Math.floor(product.stock / stockUnitsPerPurchase);
  const stockTone =
    availablePurchasableUnits > 10
      ? "text-emerald-700 bg-emerald-100"
      : availablePurchasableUnits > 0
        ? "text-amber-700 bg-amber-100"
        : "text-red-700 bg-red-100";

  const markImageAsBroken = (imageSrc: string) => {
    setBrokenImages((prev) => (prev[imageSrc] ? prev : { ...prev, [imageSrc]: true }));
  };

  const setImageIndexWithinBounds = useCallback((nextIndex: number) => {
    const total = galleryImages.length;
    if (total === 0) return;
    const bounded = (nextIndex + total) % total;
    setSelectedIndex(bounded);
  }, [galleryImages.length]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [product.id]);

  useEffect(() => {
    setSelectedOptionId(getProductDefaultSaleOption(product)?.id ?? null);
  }, [product]);

  useEffect(() => {
    const existing = localStorage.getItem("recentlyViewedProducts");
    try {
      const parsed: Product[] = existing ? JSON.parse(existing) : [];
      const deduped = [product, ...parsed.filter((item) => item.id !== product.id)].slice(0, 12);
      localStorage.setItem("recentlyViewedProducts", JSON.stringify(deduped));
    } catch {
      localStorage.setItem("recentlyViewedProducts", JSON.stringify([product]));
    }
  }, [product]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowRight") setImageIndexWithinBounds(selectedIndex + 1);
      if (event.key === "ArrowLeft") setImageIndexWithinBounds(selectedIndex - 1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [lightboxOpen, selectedIndex, galleryImages.length, setImageIndexWithinBounds]);

  const loadReviews = useCallback(async () => {
    setReviewLoading(true);
    setReviewError("");
    try {
      const data = await getProductReviews(product.id);
      setReviewData(data);
      if (data.user_review) {
        setReviewForm({
          rating: data.user_review.rating,
          title: data.user_review.title || "",
          content: data.user_review.content || "",
        });
      } else {
        setReviewForm({ rating: 5, title: "", content: "" });
      }
    } catch (error: any) {
      const rawMessage = error?.message || "Unable to load customer reviews right now.";
      setReviewError(
        rawMessage === "Not found."
          ? "Review service is not available on the deployed backend yet. Push the backend review changes and run migrations on Render."
          : rawMessage,
      );
    } finally {
      setReviewLoading(false);
    }
  }, [product.id]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) {
      router.push("/login");
      return;
    }

    setReviewSubmitting(true);
    setReviewError("");
    try {
      if (reviewData?.user_review) {
        await updateMyProductReview(token, reviewData.user_review.id, reviewForm);
      } else {
        await createProductReview(token, product.id, reviewForm);
      }
      await loadReviews();
    } catch (error: any) {
      setReviewError(error?.message || "Unable to save your review.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const removeReview = async () => {
    if (!token || !reviewData?.user_review) return;
    setReviewSubmitting(true);
    setReviewError("");
    try {
      await deleteMyProductReview(token, reviewData.user_review.id);
      await loadReviews();
    } catch (error: any) {
      setReviewError(error?.message || "Unable to delete your review.");
    } finally {
      setReviewSubmitting(false);
    }
  };

  const submitComment = async (reviewId: number) => {
    if (!token) {
      router.push("/login");
      return;
    }
    const content = (commentDrafts[reviewId] || "").trim();
    if (!content) return;

    setCommentSubmittingId(reviewId);
    setReviewError("");
    try {
      await createProductReviewComment(token, reviewId, { content });
      setCommentDrafts((prev) => ({ ...prev, [reviewId]: "" }));
      await loadReviews();
    } catch (error: any) {
      setReviewError(error?.message || "Unable to add your comment.");
    } finally {
      setCommentSubmittingId(null);
    }
  };

  const submitCommentEdit = async (commentId: number) => {
    if (!token) {
      router.push("/login");
      return;
    }
    const content = (commentEditDrafts[commentId] || "").trim();
    if (!content) return;

    setCommentSubmittingId(commentId);
    setReviewError("");
    try {
      await updateMyProductReviewComment(token, commentId, { content });
      setEditingCommentId(null);
      await loadReviews();
    } catch (error: any) {
      setReviewError(error?.message || "Unable to update your comment.");
    } finally {
      setCommentSubmittingId(null);
    }
  };

  const removeComment = async (commentId: number) => {
    if (!token) {
      router.push("/login");
      return;
    }

    setCommentSubmittingId(commentId);
    setReviewError("");
    try {
      await deleteMyProductReviewComment(token, commentId);
      if (editingCommentId === commentId) {
        setEditingCommentId(null);
      }
      await loadReviews();
    } catch (error: any) {
      setReviewError(error?.message || "Unable to delete your comment.");
    } finally {
      setCommentSubmittingId(null);
    }
  };

  const handleAddToCart = () => {
    addToCart(product, selectedOptionId);
    setAdding(true);
    setTimeout(() => setAdding(false), 650);
  };

  const handleBuyNow = () => {
    addToCart(product, selectedOptionId);
    setBuyingNow(true);
    setTimeout(() => {
      router.push("/checkout");
    }, 120);
  };

  return (
    <div className="min-h-screen bg-neutral-bg pb-16">
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mb-4 text-sm">
          <ol className="flex flex-wrap items-center gap-2 text-gray-500">
            <li>
              <Link href="/" className="hover:text-primary">Home</Link>
            </li>
            <li>/</li>
            <li>
              <Link
                href={`/search?q=${encodeURIComponent(product.category?.name || "")}`}
                className="hover:text-primary"
              >
                {product.category?.name || "Products"}
              </Link>
            </li>
            <li>/</li>
            <li className="line-clamp-1 max-w-[220px] font-semibold text-gray-800">{product.title}</li>
          </ol>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)_300px]">
          <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
            <div
              className="relative overflow-hidden rounded-xl border border-gray-100 bg-gray-100"
              onTouchStart={(event) => setTouchStartX(event.changedTouches[0].clientX)}
              onTouchEnd={(event) => {
                if (touchStartX === null) return;
                const delta = event.changedTouches[0].clientX - touchStartX;
                if (Math.abs(delta) >= 40 && hasMultipleImages) {
                  setImageIndexWithinBounds(selectedIndex + (delta < 0 ? 1 : -1));
                }
                setTouchStartX(null);
              }}
            >
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="block w-full"
                aria-label="Open image gallery"
              >
                <div className="relative aspect-square w-full">
                  <Image
                    src={selectedImageSrc}
                    alt={product.title}
                    fill
                    sizes="(max-width: 1024px) 100vw, 620px"
                    onError={() => markImageAsBroken(galleryImages[selectedIndex])}
                    className="object-cover transition-transform duration-200 hover:scale-[1.02]"
                    priority
                  />
                </div>
              </button>

              {hasMultipleImages ? (
                <>
                  <button
                    type="button"
                    onClick={() => setImageIndexWithinBounds(selectedIndex - 1)}
                    className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
                    aria-label="Previous image"
                  >
                    <FiChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageIndexWithinBounds(selectedIndex + 1)}
                    className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
                    aria-label="Next image"
                  >
                    <FiChevronRight className="h-5 w-5" />
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black/80"
              >
                <FiMaximize2 className="h-3.5 w-3.5" />
                Expand
              </button>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {galleryImages.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                    selectedIndex === index
                      ? "border-primary"
                      : "border-gray-200 hover:border-primary/40"
                  }`}
                  aria-label={`Select image ${index + 1}`}
                >
                  <Image
                    src={brokenImages[image] ? PLACEHOLDER_IMAGE : image}
                    alt={`${product.title} thumbnail ${index + 1}`}
                    fill
                    sizes="64px"
                    onError={() => markImageAsBroken(image)}
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                {product.vendor_name || "King-Kush Store"}
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-gray-900 sm:text-3xl">
                {product.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-1 text-amber-500">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <FiStar key={`detail-star-${index}`} className={`h-4 w-4 ${index < roundedRating ? "fill-current" : "text-gray-300"}`} />
                  ))}
                  <span className="ml-1 text-sm font-semibold text-gray-600">
                    {rating.toFixed(1)} ({reviewCount} reviews)
                  </span>
                </div>

                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stockTone}`}>
                  {availablePurchasableUnits > 0 ? `${availablePurchasableUnits} ${selectedOption?.label || product.base_unit_label || "units"} available` : "Out of stock"}
                </span>
              </div>

              <div className="mt-5">
                <p className="text-3xl font-black text-primary">
                  {formatCurrency(effectivePrice)}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-600">
                  Per {selectedOption?.label || product.base_unit_label || "unit"}
                </p>
                {hasPromotion ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-sm text-gray-500 line-through">{formatCurrency(originalPrice)}</p>
                    {product.promotion_badge ? (
                      <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                        {product.promotion_badge}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {Array.isArray(product.sale_options) && product.sale_options.length > 1 ? (
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Select Quantity / Unit
                  </label>
                  <select
                    value={selectedOptionId ?? ""}
                    onChange={(event) => setSelectedOptionId(event.target.value ? Number(event.target.value) : null)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
                  >
                    {product.sale_options
                      .filter((row) => row.is_active)
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} - {formatCurrency(getUnitAwareEffectivePrice(product, option.id))}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}

              <div className="mt-6 space-y-3 text-sm leading-relaxed text-gray-700">
                {normalizedDescription.isHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: normalizedDescription.text }} />
                ) : (
                  <p className="whitespace-pre-line">{normalizedDescription.text}</p>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-all ${
                    adding
                      ? "scale-[0.98] bg-primary-hover"
                      : "bg-primary hover:bg-primary-hover active:scale-[0.98]"
                  }`}
                >
                  <FiShoppingCart className="h-4 w-4" />
                  {adding ? "Added to Cart" : "Add to Cart"}
                </button>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={buyingNow}
                  className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-100 disabled:opacity-65"
                >
                  {buyingNow ? "Redirecting..." : "Buy Now"}
                </button>
              </div>
            </article>

            <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-800">Product Specifications</h2>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <p><span className="font-semibold">Vendor:</span> {product.vendor_name || "King-Kush Store"}</p>
                <p><span className="font-semibold">Category:</span> {product.category?.name || "Uncategorized"}</p>
                <p><span className="font-semibold">SKU:</span> {product.slug || product.id}</p>
              </div>
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                {product.specifications ? (
                  <p className="whitespace-pre-wrap">{product.specifications}</p>
                ) : (
                  <p>Detailed specifications are being updated for this item.</p>
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-800">Shipping, Returns & Payment</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <FiTruck className="h-4 w-4 text-primary" />
                  <p className="mt-1 text-xs font-semibold text-gray-800">Delivery</p>
                  <p className="text-xs text-gray-600">Fast dispatch across supported regions.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <FiRotateCcw className="h-4 w-4 text-primary" />
                  <p className="mt-1 text-xs font-semibold text-gray-800">Returns</p>
                  <p className="text-xs text-gray-600">Easy return and refund handling through support.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <FiShield className="h-4 w-4 text-primary" />
                  <p className="mt-1 text-xs font-semibold text-gray-800">Secure Payment</p>
                  <p className="text-xs text-gray-600">Protected checkout with verified payment flows.</p>
                </div>
              </div>
            </article>
          </section>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:h-fit">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-800">Seller Information</h2>
              <p className="mt-2 text-sm text-gray-700">{product.vendor_name || "King-Kush Store"}</p>
              <p className="mt-1 text-xs text-gray-500">Verified marketplace seller profile.</p>
              <Link
                href={`/search?q=${encodeURIComponent(product.vendor_name || "")}`}
                className="mt-4 inline-flex rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                View Seller Products
              </Link>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-800">Customer Reviews</h2>
              <p className="mt-2 text-sm text-gray-700">
                Rating: <strong>{rating.toFixed(1)} / 5</strong> from {reviewCount} customer review{reviewCount === 1 ? "" : "s"}.
              </p>
              <p className="mt-2 text-xs text-gray-500">
                Browse community feedback, add your own review after purchase, and join the discussion.
              </p>
              <a
                href="#customer-reviews"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
              >
                <FiMessageCircle className="h-3.5 w-3.5" />
                Open Reviews
              </a>
            </div>

            <AdSlot placementKey="sidebar_promo" pagePath={`/product/${encodeURIComponent(String(product.slug || product.id))}`} category={product.category?.name || ""} />
          </aside>
        </div>

        <section id="customer-reviews" className="mt-10 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-4">
            <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-black text-gray-900">Customer Reviews</h2>
              <div className="mt-3 flex items-center gap-2 text-amber-500">
                {Array.from({ length: 5 }).map((_, index) => (
                  <FiStar key={`summary-star-${index}`} className={`h-5 w-5 ${index < roundedRating ? "fill-current" : "text-gray-300"}`} />
                ))}
                <span className="ml-1 text-sm font-semibold text-gray-700">
                  {rating.toFixed(1)} out of 5
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-600">
                {reviewCount > 0
                  ? `${reviewCount} published review${reviewCount === 1 ? "" : "s"} from marketplace customers.`
                  : "No customer reviews yet. Be the first to share feedback after purchase."}
              </p>
            </article>

            <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-800">Write a Review</h3>
              {reviewError ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">{reviewError}</div>
              ) : null}
              {!isAuthenticated ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                  Sign in with your customer account to leave a review or comment.
                </div>
              ) : userRole !== "customer" ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                  Reviews are reserved for customer accounts that have purchased the item.
                </div>
              ) : !reviewData?.can_review && !reviewData?.user_review ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                  Purchase this item first to unlock reviewing.
                </div>
              ) : (
                <form className="mt-3 space-y-3" onSubmit={submitReview}>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Your rating</p>
                    <div className="flex items-center gap-3">
                      {renderRatingStars(reviewForm.rating, (value) =>
                        setReviewForm((prev) => ({ ...prev, rating: value })),
                      )}
                      <span className="text-sm font-semibold text-gray-700">
                        {reviewForm.rating} star{reviewForm.rating === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                  <input
                    value={reviewForm.title}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Review title"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                  <textarea
                    value={reviewForm.content}
                    onChange={(event) => setReviewForm((prev) => ({ ...prev, content: event.target.value }))}
                    placeholder="Share your experience with this product"
                    className="min-h-28 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={reviewSubmitting}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                    >
                      {reviewSubmitting ? "Saving..." : reviewData?.user_review ? "Update Review" : "Post Review"}
                    </button>
                    {reviewData?.user_review ? (
                      <button
                        type="button"
                        onClick={removeReview}
                        disabled={reviewSubmitting}
                        className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Delete Review
                      </button>
                    ) : null}
                  </div>
                </form>
              )}
            </article>
          </div>

          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-gray-900">Feedback from customers</h3>
              {reviewLoading ? <span className="text-xs font-semibold text-gray-500">Loading...</span> : null}
            </div>

            {!reviewLoading && reviewData?.items?.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                No reviews have been published for this product yet.
              </div>
            ) : null}

            <div className="mt-4 space-y-5">
              {reviewData?.items?.map((review) => (
                <div key={review.id} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">{review.author_name}</p>
                        {review.is_verified_purchase ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                            Verified purchase
                          </span>
                        ) : null}
                        {review.is_featured ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                            Featured
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-amber-500">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <FiStar key={`review-${review.id}-star-${index}`} className={`h-4 w-4 ${index < review.rating ? "fill-current" : "text-gray-300"}`} />
                        ))}
                        <span className="ml-2 text-xs font-medium text-gray-500">{formatReviewDate(review.created_at)}</span>
                      </div>
                      {review.title ? <p className="mt-3 font-semibold text-gray-900">{review.title}</p> : null}
                      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-gray-700">{review.content}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-gray-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Comments</p>
                    <div className="mt-3 space-y-3">
                      {review.comments.length === 0 ? (
                        <p className="text-sm text-gray-500">No comments yet.</p>
                      ) : (
                        review.comments.map((comment) => (
                          <div key={comment.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-900">{comment.author_name}</p>
                                <span className="text-xs text-gray-500">{formatReviewDate(comment.created_at)}</span>
                              </div>
                              {comment.is_admin_reply ? (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Admin reply</span>
                              ) : null}
                              {comment.is_owner ? (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCommentId(comment.id);
                                      setCommentEditDrafts((prev) => ({ ...prev, [comment.id]: comment.content }));
                                    }}
                                    className="text-xs font-semibold text-primary hover:text-primary-hover"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeComment(comment.id)}
                                    disabled={commentSubmittingId === comment.id}
                                    className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-60"
                                  >
                                    {commentSubmittingId === comment.id ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                            {editingCommentId === comment.id ? (
                              <div className="mt-2 space-y-2">
                                <textarea
                                  value={commentEditDrafts[comment.id] || ""}
                                  onChange={(event) =>
                                    setCommentEditDrafts((prev) => ({ ...prev, [comment.id]: event.target.value }))
                                  }
                                  className="min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => submitCommentEdit(comment.id)}
                                    disabled={commentSubmittingId === comment.id}
                                    className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-60"
                                  >
                                    {commentSubmittingId === comment.id ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingCommentId(null)}
                                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="mt-1 text-sm text-gray-700">{comment.content}</p>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {isAuthenticated ? (
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={commentDrafts[review.id] || ""}
                          onChange={(event) => setCommentDrafts((prev) => ({ ...prev, [review.id]: event.target.value }))}
                          placeholder="Add a comment to this review"
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => submitComment(review.id)}
                          disabled={commentSubmittingId === review.id}
                          className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
                        >
                          {commentSubmittingId === review.id ? "Posting..." : "Comment"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        {relatedProducts.length > 0 ? (
          <section className="mt-10">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-black text-gray-900">Related Products</h2>
              <Link href={`/search?q=${encodeURIComponent(product.category?.name || "")}`} className="text-sm font-semibold text-primary hover:text-primary-hover">
                View More
              </Link>
            </div>
            <ProductScrollGallery
              items={relatedProducts.slice(0, 8).map((related) => ({ product: related, keyId: related.id }))}
            />
          </section>
        ) : null}
      </div>

      {lightboxOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxOpen(false)}
              className="absolute right-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
              aria-label="Close expanded image"
            >
              <FiX className="h-4 w-4" />
            </button>

            <div className="relative aspect-square w-full md:aspect-[16/10]">
              <Image
                src={selectedImageSrc}
                alt={`${product.title} expanded`}
                fill
                sizes="95vw"
                onError={() => markImageAsBroken(galleryImages[selectedIndex])}
                className="object-contain"
              />
            </div>

            {hasMultipleImages ? (
              <>
                <button
                  type="button"
                  onClick={() => setImageIndexWithinBounds(selectedIndex - 1)}
                  className="absolute left-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Previous expanded image"
                >
                  <FiChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setImageIndexWithinBounds(selectedIndex + 1)}
                  className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                  aria-label="Next expanded image"
                >
                  <FiChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
