"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";
import { useAuth } from "../../../src/context/AuthContext";
import {
  AdminProductReportItem,
  getAdminProductReports,
  performAdminProductReportAction,
  performAdminProductReportsBulkAction,
} from "../../../src/services/api";

type ActionType = "deactivate_product" | "suspend_vendor" | "resolve" | "resolve_and_deactivate";

export default function AdminModerationPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, hasAdminPermission, canAccessAdminModule } = useAuth();
  const canModerate = canAccessAdminModule("moderation") && hasAdminPermission("moderation.manage");

  const [reports, setReports] = useState<AdminProductReportItem[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<number[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [suspendConfirmOpen, setSuspendConfirmOpen] = useState(false);
  const [suspendConfirmText, setSuspendConfirmText] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canModerate) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, canModerate, router]);

  const selectedReport = useMemo(
    () => reports.find((item) => item.id === selectedReportId) || null,
    [reports, selectedReportId],
  );

  const selectedCandidate = useMemo(() => {
    if (!selectedReport) return null;
    return selectedReport.candidates.find((candidate) => candidate.id === selectedCandidateId) || selectedReport.primary_candidate;
  }, [selectedReport, selectedCandidateId]);

  const counts = useMemo(
    () => ({
      pending: reports.filter((report) => report.status === "pending").length,
      inProgress: reports.filter((report) => report.status === "in_progress").length,
      resolved: reports.filter((report) => report.status === "resolved").length,
    }),
    [reports],
  );

  const allVisibleSelected = useMemo(
    () => reports.length > 0 && reports.every((report) => selectedReportIds.includes(report.id)),
    [reports, selectedReportIds],
  );

  const loadReports = useCallback(async () => {
    if (!token || !canModerate) return;
    setLoading(true);
    setError("");
    try {
      const data = await getAdminProductReports(token, query, statusFilter);
      setReports(data);
      setSelectedReportIds((prev) => prev.filter((id) => data.some((item) => item.id === id)));
      if (data.length === 0) {
        setSelectedReportId(null);
        setSelectedCandidateId(null);
        return;
      }
      const preferredId = selectedReportId && data.some((item) => item.id === selectedReportId) ? selectedReportId : data[0].id;
      setSelectedReportId(preferredId);
      const report = data.find((item) => item.id === preferredId) || data[0];
      setSelectedCandidateId(report.primary_candidate?.id || report.candidates[0]?.id || null);
    } catch (err: any) {
      setReports([]);
      setSelectedReportId(null);
      setSelectedCandidateId(null);
      setError(err?.message || "Failed to load moderation reports.");
    } finally {
      setLoading(false);
    }
  }, [token, canModerate, query, statusFilter, selectedReportId]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canModerate) {
      loadReports();
    }
  }, [isAuthenticated, token, userRole, canModerate, loadReports]);

  const executeAction = async (action: ActionType) => {
    if (!token || !selectedReport) return;
    setActing(true);
    setError("");
    setSuccess("");
    try {
      await performAdminProductReportAction(token, selectedReport.id, {
        action,
        notes: actionNotes.trim() || undefined,
        product_id: selectedCandidate?.id,
        vendor_profile_id: selectedCandidate?.vendor_profile_id,
      });
      setSuccess("Moderation action completed successfully.");
      await loadReports();
    } catch (err: any) {
      setError(err?.message || "Failed to execute moderation action.");
    } finally {
      setActing(false);
    }
  };

  const executeBulkAction = async (
    action: "deactivate_product" | "resolve" | "resolve_and_deactivate" | "suspend_vendor",
    confirmSuspend: boolean = false,
  ) => {
    if (!token || selectedReportIds.length === 0) return;
    setActing(true);
    setError("");
    setSuccess("");
    try {
      const response = await performAdminProductReportsBulkAction(token, {
        action,
        ticket_ids: selectedReportIds,
        notes: actionNotes.trim() || undefined,
        confirm_suspend: confirmSuspend,
      });
      const summary = `Bulk action finished: ${response.success_count} succeeded, ${response.failure_count} failed.`;
      setSuccess(summary);
      await loadReports();
      if (response.failure_count === 0) {
        setSelectedReportIds([]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to run bulk moderation.");
    } finally {
      setActing(false);
    }
  };

  const toggleSelectReport = (reportId: number, checked: boolean) => {
    setSelectedReportIds((prev) => {
      if (checked) {
        if (prev.includes(reportId)) return prev;
        return [...prev, reportId];
      }
      return prev.filter((id) => id !== reportId);
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    if (checked) {
      setSelectedReportIds((prev) => Array.from(new Set([...prev, ...reports.map((report) => report.id)])));
      return;
    }
    const visibleIds = new Set(reports.map((report) => report.id));
    setSelectedReportIds((prev) => prev.filter((id) => !visibleIds.has(id)));
  };

  const submitFilters = async (event: FormEvent) => {
    event.preventDefault();
    await loadReports();
  };

  if (!isAuthenticated || userRole !== "admin" || !canModerate) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar active="moderation" />

      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="rounded-2xl border border-gray-200 bg-white p-5">
          <h1 className="text-2xl font-black text-gray-900">Moderation Desk</h1>
          <p className="mt-1 text-sm text-gray-600">Review product reports and take immediate enforcement actions.</p>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase text-gray-500">Pending</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{counts.pending}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase text-gray-500">In Progress</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{counts.inProgress}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase text-gray-500">Resolved</p>
            <p className="mt-1 text-2xl font-black text-gray-900">{counts.resolved}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-4">
            <form onSubmit={submitFilters} className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search report, product ref, reporter..."
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </select>
              <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover">
                Apply Filters
              </button>
            </form>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleSelectAllVisible(event.target.checked)}
                />
                Select all visible
              </label>
              <span className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
                {selectedReportIds.length} selected
              </span>
              <button
                type="button"
                disabled={acting || selectedReportIds.length === 0}
                onClick={() => executeBulkAction("resolve")}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                Bulk Resolve
              </button>
              <button
                type="button"
                disabled={acting || selectedReportIds.length === 0}
                onClick={() => executeBulkAction("deactivate_product")}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                Bulk Deactivate
              </button>
              <button
                type="button"
                disabled={acting || selectedReportIds.length === 0}
                onClick={() => executeBulkAction("resolve_and_deactivate")}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                Bulk Resolve + Deactivate
              </button>
              <button
                type="button"
                disabled={acting || selectedReportIds.length === 0}
                onClick={() => {
                  setSuspendConfirmText("");
                  setSuspendConfirmOpen(true);
                }}
                className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
              >
                Bulk Suspend Vendors
              </button>
              {selectedReportIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelectedReportIds([])}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Clear Selection
                </button>
              ) : null}
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-gray-500">Loading moderation reports...</div>
          ) : (
            <div className="grid min-h-[560px] grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)]">
              <div className="border-r border-gray-100">
                <div className="max-h-[620px] overflow-y-auto divide-y divide-gray-100">
                  {reports.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">No product reports found.</div>
                  ) : (
                    reports.map((report) => (
                      <div
                        key={report.id}
                        className={`flex items-start gap-2 p-3 transition-colors ${
                          selectedReportId === report.id ? "bg-blue-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedReportIds.includes(report.id)}
                          onChange={(event) => toggleSelectReport(report.id, event.target.checked)}
                          className="mt-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedReportId(report.id);
                            setSelectedCandidateId(report.primary_candidate?.id || report.candidates[0]?.id || null);
                          }}
                          className="w-full text-left"
                        >
                          <p className="text-sm font-semibold text-gray-900">#{report.id} {report.reason || "Product report"}</p>
                          <p className="mt-1 text-xs text-gray-600 line-clamp-1">{report.product_reference || "No product reference"}</p>
                          <p className="mt-1 text-xs text-gray-500">{report.status.replace("_", " ")}</p>
                          <p className="mt-1 text-[11px] text-gray-400">{new Date(report.updated_at).toLocaleString()}</p>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4 p-5">
                {!selectedReport ? (
                  <p className="text-sm text-gray-500">Select a report to review details and apply actions.</p>
                ) : (
                  <>
                    <article className="rounded-xl border border-gray-200 p-4">
                      <p className="text-sm font-semibold text-gray-900">Report #{selectedReport.id}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        Reporter: {selectedReport.reporter_name || selectedReport.name} ({selectedReport.reporter_email || selectedReport.email})
                      </p>
                      <p className="mt-1 text-xs text-gray-600">Reason: {selectedReport.reason || "Not specified"}</p>
                      <p className="mt-1 text-xs text-gray-600">Product Reference: {selectedReport.product_reference || "Not supplied"}</p>
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                        {selectedReport.issue_details || "No additional issue details provided."}
                      </p>
                    </article>

                    {selectedReport.attachments.length > 0 ? (
                      <article className="rounded-xl border border-gray-200 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Attachments</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedReport.attachments.map((attachment) => (
                            <a
                              key={attachment.id}
                              href={attachment.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-primary hover:bg-blue-50"
                            >
                              {attachment.original_name || `Attachment #${attachment.id}`}
                            </a>
                          ))}
                        </div>
                      </article>
                    ) : null}

                    <article className="rounded-xl border border-gray-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Matched Products</p>
                        <div className="flex flex-wrap gap-2">
                          <Link href="/admin/products" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
                            Product Desk
                          </Link>
                          <Link href="/admin/vendors" className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100">
                            Vendor Desk
                          </Link>
                        </div>
                      </div>
                      {selectedReport.candidates.length === 0 ? (
                        <p className="mt-3 text-sm text-amber-700">No product candidates were detected from this report.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {selectedReport.candidates.map((candidate) => {
                            const selected = (selectedCandidate?.id || null) === candidate.id;
                            return (
                              <button
                                key={candidate.id}
                                type="button"
                                onClick={() => setSelectedCandidateId(candidate.id)}
                                className={`w-full rounded-lg border p-3 text-left ${
                                  selected ? "border-primary/40 bg-primary/5" : "border-gray-200 hover:bg-gray-50"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold text-gray-900">{candidate.title}</p>
                                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${candidate.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-700"}`}>
                                    {candidate.is_active ? "Active" : "Inactive"}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-gray-600">Vendor: {candidate.vendor_name} ({candidate.vendor_approval_status})</p>
                                <p className="mt-1 text-xs text-gray-500">ID: {candidate.id} | Slug: {candidate.slug}</p>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </article>

                    <article className="rounded-xl border border-gray-200 p-4">
                      <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Action Notes</label>
                      <textarea
                        value={actionNotes}
                        onChange={(event) => setActionNotes(event.target.value)}
                        className="mt-2 min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Optional moderation note..."
                      />
                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        <button
                          type="button"
                          disabled={acting || !selectedCandidate}
                          onClick={() => executeAction("deactivate_product")}
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          Deactivate Product
                        </button>
                        <button
                          type="button"
                          disabled={acting || !selectedCandidate}
                          onClick={() => executeAction("suspend_vendor")}
                          className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                        >
                          Suspend Vendor
                        </button>
                        <button
                          type="button"
                          disabled={acting}
                          onClick={() => executeAction("resolve")}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Resolve Report
                        </button>
                        <button
                          type="button"
                          disabled={acting || !selectedCandidate}
                          onClick={() => executeAction("resolve_and_deactivate")}
                          className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                        >
                          Resolve + Deactivate
                        </button>
                      </div>
                    </article>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {suspendConfirmOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={() => {
              if (!acting) setSuspendConfirmOpen(false);
            }}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-gray-900">Confirm Bulk Vendor Suspension</h2>
              <p className="mt-2 text-sm text-gray-700">
                You are about to suspend vendor accounts linked to <strong>{selectedReportIds.length}</strong> selected reports.
              </p>
              <p className="mt-2 text-sm text-red-700">
                Type <strong>SUSPEND</strong> to continue.
              </p>
              <input
                value={suspendConfirmText}
                onChange={(event) => setSuspendConfirmText(event.target.value)}
                placeholder="Type SUSPEND"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => setSuspendConfirmOpen(false)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={acting || suspendConfirmText.trim().toUpperCase() !== "SUSPEND"}
                  onClick={async () => {
                    await executeBulkAction("suspend_vendor", true);
                    setSuspendConfirmOpen(false);
                  }}
                  className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
                >
                  Confirm Suspension
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
