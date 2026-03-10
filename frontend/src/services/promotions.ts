import { Product } from "../types";

function normalizeApiBase(rawUrl?: string): string {
  if (!rawUrl) return "";
  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

const CONFIGURED_API_URL = normalizeApiBase(process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL);
const CLIENT_PROTOCOL = typeof window !== "undefined" && window.location?.protocol ? window.location.protocol : "http:";
const CLIENT_HOST = typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "localhost";
const CLIENT_API_URL = CONFIGURED_API_URL || "http://127.0.0.1:8000/api";

export interface BlackFridayCampaign {
  id: number;
  campaign_type: string;
  name: string;
  slug: string;
  description: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta_label: string;
  hero_cta_url: string;
  countdown_label: string;
  announcement_text: string;
  banner_image: string | null;
  banner_image_url: string;
  status: "draft" | "scheduled" | "active" | "paused" | "ended";
  is_visible: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sections_config: Array<{ key: string; title: string; limit?: number; enabled?: boolean }>;
  created_at: string;
  updated_at: string;
}

export interface BlackFridayOffer {
  id: number;
  product: Product;
  discount_type: "percentage" | "fixed";
  discount_value: string;
  section_key: string;
  badge_text: string;
  urgency_text: string;
  is_flash_deal: boolean;
  flash_end_at: string | null;
  priority: number;
  stock_remaining: number | null;
  discounted_price: string;
  savings_amount: string;
  savings_percent: number;
  click_count?: number;
  impression_count?: number;
  created_at?: string;
}

export interface BlackFridayPublicResponse {
  active: boolean;
  campaign: BlackFridayCampaign | null;
  countdown: {
    label: string;
    ends_at: string | null;
    seconds_remaining: number | null;
  } | null;
  totals?: {
    products_in_campaign: number;
    vendors_participating: number;
    categories_on_sale: number;
  };
  products: BlackFridayOffer[];
  sections: Array<{
    key: string;
    title: string;
    count: number;
    items: BlackFridayOffer[];
  }>;
  filters: {
    categories: Array<{ id: number; name: string; slug: string; count: number }>;
    vendors: Array<{ id: number; name: string; count: number }>;
    sort_options: Array<{ value: string; label: string }>;
  };
  fallback_message?: string;
  generated_at: string;
}

export interface BlackFridayAnalytics {
  active_campaign: BlackFridayCampaign | null;
  totals: {
    campaigns_total: number;
    offers_total: number;
    offers_approved: number;
    offers_pending: number;
    impressions: number;
    clicks: number;
    orders: number;
    units_sold: number;
    revenue: string;
  };
  top_offers: any[];
}

function buildApiCandidates(): string[] {
  const candidates = [
    CONFIGURED_API_URL,
    CLIENT_API_URL,
    `${CLIENT_PROTOCOL}//${CLIENT_HOST}:8000/api`,
    `${CLIENT_PROTOCOL}//localhost:8000/api`,
    `${CLIENT_PROTOCOL}//127.0.0.1:8000/api`,
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

function withAuth(token: string | null): HeadersInit {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function requestWithFallback(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<Response> {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;

  for (const base of buildApiCandidates()) {
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...withAuth(token),
          ...(init.headers || {}),
        },
      });
      if (response.ok) return response;
      if ([400, 404].includes(response.status)) {
        lastResponse = response;
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error("Failed to reach backend.");
}

export async function getBlackFridayCampaign(params: {
  q?: string;
  category?: string;
  vendor?: string;
  sort?: string;
  in_stock?: boolean;
} = {}): Promise<BlackFridayPublicResponse> {
  const searchParams = new URLSearchParams();
  if (params.q?.trim()) searchParams.set("q", params.q.trim());
  if (params.category?.trim()) searchParams.set("category", params.category.trim());
  if (params.vendor?.trim()) searchParams.set("vendor", params.vendor.trim());
  if (params.sort?.trim()) searchParams.set("sort", params.sort.trim());
  if (typeof params.in_stock === "boolean") searchParams.set("in_stock", String(params.in_stock));

  const response = await requestWithFallback(
    `/promotions/black-friday/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    { method: "GET", cache: "no-store" },
    null,
  );
  if (!response.ok) {
    throw new Error("Failed to load Black Friday campaign.");
  }
  return await response.json();
}

export async function trackBlackFridayEvent(payload: {
  offer: number;
  event_type: "impression" | "click";
  page_path?: string;
}): Promise<void> {
  const response = await requestWithFallback(
    "/promotions/black-friday/events/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    null,
  );
  if (!response.ok) {
    throw new Error("Failed to track campaign event.");
  }
}

export async function getAdminBlackFridayCampaigns(token: string, params: { q?: string; status?: string } = {}): Promise<BlackFridayCampaign[]> {
  const searchParams = new URLSearchParams();
  if (params.q?.trim()) searchParams.set("q", params.q.trim());
  if (params.status?.trim()) searchParams.set("status", params.status.trim());

  const response = await requestWithFallback(
    `/promotions/admin/black-friday/campaigns/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    { method: "GET" },
    token,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to fetch Black Friday campaigns.");
  }
  return await response.json();
}

export async function createAdminBlackFridayCampaign(token: string, payload: FormData): Promise<BlackFridayCampaign> {
  const response = await requestWithFallback(
    "/promotions/admin/black-friday/campaigns/",
    {
      method: "POST",
      body: payload,
    },
    token,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to create campaign.");
  }
  return await response.json();
}

export async function updateAdminBlackFridayCampaign(token: string, campaignId: number, payload: FormData): Promise<BlackFridayCampaign> {
  const response = await requestWithFallback(
    `/promotions/admin/black-friday/campaigns/${campaignId}/`,
    {
      method: "PATCH",
      body: payload,
    },
    token,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to update campaign.");
  }
  return await response.json();
}

export async function deleteAdminBlackFridayCampaign(token: string, campaignId: number): Promise<void> {
  const response = await requestWithFallback(
    `/promotions/admin/black-friday/campaigns/${campaignId}/`,
    { method: "DELETE" },
    token,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to delete campaign.");
  }
}

export async function getAdminBlackFridayOffers(
  token: string,
  params: { q?: string; campaign_id?: number; review_status?: string; source_type?: string } = {},
): Promise<any[]> {
  const searchParams = new URLSearchParams();
  if (params.q?.trim()) searchParams.set("q", params.q.trim());
  if (params.campaign_id) searchParams.set("campaign_id", String(params.campaign_id));
  if (params.review_status?.trim()) searchParams.set("review_status", params.review_status.trim());
  if (params.source_type?.trim()) searchParams.set("source_type", params.source_type.trim());

  const response = await requestWithFallback(
    `/promotions/admin/black-friday/offers/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    { method: "GET" },
    token,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to fetch offers.");
  }
  return await response.json();
}

export async function createAdminBlackFridayOffer(token: string, payload: Record<string, any>): Promise<any> {
  const response = await requestWithFallback(
    "/promotions/admin/black-friday/offers/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    token,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to create offer.");
  }
  return await response.json();
}

export async function updateAdminBlackFridayOffer(token: string, offerId: number, payload: Record<string, any>): Promise<any> {
  const response = await requestWithFallback(
    `/promotions/admin/black-friday/offers/${offerId}/`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    token,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to update offer.");
  }
  return await response.json();
}

export async function deleteAdminBlackFridayOffer(token: string, offerId: number): Promise<void> {
  const response = await requestWithFallback(
    `/promotions/admin/black-friday/offers/${offerId}/`,
    { method: "DELETE" },
    token,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to delete offer.");
  }
}

export async function getAdminBlackFridayAnalytics(token: string): Promise<BlackFridayAnalytics> {
  const response = await requestWithFallback(
    "/promotions/admin/black-friday/analytics/",
    { method: "GET" },
    token,
  );
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Failed to fetch analytics.");
  }
  return await response.json();
}
