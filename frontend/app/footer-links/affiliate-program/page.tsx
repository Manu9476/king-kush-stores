"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { submitSupportTicket } from "@/services/api";

const STEPS = [
  {
    title: "1. Apply",
    description: "Submit your affiliate profile with your audience channels and promotion approach.",
  },
  {
    title: "2. Admin Review",
    description: "The King-Kush team reviews your application for quality, fit, and policy compliance.",
  },
  {
    title: "3. Get Your Referral Link",
    description: "Approved affiliates receive onboarding guidance and campaign-ready referral links.",
  },
  {
    title: "4. Promote and Earn",
    description: "Share products and campaigns. Earn commission from successful, qualified purchases.",
  },
];

const BENEFITS = [
  "Performance-based commission opportunity",
  "Priority access to campaign creatives",
  "Seasonal promotion support from King-Kush",
  "Future affiliate analytics dashboard for clicks, conversions, and earnings",
];

export default function AffiliateProgramPage() {
  const { displayName, userEmail, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    website_or_social: "",
    promotion_methods: "",
    payment_details: "",
    message: "",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || (displayName && displayName !== "Account" ? displayName : ""),
      email: prev.email || userEmail || "",
    }));
  }, [displayName, userEmail]);

  const submitApplication = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const payloadMessage = [
        "Affiliate Program Application",
        `Name: ${form.name.trim()}`,
        `Email: ${form.email.trim()}`,
        `Website/Social: ${form.website_or_social.trim() || "N/A"}`,
        `Promotion Methods: ${form.promotion_methods.trim()}`,
        `Payment Details: ${form.payment_details.trim()}`,
        `Additional Message: ${form.message.trim() || "N/A"}`,
      ].join("\n");

      await submitSupportTicket(
        {
          name: form.name.trim(),
          email: form.email.trim(),
          subject: `[AFFILIATE APPLICATION] ${form.name.trim()}`,
          message: payloadMessage,
        },
        token,
      );

      setSuccess("Application submitted. Our team will review and contact you with next steps.");
      setForm((prev) => ({
        ...prev,
        website_or_social: "",
        promotion_methods: "",
        payment_details: "",
        message: "",
      }));
    } catch (err: any) {
      setError(err?.message || "Unable to submit affiliate application right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Partnerships</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Affiliate Program</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-700">
            Partner with King-Kush to promote products and campaigns. Build a long-term affiliate business with structured
            commission opportunities and future-ready performance tools.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Partnership Support
            </Link>
            <Link href="/footer-links/terms-and-conditions" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Program Terms
            </Link>
          </div>
        </header>

        {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
            <h2 className="text-lg font-bold text-gray-900">How It Works</h2>
            <div className="mt-4 space-y-3">
              {STEPS.map((step) => (
                <div key={step.title} className="rounded-modern border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-gray-700">{step.description}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
            <h2 className="text-lg font-bold text-gray-900">Why Join</h2>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="rounded-modern border border-gray-200 px-3 py-2">
                  {benefit}
                </li>
              ))}
            </ul>

            <div className="mt-5 rounded-modern border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-wide text-primary font-semibold">Affiliate Dashboard (Roadmap)</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <span className="rounded-modern bg-white px-3 py-2 border border-primary/20">Referral Clicks</span>
                <span className="rounded-modern bg-white px-3 py-2 border border-primary/20">Conversions</span>
                <span className="rounded-modern bg-white px-3 py-2 border border-primary/20">Commission Earnings</span>
                <span className="rounded-modern bg-white px-3 py-2 border border-primary/20">Payout Tracking</span>
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <h2 className="text-lg font-bold text-gray-900">Affiliate Application Form</h2>
          <p className="mt-1 text-sm text-gray-600">Applications are reviewed by admin before approval.</p>

          <form onSubmit={submitApplication} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
              placeholder="Full Name"
            />
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
              placeholder="Email Address"
            />
            <input
              value={form.website_or_social}
              onChange={(event) => setForm((prev) => ({ ...prev, website_or_social: event.target.value }))}
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Website / Social Profile"
            />
            <textarea
              required
              value={form.promotion_methods}
              onChange={(event) => setForm((prev) => ({ ...prev, promotion_methods: event.target.value }))}
              className="min-h-28 rounded-modern border border-gray-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="How will you promote King-Kush?"
            />
            <input
              required
              value={form.payment_details}
              onChange={(event) => setForm((prev) => ({ ...prev, payment_details: event.target.value }))}
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Preferred payout details (M-Pesa number or bank details)"
            />
            <textarea
              value={form.message}
              onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
              className="min-h-24 rounded-modern border border-gray-300 px-3 py-2 text-sm md:col-span-2"
              placeholder="Additional information (optional)"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60 md:col-span-2"
            >
              {loading ? "Submitting..." : "Submit Affiliate Application"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
