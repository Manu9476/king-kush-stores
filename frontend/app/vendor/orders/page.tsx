"use client";

import { useState } from "react";
import { useVendorPanel } from "../../../src/context/VendorPanelContext";
import { useAuth } from "../../../src/context/AuthContext";
import { downloadReceiptPdf, generateReceiptForTransaction } from "../../../src/services/api";

export default function VendorOrdersPage() {
  const { isApproved, orders } = useVendorPanel();
  const { token } = useAuth();
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

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
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-sm text-gray-500">
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
