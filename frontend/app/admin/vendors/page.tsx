"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/context/AuthContext";
import { VendorApplicationAdmin, getAdminVendorApplications, reviewAdminVendorApplication } from "../../../src/services/api";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";

export default function AdminVendorApplicationsPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, hasAdminPermission, canAccessAdminModule } = useAuth();
  const canViewVendors = canAccessAdminModule("vendors") && hasAdminPermission("vendors.view");
  const canApproveVendors = hasAdminPermission("vendors.approve");

  const [applications, setApplications] = useState<VendorApplicationAdmin[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canViewVendors) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, router, canViewVendors]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const data = await getAdminVendorApplications(token, query, statusFilter);
      setApplications(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load vendor applications.");
    } finally {
      setLoading(false);
    }
  }, [token, query, statusFilter]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canViewVendors) {
      load();
    }
  }, [isAuthenticated, token, userRole, load, canViewVendors]);

  const counts = useMemo(() => ({
    pending: applications.filter((x) => x.approval_status === "pending_review").length,
    approved: applications.filter((x) => x.approval_status === "approved").length,
    rejected: applications.filter((x) => x.approval_status === "rejected").length,
    needsInfo: applications.filter((x) => x.approval_status === "needs_info").length,
  }), [applications]);

  const submitFilter = async (e: FormEvent) => {
    e.preventDefault();
    await load();
  };

  const review = async (item: VendorApplicationAdmin, approval_status: VendorApplicationAdmin["approval_status"]) => {
    if (!token) return;
    if (!canApproveVendors) return;
    setSavingId(item.id);
    setError("");
    setSuccess("");
    try {
      const updated = await reviewAdminVendorApplication(token, item.id, { approval_status });
      setApplications((prev) => prev.map((x) => (x.id === item.id ? updated : x)));
      setSuccess(`Vendor ${item.store_name} updated to ${approval_status.replace("_", " ")}.`);
    } catch (err: any) {
      setError(err?.message || "Failed to update vendor application.");
    } finally {
      setSavingId(null);
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canViewVendors) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar active="vendors" />

      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="bg-white rounded-2xl border border-gray-200 p-5">
          <h1 className="text-2xl font-black text-gray-900">Vendor Application Review</h1>
          <p className="text-sm text-gray-600 mt-1">Approve, reject, request more info, or suspend vendors.</p>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs uppercase text-gray-500 font-bold">Pending</p><p className="text-2xl font-black">{counts.pending}</p></div>
          <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs uppercase text-gray-500 font-bold">Approved</p><p className="text-2xl font-black">{counts.approved}</p></div>
          <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs uppercase text-gray-500 font-bold">Needs Info</p><p className="text-2xl font-black">{counts.needsInfo}</p></div>
          <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs uppercase text-gray-500 font-bold">Rejected</p><p className="text-2xl font-black">{counts.rejected}</p></div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <form onSubmit={submitFilter} className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="md:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Search email, store, phone..." />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">All statuses</option>
                <option value="pending_review">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="needs_info">Needs Info</option>
                <option value="rejected">Rejected</option>
                <option value="suspended">Suspended</option>
              </select>
              <button className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold hover:bg-primary-hover">Filter</button>
            </form>
          </div>

          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="p-5 text-sm text-gray-500">Loading applications...</div>
            ) : applications.length === 0 ? (
              <div className="p-5 text-sm text-gray-500">No vendor applications found.</div>
            ) : (
              applications.map((item) => (
                <div key={item.id} className="p-5 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{item.store_name} <span className="text-xs text-gray-500">({item.user.email})</span></p>
                      <p className="text-sm text-gray-600 mt-1">{item.business_location || "No location"} | {item.business_phone || "No phone"} | {item.product_category || "No category"}</p>
                      <p className="text-xs text-gray-500 mt-1">Status: {item.approval_status.replace("_", " ")} | Submitted: {new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    {canApproveVendors ? (
                      <div className="flex flex-wrap gap-2">
                        <button disabled={savingId === item.id} type="button" onClick={() => review(item, "approved")} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 border border-green-200">Approve</button>
                        <button disabled={savingId === item.id} type="button" onClick={() => review(item, "needs_info")} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">Need Info</button>
                        <button disabled={savingId === item.id} type="button" onClick={() => review(item, "rejected")} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-700 border border-red-200">Reject</button>
                        <button disabled={savingId === item.id} type="button" onClick={() => review(item, "suspended")} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">Suspend</button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 font-medium">Read-only access</div>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.store_description || "No business description."}</p>
                  {item.verification_document_url && (
                    <a href={item.verification_document_url} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-primary hover:underline">
                      Open Verification Document
                    </a>
                  )}
                  {item.review_notes && <p className="text-sm text-amber-700">Review notes: {item.review_notes}</p>}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
