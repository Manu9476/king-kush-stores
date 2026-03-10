"use client";

import { useState } from "react";
import Link from "next/link";

const LAST_UPDATED = "March 9, 2026";

const SECTIONS = [
  {
    title: "Platform Usage Rules",
    content:
      "Users must use King-Kush lawfully and responsibly. Fraudulent activity, abuse, malicious automation, and policy circumvention are prohibited.",
  },
  {
    title: "User Accounts",
    content:
      "You are responsible for accurate registration details and account security. Do not share passwords or authentication credentials with third parties.",
  },
  {
    title: "Vendor Responsibilities",
    content:
      "Vendors must publish accurate listings, maintain policy compliance, fulfill confirmed orders, and respond to customer support requests in a timely manner.",
  },
  {
    title: "Orders and Payments",
    content:
      "Orders are confirmed after payment verification. Platform payment controls and payout rules govern settlement to vendors and handling of exceptional cases.",
  },
  {
    title: "Returns and Refunds",
    content:
      "Return and refund eligibility follows platform policy. Approved cases are processed according to order status, payment state, and applicable marketplace rules.",
  },
  {
    title: "Intellectual Property",
    content:
      "Platform content, brand assets, and system design elements are protected. Unauthorized use, copying, or redistribution without consent is restricted.",
  },
  {
    title: "Limitation of Liability",
    content:
      "King-Kush provides marketplace infrastructure and applies operational controls, but liability is limited to the extent permitted by applicable law.",
  },
  {
    title: "Policy Updates",
    content:
      "Terms may be updated periodically to reflect operational, legal, and platform changes. Continued usage after updates indicates acceptance of revised terms.",
  },
];

export default function TermsAndConditionsPage() {
  const [openIndex, setOpenIndex] = useState<number>(0);

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Legal</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Terms and Conditions</h1>
          <p className="mt-2 text-sm text-gray-700">Last updated: {LAST_UPDATED}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/footer-links/privacy-notice" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Privacy Notice
            </Link>
            <Link href="/footer-links/returns-policy" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Returns Policy
            </Link>
            <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Contact Support
            </Link>
          </div>
        </header>

        <section className="rounded-modern border border-gray-100 bg-white p-3 shadow-modern sm:p-5">
          <div className="space-y-2">
            {SECTIONS.map((section, index) => {
              const isOpen = openIndex === index;
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
                  {isOpen ? <p className="border-t border-gray-200 px-4 py-3 text-sm text-gray-700">{section.content}</p> : null}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
