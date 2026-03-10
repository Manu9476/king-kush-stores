"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdvertisingCampaign,
  getAdvertisingPublicData,
  trackAdvertisingEvent,
} from "../../services/api";
import { useAuth } from "../../context/AuthContext";

type AdSlotProps = {
  placementKey:
    | "announcement_bar"
    | "homepage_hero_banner"
    | "category_page_banner"
    | "sidebar_promo"
    | "sponsored_grid_card"
    | "promotional_strip"
    | "footer_banner"
    | "dashboard_promo_card";
  category?: string;
  limit?: number;
  pagePath?: string;
  className?: string;
};

function getAdSessionId(): string {
  if (typeof window === "undefined") return "server-session";
  const key = "adSessionId";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = `ads-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, next);
  return next;
}

function slotStylesByPlacement(placementKey: AdSlotProps["placementKey"]) {
  switch (placementKey) {
    case "announcement_bar":
      return "rounded-xl border border-amber-200 bg-amber-50 p-3";
    case "homepage_hero_banner":
      return "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm";
    case "category_page_banner":
      return "rounded-2xl border border-blue-200 bg-blue-50 p-4";
    case "sidebar_promo":
      return "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm";
    case "sponsored_grid_card":
      return "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm";
    case "promotional_strip":
      return "rounded-2xl border border-emerald-200 bg-emerald-50 p-4";
    case "footer_banner":
      return "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm";
    case "dashboard_promo_card":
      return "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm";
    default:
      return "rounded-2xl border border-gray-200 bg-white p-4";
  }
}

export default function AdSlot({
  placementKey,
  category = "",
  limit,
  pagePath = "",
  className = "",
}: AdSlotProps) {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState<AdvertisingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const trackedImpressions = useRef<Set<number>>(new Set());
  const adSessionId = useMemo(() => getAdSessionId(), []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAdvertisingPublicData({
          placement: placementKey,
          category,
          limit,
        });
        if (!mounted) return;
        setCampaigns(data.campaigns || []);
      } catch {
        if (!mounted) return;
        setCampaigns([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [placementKey, category, limit]);

  useEffect(() => {
    campaigns.forEach((campaign) => {
      if (trackedImpressions.current.has(campaign.id)) return;
      trackedImpressions.current.add(campaign.id);
      void trackAdvertisingEvent(
        {
          campaign_id: campaign.id,
          event_type: "impression",
          page_path: pagePath || (typeof window !== "undefined" ? window.location.pathname : ""),
          context_key: placementKey,
          session_id: adSessionId,
        },
        token,
      ).catch(() => {});
    });
  }, [campaigns, placementKey, pagePath, adSessionId, token]);

  if (loading || campaigns.length === 0) return null;

  return (
    <section className={`${slotStylesByPlacement(placementKey)} ${className}`}>
      <div className="space-y-3">
        {campaigns.map((campaign) => {
          const body = (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    {campaign.is_sponsored ? "Sponsored" : "Promotion"}
                  </span>
                  <span className="text-[11px] text-gray-500">{campaign.placement.name}</span>
                </div>
                <p className="text-sm font-bold text-gray-900">{campaign.title}</p>
                {campaign.subtitle ? <p className="mt-1 text-xs text-gray-700">{campaign.subtitle}</p> : null}
                {campaign.description ? <p className="mt-1 text-xs text-gray-600 line-clamp-2">{campaign.description}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {campaign.creative_image_url ? (
                  <img
                    src={campaign.creative_image_url}
                    alt={campaign.title}
                    className="h-16 w-28 rounded-lg border border-gray-200 object-cover"
                  />
                ) : null}
                {campaign.target_url ? (
                  <span className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">
                    {campaign.cta_label || "Learn More"}
                  </span>
                ) : null}
              </div>
            </div>
          );

          if (!campaign.target_url) {
            return (
              <article key={campaign.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                {body}
              </article>
            );
          }

          return (
            <Link
              key={campaign.id}
              href={campaign.target_url}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                void trackAdvertisingEvent(
                  {
                    campaign_id: campaign.id,
                    event_type: "click",
                    page_path: pagePath || (typeof window !== "undefined" ? window.location.pathname : ""),
                    context_key: placementKey,
                    session_id: adSessionId,
                  },
                  token,
                ).catch(() => {});
              }}
              className="block rounded-xl border border-gray-200 bg-white px-3 py-3 transition-colors hover:border-primary/40 hover:bg-gray-50"
            >
              {body}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
