"use client";

import Link from "next/link";

const partnershipHighlights = [
  {
    title: "City Launch Ownership",
    description: "Lead marketplace rollout, local vendor growth, and customer activation in your city.",
  },
  {
    title: "Operational Support",
    description: "Work with the King-Kush platform, brand systems, and support processes from day one.",
  },
  {
    title: "Revenue Opportunity",
    description: "Build a structured local commerce operation with scalable commercial upside.",
  },
  {
    title: "Regional Expansion",
    description: "Grow from one city into a stronger regional footprint as performance improves.",
  },
];

const responsibilities = [
  "Drive local merchant and vendor onboarding",
  "Coordinate delivery, pickup, and fulfillment standards",
  "Support customer service escalation in your city",
  "Grow awareness through field marketing and partnerships",
  "Maintain service quality and marketplace trust",
];

const idealProfile = [
  "Strong understanding of the local city market",
  "Experience in operations, business development, or logistics",
  "Ability to build teams and manage field execution",
  "Clear communication and commercial discipline",
  "Commitment to brand quality and customer experience",
];

export default function CityPartnerPage() {
  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="p-8 md:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Expansion Program
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-gray-900 md:text-5xl">
                Become a City Partner
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
                Help bring King-Kush to new markets by leading city-level growth, operations, and marketplace
                coordination. This program is designed for operators who can build trusted local execution around a
                modern commerce platform.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {partnershipHighlights.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <h2 className="text-sm font-bold text-gray-900">{item.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/footer-links/careers"
                  className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-hover"
                >
                  View Career Opportunities
                </Link>
                <Link
                  href="/footer-links/contact-us"
                  className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Contact the Team
                </Link>
              </div>
            </div>

            <div className="border-t border-gray-100 bg-gray-50 p-8 lg:border-l lg:border-t-0 lg:p-10">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Program Snapshot</p>
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Role Focus</p>
                    <p className="mt-1 text-sm text-gray-600">City operations, local growth, partner management</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Best Fit</p>
                    <p className="mt-1 text-sm text-gray-600">Entrepreneurs and operators with local market reach</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Support Model</p>
                    <p className="mt-1 text-sm text-gray-600">Brand systems, onboarding guidance, and operational structure</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Application Path</p>
                    <p className="mt-1 text-sm text-gray-600">Careers review, partner discussion, rollout planning</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900">What City Partners Handle</h2>
            <div className="mt-5 space-y-3">
              {responsibilities.map((item) => (
                <div key={item} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  {item}
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-black text-gray-900">Who We Are Looking For</h2>
            <div className="mt-5 space-y-3">
              {idealProfile.map((item) => (
                <div key={item} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  {item}
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Next Step</p>
              <h2 className="mt-2 text-2xl font-black text-gray-900">Apply Through the King-Kush Careers Channel</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                If you are interested in becoming a city partner, start with the careers page and watch for partner,
                expansion, or city operations opportunities. If you need help before applying, contact the team directly.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/footer-links/careers"
                className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Go to Careers
              </Link>
              <Link
                href="/footer-links/about-us"
                className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Learn About King-Kush
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
