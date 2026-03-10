"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { submitSupportTicket } from "@/services/api";

const PROGRAM_BENEFITS = [
  "Commission-based earning opportunities on qualified sales",
  "Flexible schedule across online and field-based channels",
  "Structured onboarding and product knowledge support",
  "Growth path into senior consultant or partner roles",
];

const HOW_IT_WORKS = [
  {
    title: "1. Submit Application",
    description: "Share your background, sales strengths, and preferred market focus.",
  },
  {
    title: "2. Admin Review",
    description: "Our team reviews fit, communication quality, and role readiness.",
  },
  {
    title: "3. Onboarding",
    description: "Approved applicants receive guidance, resources, and program expectations.",
  },
  {
    title: "4. Start Selling",
    description: "Promote products, close qualified orders, and track performance.",
  },
];

export default function SalesConsultantPage() {
  const { displayName, userEmail, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone_number: "",
    location: "",
    experience: "",
    sales_channels: "",
    preferred_categories: "",
    availability: "",
    motivation: "",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      full_name: prev.full_name || (displayName && displayName !== "Account" ? displayName : ""),
      email: prev.email || userEmail || "",
    }));
  }, [displayName, userEmail]);

  const submitApplication = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const message = [
        "Sales Consultant Application",
        `Full Name: ${form.full_name.trim()}`,
        `Email: ${form.email.trim()}`,
        `Phone Number: ${form.phone_number.trim()}`,
        `Location: ${form.location.trim()}`,
        `Sales Experience: ${form.experience.trim()}`,
        `Sales Channels: ${form.sales_channels.trim()}`,
        `Preferred Categories: ${form.preferred_categories.trim()}`,
        `Availability: ${form.availability.trim()}`,
        "Motivation:",
        form.motivation.trim(),
      ].join("\n");

      await submitSupportTicket(
        {
          name: form.full_name.trim(),
          email: form.email.trim(),
          subject: `[SALES CONSULTANT APPLICATION] ${form.full_name.trim()}`,
          message,
          attachment: cvFile,
        },
        token,
      );

      setSuccess("Application submitted successfully. Our team will contact you after review.");
      setForm((prev) => ({
        ...prev,
        phone_number: "",
        location: "",
        experience: "",
        sales_channels: "",
        preferred_categories: "",
        availability: "",
        motivation: "",
      }));
      setCvFile(null);
    } catch (err: any) {
      setError(err?.message || "Unable to submit your application right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Business Growth Program</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Become a Sales Consultant</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-700">
            Join King-Kush as a sales consultant and help drive marketplace growth through product promotion,
            customer acquisition, and conversion-focused selling.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/footer-links/careers" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              View Careers
            </Link>
            <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Contact Recruitment Support
            </Link>
          </div>
        </header>

        {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
          <article className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
            <h2 className="text-lg font-bold text-gray-900">Why Join</h2>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              {PROGRAM_BENEFITS.map((benefit) => (
                <li key={benefit} className="rounded-modern border border-gray-200 px-3 py-2">
                  {benefit}
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
            <h2 className="text-lg font-bold text-gray-900">How It Works</h2>
            <div className="mt-4 space-y-3">
              {HOW_IT_WORKS.map((step) => (
                <div key={step.title} className="rounded-modern border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
                  <p className="mt-1 text-sm text-gray-700">{step.description}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <h2 className="text-lg font-bold text-gray-900">Sales Consultant Application</h2>
          <p className="mt-1 text-sm text-gray-600">
            Complete this form to apply. Submissions are sent directly for admin recruitment review.
          </p>

          <form onSubmit={submitApplication} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              required
              value={form.full_name}
              onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
              placeholder="Full Name"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Email Address"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              required
              value={form.phone_number}
              onChange={(event) => setForm((prev) => ({ ...prev, phone_number: event.target.value }))}
              placeholder="Phone Number"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              required
              value={form.location}
              onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              placeholder="City / Location"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              required
              value={form.experience}
              onChange={(event) => setForm((prev) => ({ ...prev, experience: event.target.value }))}
              placeholder="Years of Sales Experience"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              required
              value={form.sales_channels}
              onChange={(event) => setForm((prev) => ({ ...prev, sales_channels: event.target.value }))}
              placeholder="Sales Channels (online, field, social, etc.)"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={form.preferred_categories}
              onChange={(event) => setForm((prev) => ({ ...prev, preferred_categories: event.target.value }))}
              placeholder="Preferred Product Categories"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            />
            <input
              required
              value={form.availability}
              onChange={(event) => setForm((prev) => ({ ...prev, availability: event.target.value }))}
              placeholder="Availability (full-time / part-time / flexible)"
              className="rounded-modern border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            />
            <textarea
              required
              value={form.motivation}
              onChange={(event) => setForm((prev) => ({ ...prev, motivation: event.target.value }))}
              placeholder="Why do you want to become a King-Kush Sales Consultant?"
              className="min-h-32 rounded-modern border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            />
            <div className="rounded-modern border border-dashed border-gray-300 p-3 md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600">
                Optional CV upload (PDF/JPG/PNG/WEBP, max 6MB)
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(event) => setCvFile(event.target.files?.[0] || null)}
                className="mt-2 block w-full text-xs text-gray-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60 md:col-span-2"
            >
              {loading ? "Submitting..." : "Submit Consultant Application"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
