"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BlackFridayOffer,
  BlackFridayPublicResponse,
  getBlackFridayCampaign,
  trackBlackFridayEvent,
} from "@/services/promotions";
import ProductScrollGallery from "@/components/ProductScrollGallery";

function Countdown({ seconds }: { seconds: number | null }) {
  const [timeLeft, setTimeLeft] = useState<number | null>(seconds);

  useEffect(() => {
    setTimeLeft(seconds);
  }, [seconds]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev !== null ? Math.max(prev - 1, 0) : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  if (timeLeft === null) {
    return <p className="text-sm text-gray-200">Countdown will appear when campaign schedule is set.</p>;
  }

  const days = Math.floor(timeLeft / 86400);
  const hours = Math.floor((timeLeft % 86400) / 3600);
  const minutes = Math.floor((timeLeft % 3600) / 60);
  const secondsPart = timeLeft % 60;

  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-red-300/50 bg-black/20 px-4 py-2 text-sm font-semibold text-white">
      <span>{days}d</span>
      <span>{hours.toString().padStart(2, "0")}h</span>
      <span>{minutes.toString().padStart(2, "0")}m</span>
      <span>{secondsPart.toString().padStart(2, "0")}s</span>
    </div>
  );
}

export default function BlackFridayPage() {
  const [data, setData] = useState<BlackFridayPublicResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [vendor, setVendor] = useState("");
  const [sort, setSort] = useState("priority");
  const [inStockOnly, setInStockOnly] = useState(false);

  const loadCampaign = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getBlackFridayCampaign({
        q: query,
        category,
        vendor,
        sort,
        in_stock: inStockOnly,
      });
      setData(response);
    } catch (err: any) {
      setError(err?.message || "Failed to load Black Friday campaign.");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCampaign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const campaignTitle = useMemo(() => data?.campaign?.hero_title || "Black Friday Deals", [data]);

  return (
    <main className="min-h-screen bg-[#0b0b0f] pb-16 text-white">
      <section className="relative overflow-hidden border-b border-red-500/30 bg-gradient-to-r from-[#150909] via-[#360a0a] to-[#150909]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">King-Kush Campaign Event</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{campaignTitle}</h1>
          <p className="mt-3 max-w-2xl text-sm text-gray-200">
            {data?.campaign?.hero_subtitle || "Shop verified deals across categories, vendors, and limited-time flash offers."}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Countdown seconds={data?.countdown?.seconds_remaining ?? null} />
            <button onClick={() => void loadCampaign()} className="rounded-xl border border-red-300/60 bg-red-700/30 px-4 py-2 text-sm font-semibold hover:bg-red-700/40">
              Refresh Deals
            </button>
            <Link href={data?.campaign?.hero_cta_url || "/search?q="} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500">
              {data?.campaign?.hero_cta_label || "Shop Now"}
            </Link>
          </div>
          {data?.campaign?.announcement_text ? <p className="mt-4 text-sm font-semibold text-amber-300">{data.campaign.announcement_text}</p> : null}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-gray-800 bg-[#111219] p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search deals..."
              className="rounded-lg border border-gray-700 bg-[#0d0f15] px-3 py-2 text-sm text-white placeholder:text-gray-500 md:col-span-2"
            />
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded-lg border border-gray-700 bg-[#0d0f15] px-3 py-2 text-sm text-white">
              <option value="">All categories</option>
              {(data?.filters.categories || []).map((entry) => (
                <option key={entry.id} value={entry.slug || String(entry.id)}>
                  {entry.name} ({entry.count})
                </option>
              ))}
            </select>
            <select value={vendor} onChange={(event) => setVendor(event.target.value)} className="rounded-lg border border-gray-700 bg-[#0d0f15] px-3 py-2 text-sm text-white">
              <option value="">All vendors</option>
              {(data?.filters.vendors || []).map((entry) => (
                <option key={entry.id} value={String(entry.id)}>
                  {entry.name} ({entry.count})
                </option>
              ))}
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-gray-700 bg-[#0d0f15] px-3 py-2 text-sm text-white">
              {(data?.filters.sort_options || []).map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-200">
              <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />
              In-stock only
            </label>
            <button onClick={() => void loadCampaign()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500">
              Apply Filters
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        {loading ? <p className="rounded-xl border border-gray-800 bg-[#111219] px-4 py-6 text-sm text-gray-300">Loading Black Friday deals...</p> : null}
        {!loading && error ? <p className="rounded-xl border border-red-700/50 bg-red-900/20 px-4 py-6 text-sm text-red-200">{error}</p> : null}

        {!loading && !error && data && !data.active ? (
          <div className="rounded-2xl border border-gray-800 bg-[#111219] p-8 text-center">
            <h2 className="text-2xl font-bold text-white">No active Black Friday campaign</h2>
            <p className="mt-2 text-sm text-gray-300">{data.fallback_message || "Deals are coming soon."}</p>
            <div className="mt-6">
              <Link href="/search?q=" className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-500">Browse all products</Link>
            </div>
          </div>
        ) : null}

        {!loading && !error && data?.active ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-gray-800 bg-[#111219] p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">Products in campaign</p>
                <p className="text-2xl font-black text-white">{data.totals?.products_in_campaign || 0}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-[#111219] p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">Participating vendors</p>
                <p className="text-2xl font-black text-white">{data.totals?.vendors_participating || 0}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-[#111219] p-4">
                <p className="text-xs uppercase tracking-wide text-gray-400">Categories on sale</p>
                <p className="text-2xl font-black text-white">{data.totals?.categories_on_sale || 0}</p>
              </div>
            </div>

            {data.sections.length === 0 ? (
              <div className="rounded-xl border border-gray-800 bg-[#111219] px-4 py-6 text-sm text-gray-300">
                No products matched your current filters.
              </div>
            ) : (
              data.sections.map((section) => (
                <div key={section.key} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-white">{section.title}</h2>
                    <span className="text-xs text-gray-400">{section.count} deals</span>
                  </div>
                  {section.items.length === 0 ? (
                    <p className="rounded-xl border border-gray-800 bg-[#111219] px-4 py-4 text-sm text-gray-400">No items in this section yet.</p>
                  ) : (
                    <ProductScrollGallery
                      items={section.items.map((offer: BlackFridayOffer) => ({
                        product: offer.product,
                        badgeText: offer.badge_text || "Black Friday Deal",
                        keyId: `${section.key}-${offer.id}`,
                        onOpen: () => {
                          void trackBlackFridayEvent({
                            offer: offer.id,
                            event_type: "click",
                            page_path: "/footer-links/black-friday",
                          }).catch(() => undefined);
                        },
                      }))}
                    />
                  )}
                </div>
              ))
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
