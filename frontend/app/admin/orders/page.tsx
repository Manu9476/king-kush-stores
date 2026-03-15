"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";
import { useAuth } from "../../../src/context/AuthContext";
import {
  downloadReceiptPdf,
  generateReceiptForTransaction,
  getOrders,
  Order,
  updateAdminOrder,
} from "../../../src/services/api";

function formatKes(value: string | number): string {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (["delivered", "completed", "fulfilled"].includes(normalized)) return "bg-green-100 text-green-700";
  if (["cancelled", "failed", "refunded"].includes(normalized)) return "bg-red-100 text-red-700";
  if (["processing", "in_transit", "shipped", "paid"].includes(normalized)) return "bg-blue-100 text-blue-700";
  return "bg-amber-100 text-amber-700";
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, canAccessAdminModule, hasAdminPermission } = useAuth();
  const canViewOrders = canAccessAdminModule("orders") && hasAdminPermission("orders.view");
  const canEditOrders = hasAdminPermission("orders.edit");

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [receiptBusyOrderId, setReceiptBusyOrderId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const statusOptions: Order["status"][] = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canViewOrders) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, canViewOrders, router]);

  const loadOrders = useCallback(async () => {
    if (!token || !canViewOrders) return;
    setLoading(true);
    setError("");
    try {
      const data = await getOrders(token);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load orders.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token, canViewOrders]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canViewOrders) {
      loadOrders();
    }
  }, [isAuthenticated, token, userRole, canViewOrders, loadOrders]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => {
      const hay = `${order.order_number} ${order.user?.email || ""} ${order.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, query]);

  const updateOrder = async (orderId: number, payload: { status?: Order["status"]; is_paid?: boolean }) => {
    if (!token || !canEditOrders) return;
    setBusyOrderId(orderId);
    setError("");
    setMessage("");
    try {
      const updated = await updateAdminOrder(token, orderId, payload);
      setOrders((prev) => prev.map((row) => (row.id === orderId ? updated : row)));
      setMessage(`Order ${updated.order_number} updated successfully.`);
    } catch (err: any) {
      setError(err?.message || "Unable to update order.");
    } finally {
      setBusyOrderId(null);
    }
  };

  const generateReceipt = async (orderId: number) => {
    if (!token) return;
    setReceiptBusyOrderId(orderId);
    setError("");
    setMessage("");
    try {
      const receipt = await generateReceiptForTransaction(token, { entity_type: "order", entity_id: orderId });
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
      setMessage(`Receipt ${receipt.receipt_number} downloaded.`);
    } catch (err: any) {
      setError(err?.message || "Unable to generate receipt.");
    } finally {
      setReceiptBusyOrderId(null);
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canViewOrders) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <AdminSidebar active="orders" />
      <main className="flex-1 overflow-y-auto p-6 pb-24 md:p-8 md:pb-8">
        <div className="space-y-4">
          <div className="rounded-modern border border-gray-200 bg-white p-5">
            <h1 className="text-2xl font-bold text-gray-900">Orders Desk</h1>
            <p className="text-sm text-gray-600">
              Update order status, mark payment state, and generate receipts from the custom admin panel.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by order number, customer email, or status..."
              className="w-full rounded-modern border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-primary md:max-w-xl"
            />
            <button
              type="button"
              onClick={loadOrders}
              disabled={loading}
              className="rounded-modern border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
            >
              Refresh
            </button>
          </div>

          {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}
          {message ? <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{message}</div> : null}

          <div className="overflow-x-auto rounded-modern border border-gray-100 bg-white">
            <table className="w-full min-w-[1100px] text-left">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-sm text-gray-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-sm text-gray-500">
                      No orders found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-50 text-sm">
                      <td className="px-4 py-3 font-semibold text-gray-900">{order.order_number}</td>
                      <td className="px-4 py-3">{order.user?.email || "-"}</td>
                      <td className="px-4 py-3">{new Date(order.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold">{formatKes(order.total_amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(order.status)}`}>
                            {order.status}
                          </span>
                          <select
                            value={order.status}
                            onChange={(e) => updateOrder(order.id, { status: e.target.value as Order["status"] })}
                            disabled={!canEditOrders || busyOrderId === order.id}
                            className="rounded-modern border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 disabled:opacity-60"
                          >
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                          <input
                            type="checkbox"
                            checked={Boolean(order.is_paid)}
                            onChange={(e) => updateOrder(order.id, { is_paid: e.target.checked })}
                            disabled={!canEditOrders || busyOrderId === order.id}
                          />
                          {order.is_paid ? "Paid" : "Unpaid"}
                        </label>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => generateReceipt(order.id)}
                          disabled={receiptBusyOrderId === order.id}
                          className="rounded-modern border border-primary/30 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                        >
                          {receiptBusyOrderId === order.id ? "Generating..." : "Generate Receipt"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

