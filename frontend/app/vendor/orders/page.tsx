"use client";

import { useState } from "react";
import { useVendorPanel } from "../../../src/context/VendorPanelContext";
import { useAuth } from "../../../src/context/AuthContext";
import { downloadReceiptPdf, generateReceiptForTransaction, updateVendorOrderStatus } from "../../../src/services/api";

export default function VendorOrdersPage() {
  const { isApproved, orders, reload } = useVendorPanel();
  const { token } = useAuth();
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [statusBusyOrderId, setStatusBusyOrderId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const statusOptions: Array<"Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled"> = [
    "Pending",
    "Processing",
    "Shipped",
    "Delivered",
    "Cancelled",
  ];
  const normalizeStatus = (value: string): "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled" =>
    statusOptions.includes(value as "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled")
      ? (value as "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled")
      : "Pending";

  if (!isApproved) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Orders</h2>
        <p className="rounded-modern border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Orders will appear here once your vendor account is approved and your products receive purchases.
        </p>
      </div>
    );
  }

  const generateReceipt = async (orderId: number) => {
    if (!token) return;
    setBusyOrderId(orderId);
    setMessage("");
    try {
      const receipt = await generateReceiptForTransaction(token, { entity_type: "order", entity_id: orderId });
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
      setMessage(`Receipt ${receipt.receipt_number} downloaded.`);
    } catch (error: any) {
      setMessage(error?.message || "Unable to generate receipt.");
    } finally {
      setBusyOrderId(null);
    }
  };

  const updateStatus = async (
    orderId: number,
    nextStatus: "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled",
  ) => {
    if (!token) return;
    setStatusBusyOrderId(orderId);
    setMessage("");
    try {
      const result = await updateVendorOrderStatus(token, orderId, { status: nextStatus });
      await reload();
      setMessage(result.detail || `Order updated to ${nextStatus}.`);
    } catch (error: any) {
      setMessage(error?.message || "Unable to update order status.");
    } finally {
      setStatusBusyOrderId(null);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Orders For Your Products</h2>
      {message ? <p className="text-sm text-gray-600">{message}</p> : null}

      <div className="overflow-x-auto rounded-modern border border-gray-100">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Update</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-sm text-gray-500">
                  No orders yet for your products.
                </td>
              </tr>
            ) : (
              orders.map((row, index) => (
                <tr key={`${row.order_id}-${row.product_id}-${index}`} className="border-b border-gray-50 text-sm">
                  <td className="px-4 py-3">{row.order_number}</td>
                  <td className="px-4 py-3">{row.product_title}</td>
                  <td className="px-4 py-3">{row.customer_email}</td>
                  <td className="px-4 py-3">{row.quantity}</td>
                  <td className="px-4 py-3">{row.order_status}</td>
                  <td className="px-4 py-3">
                    <select
                      value={normalizeStatus(row.order_status || "Pending")}
                      onChange={(event) => updateStatus(row.order_id, normalizeStatus(event.target.value))}
                      disabled={statusBusyOrderId === row.order_id}
                      className="rounded-modern border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700 disabled:opacity-60"
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    {row.shipping_city}, {row.shipping_country}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => generateReceipt(row.order_id)}
                      disabled={busyOrderId === row.order_id}
                      className="rounded-modern border border-primary/30 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                    >
                      {busyOrderId === row.order_id ? "Generating..." : "Generate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
