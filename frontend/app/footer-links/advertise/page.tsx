"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../../src/context/AuthContext";
import {
  AdvertisingPlacement,
  CreateAdvertisingRequestPayload,
  getAdvertisingPublicData,
  submitAdvertisingRequest,
} from "../../../src/services/api";

const FAQ_ITEMS = [
  {
    question: "How long does campaign review take?",
    answer: "Most submissions are reviewed within 1 to 2 business days. High-demand periods may take slightly longer.",
  },
  {
    question: "Can vendors sponsor their own products?",
    answer: "Yes. Vendors can request sponsored placements through this form. All campaigns must pass admin review.",
  },
  {
    question: "Do ads go live automatically after submission?",
    answer: "No. Every campaign goes through quality and policy checks before approval and scheduling.",
  },
  {
    question: "Can campaigns run for specific product categories?",
    answer: "Yes. Category and context targeting are supported for relevant placements.",
  },
];

function humanizePlacementKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function AdvertisePage() {
  const { token, isAuthenticated, userRole, displayName, userEmail } = useAuth();
  const [placements, setPlacements] = useState<AdvertisingPlacement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const [form, setForm] = useState<CreateAdvertisingRequestPayload>({
    full_name: displayName || "",
    company_name: "",
    email: userEmail || "",
    phone_number: "",
    business_type: userRole === "vendor" ? "vendor" : "brand",
    ad_objective: "",
    preferred_placement_id: null,
    campaign_duration: "",
    budget_range: "",
    message: "",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      full_name: prev.full_name || displayName || "",
      email: prev.email || userEmail || "",
      business_type: userRole === "vendor" ? "vendor" : prev.business_type,
    }));
  }, [displayName, userEmail, userRole]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getAdvertisingPublicData();
        if (!mounted) return;
        setPlacements(data.placements || []);
      } catch {
        if (!mounted) return;
        setPlacements([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const placementCards = useMemo(
    () =>
      placements.map((placement) => ({
        ...placement,
        sizeHint: `${placement.default_image_width}x${placement.default_image_height}`,
      })),
    [placements],
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");
    setSuccess("");
    if (!form.full_name.trim() || !form.email.trim() || !form.ad_objective.trim()) {
      setSubmitError("Full name, email, and ad objective are required.");
      return;
    }
    if (!form.campaign_duration.trim() || !form.budget_range.trim()) {
      setSubmitError("Please provide campaign duration and budget range.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await submitAdvertisingRequest(
        {
          ...form,
          full_name: form.full_name.trim(),
          company_name: form.company_name?.trim() || "",
          email: form.email.trim(),
          phone_number: form.phone_number?.trim() || "",
          ad_objective: form.ad_objective.trim(),
          campaign_duration: form.campaign_duration.trim(),
          budget_range: form.budget_range.trim(),
          message: form.message?.trim() || "",
        },
        token,
      );
      setSuccess(response.detail);
      setForm((prev) => ({
        ...prev,
        company_name: "",
        phone_number: "",
        ad_objective: "",
        preferred_placement_id: null,
        campaign_duration: "",
        budget_range: "",
        message: "",
      }));
    } catch (error: any) {
      setSubmitError(error?.message || "Failed to submit advertising request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <section className="bg-primary px-4 py-14 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-200">King-Kush Advertising Network</p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">Advertise with King-Kush</h1>
          <p className="mt-4 max-w-3xl text-base text-blue-100">
            Launch sponsored campaigns, category placements, and brand promotions with controlled visibility, clean layouts,
            and measurable performance.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="#advertiser-form" className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-primary hover:bg-blue-100">
              Start Campaign Inquiry
            </a>
            <Link href="/footer-links/contact-us" className="rounded-xl border border-blue-300 px-5 py-3 text-sm font-bold text-white hover:bg-blue-900/50">
              Contact Marketing Team
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl space-y-6 px-4">
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900">Advertising Opportunities</h2>
            <p className="mt-2 text-sm text-gray-600">
              Use marketplace placements for broad reach or targeted category discovery. All ads are screened for quality and compliance.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              <li>Homepage hero banners and promotional strips</li>
              <li>Category and search result campaign banners</li>
              <li>Sponsored product-grid cards and dashboard placements</li>
              <li>Announcement bars and footer campaign spots</li>
            </ul>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900">Pricing & Commercial Model</h2>
            <p className="mt-2 text-sm text-gray-600">Campaign pricing depends on placement type, duration, and targeting scope.</p>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Contact for pricing and custom plans.</p>
              <p className="mt-1 text-xs text-blue-800">
                Includes sponsored products, seasonal campaigns, flash-sale pushes, vendor spotlight programs, and homepage takeovers.
              </p>
            </div>
          </article>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-gray-900">Placement Inventory</h2>
          <p className="mt-1 text-sm text-gray-600">
            Campaigns are delivered only in predefined placement components to preserve layout consistency and browsing quality.
          </p>
          {loading ? (
            <p className="mt-4 text-sm text-gray-500">Loading placement options...</p>
          ) : placementCards.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">Placement options are being prepared. You can still submit an inquiry below.</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {placementCards.map((placement) => (
                <article key={placement.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-900">{placement.name || humanizePlacementKey(placement.key)}</p>
                  <p className="mt-1 text-xs text-gray-600">{placement.description || "Standardized slot placement."}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                    <span>Max per page: {placement.max_ads_per_page}</span>
                    <span>Size: {placement.sizeHint}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="advertiser-form" className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-gray-900">Advertiser Inquiry Form</h2>
          <p className="mt-1 text-sm text-gray-600">
            Submit your campaign request. Our team will review, advise on placements, and schedule approved campaigns.
          </p>

          {submitError ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div> : null}
          {success ? <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}

          <form onSubmit={onSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Full Name *</label>
              <input
                value={form.full_name}
                onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Company / Brand Name</label>
              <input
                value={form.company_name}
                onChange={(event) => setForm((prev) => ({ ...prev, company_name: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Phone Number</label>
              <input
                value={form.phone_number}
                onChange={(event) => setForm((prev) => ({ ...prev, phone_number: event.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Business Type *</label>
              <select
                value={form.business_type}
                onChange={(event) => setForm((prev) => ({ ...prev, business_type: event.target.value as CreateAdvertisingRequestPayload["business_type"] }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="vendor">Vendor</option>
                <option value="brand">Brand</option>
                <option value="agency">Agency</option>
                <option value="platform">Platform Promotion</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Ad Objective *</label>
              <input
                value={form.ad_objective}
                onChange={(event) => setForm((prev) => ({ ...prev, ad_objective: event.target.value }))}
                placeholder="Brand awareness, sales conversion, product launch..."
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Preferred Placement</label>
              <select
                value={form.preferred_placement_id || ""}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    preferred_placement_id: event.target.value ? Number(event.target.value) : null,
                  }))
                }
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select placement</option>
                {placements.map((placement) => (
                  <option key={placement.id} value={placement.id}>
                    {placement.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">Campaign Duration *</label>
              <input
                value={form.campaign_duration}
                onChange={(event) => setForm((prev) => ({ ...prev, campaign_duration: event.target.value }))}
                placeholder="e.g., 2 weeks, 1 month"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-gray-700">Budget Range *</label>
              <input
                value={form.budget_range}
                onChange={(event) => setForm((prev) => ({ ...prev, budget_range: event.target.value }))}
                placeholder="e.g., KES 50,000 - KES 100,000"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-gray-700">Campaign Message / Description</label>
              <textarea
                value={form.message}
                onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                rows={5}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="md:col-span-2 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                All campaigns are reviewed for quality, relevance, and policy compliance before going live.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit Advertising Request"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-gray-900">Advertiser FAQs</h2>
          <div className="mt-4 divide-y divide-gray-100">
            {FAQ_ITEMS.map((item, index) => (
              <article key={item.question} className="py-3">
                <button
                  type="button"
                  onClick={() => setOpenFaq((prev) => (prev === index ? null : index))}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="text-sm font-semibold text-gray-900">{item.question}</span>
                  <span className="text-xs text-gray-500">{openFaq === index ? "Hide" : "Show"}</span>
                </button>
                {openFaq === index ? <p className="mt-2 text-sm text-gray-600">{item.answer}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="text-sm font-bold text-emerald-900">Internal Promotions on the Same System</h3>
          <p className="mt-1 text-sm text-emerald-800">
            King-Kush marketing campaigns such as flash sales, seasonal offers, new arrivals, Black Friday, and vendor spotlights are
            managed through the same approval and scheduling pipeline for consistency and performance tracking.
          </p>
          {!isAuthenticated ? (
            <p className="mt-2 text-xs text-emerald-700">
              Sign in to streamline submissions and link requests to your account history.
            </p>
          ) : null}
        </section>
      </section>
    </main>
  );
}
