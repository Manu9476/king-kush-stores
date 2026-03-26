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
                {(company.email || company.phone_number || company.website_url || company.address || company.location || company.facebook_url || company.instagram_url || company.x_url || company.linkedin_url || company.youtube_url || company.tiktok_url) ? (
                  <div className="mt-5 rounded-3xl border border-gray-200 bg-linear-to-br from-slate-50 via-white to-blue-50 p-5 shadow-sm">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="grid flex-1 gap-3 md:grid-cols-2">
                        {company.email ? (
                          <a href={`mailto:${company.email}`} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">Email</span>
                            <span className="mt-1 block font-semibold text-primary">{company.email}</span>
                          </a>
                        ) : null}
                        {company.phone_number ? (
                          <a href={`tel:${company.phone_number}`} className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">Phone</span>
                            <span className="mt-1 block font-semibold text-primary">{company.phone_number}</span>
                          </a>
                        ) : null}
                        {company.website_url ? (
                          <a href={company.website_url} target="_blank" rel="noreferrer" className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 transition-colors hover:border-primary/40 hover:bg-primary/5">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">Website</span>
                            <span className="mt-1 block font-semibold text-primary">{company.website_url}</span>
                          </a>
                        ) : null}
                        {company.location ? (
                          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">Location</span>
                            <span className="mt-1 block font-semibold">{company.location}</span>
                          </div>
                        ) : null}
                        {company.address ? (
                          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 md:col-span-2">
                            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">Address</span>
                            <span className="mt-1 block font-semibold">{company.address}</span>
                          </div>
                        ) : null}
                      </div>

                      {(company.facebook_url || company.instagram_url || company.x_url || company.linkedin_url || company.youtube_url || company.tiktok_url) ? (
                        <div className="lg:w-56">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500">Connect</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {company.facebook_url ? <a href={company.facebook_url} target="_blank" rel="noreferrer" className="rounded-full bg-[#1877F2] px-3 py-2 text-xs font-semibold text-white hover:opacity-90">Facebook</a> : null}
                            {company.instagram_url ? <a href={company.instagram_url} target="_blank" rel="noreferrer" className="rounded-full bg-[#E4405F] px-3 py-2 text-xs font-semibold text-white hover:opacity-90">Instagram</a> : null}
                            {company.x_url ? <a href={company.x_url} target="_blank" rel="noreferrer" className="rounded-full bg-black px-3 py-2 text-xs font-semibold text-white hover:opacity-90">X</a> : null}
                            {company.linkedin_url ? <a href={company.linkedin_url} target="_blank" rel="noreferrer" className="rounded-full bg-[#0A66C2] px-3 py-2 text-xs font-semibold text-white hover:opacity-90">LinkedIn</a> : null}
                            {company.youtube_url ? <a href={company.youtube_url} target="_blank" rel="noreferrer" className="rounded-full bg-[#FF0000] px-3 py-2 text-xs font-semibold text-white hover:opacity-90">YouTube</a> : null}
                            {company.tiktok_url ? <a href={company.tiktok_url} target="_blank" rel="noreferrer" className="rounded-full bg-[#111111] px-3 py-2 text-xs font-semibold text-white hover:opacity-90">TikTok</a> : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
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
