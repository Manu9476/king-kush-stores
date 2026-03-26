"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PersonProfileData, getPublicCreatorDetail, getPublicTeamMemberDetail } from "../services/api";

const FALLBACK_IMAGE = "/product-placeholder.svg";

export default function PublicProfileDetailClient({ mode, slug }: { mode: "creators" | "team"; slug: string }) {
  const [item, setItem] = useState<PersonProfileData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = mode === "creators" ? await getPublicCreatorDetail(slug) : await getPublicTeamMemberDetail(slug);
        if (active) setItem(data);
      } catch (err: any) {
        if (active) setError(err?.message || "Failed to load profile.");
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [mode, slug]);

  if (error) return <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8"><div className="mx-auto max-w-4xl rounded-3xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div></main>;
  if (!item) return <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8"><div className="mx-auto max-w-4xl rounded-3xl border border-gray-200 bg-white p-6 text-gray-500">Loading profile...</div></main>;

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-5xl rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="grid gap-8 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="relative h-80 overflow-hidden rounded-3xl bg-gray-100">
            <Image src={item.profile_photo_url || FALLBACK_IMAGE} alt={item.full_name} fill className="object-cover" />
          </div>
          <div>
            <Link href={mode === "creators" ? "/creators" : "/our-team"} className="text-sm font-semibold text-primary">Back</Link>
            <h1 className="mt-3 text-4xl font-black text-gray-900">{item.full_name}</h1>
            <p className="mt-2 text-lg font-semibold text-primary">{item.role_title}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {item.departments.map((dept) => <span key={dept.id} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{dept.name}</span>)}
            </div>
            <p className="mt-5 text-sm leading-7 text-gray-600">{item.bio || "Profile details coming soon."}</p>
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {item.email ? <p className="text-sm text-gray-700"><strong>Email:</strong> {item.email}</p> : null}
              {item.phone_number ? <p className="text-sm text-gray-700"><strong>Phone:</strong> {item.phone_number}</p> : null}
              {item.portfolio_url ? <p className="text-sm text-gray-700"><strong>Website:</strong> <a href={item.portfolio_url} className="text-primary" target="_blank" rel="noreferrer">{item.portfolio_url}</a></p> : null}
              {item.joining_date ? <p className="text-sm text-gray-700"><strong>Joined:</strong> {item.joining_date}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
