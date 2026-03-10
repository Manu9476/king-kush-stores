"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ReceiptRecord, downloadReceiptPdf, getVendorReceipts, regenerateReceipt } from "../../../src/services/api";
import { useAuth } from "../../../src/context/AuthContext";

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: currency || "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export default function VendorReceiptsPage() {
  const { token } = useAuth();
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const loadReceipts = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError("");
    try {
      const data = await getVendorReceipts(token, { q: query || undefined, receipt_type: typeFilter || undefined });
      setReceipts(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load vendor receipts.");
    } finally {
      setIsLoading(false);
    }
  }, [token, query, typeFilter]);

  useEffect(() => {
    if (token) {
      loadReceipts();
    }
  }, [token, loadReceipts]);

  const knownTypes = useMemo(
    () => Array.from(new Set(receipts.map((item) => item.receipt_type))).sort(),
    [receipts],
  );

  const runSearch = (event: FormEvent) => {
    event.preventDefault();
    loadReceipts();
  };

  const handleDownload = async (receipt: ReceiptRecord) => {
    if (!token) return;
    setIsWorking(true);
    setError("");
    try {
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
    } catch (err: any) {
      setError(err?.message || "Failed to download receipt.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleRegenerate = async (receipt: ReceiptRecord) => {
    if (!token) return;
    const reason = window.prompt("Reason for regeneration (optional):", "") || "";
    setIsWorking(true);
    setError("");
    setSuccess("");
    try {
      const regenerated = await regenerateReceipt(token, receipt.id, reason);
      setSuccess(`Generated revision: ${regenerated.receipt_number}`);
      await loadReceipts();
    } catch (err: any) {
      setError(err?.message || "Failed to regenerate receipt.");
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Vendor Receipt Center</h2>
        <p className="text-sm text-gray-600">View payout, commission, and settlement receipts for your store.</p>
      </div>

      {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <section className="rounded-modern border border-gray-100 p-4">
        <form onSubmit={runSearch} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by receipt number, payout reference, order reference..."
            className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
          />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="">All receipt types</option>
            {knownTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
            Search
          </button>
        </form>

        {isLoading ? (
          <div className="mt-5 flex min-h-[180px] items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-b-4 border-primary" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Receipt</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Net Amount</th>
                  <th className="px-3 py-2">Issued</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id} className="border-b border-gray-50">
                    <td className="px-3 py-2 font-semibold text-gray-900">{receipt.receipt_number}</td>
                    <td className="px-3 py-2 text-gray-700">{receipt.receipt_type.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-gray-600">{receipt.related_reference || "-"}</td>
                    <td className="px-3 py-2 text-gray-700">{formatMoney(receipt.net_amount, receipt.currency)}</td>
                    <td className="px-3 py-2 text-gray-600">{new Date(receipt.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownload(receipt)}
                          disabled={isWorking}
                          className="rounded-modern border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                        >
                          Download PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRegenerate(receipt)}
                          disabled={isWorking}
                          className="rounded-modern border border-primary/30 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                        >
                          Regenerate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">
                      No vendor receipts found yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
