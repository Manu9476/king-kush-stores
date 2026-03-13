"use client";

import { FormEvent, useMemo, useState } from "react";
import { useVendorPanel } from "../../../src/context/VendorPanelContext";
import { useAuth } from "../../../src/context/AuthContext";
import { downloadReceiptPdf, generateReceiptForTransaction } from "../../../src/services/api";

function formatKes(value: string | number): string {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export default function VendorFinancePage() {
  const { isApproved, financeSummary, payoutRequests, requestPayout, saving } = useVendorPanel();
  const { token } = useAuth();
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [localMessage, setLocalMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const withdrawable = useMemo(
    () => Number(financeSummary?.totals.withdrawable_balance || 0),
    [financeSummary?.totals.withdrawable_balance],
  );

  if (!isApproved) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Finance</h2>
        <p className="rounded-modern border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Finance unlocks after vendor approval.
        </p>
      </div>
    );
  }

  const submitPayout = async (event: FormEvent) => {
    event.preventDefault();
    setLocalMessage("");
    try {
      await requestPayout({
        amount,
        phone_number: phone,
        notes: notes.trim() || undefined,
      });
      setAmount("");
      setNotes("");
      setLocalMessage(
        financeSummary?.payout_policy?.mode === "automatic"
          ? "Withdrawal processed automatically."
          : "Payout request submitted.",
      );
    } catch (error: any) {
      setLocalMessage(error?.message || "Unable to submit payout request.");
    }
  };

  const generateReceipt = async (entityType: "wallet_transaction" | "payout_request", entityId: number, key: string) => {
    if (!token) return;
    setBusyKey(key);
    setLocalMessage("");
    try {
      const receipt = await generateReceiptForTransaction(token, { entity_type: entityType, entity_id: entityId });
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
      setLocalMessage(`Receipt ${receipt.receipt_number} downloaded.`);
    } catch (error: any) {
      setLocalMessage(error?.message || "Unable to generate receipt.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Finance Dashboard</h2>
      <div className="rounded-modern border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-gray-700">
        <strong>Payout Mode:</strong> {financeSummary?.payout_policy?.mode === "automatic" ? "Automatic" : "Manual Approval"}{" "}
        | <strong>Earnings Release:</strong> {financeSummary?.payout_policy?.earnings_release_policy === "on_payment" ? "On Payment Confirmation" : "On Delivery"}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Placed Orders Value</p>
          <p className="text-lg font-bold">{formatKes(financeSummary?.totals.placed_order_value || financeSummary?.totals.total_sales || "0")}</p>
        </div>
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Total Sales (Paid/Split)</p>
          <p className="text-lg font-bold">{formatKes(financeSummary?.totals.total_sales || "0")}</p>
        </div>
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Platform Commission</p>
          <p className="text-lg font-bold">{formatKes(financeSummary?.totals.platform_commission || "0")}</p>
        </div>
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Unpaid Orders Value</p>
          <p className="text-lg font-bold">{formatKes(financeSummary?.totals.unpaid_order_value || "0")}</p>
        </div>
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Pending Balance</p>
          <p className="text-lg font-bold">{formatKes(financeSummary?.wallet.pending_balance || "0")}</p>
        </div>
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Withdrawable Balance</p>
          <p className="text-lg font-bold text-emerald-700">{formatKes(financeSummary?.wallet.available_balance || "0")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_1fr]">
        <form onSubmit={submitPayout} className="rounded-modern border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Request Payout</h3>
          <p className="mt-1 text-xs text-gray-500">
            Available to withdraw: <strong>{formatKes(withdrawable)}</strong>
          </p>
          <div className="mt-3 space-y-2">
            <input
              required
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (KES)"
              className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
            />
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Mpesa phone number"
              className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Notes (optional)"
              className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {saving ? "Processing..." : financeSummary?.payout_policy?.mode === "automatic" ? "Withdraw Now" : "Submit Payout Request"}
            </button>
            {localMessage ? <p className="text-xs text-gray-600">{localMessage}</p> : null}
          </div>
        </form>

        <div className="rounded-modern border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-gray-900">Recent Wallet Transactions</h3>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {(financeSummary?.recent_transactions || []).length === 0 ? (
              <p className="text-sm text-gray-500">No finance transactions yet.</p>
            ) : (
              (financeSummary?.recent_transactions || []).map((row) => (
                <div key={row.id} className="rounded-modern border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-semibold text-gray-900">{row.description || row.transaction_type}</p>
                  <p className="text-xs text-gray-600">
                    {row.direction.toUpperCase()} {formatKes(row.amount)} | Balance {formatKes(row.balance_after)}
                  </p>
                  <p className="text-[11px] text-gray-500">{new Date(row.created_at).toLocaleString()}</p>
                  <button
                    type="button"
                    onClick={() => generateReceipt("wallet_transaction", row.id, `wallet-${row.id}`)}
                    disabled={busyKey === `wallet-${row.id}`}
                    className="mt-2 rounded-modern border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                  >
                    {busyKey === `wallet-${row.id}` ? "Generating..." : "Generate Receipt"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-modern border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Payout History</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2">Requested</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reference</th>
              </tr>
            </thead>
            <tbody>
              {payoutRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-sm text-gray-500">
                    No payout requests yet.
                  </td>
                </tr>
              ) : (
                payoutRequests.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50">
                    <td className="px-3 py-2">{new Date(row.requested_at).toLocaleString()}</td>
                    <td className="px-3 py-2">{formatKes(row.amount)}</td>
                    <td className="px-3 py-2">{row.phone_number}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>{row.external_reference || "-"}</span>
                        <button
                          type="button"
                          onClick={() => generateReceipt("payout_request", row.id, `payout-${row.id}`)}
                          disabled={busyKey === `payout-${row.id}`}
                          className="rounded-modern border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                        >
                          {busyKey === `payout-${row.id}` ? "Generating..." : "Receipt"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
