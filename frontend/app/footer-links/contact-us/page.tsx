"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../src/context/AuthContext";
import { submitSupportTicket } from "../../../src/services/api";

const SUPPORT_EMAIL = "emmanuelmacharia408@gmail.com";
const SUPPORT_PHONE = "0701137747";

export default function ContactUsPage() {
  const { token, userEmail, displayName } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: prev.name || (displayName && displayName !== "Account" ? displayName : ""),
      email: prev.email || userEmail || "",
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
          name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject.trim(),
          message: form.message.trim(),
        },
        token,
      );
      setSuccess(response.detail);
      setTicketId(response.id);
      setForm((prev) => ({ ...prev, subject: "", message: "" }));
    } catch (err: any) {
      setError(err?.message || "Unable to send your request right now.");
    } finally {
      setLoading(false);
    }
  };

  const copySupportEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 1800);
    } catch {
      setEmailCopied(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Support</p>
          <h1 className="text-h2 font-heading font-bold text-primary mt-1">Contact Us</h1>
          <p className="text-sm text-gray-600 mt-1">
            Submit your support request and our team will respond as soon as possible.
          </p>
        </header>

        {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? (
          <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success} {ticketId ? `Ticket #${ticketId}.` : ""}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-modern bg-white p-6 shadow-modern">
            <h2 className="text-lg font-bold text-gray-900">Send Us a Message</h2>
            <p className="text-xs text-gray-500 mt-1">Your request is routed to the admin support panel for review and response.</p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Full Name"
                className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                required
              />
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email Address"
                className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                required
              />
              <input
                value={form.subject}
                onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                placeholder="Subject"
                className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                required
              />
              <textarea
                value={form.message}
                onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                placeholder="Tell us what you need help with..."
                className="min-h-40 w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover transition-colors disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Sending..." : "Submit Support Request"}
              </button>
            </form>
          </section>

          <section className="space-y-4">
            <div className="rounded-modern bg-white p-6 shadow-modern">
              <h2 className="text-lg font-bold text-gray-900">Official Support Contacts</h2>
              <div className="mt-4 space-y-3">
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="block rounded-modern border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  Email: {SUPPORT_EMAIL}
                </a>
                <a
                  href={`tel:${SUPPORT_PHONE}`}
                  className="block rounded-modern border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
                >
                  Phone: {SUPPORT_PHONE}
                </a>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-modern border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    Open Gmail
                  </a>
                  <button
                    type="button"
                    onClick={copySupportEmail}
                    className="rounded-modern border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    {emailCopied ? "Email Copied" : "Copy Email"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-modern border border-primary/20 bg-primary/5 p-6">
              <h3 className="text-sm font-bold text-primary">Before submitting</h3>
              <ul className="mt-2 space-y-2 text-sm text-gray-700">
                <li>Check the Help Center for quick answers.</li>
                <li>Include order number for order-related issues.</li>
                <li>Describe your issue clearly for faster resolution.</li>
              </ul>
              <Link
                href="/footer-links/help-center"
                className="mt-4 inline-flex rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors"
              >
                Open Help Center
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
