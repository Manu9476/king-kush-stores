"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { PublicVendorStore, getPublicVendorStores } from "@/services/api";

type DistanceMode = "all" | "same_city" | "same_country";

function buildAddress(store: PublicVendorStore): string {
  return [
    store.business_address_line_1,
    store.business_address_line_2,
    store.business_city,
    store.business_country,
  ]
    .filter((part) => String(part || "").trim())
    .join(", ");
}

export default function StoreLocatorPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<PublicVendorStore[]>([]);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [distanceMode, setDistanceMode] = useState<DistanceMode>("all");

  const [filters, setFilters] = useState({
    q: "",
    city: "",
    country: "",
    category: "",
    min_score: "",
  });

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) || stores[0] || null,
    [stores, selectedStoreId],
  );

  const visibleStores = useMemo(() => {
    if (distanceMode === "same_city" && filters.city.trim()) {
      return stores.filter((store) => (store.business_city || "").toLowerCase().includes(filters.city.trim().toLowerCase()));
    }
    if (distanceMode === "same_country" && filters.country.trim()) {
      return stores.filter((store) => (store.business_country || "").toLowerCase().includes(filters.country.trim().toLowerCase()));
    }
    return stores;
  }, [stores, distanceMode, filters.city, filters.country]);

  const loadStores = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getPublicVendorStores({
        q: filters.q || undefined,
        city: filters.city || undefined,
        country: filters.country || undefined,
        category: filters.category || undefined,
        min_score: filters.min_score ? Number(filters.min_score) : undefined,
      });
      setStores(response.stores);
      setCityOptions(response.meta.city_options || []);
      setCategoryOptions(response.meta.category_options || []);
      setSelectedStoreId(response.stores[0]?.id || null);
    } catch (err: any) {
      setStores([]);
      setError(err?.message || "Failed to load store locator data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFilter = async (event: FormEvent) => {
    event.preventDefault();
    await loadStores();
  };

  const mapQuery = selectedStore ? encodeURIComponent(buildAddress(selectedStore) || selectedStore.store_name) : "";

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Store Discovery</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Store Locator</h1>
          <p className="mt-2 text-sm text-gray-700">
            Search approved marketplace stores by city, category, and store quality score. Open each location on map,
            call directly, or jump to related products.
          </p>
        </header>

        <section className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <form onSubmit={onFilter} className="grid grid-cols-1 gap-3 md:grid-cols-6">
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder="Search store, city, or region"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              value={filters.city}
              onChange={(event) => setFilters((prev) => ({ ...prev, city: event.target.value }))}
              placeholder="City"
              list="locator-city-options"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={filters.country}
              onChange={(event) => setFilters((prev) => ({ ...prev, country: event.target.value }))}
              placeholder="Country"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={filters.category}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
              placeholder="Category"
              list="locator-category-options"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={filters.min_score}
              onChange={(event) => setFilters((prev) => ({ ...prev, min_score: event.target.value }))}
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Any rating</option>
              <option value="4">4.0+ rating</option>
              <option value="4.5">4.5+ rating</option>
            </select>

            <select
              value={distanceMode}
              onChange={(event) => setDistanceMode(event.target.value as DistanceMode)}
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            >
              <option value="all">Distance: All locations</option>
              <option value="same_city">Distance: Same city only</option>
              <option value="same_country">Distance: Same country only</option>
            </select>
            <button type="submit" className="rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover md:col-span-1">
              Search
            </button>
          </form>
          <datalist id="locator-city-options">
            {cityOptions.map((city) => (
              <option key={city} value={city} />
            ))}
          </datalist>
          <datalist id="locator-category-options">
            {categoryOptions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </section>

        {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-modern border border-gray-100 bg-white p-4 shadow-modern">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Available Stores</h2>
              <span className="text-xs text-gray-500">{visibleStores.length} found</span>
            </div>
            {loading ? (
              <p className="mt-4 text-sm text-gray-500">Loading stores...</p>
            ) : visibleStores.length === 0 ? (
              <div className="mt-4 rounded-modern border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                No stores matched your filters. Try broadening city/category or score filters.
              </div>
            ) : (
              <div className="mt-4 max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {visibleStores.map((store) => {
                  const address = buildAddress(store);
                  return (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => setSelectedStoreId(store.id)}
                      className={`w-full rounded-modern border p-4 text-left transition-colors ${
                        selectedStore?.id === store.id ? "border-primary/40 bg-primary/5" : "border-gray-200 bg-white hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{store.store_name}</h3>
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700">
                          {store.store_score.toFixed(1)} rating
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">{address || store.business_location || "Location not set"}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Categories: {(store.catalog_categories?.length ? store.catalog_categories : [store.product_category || "General"]).join(", ")}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || store.store_name)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-modern border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Open Map
                        </a>
                        <Link
                          href={`/search?q=${encodeURIComponent(store.store_name)}`}
                          className="rounded-modern border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-700"
                          onClick={(event) => event.stopPropagation()}
                        >
                          View Store Products
                        </Link>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </article>

          <article className="rounded-modern border border-gray-100 bg-white p-4 shadow-modern">
            <h2 className="text-lg font-bold text-gray-900">Map & Contact</h2>
            {!selectedStore ? (
              <p className="mt-4 text-sm text-gray-500">Select a store to view map and contact details.</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="overflow-hidden rounded-modern border border-gray-200">
                  {mapQuery ? (
                    <iframe
                      title="Store Map"
                      src={`https://maps.google.com/maps?q=${mapQuery}&z=13&output=embed`}
                      className="h-64 w-full"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-64 items-center justify-center bg-gray-50 text-sm text-gray-500">Map unavailable for this store.</div>
                  )}
                </div>

                <div className="rounded-modern border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{selectedStore.store_name}</h3>
                  <p className="mt-1 text-xs text-gray-600">{buildAddress(selectedStore) || selectedStore.business_location || "Location not set"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedStore.business_phone ? (
                      <a href={`tel:${selectedStore.business_phone}`} className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                        Call Store
                      </a>
                    ) : null}
                    {selectedStore.business_email ? (
                      <a href={`mailto:${selectedStore.business_email}`} className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                        Email Store
                      </a>
                    ) : null}
                    <Link href={`/search?q=${encodeURIComponent(selectedStore.store_name)}`} className="rounded-modern bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                      Browse Products
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
