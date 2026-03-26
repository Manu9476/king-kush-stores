import Link from "next/link";

interface ComingSoonBannerProps {
  country: string;
}

const launchSignals = [
  {
    title: "Vendor Readiness",
    description: "We are preparing reliable seller onboarding and marketplace standards for launch.",
  },
  {
    title: "Delivery Coverage",
    description: "Logistics, pickup flow, and customer fulfillment planning are being mapped for each market.",
  },
  {
    title: "Support Operations",
    description: "Customer care, escalation flow, and launch support are being structured before rollout.",
  },
];

export default function ComingSoonBanner({ country }: ComingSoonBannerProps) {
  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-8 md:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                International Expansion
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-tight text-gray-900 md:text-5xl">
                King-Kush in {country}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-gray-600">
                We are preparing a structured launch plan for {country}, with focus on marketplace quality, trusted
                vendors, operations, and customer experience. This page will be updated as rollout plans become ready.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/footer-links/contact-us"
                  className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-hover"
                >
                  Contact the Team
                </Link>
                <Link
                  href="/footer-links/sell"
                  className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Explore Seller Opportunities
                </Link>
              </div>
            </div>

            <div className="border-t border-gray-100 bg-gray-50 p-8 lg:border-l lg:border-t-0 lg:p-10">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Launch Status</p>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-linear-to-r from-amber-50 via-yellow-50 to-amber-100 px-4 py-4 shadow-[0_0_24px_rgba(251,191,36,0.35)]">
                  <p className="text-sm font-bold text-amber-900 drop-shadow-[0_0_10px_rgba(251,191,36,0.55)]">
                    Coming Soon
                  </p>
                  <p className="mt-1 text-sm leading-6 text-amber-800 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)]">
                    Expansion planning for {country} is active, but the marketplace is not live there yet.
                  </p>
                </div>
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-sm font-bold text-gray-900">Current Focus</p>
                    <p className="mt-1 text-sm text-gray-600">Market readiness, logistics planning, and partner evaluation</p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">Next Update</p>
                    <p className="mt-1 text-sm text-gray-600">Launch milestones and partnership details will appear here</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {launchSignals.map((item) => (
            <article key={item.title} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-gray-900">{item.title}</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">{item.description}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Stay Connected</p>
              <h2 className="mt-2 text-2xl font-black text-gray-900">Interested in King-Kush launching in {country}?</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
                Reach out through our contact channels if you want to partner, sell, or follow launch progress for this market.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/footer-links/contact-us"
                className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Contact Us
              </Link>
              <Link
                href="/footer-links/about-us"
                className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                About King-Kush
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
