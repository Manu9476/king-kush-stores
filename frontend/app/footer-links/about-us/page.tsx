import Link from "next/link";

const DIFFERENTIATORS = [
  {
    title: "Verified Marketplace Sellers",
    description: "Vendor onboarding is reviewed to improve trust, catalog quality, and customer confidence.",
  },
  {
    title: "Secure Platform Payments",
    description: "Transactions are processed through King-Kush payment controls before vendor payouts are released.",
  },
  {
    title: "Customer Protection Standards",
    description: "Support, refund handling, and policy enforcement are structured to protect buyers and sellers.",
  },
  {
    title: "Wide Product Selection",
    description: "Customers can discover products from multiple vendors in one organized marketplace experience.",
  },
];

export default function AboutUsPage() {
  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Company</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">About King-Kush</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-700">
            King-Kush is a multi-vendor commerce platform built to connect reliable sellers with customers through a secure,
            scalable, and high-quality marketplace experience.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <article className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern lg:col-span-2">
            <h2 className="text-lg font-bold text-gray-900">Our Story</h2>
            <p className="mt-2 text-sm text-gray-700">
              King-Kush started as a focused effort to build a modern marketplace that is easier to trust, easier to manage,
              and easier to scale. We designed the platform around real marketplace operations: customer support workflows,
              vendor controls, secure payments, and accountable admin governance.
            </p>
            <h2 className="mt-6 text-lg font-bold text-gray-900">What King-Kush Does</h2>
            <p className="mt-2 text-sm text-gray-700">
              We provide an integrated platform where customers browse and buy across multiple stores, vendors manage products
              and order fulfillment, and platform teams coordinate quality, payments, support, and growth from structured dashboards.
            </p>
          </article>

          <article className="rounded-modern border border-primary/20 bg-primary/5 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-primary">Our Vision</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              <li>Empower businesses of all sizes to sell confidently online.</li>
              <li>Connect vendors to customers through trusted commerce infrastructure.</li>
              <li>Build a long-term marketplace brand known for reliability and service.</li>
            </ul>
            <p className="mt-4 text-xs text-gray-600">
              Regional growth remains part of our roadmap, including expansion support for more countries over time.
            </p>
          </article>
        </section>

        <section className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <h2 className="text-lg font-bold text-gray-900">What Makes Us Different</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {DIFFERENTIATORS.map((item) => (
              <article key={item.title} className="rounded-modern border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-1 text-sm text-gray-700">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <h2 className="text-lg font-bold text-gray-900">Build with King-Kush</h2>
          <p className="mt-2 text-sm text-gray-700">
            Explore careers, vendor opportunities, and strategic partnerships designed for long-term growth.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/footer-links/careers" className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
              View Careers
            </Link>
            <Link href="/footer-links/sell" className="rounded-modern border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Become a Vendor
            </Link>
            <Link href="/footer-links/affiliate-program" className="rounded-modern border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Join Affiliate Program
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
