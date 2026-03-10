"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Order, downloadReceiptPdf, generateReceiptForTransaction, trackMyOrder } from "../../../src/services/api";
import { useAuth } from "../../../src/context/AuthContext";

const deliverySteps = ["Pending", "Processing", "Shipped", "Delivered"];
const pickupSteps = ["Pending", "Processing", "Ready for Pickup", "Collected"];

function getProgress(order: Order | null): number {
  if (!order || order.status === "Cancelled") return 0;
  if (order.fulfillment_method === "pickup") {
    if (order.picked_up_at || order.status === "Delivered") return 4;
    if (order.pickup_ready_at) return 3;
    if (order.status === "Processing" || order.status === "Shipped") return 2;
    return 1;
  }
  const idx = deliverySteps.indexOf(order.status);
  return idx < 0 ? 0 : idx + 1;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(value);
}

function TrackOrderPageContent() {
  const searchParams = useSearchParams();
  const { isAuthenticated, token, userEmail } = useAuth();
  const [orderNumber, setOrderNumber] = useState(searchParams.get("order") || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);

  const progress = useMemo(() => getProgress(order), [order]);
  const progressSteps = order?.fulfillment_method === "pickup" ? pickupSteps : deliverySteps;

  const runLookup = async (value: string) => {
    if (!token || !value.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      const tracked = await trackMyOrder(value.trim(), token);
      setOrder(tracked);
    } catch (err: any) {
      setOrder(null);
      setError(err?.message || "Unable to track this order.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const initial = searchParams.get("order");
    if (initial && token) {
      runLookup(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, searchParams]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runLookup(orderNumber);
  };

  const generateReceipt = async () => {
    if (!token || !order) return;
    setGeneratingReceipt(true);
    setError("");
    try {
      const receipt = await generateReceiptForTransaction(token, { entity_type: "order", entity_id: order.id });
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
    } catch (err: any) {
      setError(err?.message || "Unable to generate receipt for this order.");
    } finally {
      setGeneratingReceipt(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-xl mx-auto bg-white p-8 rounded-lg shadow-md border border-gray-100 text-center">
          <h1 className="text-3xl font-bold mb-4">Track Your Order</h1>
          <p className="text-gray-600 mb-6">Please sign in to securely track orders linked to your account.</p>
          <Link href="/login" className="inline-flex bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-hover transition-colors">
            Sign In to Track Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="bg-white p-8 rounded-lg shadow-md border border-gray-100">
          <h1 className="text-3xl font-bold mb-2">Track Your Order</h1>
          <p className="text-gray-600 mb-6">
            Signed in as <span className="font-semibold">{userEmail}</span>. Enter your order number to check live status.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="orderNumber" className="block text-gray-700 font-medium mb-2">
                Order Number
              </label>
              <input
                type="text"
                id="orderNumber"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="e.g., ORD-AB12CD34"
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary hover:bg-primary-hover text-white font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-60"
            >
              {isLoading ? "Tracking..." : "Track Order"}
            </button>
          </form>
          {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        </div>

        {order && (
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Order Number</p>
                <p className="font-bold text-gray-900">{order.order_number}</p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{order.status}</span>
            </div>

            {order.status !== "Cancelled" && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {order.fulfillment_method === "pickup" ? "Pickup Progress" : "Delivery Progress"}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {progressSteps.map((step, index) => {
                    const active = index < progress;
                    return (
                      <div
                        key={step}
                        className={`rounded-lg border px-2 py-3 text-center text-xs font-semibold ${
                          active ? "border-primary bg-primary/10 text-primary" : "border-gray-200 text-gray-400"
                        }`}
                      >
                        {step}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-100 p-4">
                {order.fulfillment_method === "pickup" ? (
                  <>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Pickup Station</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">{order.pickup_station?.name || "Station not available"}</p>
                    <p className="text-xs text-gray-600">{order.pickup_station?.address || "-"}</p>
                    <p className="text-xs text-gray-600">{order.pickup_station?.city || "-"}</p>
                    {order.pickup_station?.temporary_notice ? (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        Notice: {order.pickup_station.temporary_notice}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Shipping</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">{order.shipping_address.full_name}</p>
                    <p className="text-xs text-gray-600">{order.shipping_address.address_line_1}</p>
                    <p className="text-xs text-gray-600">
                      {order.shipping_address.city}, {order.shipping_address.country}
                    </p>
                  </>
                )}
              </div>
              <div className="rounded-lg border border-gray-100 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Payment</p>
                <p className="mt-2 text-sm text-gray-700">
                  Status: <span className="font-semibold">{order.is_paid ? "Paid" : "Pending"}</span>
                </p>
                <p className="text-sm text-gray-700">
                  Total: <span className="font-semibold">{formatCurrency(Number(order.total_amount || 0))}</span>
                </p>
                {order.fulfillment_method === "pickup" ? (
                  <>
                    <p className="mt-1 text-xs text-gray-600">Ready: {order.pickup_ready_at ? new Date(order.pickup_ready_at).toLocaleString() : "Not yet"}</p>
                    <p className="text-xs text-gray-600">Collected: {order.picked_up_at ? new Date(order.picked_up_at).toLocaleString() : "Not yet"}</p>
                  </>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-gray-100 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Items</p>
              <div className="mt-3 space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.product.title}</p>
                      <p className="text-xs text-gray-500">Qty {item.quantity} • {item.selected_unit_label || item.sale_option_label || "unit"}</p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(Number(item.price_at_purchase) * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={generateReceipt}
                disabled={generatingReceipt}
                className="rounded-lg border border-primary/30 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
              >
                {generatingReceipt ? "Generating..." : "Generate Receipt"}
              </button>
              <Link href={`/account/orders/${encodeURIComponent(order.order_number)}`} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                Open Full Order Details
              </Link>
              <Link href="/account" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                Back to My Account
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TrackOrderPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-12 text-center text-gray-600">Loading order tracking...</div>}>
      <TrackOrderPageContent />
    </Suspense>
  );
}
