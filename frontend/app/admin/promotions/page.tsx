"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { useAuth } from "@/context/AuthContext";
import { getAdminProducts } from "@/services/api";
import {
  BlackFridayCampaign,
  BlackFridayAnalytics,
  createAdminBlackFridayCampaign,
  createAdminBlackFridayOffer,
  deleteAdminBlackFridayCampaign,
  deleteAdminBlackFridayOffer,
  getAdminBlackFridayAnalytics,
  getAdminBlackFridayCampaigns,
  getAdminBlackFridayOffers,
  updateAdminBlackFridayCampaign,
  updateAdminBlackFridayOffer,
} from "@/services/promotions";

type TabKey = "campaigns" | "offers" | "analytics";

type ProductOption = { id: number; title: string; vendor_name: string };

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIsoOrNull(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function buildCampaignFormData(payload: {
  name: string;
  description: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta_label: string;
  hero_cta_url: string;
  announcement_text: string;
  countdown_label: string;
  status: string;
  is_visible: boolean;
  starts_at: string;
  ends_at: string;
  banner: File | null;
}): FormData {
  const form = new FormData();
  form.append("name", payload.name);
  form.append("description", payload.description || "");
  form.append("hero_title", payload.hero_title || "");
  form.append("hero_subtitle", payload.hero_subtitle || "");
  form.append("hero_cta_label", payload.hero_cta_label || "Shop Deals");
  form.append("hero_cta_url", payload.hero_cta_url || "");
  form.append("announcement_text", payload.announcement_text || "");
  form.append("countdown_label", payload.countdown_label || "Sale ends in");
  form.append("status", payload.status);
  form.append("is_visible", String(payload.is_visible));
  form.append("starts_at", toIsoOrNull(payload.starts_at) || "");
  form.append("ends_at", toIsoOrNull(payload.ends_at) || "");
  if (payload.banner) form.append("banner_image", payload.banner);
  return form;
}

export default function AdminPromotionsPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, canAccessAdminModule, hasAdminPermission } = useAuth();

  const canView = canAccessAdminModule("promotions") && hasAdminPermission("promotions.view");
  const canManage = hasAdminPermission("promotions.manage");
  const canAccess = canView || canManage;

  const [tab, setTab] = useState<TabKey>("campaigns");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [campaigns, setCampaigns] = useState<BlackFridayCampaign[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [analytics, setAnalytics] = useState<BlackFridayAnalytics | null>(null);

  const [editingCampaignId, setEditingCampaignId] = useState<number | null>(null);
  const [campaignBanner, setCampaignBanner] = useState<File | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    description: "",
    hero_title: "",
    hero_subtitle: "",
    hero_cta_label: "Shop Deals",
    hero_cta_url: "/search?q=",
    announcement_text: "",
    countdown_label: "Sale ends in",
    status: "draft",
    is_visible: true,
    starts_at: "",
    ends_at: "",
  });

  const [editingOfferId, setEditingOfferId] = useState<number | null>(null);
  const [offerForm, setOfferForm] = useState({
    campaign_id: 0,
    product_id: 0,
    discount_type: "percentage",
    discount_value: "10",
    review_status: "approved",
    section_key: "best_deals",
    badge_text: "Black Friday Deal",
    urgency_text: "",
    is_flash_deal: false,
    flash_start_at: "",
    flash_end_at: "",
    promotional_stock_limit: "",
    priority: "50",
    is_enabled: true,
  });

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
      const [campaignRows, offerRows, analyticsData, productRows] = await Promise.all([
        canView ? getAdminBlackFridayCampaigns(token) : Promise.resolve([]),
        canView ? getAdminBlackFridayOffers(token) : Promise.resolve([]),
        canView ? getAdminBlackFridayAnalytics(token) : Promise.resolve(null),
        canView ? getAdminProducts(token) : Promise.resolve([]),
      ]);
      setCampaigns(campaignRows);
      setOffers(offerRows);
      setAnalytics(analyticsData);
      setProducts(productRows.map((row) => ({ id: row.id, title: row.title, vendor_name: row.vendor_name })));

      if (campaignRows.length > 0 && offerForm.campaign_id === 0) {
        setOfferForm((prev) => ({ ...prev, campaign_id: campaignRows[0].id }));
      }
      if (productRows.length > 0 && offerForm.product_id === 0) {
        setOfferForm((prev) => ({ ...prev, product_id: productRows[0].id }));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load promotions data.");
    } finally {
      setLoading(false);
    }
  }, [token, canAccess, canView, offerForm.campaign_id, offerForm.product_id]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canAccess) {
      void loadData();
    }
  }, [isAuthenticated, token, userRole, canAccess, loadData]);

  const sortedCampaigns = useMemo(
    () => [...campaigns].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
    [campaigns],
  );

  const onSaveCampaign = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManage || !campaignForm.name.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = buildCampaignFormData({ ...campaignForm, banner: campaignBanner });
      const updated = editingCampaignId
        ? await updateAdminBlackFridayCampaign(token, editingCampaignId, payload)
        : await createAdminBlackFridayCampaign(token, payload);

      setCampaigns((prev) => {
        if (editingCampaignId) return prev.map((row) => (row.id === updated.id ? updated : row));
        return [updated, ...prev];
      });
      setEditingCampaignId(null);
      setCampaignBanner(null);
      setCampaignForm({
        name: "",
        description: "",
        hero_title: "",
        hero_subtitle: "",
        hero_cta_label: "Shop Deals",
        hero_cta_url: "/search?q=",
        announcement_text: "",
        countdown_label: "Sale ends in",
        status: "draft",
        is_visible: true,
        starts_at: "",
        ends_at: "",
      });
      setSuccess("Campaign saved successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to save campaign.");
    } finally {
      setSaving(false);
    }
  };

  const onSaveOffer = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManage || !offerForm.campaign_id || !offerForm.product_id) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        campaign_id: offerForm.campaign_id,
        product_id: offerForm.product_id,
        discount_type: offerForm.discount_type,
        discount_value: offerForm.discount_value,
        review_status: offerForm.review_status,
        section_key: offerForm.section_key,
        badge_text: offerForm.badge_text,
        urgency_text: offerForm.urgency_text,
        is_flash_deal: offerForm.is_flash_deal,
        flash_start_at: toIsoOrNull(offerForm.flash_start_at),
        flash_end_at: toIsoOrNull(offerForm.flash_end_at),
        promotional_stock_limit: offerForm.promotional_stock_limit ? Number(offerForm.promotional_stock_limit) : null,
        priority: Number(offerForm.priority || 50),
        is_enabled: offerForm.is_enabled,
      };

      const updated = editingOfferId
        ? await updateAdminBlackFridayOffer(token, editingOfferId, payload)
        : await createAdminBlackFridayOffer(token, payload);

      setOffers((prev) => {
        if (editingOfferId) return prev.map((row) => (row.id === updated.id ? updated : row));
        return [updated, ...prev];
      });

      setEditingOfferId(null);
      setOfferForm((prev) => ({
        ...prev,
        discount_type: "percentage",
        discount_value: "10",
        review_status: "approved",
        section_key: "best_deals",
        badge_text: "Black Friday Deal",
        urgency_text: "",
        is_flash_deal: false,
        flash_start_at: "",
        flash_end_at: "",
        promotional_stock_limit: "",
        priority: "50",
        is_enabled: true,
      }));
      setSuccess("Offer saved successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to save offer.");
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canAccess) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar active="promotions" />
      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="rounded-2xl border border-gray-200 bg-white p-5">
          <h1 className="text-2xl font-black text-gray-900">Promotions Desk</h1>
          <p className="mt-1 text-sm text-gray-600">Manage Black Friday campaign scheduling, offer approvals, and promotion performance.</p>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}

        <div className="flex flex-wrap gap-2">
          {(["campaigns", "offers", "analytics"] as TabKey[]).map((key) => (
            <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? "bg-primary text-white" : "border border-gray-300 bg-white text-gray-700"}`}>
              {key}
            </button>
          ))}
          <button type="button" onClick={() => void loadData()} className="ml-auto rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700">
            Refresh
          </button>
        </div>

        {loading ? <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading promotions...</div> : null}

        {!loading && tab === "campaigns" ? (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-gray-200 bg-white max-h-[620px] overflow-y-auto divide-y divide-gray-100">
              {sortedCampaigns.length === 0 ? <p className="p-4 text-sm text-gray-500">No campaigns yet.</p> : sortedCampaigns.map((campaign) => (
                <div key={campaign.id} className="p-4">
                  <p className="text-sm font-semibold text-gray-900">{campaign.name}</p>
                  <p className="text-xs text-gray-500">{campaign.status} | {campaign.is_visible ? "visible" : "hidden"}</p>
                  <p className="text-xs text-gray-500">{campaign.starts_at ? new Date(campaign.starts_at).toLocaleString() : "No start"} - {campaign.ends_at ? new Date(campaign.ends_at).toLocaleString() : "No end"}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                      onClick={() => {
                        setEditingCampaignId(campaign.id);
                        setCampaignForm({
                          name: campaign.name,
                          description: campaign.description || "",
                          hero_title: campaign.hero_title || "",
                          hero_subtitle: campaign.hero_subtitle || "",
                          hero_cta_label: campaign.hero_cta_label || "Shop Deals",
                          hero_cta_url: campaign.hero_cta_url || "/search?q=",
                          announcement_text: campaign.announcement_text || "",
                          countdown_label: campaign.countdown_label || "Sale ends in",
                          status: campaign.status,
                          is_visible: campaign.is_visible,
                          starts_at: toDateTimeLocal(campaign.starts_at),
                          ends_at: toDateTimeLocal(campaign.ends_at),
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                      onClick={() => {
                        if (!token) return;
                        void deleteAdminBlackFridayCampaign(token, campaign.id).then(() => {
                          setCampaigns((prev) => prev.filter((row) => row.id !== campaign.id));
                        }).catch((err: any) => setError(err?.message || "Failed to delete campaign."));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={onSaveCampaign} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">{editingCampaignId ? "Edit campaign" : "Create campaign"}</p>
              <input value={campaignForm.name} onChange={(e) => setCampaignForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Campaign name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              <textarea value={campaignForm.description} onChange={(e) => setCampaignForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="Description" className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={campaignForm.hero_title} onChange={(e) => setCampaignForm((prev) => ({ ...prev, hero_title: e.target.value }))} placeholder="Hero title" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={campaignForm.hero_subtitle} onChange={(e) => setCampaignForm((prev) => ({ ...prev, hero_subtitle: e.target.value }))} placeholder="Hero subtitle" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input value={campaignForm.hero_cta_label} onChange={(e) => setCampaignForm((prev) => ({ ...prev, hero_cta_label: e.target.value }))} placeholder="CTA label" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <input value={campaignForm.hero_cta_url} onChange={(e) => setCampaignForm((prev) => ({ ...prev, hero_cta_url: e.target.value }))} placeholder="CTA URL" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <input value={campaignForm.announcement_text} onChange={(e) => setCampaignForm((prev) => ({ ...prev, announcement_text: e.target.value }))} placeholder="Announcement text" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <select value={campaignForm.status} onChange={(e) => setCampaignForm((prev) => ({ ...prev, status: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="draft">draft</option>
                  <option value="scheduled">scheduled</option>
                  <option value="active">active</option>
                  <option value="paused">paused</option>
                  <option value="ended">ended</option>
                </select>
                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                  <input type="checkbox" checked={campaignForm.is_visible} onChange={(e) => setCampaignForm((prev) => ({ ...prev, is_visible: e.target.checked }))} />
                  visible
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="datetime-local" value={campaignForm.starts_at} onChange={(e) => setCampaignForm((prev) => ({ ...prev, starts_at: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <input type="datetime-local" value={campaignForm.ends_at} onChange={(e) => setCampaignForm((prev) => ({ ...prev, ends_at: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <input type="file" accept=".jpg,.jpeg,.png,.webp" onChange={(e) => setCampaignBanner(e.target.files?.[0] || null)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <button disabled={!canManage || saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save Campaign</button>
            </form>
          </section>
        ) : null}

        {!loading && tab === "offers" ? (
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-gray-200 bg-white max-h-[620px] overflow-y-auto divide-y divide-gray-100">
              {offers.length === 0 ? <p className="p-4 text-sm text-gray-500">No offers yet.</p> : offers.map((offer) => (
                <div key={offer.id} className="p-4">
                  <p className="text-sm font-semibold text-gray-900">{offer.product?.title || "Product"}</p>
                  <p className="text-xs text-gray-500">{offer.campaign?.name || "Campaign"} | {offer.review_status}</p>
                  <p className="text-xs text-gray-500">Discount: {offer.discount_type} {offer.discount_value} | Priority {offer.priority}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                      onClick={() => {
                        setEditingOfferId(offer.id);
                        setOfferForm({
                          campaign_id: offer.campaign?.id || 0,
                          product_id: offer.product?.id || 0,
                          discount_type: offer.discount_type,
                          discount_value: String(offer.discount_value),
                          review_status: offer.review_status,
                          section_key: offer.section_key || "best_deals",
                          badge_text: offer.badge_text || "Black Friday Deal",
                          urgency_text: offer.urgency_text || "",
                          is_flash_deal: Boolean(offer.is_flash_deal),
                          flash_start_at: toDateTimeLocal(offer.flash_start_at),
                          flash_end_at: toDateTimeLocal(offer.flash_end_at),
                          promotional_stock_limit: offer.promotional_stock_limit ? String(offer.promotional_stock_limit) : "",
                          priority: String(offer.priority || 50),
                          is_enabled: Boolean(offer.is_enabled),
                        });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                      onClick={() => {
                        if (!token) return;
                        void deleteAdminBlackFridayOffer(token, offer.id).then(() => {
                          setOffers((prev) => prev.filter((row) => row.id !== offer.id));
                        }).catch((err: any) => setError(err?.message || "Failed to delete offer."));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <form onSubmit={onSaveOffer} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
              <p className="text-sm font-semibold text-gray-900">{editingOfferId ? "Edit offer" : "Create offer"}</p>
              <select value={offerForm.campaign_id || ""} onChange={(e) => setOfferForm((prev) => ({ ...prev, campaign_id: Number(e.target.value) }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
              <select value={offerForm.product_id || ""} onChange={(e) => setOfferForm((prev) => ({ ...prev, product_id: Number(e.target.value) }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.title} ({product.vendor_name})</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <select value={offerForm.discount_type} onChange={(e) => setOfferForm((prev) => ({ ...prev, discount_type: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="percentage">percentage</option>
                  <option value="fixed">fixed</option>
                </select>
                <input value={offerForm.discount_value} onChange={(e) => setOfferForm((prev) => ({ ...prev, discount_value: e.target.value }))} placeholder="Discount value" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={offerForm.review_status} onChange={(e) => setOfferForm((prev) => ({ ...prev, review_status: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="pending_review">pending_review</option>
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                </select>
                <input value={offerForm.section_key} onChange={(e) => setOfferForm((prev) => ({ ...prev, section_key: e.target.value }))} placeholder="Section key" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <input value={offerForm.badge_text} onChange={(e) => setOfferForm((prev) => ({ ...prev, badge_text: e.target.value }))} placeholder="Badge text" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input value={offerForm.urgency_text} onChange={(e) => setOfferForm((prev) => ({ ...prev, urgency_text: e.target.value }))} placeholder="Urgency text" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="datetime-local" value={offerForm.flash_start_at} onChange={(e) => setOfferForm((prev) => ({ ...prev, flash_start_at: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <input type="datetime-local" value={offerForm.flash_end_at} onChange={(e) => setOfferForm((prev) => ({ ...prev, flash_end_at: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={offerForm.promotional_stock_limit} onChange={(e) => setOfferForm((prev) => ({ ...prev, promotional_stock_limit: e.target.value }))} placeholder="Promo stock limit" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <input value={offerForm.priority} onChange={(e) => setOfferForm((prev) => ({ ...prev, priority: e.target.value }))} placeholder="Priority" className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                  <input type="checkbox" checked={offerForm.is_flash_deal} onChange={(e) => setOfferForm((prev) => ({ ...prev, is_flash_deal: e.target.checked }))} />
                  flash deal
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                  <input type="checkbox" checked={offerForm.is_enabled} onChange={(e) => setOfferForm((prev) => ({ ...prev, is_enabled: e.target.checked }))} />
                  enabled
                </label>
              </div>
              <button disabled={!canManage || saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save Offer</button>
            </form>
          </section>
        ) : null}

        {!loading && tab === "analytics" ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            {!analytics ? <p className="text-sm text-gray-500">No analytics yet.</p> : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Campaigns</p><p className="text-2xl font-black text-gray-900">{analytics.totals.campaigns_total}</p></div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Offers</p><p className="text-2xl font-black text-gray-900">{analytics.totals.offers_total}</p></div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Orders</p><p className="text-2xl font-black text-gray-900">{analytics.totals.orders}</p></div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Revenue</p><p className="text-2xl font-black text-gray-900">KES {Number(analytics.totals.revenue || 0).toFixed(2)}</p></div>
                </div>
                <div className="space-y-2">
                  {analytics.top_offers.map((offer: any) => (
                    <div key={offer.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {offer.product?.title || "Product"} | Orders {offer.orders_count} | Clicks {offer.click_count} | Impressions {offer.impression_count}
                    </div>
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
