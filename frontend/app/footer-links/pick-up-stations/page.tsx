"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PickupStation, getPublicPickupStations } from "../../../src/services/api";

function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export default function PickupStationsPage() {
  const [stations, setStations] = useState<PickupStation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("all");

  const loadStations = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const data = await getPublicPickupStations();
      setStations(data);
    } catch (error: any) {
      setLoadError(error?.message || "Unable to load pickup stations at the moment.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStations();
  }, []);

  const cities = useMemo(() => Array.from(new Set(stations.map((station) => station.city))).sort(), [stations]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return stations.filter((station) => {
      const cityMatch = city === "all" || station.city === city;
      if (!cityMatch) return false;
      if (!normalizedQuery) return true;
      const haystack = `${station.name} ${station.city} ${station.address} ${station.services.join(" ")} ${station.temporary_notice || ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [city, query, stations]);

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Fulfillment</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Pick-up Stations</h1>
          <p className="mt-1 text-sm text-gray-600">
            Locate nearby collection points, confirm operating hours, and access map directions quickly.
          </p>
        </header>

        <section className="rounded-modern bg-white p-5 shadow-modern">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by city, station, or address..."
              className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
            />
            <select
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="all">All Cities</option>
              {cities.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCity("all");
              }}
              className="rounded-modern border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={loadStations}
              className="rounded-modern border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Refresh
            </button>
          </div>
          {isLoading ? <p className="mt-3 text-xs text-primary">Loading stations...</p> : null}
          {loadError ? <p className="mt-3 text-xs text-red-700">{loadError}</p> : null}
          {!isLoading && !loadError ? (
            <p className="mt-3 text-xs text-gray-500">
              {filtered.length} station{filtered.length === 1 ? "" : "s"} found.
            </p>
          ) : null}
        </section>

        {!isLoading && !loadError && filtered.length === 0 ? (
          <section className="rounded-modern border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
            No pick-up stations matched your search. Try a different city or keyword.
          </section>
        ) : null}

        {!isLoading && !loadError && filtered.length > 0 ? (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((station) => (
              <article key={station.id} className="rounded-modern bg-white p-5 shadow-modern">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{station.city}</p>
                <h2 className="mt-1 text-lg font-bold text-gray-900">{station.name}</h2>
                <p className="mt-2 text-sm text-gray-700">{station.address}</p>
                <p className="mt-2 text-xs font-semibold text-gray-600">Open: {station.operating_hours}</p>
                <p className="mt-2 text-xs text-gray-600">
                  Services: {station.services.length > 0 ? station.services.join(" | ") : "Order Collection"}
                </p>
                {station.temporary_notice ? (
                  <p className="mt-2 rounded-modern border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    Notice: {station.temporary_notice}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={mapUrl(`${station.name}, ${station.address}, ${station.city}`)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-modern bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
                  >
                    Get Directions
                  </a>
                  <a
                    href={`tel:${station.contact_phone.replace(/\s+/g, "")}`}
                    className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Call Station
                  </a>
                </div>
              </article>
            ))}
          </section>
        ) : null}

        <section className="rounded-modern border border-primary/20 bg-primary/5 p-6">
          <h3 className="text-sm font-bold text-primary">Before You Pick Up</h3>
          <ul className="mt-2 space-y-2 text-sm text-gray-700">
            <li>Carry your order number and a valid phone number used during checkout.</li>
            <li>Check your order status before travel to confirm readiness.</li>
            <li>For delays or issues, contact support with your order reference.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/footer-links/track-your-order" className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
              Track Your Order
            </Link>
            <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Contact Support
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
