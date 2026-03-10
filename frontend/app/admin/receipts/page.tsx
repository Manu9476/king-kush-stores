"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";
import { useAuth } from "../../../src/context/AuthContext";
import {
  ReceiptCategory,
  ReceiptOwnerType,
  ReceiptRecord,
  createAdminManualReceipt,
  downloadReceiptPdf,
  getAdminReceipts,
  regenerateReceipt,
} from "../../../src/services/api";

function formatMoney(amount: string, currency: string): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: currency || "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export default function AdminReceiptsPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, isSuperAdmin, hasAdminPermission, canAccessAdminModule } = useAuth();

  const canView =
    isSuperAdmin ||
    hasAdminPermission("receipts.view") ||
    hasAdminPermission("finance.view") ||
    hasAdminPermission("pickup.view") ||
    hasAdminPermission("pickup.operations");
  const canManage = isSuperAdmin || hasAdminPermission("receipts.manage") || hasAdminPermission("finance.manage");

  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");

  const [manualCategory, setManualCategory] = useState<ReceiptCategory>("admin");
  const [manualType, setManualType] = useState("admin_adjustment");
  const [manualOwnerType, setManualOwnerType] = useState<ReceiptOwnerType>("admin");
  const [manualReference, setManualReference] = useState("");
  const [manualGrossAmount, setManualGrossAmount] = useState("");
  const [manualNetAmount, setManualNetAmount] = useState("");
  const [manualSummary, setManualSummary] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canView) {
      if (canAccessAdminModule("dashboard")) router.push("/admin");
      else router.push("/");
    }
  }, [isAuthenticated, userRole, canView, canAccessAdminModule, router]);

  const loadReceipts = useCallback(async () => {
    if (!token || !canView) return;
    setIsLoading(true);
    setError("");
    try {
      const data = await getAdminReceipts(token, {
        q: query || undefined,
        category: categoryFilter || undefined,
        receipt_type: typeFilter || undefined,
        owner_type: ownerFilter || undefined,
      });
      setReceipts(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load receipts.");
    } finally {
      setIsLoading(false);
    }
  }, [token, canView, query, categoryFilter, typeFilter, ownerFilter]);

  useEffect(() => {
    if (isAuthenticated && token && canView) {
      loadReceipts();
    }
  }, [isAuthenticated, token, canView, loadReceipts]);

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
      setSuccess(`Generated new revision: ${regenerated.receipt_number}`);
      await loadReceipts();
    } catch (err: any) {
      setError(err?.message || "Failed to regenerate receipt.");
    } finally {
      setIsWorking(false);
    }
  };

  const createManual = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManage) return;
    setIsWorking(true);
    setError("");
    setSuccess("");
    try {
      let summaryPayload: Record<string, any> = {};
      if (manualSummary.trim()) {
        try {
          summaryPayload = JSON.parse(manualSummary);
        } catch {
          summaryPayload = { note: manualSummary.trim() };
        }
      }
      const created = await createAdminManualReceipt(token, {
        category: manualCategory,
        receipt_type: manualType.trim() || "admin_adjustment",
        owner_type: manualOwnerType,
        related_entity_type: "manual_action",
        related_reference: manualReference.trim(),
        gross_amount: manualGrossAmount || "0",
        net_amount: manualNetAmount || manualGrossAmount || "0",
        summary: summaryPayload,
      });
      setSuccess(`Manual receipt issued: ${created.receipt_number}`);
      setManualReference("");
      setManualGrossAmount("");
      setManualNetAmount("");
      setManualSummary("");
      await loadReceipts();
    } catch (err: any) {
      setError(err?.message || "Failed to issue manual receipt.");
    } finally {
      setIsWorking(false);
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canView) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AdminSidebar active="receipts" />
      <main className="flex-1 space-y-5 p-5 pb-24 md:p-8 md:pb-8">
        <header className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Receipt Control Center</h1>
              <p className="mt-1 text-sm text-gray-600">Unified receipt records for customers, vendors, stations, and admin operations.</p>
            </div>
            <button
              type="button"
              onClick={loadReceipts}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Refresh
            </button>
          </div>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <section className="rounded-2xl border border-gray-200 bg-white p-5">
          <form onSubmit={runSearch} className="grid grid-cols-1 gap-2 xl:grid-cols-[1.4fr_180px_220px_170px_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by receipt no, reference, owner, or type..."
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">All categories</option>
              <option value="customer">Customer</option>
              <option value="vendor">Vendor</option>
              <option value="admin">Admin</option>
              <option value="station">Station</option>
              <option value="system">System</option>
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">All types</option>
              {knownTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">All owners</option>
              <option value="customer">Customer</option>
              <option value="vendor">Vendor</option>
              <option value="admin">Admin</option>
              <option value="station_staff">Station Staff</option>
              <option value="platform">Platform</option>
            </select>
            <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
              Search
            </button>
          </form>
        </section>

        {canManage ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5">
            <h2 className="text-lg font-bold text-gray-900">Issue Manual Receipt</h2>
            <p className="mt-1 text-xs text-gray-500">Use this for approved adjustments, subscription payments, station service charges, and other controlled actions.</p>
            <form onSubmit={createManual} className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-6">
              <select value={manualCategory} onChange={(event) => setManualCategory(event.target.value as ReceiptCategory)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="admin">Admin</option>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
                <option value="station">Station</option>
                <option value="system">System</option>
              </select>
              <input value={manualType} onChange={(event) => setManualType(event.target.value)} placeholder="Receipt type (e.g. station_service_charge)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm xl:col-span-2" />
              <select value={manualOwnerType} onChange={(event) => setManualOwnerType(event.target.value as ReceiptOwnerType)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="admin">Admin</option>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
                <option value="station_staff">Station Staff</option>
                <option value="platform">Platform</option>
                <option value="system">System</option>
              </select>
              <input value={manualReference} onChange={(event) => setManualReference(event.target.value)} placeholder="Reference" className="rounded-lg border border-gray-300 px-3 py-2 text-sm xl:col-span-2" />
              <input value={manualGrossAmount} onChange={(event) => setManualGrossAmount(event.target.value)} placeholder="Gross amount" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={manualNetAmount} onChange={(event) => setManualNetAmount(event.target.value)} placeholder="Net amount" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={manualSummary} onChange={(event) => setManualSummary(event.target.value)} placeholder='Summary JSON or text (e.g. {"reason":"Adjustment"})' className="rounded-lg border border-gray-300 px-3 py-2 text-sm xl:col-span-3" />
              <button type="submit" disabled={isWorking} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
                Issue Manual Receipt
              </button>
            </form>
          </section>
        ) : null}

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {isLoading ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <div className="h-10 w-10 animate-spin rounded-full border-b-4 border-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px] text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Receipt</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Owner</th>
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
                      <td className="px-3 py-2 text-gray-700">{receipt.category}</td>
                      <td className="px-3 py-2 text-gray-700">{receipt.receipt_type.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 text-gray-600">{receipt.owner_email || receipt.vendor_name || receipt.customer_email || "-"}</td>
                      <td className="px-3 py-2 text-gray-600">{receipt.related_reference || "-"}</td>
                      <td className="px-3 py-2 text-gray-700">{formatMoney(receipt.net_amount, receipt.currency)}</td>
                      <td className="px-3 py-2 text-gray-600">{new Date(receipt.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownload(receipt)}
                            disabled={isWorking}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                          >
                            Download PDF
                          </button>
                          {canManage ? (
                            <button
                              type="button"
                              onClick={() => handleRegenerate(receipt)}
                              disabled={isWorking}
                              className="rounded-lg border border-primary/30 px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                            >
                              Regenerate
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {receipts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                        No receipts found with the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
