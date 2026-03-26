"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CreatorsPageResponse,
  PersonProfileData,
  TeamPageResponse,
  getPublicCreatorsPage,
  getPublicTeamPage,
} from "../services/api";

const FALLBACK_IMAGE = "/product-placeholder.svg";

type Props = {
  mode: "creators" | "team";
};

function PersonCard({ item, href }: { item: PersonProfileData; href: string }) {
  const image = item.profile_photo_url || FALLBACK_IMAGE;
  const [openImage, setOpenImage] = useState(false);
  return (
    <article className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
      <button type="button" onClick={() => setOpenImage(true)} className="relative block h-56 w-full overflow-hidden rounded-2xl bg-gray-100">
        <Image src={image} alt={item.full_name} fill className="object-cover" />
      </button>
      <p className="mt-4 text-lg font-black text-gray-900">{item.full_name}</p>
      <p className="mt-1 text-sm font-semibold text-primary">{item.role_title}</p>
      <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{item.bio || "Profile details coming soon."}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.departments.map((dept) => (
          <span key={dept.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{dept.name}</span>
        ))}
      </div>
      <Link href={href} className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover">
        View Profile
      </Link>
      {openImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpenImage(false)}>
          <div className="relative h-[80vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white" onClick={(event) => event.stopPropagation()}>
            <Image src={image} alt={item.full_name} fill className="object-contain" />
          </div>
        </div>
      ) : null}
    </article>
  );
}

export default function PublicPeopleClient({ mode }: Props) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<CreatorsPageResponse | TeamPageResponse | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        const payload = mode === "creators" ? await getPublicCreatorsPage(query, department) : await getPublicTeamPage(query, department);
        if (active) setData(payload);
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load page content.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [mode, query, department]);

  const departments = data?.departments || [];
  const featured = mode === "creators" ? (data as CreatorsPageResponse | null)?.featured_creators || [] : (data as TeamPageResponse | null)?.featured_members || [];
  const items = mode === "creators" ? (data as CreatorsPageResponse | null)?.creators || [] : (data as TeamPageResponse | null)?.members || [];
  const company = mode === "creators" ? (data as CreatorsPageResponse | null)?.company : null;
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {mode === "creators" && company ? (
          <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
            <button type="button" onClick={() => setLightboxImage(company.banner_url || FALLBACK_IMAGE)} className="relative block h-64 w-full bg-gray-100">
              <Image src={company.banner_url || FALLBACK_IMAGE} alt={company.company_name} fill className="object-cover" />
            </button>
            <div className="grid gap-6 p-6 lg:grid-cols-[120px_minmax(0,1fr)] lg:p-8">
              <button type="button" onClick={() => setLightboxImage(company.logo_url || FALLBACK_IMAGE)} className="relative h-28 w-28 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <Image src={company.logo_url || FALLBACK_IMAGE} alt={company.company_name} fill className="object-cover" />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">My Company</p>
                <h1 className="mt-2 text-3xl font-black text-gray-900 md:text-4xl">{company.company_name}</h1>
                <p className="mt-3 text-sm leading-7 text-gray-600">{company.description || "Company profile coming soon."}</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {company.mission ? (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Mission</p>
                      <p className="mt-2 text-sm leading-7 text-gray-600">{company.mission}</p>
                    </div>
                  ) : null}
                  {company.vision ? (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Vision</p>
                      <p className="mt-2 text-sm leading-7 text-gray-600">{company.vision}</p>
                    </div>
                  ) : null}
                </div>
                {company.featured_media?.length ? (
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Featured Media</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {company.featured_media.map((media) => (
                        <button key={media.id} type="button" onClick={() => setLightboxImage(media.image_url || FALLBACK_IMAGE)} className="relative h-32 overflow-hidden rounded-2xl bg-gray-100">
                          <Image src={media.image_url || FALLBACK_IMAGE} alt={media.caption || company.company_name} fill className="object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{mode === "creators" ? "Creators Page" : "Our Team"}</p>
            <h1 className="mt-3 text-4xl font-black text-gray-900">{mode === "creators" ? "Meet Our Creators" : "Meet Our Team"}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600">
              {mode === "creators" ? "Explore featured creators, departments, and individual profiles." : "Browse team members by role, department, and featured profiles."}
            </p>
          </section>
        )}

        <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px]">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, title, or bio" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
            <select value={department} onChange={(e) => setDepartment(e.target.value)} className="rounded-xl border border-gray-300 px-4 py-3 text-sm">
              <option value="">All departments</option>
              {departments.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}
            </select>
          </div>
        </section>

        {featured.length > 0 ? (
          <section>
            <h2 className="text-2xl font-black text-gray-900">Featured {mode === "creators" ? "Creators" : "Team Members"}</h2>
            <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {featured.map((item) => <PersonCard key={item.id} item={item} href={mode === "creators" ? `/creators/${item.slug}` : `/our-team/${item.slug}`} />)}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="text-2xl font-black text-gray-900">{mode === "creators" ? "All Creators" : "All Team Members"}</h2>
          {loading ? <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">Loading profiles...</div> : null}
          {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div> : null}
          {!loading && !error ? (
            <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => <PersonCard key={item.id} item={item} href={mode === "creators" ? `/creators/${item.slug}` : `/our-team/${item.slug}`} />)}
            </div>
          ) : null}
        </section>
      </div>
      {lightboxImage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightboxImage(null)}>
          <div className="relative h-[85vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white" onClick={(event) => event.stopPropagation()}>
            <Image src={lightboxImage} alt="Expanded media" fill className="object-contain" />
          </div>
        </div>
      ) : null}
    </main>
  );
}
