"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/context/AuthContext";
import { ReceiptRecord, downloadReceiptPdf, getMyReceipts, regenerateReceipt } from "../../../src/services/api";
import { useDashboardTheme } from "../../../src/hooks/useDashboardTheme";

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: currency || "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export default function CustomerReceiptCenterPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole } = useAuth();
  const { theme } = useDashboardTheme();

  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole === "vendor") {
      router.push("/vendor/receipts");
      return;
    }
    if (userRole === "admin") {
      router.push("/admin/receipts");
    }
  }, [isAuthenticated, userRole, router]);

  const loadReceipts = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError("");
    try {
      const data = await getMyReceipts(token, { q: query || undefined, receipt_type: typeFilter || undefined });
      setReceipts(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load receipts.");
    } finally {
      setIsLoading(false);
    }
  }, [token, query, typeFilter]);

  useEffect(() => {
    if (isAuthenticated && token) {
      loadReceipts();
    }
  }, [isAuthenticated, token, loadReceipts]);

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
      setError(err?.message || "Failed to download receipt PDF.");
    } finally {
      setIsWorking(false);
    }
  };

  const handleRegenerate = async (receipt: ReceiptRecord) => {
    if (!token) return;
    const reason = window.prompt("Reason for regenerating this receipt (optional):", "") || "";
    setIsWorking(true);
    setError("");
    setSuccess("");
    try {
      const regenerated = await regenerateReceipt(token, receipt.id, reason);
      setSuccess(`New receipt generated: ${regenerated.receipt_number}`);
      await loadReceipts();
    } catch (err: any) {
      setError(err?.message || "Failed to regenerate receipt.");
    } finally {
      setIsWorking(false);
    }
  };

  if (!isAuthenticated || userRole !== "customer") return null;

  return (
    <main data-theme={theme} className="dashboard-shell min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-modern bg-white p-5 shadow-modern">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-h2 font-heading font-bold text-primary">Receipt Center</h1>
              <p className="text-sm text-gray-600">Download transaction receipts for orders, payments, refunds, pickups, and returns.</p>
            </div>
            <Link href="/account" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Back to My Account
            </Link>
          </div>
        </header>

        {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <section className="rounded-modern bg-white p-5 shadow-modern">
          <form onSubmit={runSearch} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by receipt number, order reference, or type..."
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
            <div className="mt-6 flex min-h-[220px] items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-b-4 border-primary" />
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Receipt</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Reference</th>
                    <th className="px-3 py-2">Amount</th>
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
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">
                        No receipts found for your account yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
