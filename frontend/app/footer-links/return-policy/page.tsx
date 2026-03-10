"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../src/context/AuthContext";
import { Order, getMyOrders, submitSupportTicket } from "../../../src/services/api";

interface LocalReturnRequest {
  id: string;
  order_number: string;
  status: "Requested" | "Approved" | "Refunded";
  created_at: string;
}

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function money(value: number): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", currencyDisplay: "code", maximumFractionDigits: 0 }).format(value);
}

export default function ReturnPolicyPage() {
  const { isAuthenticated, token, userEmail, displayName } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [resolution, setResolution] = useState<"refund" | "exchange">("refund");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    const fetchOrders = async () => {
      setLoadingOrders(true);
      setError("");
      try {
        const result = await getMyOrders(token);
        setOrders(result);
      } catch (err: any) {
        setError(err?.message || "Unable to load your orders.");
      } finally {
        setLoadingOrders(false);
      }
    };
    fetchOrders();
  }, [isAuthenticated, token]);

  const deliveredOrders = useMemo(
    () => orders.filter((entry) => entry.status === "Delivered"),
    [orders],
  );

  const selectedOrder = useMemo(
    () => deliveredOrders.find((entry) => entry.order_number === orderNumber) || null,
    [deliveredOrders, orderNumber],
  );

  const submitReturnRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!isAuthenticated || !token) {
      setError("Please sign in first to request a return.");
      return;
    }
    if (!orderNumber) {
      setError("Please select an eligible delivered order.");
      return;
    }
    if (reason.trim().length < 8) {
      setError("Please provide a clear reason for your return request.");
      return;
    }

    setLoadingSubmit(true);
    setError("");
    setSuccess("");
    setTicketId(null);

    const existing = lsGet<LocalReturnRequest[]>("returnRequests", []);
    const hasExisting = existing.some((entry) => entry.order_number === orderNumber);
    if (!hasExisting) {
      const next: LocalReturnRequest[] = [
        {
          id: `${Date.now()}`,
          order_number: orderNumber,
          status: "Requested",
          created_at: new Date().toISOString(),
        },
        ...existing,
      ];
      localStorage.setItem("returnRequests", JSON.stringify(next));
    }

    try {
      const support = await submitSupportTicket(
        {
          name: displayName && displayName !== "Account" ? displayName : "Customer",
          email: userEmail || "",
          subject: `Return Request: ${orderNumber}`,
          message: `Order: ${orderNumber}\nResolution: ${resolution}\nReason: ${reason.trim()}`,
        },
        token,
      );
      setTicketId(support.id);
      setSuccess("Return request submitted successfully. Our team will contact you with next steps.");
      setReason("");
      setResolution("refund");
    } catch (err: any) {
      setSuccess("Return request saved in your account. Support ticket auto-routing failed, please contact support manually.");
      setError(err?.message || "Support routing failed.");
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Policy</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Return & Refund Policy</h1>
          <p className="mt-1 text-sm text-gray-600">
            Request returns for delivered orders and track your refund resolution from one place.
          </p>
        </header>

        {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? (
          <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success} {ticketId ? `Support Ticket #${ticketId}.` : ""}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-modern bg-white p-6 shadow-modern">
            <h2 className="text-lg font-bold text-gray-900">Initiate Return Request</h2>
            {!isAuthenticated ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-600">Sign in to select your delivered orders and submit a return request.</p>
                <Link href="/login" className="inline-flex rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">
                  Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={submitReturnRequest} className="mt-4 space-y-3">
                <select
                  value={orderNumber}
                  onChange={(event) => setOrderNumber(event.target.value)}
                  className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                  required
                >
                  <option value="">Select Delivered Order</option>
                  {deliveredOrders.map((entry) => (
                    <option key={entry.id} value={entry.order_number}>
                      {entry.order_number} - {money(Number(entry.total_amount || 0))}
                    </option>
                  ))}
                </select>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setResolution("refund")}
                    className={`rounded-modern px-3 py-2 text-xs font-semibold ${resolution === "refund" ? "bg-primary text-white" : "border border-gray-200 text-gray-700"}`}
                  >
                    Refund
                  </button>
                  <button
                    type="button"
                    onClick={() => setResolution("exchange")}
                    className={`rounded-modern px-3 py-2 text-xs font-semibold ${resolution === "exchange" ? "bg-primary text-white" : "border border-gray-200 text-gray-700"}`}
                  >
                    Exchange
                  </button>
                </div>

                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="min-h-28 w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                  placeholder="Reason for return"
                  required
                />

                <button
                  type="submit"
                  disabled={loadingSubmit || loadingOrders || deliveredOrders.length === 0}
                  className="w-full rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loadingSubmit ? "Submitting..." : "Submit Return Request"}
                </button>
              </form>
            )}
            {loadingOrders ? <p className="mt-3 text-xs text-gray-500">Loading your delivered orders...</p> : null}
            {isAuthenticated && !loadingOrders && deliveredOrders.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No delivered orders found yet. Return requests become available after delivery.</p>
            ) : null}
          </section>

          <section className="space-y-4">
            <div className="rounded-modern bg-white p-6 shadow-modern">
              <h3 className="text-sm font-bold text-gray-900">Quick Actions</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/footer-links/track-your-order" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                  Track Your Order
                </Link>
                <Link href="/account" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                  My Account
                </Link>
                <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                  Contact Support
                </Link>
              </div>
              {selectedOrder ? (
                <p className="mt-3 text-xs text-gray-500">
                  Selected order <strong>{selectedOrder.order_number}</strong> | Total {money(Number(selectedOrder.total_amount || 0))}
                </p>
              ) : null}
            </div>

            <div className="rounded-modern border border-primary/20 bg-primary/5 p-6">
              <h3 className="text-sm font-bold text-primary">Refund Timelines</h3>
              <ul className="mt-2 space-y-2 text-sm text-gray-700">
                <li>Store Credit refunds are typically processed within 24 hours after approval.</li>
                <li>Original payment method refunds may take 5-7 business days after approval.</li>
                <li>Refund status updates are communicated through support and account activity.</li>
              </ul>
            </div>
          </section>
        </div>

        <section className="rounded-modern bg-white p-6 shadow-modern">
          <h2 className="text-lg font-bold text-gray-900">Policy Terms</h2>
          <div className="mt-3 space-y-4 text-sm text-gray-700">
            <div>
              <h3 className="font-semibold text-gray-900">1. Eligibility for Returns</h3>
              <p>Most items are eligible within 14 days of delivery if unused, in original packaging, and accompanied by proof of purchase.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">2. Non-Returnable Items</h3>
              <p>Underwear, swimwear, personalized items, and digital products are not eligible for return unless defective.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">3. Refund Processing</h3>
              <p>Refunds are processed after return inspection and approval. You may choose store credit or original payment method where applicable.</p>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">4. Exchanges</h3>
              <p>Defective or incorrect items may be exchanged after review. Support will coordinate collection and replacement delivery.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
