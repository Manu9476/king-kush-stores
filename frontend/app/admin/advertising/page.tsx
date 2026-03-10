"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";
import { useAuth } from "../../../src/context/AuthContext";
import {
  AdvertisingAnalyticsResponse,
  AdvertisingCampaign,
  AdvertisingPlacement,
  AdvertisingRequest,
  createAdminAdvertisingCampaign,
  deleteAdminAdvertisingCampaign,
  getAdminAdvertisingAnalytics,
  getAdminAdvertisingCampaigns,
  getAdminAdvertisingPlacements,
  getAdminAdvertisingRequests,
  reviewAdminAdvertisingRequest,
  updateAdminAdvertisingCampaign,
  updateAdminAdvertisingPlacement,
} from "../../../src/services/api";

type TabKey = "requests" | "campaigns" | "placements" | "analytics";

export default function AdminAdvertisingPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, hasAdminPermission, canAccessAdminModule } = useAuth();
  const canView = canAccessAdminModule("advertising") && hasAdminPermission("advertising.view");
  const canManage = hasAdminPermission("advertising.manage");
  const canApprove = hasAdminPermission("advertising.approve");
  const canAccess = canView || canManage || canApprove;

  const [tab, setTab] = useState<TabKey>("requests");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [requests, setRequests] = useState<AdvertisingRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [reviewStatus, setReviewStatus] = useState<AdvertisingRequest["status"]>("pending_review");
  const [reviewNotes, setReviewNotes] = useState("");
  const [requestFilter, setRequestFilter] = useState("");

  const [placements, setPlacements] = useState<AdvertisingPlacement[]>([]);
  const [campaigns, setCampaigns] = useState<AdvertisingCampaign[]>([]);
  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
  const [campaignImage, setCampaignImage] = useState<File | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    title: "",
    source_type: "external" as AdvertisingCampaign["source_type"],
    placement_id: 0,
    status: "draft" as AdvertisingCampaign["status"],
    target_url: "",
    cta_label: "",
    category_context: "",
    priority: 50,
    is_visible: true,
    is_sponsored: true,
  });
  const [analytics, setAnalytics] = useState<AdvertisingAnalyticsResponse | null>(null);

  const selectedRequest = useMemo(
    () => requests.find((item) => item.id === selectedRequestId) || null,
    [requests, selectedRequestId],
  );

  useEffect(() => {
    if (!isAuthenticated) return void router.push("/login");
    if (userRole && userRole !== "admin") return void router.push("/");
    if (isAuthenticated && userRole === "admin" && !canAccess) return void router.push("/admin");
  }, [isAuthenticated, userRole, canAccess, router]);

  const loadData = useCallback(async () => {
    if (!token || !canAccess) return;
    setLoading(true);
    setError("");
    try {
      const [requestRows, placementRows, campaignRows, analyticsData] = await Promise.all([
        canView ? getAdminAdvertisingRequests(token, "", requestFilter) : Promise.resolve([]),
        canView ? getAdminAdvertisingPlacements(token) : Promise.resolve([]),
        canView ? getAdminAdvertisingCampaigns(token) : Promise.resolve([]),
        canView ? getAdminAdvertisingAnalytics(token) : Promise.resolve(null),
      ]);
      setRequests(requestRows);
      setPlacements(placementRows);
      setCampaigns(campaignRows);
      setAnalytics(analyticsData);
      if (requestRows.length && !selectedRequestId) {
        setSelectedRequestId(requestRows[0].id);
        setReviewStatus(requestRows[0].status);
        setReviewNotes(requestRows[0].admin_notes || "");
      }
      if (placementRows.length && !campaignForm.placement_id) {
        setCampaignForm((prev) => ({ ...prev, placement_id: placementRows[0].id }));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load advertising data.");
    } finally {
      setLoading(false);
    }
  }, [token, canAccess, canView, requestFilter, selectedRequestId, campaignForm.placement_id]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canAccess) void loadData();
  }, [isAuthenticated, token, userRole, canAccess, loadData]);

  const saveRequestReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedRequest || !canApprove) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await reviewAdminAdvertisingRequest(token, selectedRequest.id, { status: reviewStatus, admin_notes: reviewNotes });
      setRequests((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setSuccess(`Updated request #${updated.id}.`);
    } catch (err: any) {
      setError(err?.message || "Failed to review request.");
    } finally {
      setSaving(false);
    }
  };

  const saveCampaign = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManage || !campaignForm.title.trim() || !campaignForm.placement_id) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        ...campaignForm,
        title: campaignForm.title.trim(),
        creative_image: campaignImage || undefined,
      };
      const updated = editingCampaignId
        ? await updateAdminAdvertisingCampaign(token, editingCampaignId, payload)
        : await createAdminAdvertisingCampaign(token, payload);
      setCampaigns((prev) => (editingCampaignId ? prev.map((row) => (row.id === updated.id ? updated : row)) : [updated, ...prev]));
      setCampaignImage(null);
      setEditingCampaignId(null);
      setCampaignForm((prev) => ({ ...prev, title: "", target_url: "", cta_label: "", category_context: "" }));
      setSuccess("Campaign saved.");
    } catch (err: any) {
      setError(err?.message || "Failed to save campaign.");
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canAccess) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar active="advertising" />
      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="rounded-2xl border border-gray-200 bg-white p-5">
          <h1 className="text-2xl font-black text-gray-900">Advertising Management</h1>
          <p className="mt-1 text-sm text-gray-600">Manage ad requests, campaign placements, and performance.</p>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}

        <div className="flex flex-wrap gap-2">
          {(["requests", "campaigns", "placements", "analytics"] as TabKey[]).map((key) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-primary text-white" : "border border-gray-300 bg-white text-gray-700"}`}>
              {key}
            </button>
          ))}
          <button type="button" onClick={() => void loadData()} className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700">Refresh</button>
        </div>

        {loading ? <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading...</div> : null}

        {!loading && tab === "requests" ? (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              <div className="border-b border-gray-100 p-3">
                <select value={requestFilter} onChange={(e) => setRequestFilter(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">All request statuses</option><option value="pending_review">pending_review</option><option value="approved">approved</option><option value="rejected">rejected</option><option value="needs_info">needs_info</option>
                </select>
              </div>
              <div className="max-h-[520px] divide-y divide-gray-100 overflow-y-auto">
                {requests.map((row) => (
                  <button key={row.id} type="button" onClick={() => { setSelectedRequestId(row.id); setReviewStatus(row.status); setReviewNotes(row.admin_notes || ""); }} className={`w-full px-4 py-3 text-left ${selectedRequestId === row.id ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                    <p className="text-sm font-semibold text-gray-900">{row.company_name || row.full_name}</p>
                    <p className="text-xs text-gray-500">{row.email}</p>
                    <p className="text-xs text-gray-500">{row.status}</p>
                  </button>
                ))}
              </div>
            </div>
            <form onSubmit={saveRequestReview} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
              {!selectedRequest ? <p className="text-sm text-gray-500">Select a request.</p> : (
                <>
                  <p className="text-sm font-semibold text-gray-900">{selectedRequest.company_name || selectedRequest.full_name}</p>
                  <p className="text-xs text-gray-600">{selectedRequest.ad_objective}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedRequest.message || "No message"}</p>
                  <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value as AdvertisingRequest["status"])} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                    <option value="pending_review">pending_review</option><option value="needs_info">needs_info</option><option value="approved">approved</option><option value="rejected">rejected</option>
                  </select>
                  <textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} className="min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Admin notes..." />
                  <button type="submit" disabled={saving || !canApprove} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save Review</button>
                </>
              )}
            </form>
          </section>
        ) : null}

        {!loading && tab === "campaigns" ? (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-gray-200 bg-white max-h-[560px] overflow-y-auto divide-y divide-gray-100">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="p-4">
                  <p className="text-sm font-semibold text-gray-900">{campaign.title}</p>
                  <p className="text-xs text-gray-600">{campaign.placement.name} | {campaign.status}</p>
                  <p className="text-xs text-gray-500">Impressions {campaign.impression_count} | Clicks {campaign.click_count}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => { setEditingCampaignId(campaign.id); setCampaignForm({ title: campaign.title, source_type: campaign.source_type, placement_id: campaign.placement.id, status: campaign.status, target_url: campaign.target_url || "", cta_label: campaign.cta_label || "", category_context: campaign.category_context || "", priority: campaign.priority, is_visible: campaign.is_visible, is_sponsored: campaign.is_sponsored }); }} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Edit</button>
                    <button type="button" onClick={() => void deleteAdminAdvertisingCampaign(token as string, campaign.id).then(() => setCampaigns((prev) => prev.filter((row) => row.id !== campaign.id)))} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={saveCampaign} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">{editingCampaignId ? "Edit campaign" : "Create campaign"}</p>
              <input value={campaignForm.title} onChange={(e) => setCampaignForm((prev) => ({ ...prev, title: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Title" required />
              <div className="grid grid-cols-2 gap-2">
                <select value={campaignForm.source_type} onChange={(e) => setCampaignForm((prev) => ({ ...prev, source_type: e.target.value as AdvertisingCampaign["source_type"] }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="external">external</option><option value="internal">internal</option><option value="vendor">vendor</option></select>
                <select value={campaignForm.status} onChange={(e) => setCampaignForm((prev) => ({ ...prev, status: e.target.value as AdvertisingCampaign["status"] }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="draft">draft</option><option value="scheduled">scheduled</option><option value="active">active</option><option value="paused">paused</option></select>
              </div>
              <select value={campaignForm.placement_id || ""} onChange={(e) => setCampaignForm((prev) => ({ ...prev, placement_id: Number(e.target.value) }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">{placements.map((placement) => <option key={placement.id} value={placement.id}>{placement.name}</option>)}</select>
              <input value={campaignForm.target_url} onChange={(e) => setCampaignForm((prev) => ({ ...prev, target_url: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Target URL" />
              <input value={campaignForm.cta_label} onChange={(e) => setCampaignForm((prev) => ({ ...prev, cta_label: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="CTA Label" />
              <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setCampaignImage(e.target.files?.[0] || null)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button type="submit" disabled={saving || !canManage} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save Campaign</button>
            </form>
          </section>
        ) : null}

        {!loading && tab === "placements" ? (
          <section className="rounded-2xl border border-gray-200 bg-white divide-y divide-gray-100">
            {placements.map((placement) => (
              <div key={placement.id} className="p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-60">
                  <p className="text-sm font-semibold text-gray-900">{placement.name}</p>
                  <p className="text-xs text-gray-500">{placement.key}</p>
                </div>
                <input type="number" min={1} value={placement.max_ads_per_page} onChange={(e) => setPlacements((prev) => prev.map((row) => row.id === placement.id ? { ...row, max_ads_per_page: Number(e.target.value || 1) } : row))} className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <label className="text-xs text-gray-600 flex items-center gap-2"><input type="checkbox" checked={placement.is_active} onChange={(e) => setPlacements((prev) => prev.map((row) => row.id === placement.id ? { ...row, is_active: e.target.checked } : row))} />active</label>
                <button type="button" disabled={!canManage || saving} onClick={() => void updateAdminAdvertisingPlacement(token as string, placement.id, { max_ads_per_page: placement.max_ads_per_page, is_active: placement.is_active }).then((updated) => setPlacements((prev) => prev.map((row) => row.id === updated.id ? updated : row)))} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-60">Save</button>
              </div>
            ))}
          </section>
        ) : null}

        {!loading && tab === "analytics" ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            {!analytics ? <p className="text-sm text-gray-500">No analytics data yet.</p> : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Campaigns</p><p className="text-2xl font-black text-gray-900">{analytics.totals.campaigns_total}</p></div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Active</p><p className="text-2xl font-black text-gray-900">{analytics.totals.campaigns_active}</p></div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Pending</p><p className="text-2xl font-black text-gray-900">{analytics.totals.pending_requests}</p></div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Impressions</p><p className="text-2xl font-black text-gray-900">{analytics.totals.impressions}</p></div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">CTR</p><p className="text-2xl font-black text-gray-900">{analytics.totals.ctr.toFixed(2)}%</p></div>
                </div>
                <div className="space-y-2">
                  {analytics.placement_performance.map((row) => (
                    <p key={row.placement_key} className="text-sm text-gray-700">{row.placement_name}: {row.impressions} impressions, {row.clicks} clicks, {row.ctr.toFixed(2)}% CTR</p>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
