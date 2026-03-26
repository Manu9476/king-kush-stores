"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";
import { useAuth } from "../../../src/context/AuthContext";
import {
  AdminProductReview,
  deleteAdminProductReview,
  deleteAdminProductReviewComment,
  getAdminProductReviews,
  updateAdminProductReview,
  updateAdminProductReviewComment,
} from "../../../src/services/api";

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export default function AdminReviewsPage() {
  const router = useRouter();
  const { isAuthenticated, userRole, token, hasAdminPermission, canAccessAdminModule } = useAuth();
  const canView = canAccessAdminModule("products") && hasAdminPermission("products.view");
  const canEdit = hasAdminPermission("products.edit");
  const canDelete = hasAdminPermission("products.delete");

  const [items, setItems] = useState<AdminProductReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canView) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, router, canView]);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError("");
    try {
      const data = await getAdminProductReviews(token, query, statusFilter);
      setItems(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load reviews.");
    } finally {
      setIsLoading(false);
    }
  }, [token, query, statusFilter]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canView) {
      load();
    }
  }, [isAuthenticated, token, userRole, canView, load]);

  const patchReview = async (reviewId: number, payload: Partial<{ is_approved: boolean; is_featured: boolean }>) => {
    if (!token || !canEdit) return;
    setBusyKey(`review-${reviewId}`);
    setError("");
    setMessage("");
    try {
      const updated = await updateAdminProductReview(token, reviewId, payload);
      setItems((prev) => prev.map((item) => (item.id === reviewId ? { ...item, ...updated } : item)));
      setMessage("Review updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to update review.");
    } finally {
      setBusyKey("");
    }
  };

  const removeReview = async (reviewId: number) => {
    if (!token || !canDelete) return;
    setBusyKey(`review-delete-${reviewId}`);
    setError("");
    setMessage("");
    try {
      await deleteAdminProductReview(token, reviewId);
      setItems((prev) => prev.filter((item) => item.id !== reviewId));
      setMessage("Review deleted.");
    } catch (err: any) {
      setError(err?.message || "Failed to delete review.");
    } finally {
      setBusyKey("");
    }
  };

  const patchComment = async (reviewId: number, commentId: number, isApproved: boolean) => {
    if (!token || !canEdit) return;
    setBusyKey(`comment-${commentId}`);
    setError("");
    setMessage("");
    try {
      const updated = await updateAdminProductReviewComment(token, commentId, { is_approved: isApproved });
      setItems((prev) =>
        prev.map((item) =>
          item.id === reviewId
            ? { ...item, comments: item.comments.map((comment) => (comment.id === commentId ? { ...comment, ...updated } : comment)) }
            : item,
        ),
      );
      setMessage("Comment updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to update comment.");
    } finally {
      setBusyKey("");
    }
  };

  const removeComment = async (reviewId: number, commentId: number) => {
    if (!token || !canDelete) return;
    setBusyKey(`comment-delete-${commentId}`);
    setError("");
    setMessage("");
    try {
      await deleteAdminProductReviewComment(token, commentId);
      setItems((prev) =>
        prev.map((item) =>
          item.id === reviewId ? { ...item, comments: item.comments.filter((comment) => comment.id !== commentId) } : item,
        ),
      );
      setMessage("Comment deleted.");
    } catch (err: any) {
      setError(err?.message || "Failed to delete comment.");
    } finally {
      setBusyKey("");
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canView) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <AdminSidebar active="reviews" />
      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Customer Reviews Desk</h1>
              <p className="mt-1 text-sm text-gray-600">Moderate product ratings, seeded feedback, and discussion comments.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product, reviewer, or text..."
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All reviews</option>
                <option value="approved">Approved</option>
                <option value="hidden">Hidden</option>
                <option value="featured">Featured</option>
              </select>
              <button type="button" onClick={load} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">
                Refresh
              </button>
            </div>
          </div>
        </header>

        {message ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{message}</div> : null}
        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-bold text-gray-900">All Reviews ({items.length})</h2>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading reviews...</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No reviews found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((review) => (
                <div key={review.id} className="p-5 space-y-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{review.product.title}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {review.product.vendor_name} | {review.author_name} {review.user_email ? `(${review.user_email})` : ""} | {formatDate(review.created_at)}
                      </p>
                      <p className="mt-2 text-sm text-gray-700">
                        Rating: <strong>{review.rating}/5</strong>
                        {review.is_verified_purchase ? " | Verified purchase" : ""}
                        {review.is_seeded ? " | Seeded review" : ""}
                      </p>
                      {review.title ? <p className="mt-3 font-semibold text-gray-900">{review.title}</p> : null}
                      <p className="mt-2 text-sm leading-6 text-gray-700 whitespace-pre-line">{review.content}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canEdit ? (
                        <>
                          <button
                            type="button"
                            disabled={busyKey === `review-${review.id}`}
                            onClick={() => patchReview(review.id, { is_approved: !review.is_approved })}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                              review.is_approved
                                ? "border border-amber-200 bg-amber-50 text-amber-700"
                                : "border border-green-200 bg-green-50 text-green-700"
                            }`}
                          >
                            {review.is_approved ? "Hide Review" : "Approve Review"}
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === `review-${review.id}`}
                            onClick={() => patchReview(review.id, { is_featured: !review.is_featured })}
                            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"
                          >
                            {review.is_featured ? "Unfeature" : "Feature"}
                          </button>
                        </>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          disabled={busyKey === `review-delete-${review.id}`}
                          onClick={() => removeReview(review.id)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-gray-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Comments ({review.comments.length})</p>
                    <div className="mt-3 space-y-3">
                      {review.comments.length === 0 ? (
                        <p className="text-sm text-gray-500">No comments on this review.</p>
                      ) : (
                        review.comments.map((comment) => (
                          <div key={comment.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {comment.author_name} {comment.is_admin_reply ? <span className="text-xs text-blue-700">| Admin reply</span> : null}
                              </p>
                              <p className="mt-1 text-sm text-gray-700">{comment.content}</p>
                            </div>
                            <div className="flex gap-2">
                              {canEdit ? (
                                <button
                                  type="button"
                                  disabled={busyKey === `comment-${comment.id}`}
                                  onClick={() => patchComment(review.id, comment.id, !comment.is_approved)}
                                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700"
                                >
                                  {comment.is_approved ? "Hide" : "Approve"}
                                </button>
                              ) : null}
                              {canDelete ? (
                                <button
                                  type="button"
                                  disabled={busyKey === `comment-delete-${comment.id}`}
                                  onClick={() => removeComment(review.id, comment.id)}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
