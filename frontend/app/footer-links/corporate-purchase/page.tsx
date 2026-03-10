"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../src/context/AuthContext";
import { submitSupportTicket } from "../../../src/services/api";

export default function CorporatePurchasePage() {
  const { token, userEmail, displayName } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [form, setForm] = useState({
    companyName: "",
    businessEmail: "",
    contactPhone: "",
    details: "",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      businessEmail: prev.businessEmail || userEmail || "",
      companyName: prev.companyName || (displayName && displayName !== "Account" ? `${displayName} Business` : ""),
    }));
  }, [displayName, userEmail]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    setTicketId(null);
    try {
      const response = await submitSupportTicket(
        {
          name: form.companyName.trim() || "Corporate Buyer",
          email: form.businessEmail.trim(),
          subject: "Corporate & Bulk Purchase Request",
          message: [
            `Company Name: ${form.companyName.trim()}`,
            `Business Email: ${form.businessEmail.trim()}`,
            `Contact Phone: ${form.contactPhone.trim()}`,
            "",
            "Order Details:",
            form.details.trim(),
          ].join("\n"),
        },
        token,
      );
      setTicketId(response.id);
      setSuccess("Your bulk purchase request has been submitted successfully.");
      setForm((prev) => ({ ...prev, contactPhone: "", details: "" }));
    } catch (err: any) {
      setError(err?.message || "Unable to submit request right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Business Services</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Corporate & Bulk Purchases</h1>
          <p className="mt-1 text-sm text-gray-600">
            Get structured pricing, reliable fulfillment, and dedicated support for business orders.
          </p>
        </header>

        {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? (
          <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success} {ticketId ? `Request ID #${ticketId}.` : ""}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-modern bg-white p-5 shadow-modern sm:p-6">
            <h2 className="text-lg font-bold text-gray-900">Request a Quote</h2>
            <p className="mt-1 text-xs text-gray-500">
              Submit your requirements and our team will respond with pricing, timelines, and next steps.
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(event) => setForm((prev) => ({ ...prev, companyName: event.target.value }))}
                  placeholder="Company Name"
                  className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                  required
                />
                <input
                  type="email"
                  value={form.businessEmail}
                  onChange={(event) => setForm((prev) => ({ ...prev, businessEmail: event.target.value }))}
                  placeholder="Business Email"
                  className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                  required
                />
              </div>

              <input
                type="tel"
                value={form.contactPhone}
                onChange={(event) => setForm((prev) => ({ ...prev, contactPhone: event.target.value }))}
                placeholder="Contact Phone"
                className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                required
              />

              <textarea
                value={form.details}
                onChange={(event) => setForm((prev) => ({ ...prev, details: event.target.value }))}
                rows={7}
                placeholder="Describe products, quantities, delivery location, and preferred timeline."
                className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                required
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Submitting..." : "Submit Corporate Request"}
              </button>
            </form>
          </section>

          <section className="space-y-4">
            <div className="rounded-modern bg-white p-6 shadow-modern">
              <h2 className="text-lg font-bold text-gray-900">Why Buy in Bulk</h2>
              <ul className="mt-3 space-y-3 text-sm text-gray-700">
                <li className="rounded-modern border border-gray-100 bg-gray-50 px-3 py-2">
                  <strong>Volume Discounts:</strong> Better pricing tiers based on quantity.
                </li>
                <li className="rounded-modern border border-gray-100 bg-gray-50 px-3 py-2">
                  <strong>Priority Support:</strong> Dedicated handling for business orders.
                </li>
                <li className="rounded-modern border border-gray-100 bg-gray-50 px-3 py-2">
                  <strong>Flexible Fulfillment:</strong> Coordinated delivery windows for teams and projects.
                </li>
                <li className="rounded-modern border border-gray-100 bg-gray-50 px-3 py-2">
                  <strong>Structured Payments:</strong> Secure payment methods suitable for corporate workflows.
                </li>
              </ul>
            </div>

            <div className="rounded-modern border border-primary/20 bg-primary/5 p-6">
              <h3 className="text-sm font-bold text-primary">Response SLA</h3>
              <p className="mt-2 text-sm text-gray-700">
                We typically respond to corporate and bulk requests within one business day.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

