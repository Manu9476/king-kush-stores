"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { submitSupportTicket } from "@/services/api";

const REPORT_REASONS = [
  "Counterfeit product",
  "Misleading description",
  "Prohibited item",
  "Inappropriate content",
  "Pricing manipulation",
  "Other policy concern",
];

export default function ReportProductPage() {
  const { userEmail, displayName, token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    product_reference: "",
    reason: "",
    description: "",
    reporter_email: "",
  });
  const [screenshot, setScreenshot] = useState<File | null>(null);

  useEffect(() => {
    setForm((prev) => ({ ...prev, reporter_email: prev.reporter_email || userEmail || "" }));
  }, [userEmail]);

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const reporterName = displayName && displayName !== "Account" ? displayName : "Customer";
      const body = [
        "Product Moderation Report",
        `Reporter Name: ${reporterName}`,
        `Reporter Email: ${form.reporter_email.trim()}`,
        `Product Reference: ${form.product_reference.trim()}`,
        `Reason: ${form.reason}`,
        "Issue Details:",
        form.description.trim(),
      ].join("\n");

      await submitSupportTicket(
        {
          name: reporterName,
          email: form.reporter_email.trim(),
          subject: `[PRODUCT REPORT] ${form.reason} - ${form.product_reference.trim()}`,
          message: body,
          attachment: screenshot,
        },
        token,
      );

      setSuccess("Product report submitted. Our moderation team will review and take action.");
      setForm({
        product_reference: "",
        reason: "",
        description: "",
        reporter_email: form.reporter_email,
      });
      setScreenshot(null);
    } catch (err: any) {
      setError(err?.message || "Unable to submit report at the moment.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Safety & Moderation</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Report a Product</h1>
          <p className="mt-2 text-sm text-gray-700">
            Report suspicious or policy-violating listings. Submissions are routed to admin moderation for review and resolution.
          </p>
        </header>

        {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <section className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <form onSubmit={submitReport} className="space-y-3">
            <input
              required
              value={form.product_reference}
              onChange={(event) => setForm((prev) => ({ ...prev, product_reference: event.target.value }))}
              placeholder="Product URL, slug, or ID"
              className="w-full rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              required
              value={form.reason}
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
              className="w-full rounded-modern border border-gray-300 px-3 py-2 text-sm bg-white"
            >
              <option value="">Select reason</option>
              {REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <textarea
              required
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Describe the issue in detail"
              className="min-h-32 w-full rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              required
              type="email"
              value={form.reporter_email}
              onChange={(event) => setForm((prev) => ({ ...prev, reporter_email: event.target.value }))}
              placeholder="Reporter email"
              className="w-full rounded-modern border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="rounded-modern border border-dashed border-gray-300 p-3">
              <label className="block text-xs font-semibold text-gray-600">Optional screenshot (JPG, PNG, WEBP, PDF up to 6MB)</label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(event) => setScreenshot(event.target.files?.[0] || null)}
                className="mt-2 block w-full text-xs text-gray-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-modern bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {loading ? "Submitting Report..." : "Submit Product Report"}
            </button>
          </form>
        </section>

        <section className="rounded-modern border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-800">After You Submit</h2>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            <li>Moderation reviews your report and evidence.</li>
            <li>Admins can mark reports resolved or in progress.</li>
            <li>Policy action may include listing removal or vendor enforcement.</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/footer-links/help-center" className="rounded-modern border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800">
              Help Center
            </Link>
            <Link href="/footer-links/contact-us" className="rounded-modern border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800">
              Contact Support
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
