"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/context/AuthContext";
import {
  AdminFinanceSummary,
  MarketplacePayment,
  VendorOrderSplit,
  VendorPayoutRequest,
  downloadReceiptPdf,
  generateReceiptForTransaction,
  getAdminFinanceSummary,
  getAdminMarketplacePayments,
  getAdminPayoutRequests,
  getAdminVendorOrders,
  releaseAdminExpiredReservations,
  updateAdminPayoutRequest,
} from "../../../src/services/api";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";

function formatKes(value: string | number): string {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export default function AdminFinancePage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, canAccessAdminModule, hasAdminPermission } = useAuth();
  const canViewFinance = canAccessAdminModule("finance") && hasAdminPermission("finance.view");
  const canManagePayouts = hasAdminPermission("payouts.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [summary, setSummary] = useState<AdminFinanceSummary | null>(null);
  const [payments, setPayments] = useState<MarketplacePayment[]>([]);
  const [vendorOrders, setVendorOrders] = useState<VendorOrderSplit[]>([]);
  const [payouts, setPayouts] = useState<VendorPayoutRequest[]>([]);
  const [receiptBusyKey, setReceiptBusyKey] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canViewFinance) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, canViewFinance, router]);

  const loadFinanceData = useCallback(async () => {
    if (!token || !canViewFinance) return;
    setLoading(true);
    setError("");
    try {
      const [summaryData, paymentsData, vendorOrderData, payoutData] = await Promise.all([
        getAdminFinanceSummary(token),
        getAdminMarketplacePayments(token),
        getAdminVendorOrders(token),
        getAdminPayoutRequests(token),
      ]);
      setSummary(summaryData);
      setPayments(paymentsData);
      setVendorOrders(vendorOrderData);
      setPayouts(payoutData);
    } catch (err: any) {
      setError(err?.message || "Failed to load finance dashboard.");
    } finally {
      setLoading(false);
    }
  }, [token, canViewFinance]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canViewFinance) {
      loadFinanceData();
    }
  }, [isAuthenticated, token, userRole, canViewFinance, loadFinanceData]);

  if (!isAuthenticated || userRole !== "admin" || !canViewFinance) return null;

  const updatePayout = async (payoutId: number, action: "approve" | "reject" | "mark_paid") => {
    if (!token || !canManagePayouts) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateAdminPayoutRequest(token, payoutId, { action });
      setPayouts((prev) => prev.map((row) => (row.id === payoutId ? updated : row)));
      setSuccess(`Payout request #${payoutId} updated to ${updated.status}.`);
      await loadFinanceData();
    } catch (err: any) {
      setError(err?.message || "Failed to update payout request.");
    } finally {
      setSaving(false);
    }
  };

  const runReservationRelease = async () => {
    if (!token || !hasAdminPermission("orders.edit")) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await releaseAdminExpiredReservations(token, { limit: 800 });
      setSuccess(result.detail);
      await loadFinanceData();
    } catch (err: any) {
      setError(err?.message || "Failed to release expired reservations.");
    } finally {
      setSaving(false);
    }
  };

  const generateReceipt = async (
    entityType: "payment" | "vendor_order" | "payout_request",
    entityId: number,
    key: string,
  ) => {
    if (!token) return;
    setReceiptBusyKey(key);
    setError("");
    setSuccess("");
    try {
      const receipt = await generateReceiptForTransaction(token, { entity_type: entityType, entity_id: entityId });
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
      setSuccess(`Receipt ${receipt.receipt_number} downloaded.`);
    } catch (err: any) {
      setError(err?.message || "Failed to generate receipt.");
    } finally {
      setReceiptBusyKey("");
    }
  };

  const payoutMode = summary?.payout_config?.mode || "automatic";
  const isAutomaticPayout = payoutMode === "automatic";

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <AdminSidebar active="finance" />

      <main className="flex-1 overflow-y-auto p-6 pb-24 md:p-8 md:pb-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Marketplace Finance</h1>
            <div className="flex items-center gap-2">
              {hasAdminPermission("orders.edit") ? (
                <button
                  type="button"
                  onClick={runReservationRelease}
                  disabled={saving}
                  className="rounded-modern border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                >
                  Release Expired Stock
                </button>
              ) : null}
              <button
                type="button"
                onClick={loadFinanceData}
                disabled={loading}
                className="rounded-modern border border-gray-300 px-3 py-2 text-xs font-semibold hover:bg-gray-100 disabled:opacity-60"
              >
                Refresh
              </button>
            </div>
          </div>

          {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}
          {success ? <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</div> : null}
          {summary?.payout_config ? (
            <div className="rounded-modern border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-gray-700">
              <strong>Payout Mode:</strong> {isAutomaticPayout ? "Automatic" : "Manual Approval"} |{" "}
              <strong>Earnings Release:</strong>{" "}
              {summary.payout_config.earnings_release_policy === "on_payment" ? "On Payment Confirmation" : "On Delivery"}
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-b-4 border-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">Revenue Collected</p>
                  <p className="text-lg font-bold">{formatKes(summary?.totals.marketplace_revenue_collected || "0")}</p>
                </div>
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">Merchant Account Balance</p>
                  <p className="text-lg font-bold text-emerald-700">{formatKes(summary?.totals.merchant_account_balance || "0")}</p>
                </div>
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">Vendor Available Liability</p>
                  <p className="text-lg font-bold">{formatKes(summary?.totals.vendor_wallet_available_liability || "0")}</p>
                </div>
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">Vendor Pending Liability</p>
                  <p className="text-lg font-bold">{formatKes(summary?.totals.vendor_wallet_pending_liability || "0")}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">Commission Earned</p>
                  <p className="text-lg font-bold">{formatKes(summary?.totals.platform_commission_earned || "0")}</p>
                </div>
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">Vendor Net Earnings</p>
                  <p className="text-lg font-bold">{formatKes(summary?.totals.vendor_net_earnings || "0")}</p>
                </div>
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">Paid Out</p>
                  <p className="text-lg font-bold">{formatKes(summary?.totals.vendor_payouts_completed || "0")}</p>
                </div>
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">Refunds</p>
                  <p className="text-lg font-bold">{formatKes(summary?.totals.refunds_total || "0")}</p>
                </div>
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <p className="text-xs text-gray-500">Pending Payout Requests</p>
                  <p className="text-lg font-bold">{summary?.open_items.pending_payout_requests || 0}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <h2 className="text-sm font-semibold text-gray-900">Recent Marketplace Payments</h2>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                          <th className="px-2 py-2">Order</th>
                          <th className="px-2 py-2">Customer</th>
                          <th className="px-2 py-2">Amount</th>
                          <th className="px-2 py-2">Status</th>
                          <th className="px-2 py-2">Tx</th>
                          <th className="px-2 py-2">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payments.slice(0, 20).map((row) => (
                          <tr key={row.id} className="border-b border-gray-50">
                            <td className="px-2 py-2">{row.order_number}</td>
                            <td className="px-2 py-2">{row.customer_email}</td>
                            <td className="px-2 py-2">{formatKes(row.amount)}</td>
                            <td className="px-2 py-2">{row.status}</td>
                            <td className="px-2 py-2">{row.transaction_id || row.mpesa_receipt_number || "-"}</td>
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                onClick={() => generateReceipt("payment", row.id, `payment-${row.id}`)}
                                disabled={receiptBusyKey === `payment-${row.id}`}
                                className="rounded-modern border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                              >
                                {receiptBusyKey === `payment-${row.id}` ? "Generating..." : "Generate"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-modern border border-gray-100 bg-white p-4">
                  <h2 className="text-sm font-semibold text-gray-900">Payout Requests</h2>
                  <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
                    {payouts.length === 0 ? (
                      <p className="text-sm text-gray-500">No payout requests.</p>
                    ) : (
                      payouts.slice(0, 40).map((row) => (
                        <div key={row.id} className="rounded-modern border border-gray-100 bg-gray-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                #{row.id} {row.vendor_name}
                              </p>
                              <p className="text-xs text-gray-600">
                                {formatKes(row.amount)} | {row.phone_number} | {row.status}
                              </p>
                              <button
                                type="button"
                                onClick={() => generateReceipt("payout_request", row.id, `payout-${row.id}`)}
                                disabled={receiptBusyKey === `payout-${row.id}`}
                                className="mt-2 rounded-modern border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                              >
                                {receiptBusyKey === `payout-${row.id}` ? "Generating..." : "Receipt"}
                              </button>
                            </div>
                            {canManagePayouts && !isAutomaticPayout ? (
                              <div className="flex flex-wrap gap-1">
                                <button type="button" disabled={saving || row.status !== "requested"} onClick={() => updatePayout(row.id, "approve")} className="rounded-modern border border-emerald-300 px-2 py-1 text-[11px] font-semibold text-emerald-700 disabled:opacity-50">Approve</button>
                                <button type="button" disabled={saving || (row.status !== "requested" && row.status !== "approved")} onClick={() => updatePayout(row.id, "reject")} className="rounded-modern border border-red-300 px-2 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-50">Reject</button>
                                <button type="button" disabled={saving || (row.status !== "approved" && row.status !== "requested")} onClick={() => updatePayout(row.id, "mark_paid")} className="rounded-modern border border-primary/40 px-2 py-1 text-[11px] font-semibold text-primary disabled:opacity-50">Mark Paid</button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-modern border border-gray-100 bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-900">Vendor Split Orders</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[880px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-2 py-2">Reference</th>
                        <th className="px-2 py-2">Vendor</th>
                        <th className="px-2 py-2">Gross</th>
                        <th className="px-2 py-2">Commission</th>
                        <th className="px-2 py-2">Net</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Payout</th>
                        <th className="px-2 py-2">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorOrders.slice(0, 80).map((row) => (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="px-2 py-2">{row.order_reference}</td>
                          <td className="px-2 py-2">{row.vendor_name}</td>
                          <td className="px-2 py-2">{formatKes(row.gross_amount)}</td>
                          <td className="px-2 py-2">{formatKes(row.platform_commission_amount)}</td>
                          <td className="px-2 py-2">{formatKes(row.vendor_earning_amount)}</td>
                          <td className="px-2 py-2">{row.status}</td>
                          <td className="px-2 py-2">{row.payout_status}</td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => generateReceipt("vendor_order", row.id, `vendor-order-${row.id}`)}
                              disabled={receiptBusyKey === `vendor-order-${row.id}`}
                              className="rounded-modern border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                            >
                              {receiptBusyKey === `vendor-order-${row.id}` ? "Generating..." : "Generate"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
