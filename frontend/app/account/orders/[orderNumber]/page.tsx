"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cancelMyOrder, downloadReceiptPdf, generateReceiptForTransaction, getMyOrders, Order } from "../../../../src/services/api";
import { useAuth } from "../../../../src/context/AuthContext";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(value);
}

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

export default function AccountOrderDetailsPage() {
  const params = useParams<{ orderNumber: string }>();
  const router = useRouter();
  const { token, isAuthenticated } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [generatingReceipt, setGeneratingReceipt] = useState(false);

  const orderNumber = useMemo(() => decodeURIComponent(params?.orderNumber || ""), [params?.orderNumber]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!token || !orderNumber) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const orders = await getMyOrders(token);
        const matched = orders.find((entry) => entry.order_number === orderNumber) || null;
        if (!matched) {
          setError("Order not found in your account.");
        }
        setOrder(matched);
      } catch (err: any) {
        setError(err.message || "Failed to load order details.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [isAuthenticated, orderNumber, router, token]);

  if (!isAuthenticated) return null;

  const downloadInvoice = () => {
    if (!order) return;
    const rows = [
      "King-Kush Stores - Invoice",
      `Order Number: ${order.order_number}`,
      `Date: ${new Date(order.created_at).toLocaleString()}`,
      `Status: ${order.status}`,
      "",
      ...order.items.map(
        (item) =>
          `${item.product.title} (${item.selected_unit_label || item.sale_option_label || "unit"}) x${item.quantity} - ${formatCurrency(Number(item.price_at_purchase) * item.quantity)}`,
      ),
      "",
      `Total: ${formatCurrency(Number(order.total_amount || 0))}`,
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${order.order_number}-invoice.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const cancelOrder = async () => {
    if (!order || !token) return;
    setCancelling(true);
    try {
      const updated = await cancelMyOrder(order.id, token);
      setOrder(updated);
    } catch (err: any) {
      setError(err.message || "Unable to cancel this order.");
    } finally {
      setCancelling(false);
    }
  };

  const generateReceipt = async () => {
    if (!order || !token) return;
    setGeneratingReceipt(true);
    setError(null);
    try {
      const receipt = await generateReceiptForTransaction(token, { entity_type: "order", entity_id: order.id });
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
    } catch (err: any) {
      setError(err.message || "Unable to generate receipt.");
    } finally {
      setGeneratingReceipt(false);
    }
  };

  const showCancel = order && (order.status === "Pending" || order.status === "Processing");
  const progress = getProgress(order);
  const progressSteps = order?.fulfillment_method === "pickup" ? pickupSteps : deliverySteps;

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <Link href="/account" className="inline-flex rounded-modern border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-primary">
          Back to Account
        </Link>

        {loading ? (
          <div className="rounded-modern bg-white p-8 shadow-modern">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-4 border-primary" />
          </div>
        ) : error ? (
          <div className="rounded-modern bg-white p-8 shadow-modern">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        ) : order ? (
          <div className="rounded-modern bg-white p-6 shadow-modern space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-h3 font-heading font-bold text-neutral-text">{order.order_number}</h1>
                <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleString()}</p>
              </div>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{order.status}</span>
            </div>

            {order.status !== "Cancelled" ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {order.fulfillment_method === "pickup" ? "Pickup Progress" : "Order Progress"}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {progressSteps.map((step, index) => {
                    const active = index < progress;
                    return (
                      <div key={step} className={`rounded-modern border px-2 py-3 text-center text-xs font-semibold ${active ? "border-primary bg-primary/10 text-primary" : "border-gray-200 text-gray-400"}`}>
                        {step}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-modern border border-gray-100 p-4">
                {order.fulfillment_method === "pickup" ? (
                  <>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Pickup Station</p>
                    <p className="mt-2 text-sm font-semibold text-neutral-text">{order.pickup_station?.name || "Station unavailable"}</p>
                    <p className="text-xs text-gray-600">{order.pickup_station?.address || "-"}</p>
                    <p className="text-xs text-gray-600">{order.pickup_station?.city || "-"}</p>
                    <p className="text-xs text-gray-600">{order.pickup_station?.contact_phone || "-"}</p>
                    {order.pickup_station?.temporary_notice ? (
                      <p className="mt-2 rounded-modern border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        Notice: {order.pickup_station.temporary_notice}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-xs uppercase tracking-wide text-gray-500">Shipping Address</p>
                    <p className="mt-2 text-sm font-semibold text-neutral-text">{order.shipping_address.full_name}</p>
                    <p className="text-xs text-gray-600">{order.shipping_address.address_line_1}</p>
                    <p className="text-xs text-gray-600">{order.shipping_address.city}, {order.shipping_address.country}</p>
                    <p className="text-xs text-gray-600">{order.shipping_address.phone_number}</p>
                  </>
                )}
              </div>
              <div className="rounded-modern border border-gray-100 p-4">
                <p className="text-xs uppercase tracking-wide text-gray-500">Payment Summary</p>
                <p className="mt-2 text-sm text-gray-700">Status: <span className="font-semibold">{order.is_paid ? "Paid" : "Pending"}</span></p>
                <p className="text-sm text-gray-700">Total: <span className="font-semibold">{formatCurrency(Number(order.total_amount || 0))}</span></p>
                {order.fulfillment_method === "pickup" ? (
                  <>
                    <p className="mt-1 text-xs text-gray-600">Ready: {order.pickup_ready_at ? new Date(order.pickup_ready_at).toLocaleString() : "Not yet"}</p>
                    <p className="text-xs text-gray-600">Collected: {order.picked_up_at ? new Date(order.picked_up_at).toLocaleString() : "Not yet"}</p>
                  </>
                ) : null}
              </div>
            </div>

            <div className="rounded-modern border border-gray-100 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Items</p>
              <div className="mt-3 space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-modern border border-gray-100 px-3 py-2">
                    <div>
                      <p className="text-sm font-semibold text-neutral-text">{item.product.title}</p>
                      <p className="text-xs text-gray-500">Qty {item.quantity} • {item.selected_unit_label || item.sale_option_label || "unit"}</p>
                    </div>
                    <p className="text-sm font-semibold text-neutral-text">
                      {formatCurrency(Number(item.price_at_purchase) * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={downloadInvoice} className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">
                Download Invoice
              </button>
              <button
                type="button"
                onClick={generateReceipt}
                disabled={generatingReceipt}
                className="rounded-modern border border-primary/30 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-60"
              >
                {generatingReceipt ? "Generating..." : "Generate Receipt"}
              </button>
              {showCancel ? (
                <button
                  type="button"
                  onClick={cancelOrder}
                  disabled={cancelling}
                  className="rounded-modern border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-60"
                >
                  {cancelling ? "Cancelling..." : "Cancel Order"}
                </button>
              ) : null}
              <Link href={`/footer-links/track-your-order?order=${encodeURIComponent(order.order_number)}`} className="rounded-modern bg-primary px-3 py-2 text-xs font-semibold text-white">
                Track Order
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
