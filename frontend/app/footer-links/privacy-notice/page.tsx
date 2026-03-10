"use client";

import { useState } from "react";
import Link from "next/link";

const LAST_UPDATED = "March 9, 2026";

const PRIVACY_SECTIONS = [
  {
    title: "Information We Collect",
    points: [
      "Account profile data such as name, email, phone, and account role.",
      "Order, shipping, and transaction records needed to deliver services.",
      "Customer support and platform interaction data for service quality and safety.",
    ],
  },
  {
    title: "How We Use Information",
    points: [
      "Process orders, verify payments, and coordinate delivery workflows.",
      "Provide account support, dispute handling, and service communications.",
      "Improve platform performance, reliability, and user experience.",
    ],
  },
  {
    title: "Data Protection",
    points: [
      "Operational and technical controls are used to protect account and transaction data.",
      "Access to sensitive operational data is restricted by role-based permissions.",
      "Critical data such as full card details and passwords are never exposed in plain form.",
    ],
  },
  {
    title: "Third-Party Services",
    points: [
      "Payment providers and logistics partners may process limited data required for operations.",
      "Service providers are selected with security and compliance expectations.",
      "Third-party processing is limited to legitimate platform functions.",
    ],
  },
  {
    title: "User Rights",
    points: [
      "You can request profile updates, corrections, or account assistance through support.",
      "You may request data access or deletion subject to legal and operational requirements.",
      "Privacy-related requests are handled through the Contact Us and support channels.",
    ],
  },
  {
    title: "Cookies and Tracking",
    points: [
      "Cookies are used for authentication, session continuity, and product experience improvements.",
      "Analytics and usage insights may be applied to improve marketplace performance.",
      "See the Cookies Notice for detailed control and usage information.",
    ],
  },
];

export default function PrivacyNoticePage() {
  const [openIndex, setOpenIndex] = useState<number>(0);

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Legal</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Privacy Notice</h1>
          <p className="mt-2 text-sm text-gray-700">Last updated: {LAST_UPDATED}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/footer-links/cookies-notice" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Cookies Notice
            </Link>
            <Link href="/footer-links/terms-and-conditions" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Terms & Conditions
            </Link>
            <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Privacy Support
            </Link>
          </div>
        </header>

        <section className="rounded-modern border border-gray-100 bg-white p-3 shadow-modern sm:p-5">
          <div className="space-y-2">
            {PRIVACY_SECTIONS.map((section, index) => {
              const isOpen = index === openIndex;
              return (
                <article key={section.title} className="rounded-modern border border-gray-200">
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? -1 : index)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-sm font-semibold text-gray-900">{section.title}</span>
                    <span className="text-primary font-bold">{isOpen ? "-" : "+"}</span>
                  </button>
                  {isOpen ? (
                    <ul className="border-t border-gray-200 px-4 py-3 text-sm text-gray-700 space-y-2">
                      {section.points.map((point) => (
                        <li key={point} className="list-disc ml-4">
                          {point}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
