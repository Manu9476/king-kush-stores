import Link from "next/link";

const SUPPORT_EMAIL = "emmanuelmacharia408@gmail.com";
const SUPPORT_PHONE = "0701137747";

const PROCESS_STEPS: Array<{
  step: string;
  title: string;
  description: string;
  timeline: string;
}> = [
  {
    step: "Step 1",
    title: "Contact Support First",
    description:
      "Open a support request with your order number, product details, and a clear description of the issue. Most cases are resolved at this stage.",
    timeline: "Within 24 hours",
  },
  {
    step: "Step 2",
    title: "Formal Dispute Review",
    description:
      "If unresolved, your case is escalated for formal review by the support lead with complete evidence and vendor response checks.",
    timeline: "Within 3 business days",
  },
  {
    step: "Step 3",
    title: "Mediation",
    description:
      "Where needed, both sides are guided through a structured mediation process to reach a fair and practical resolution.",
    timeline: "Case dependent",
  },
  {
    step: "Step 4",
    title: "Final Escalation",
    description:
      "If mediation fails, the final resolution path follows applicable laws and platform policy obligations for both parties.",
    timeline: "As required by case",
  },
];

const EVIDENCE_CHECKLIST = [
  "Order number and purchase date",
  "Product name, quantity, and expected outcome",
  "Images/video proof where applicable",
  "Communication records with vendor or support",
  "Specific requested resolution (refund, replacement, or clarification)",
];

export default function DisputeResolutionPage() {
  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Policy</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Dispute Resolution Policy</h1>
          <p className="mt-1 text-sm text-gray-600">
            King-Kush uses a clear and fair process to resolve customer-vendor disputes with accountability and documented review.
          </p>
        </header>

        <section className="rounded-modern bg-white p-6 shadow-modern">
          <h2 className="text-lg font-bold text-gray-900">Resolution Process</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {PROCESS_STEPS.map((entry) => (
              <article key={entry.step} className="rounded-modern border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">{entry.step}</p>
                <h3 className="mt-1 text-base font-bold text-gray-900">{entry.title}</h3>
                <p className="mt-2 text-sm text-gray-700">{entry.description}</p>
                <p className="mt-2 text-xs font-semibold text-gray-600">Typical timeline: {entry.timeline}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-modern bg-white p-6 shadow-modern">
            <h2 className="text-lg font-bold text-gray-900">What to Include in a Dispute</h2>
            <ul className="mt-3 space-y-2 text-sm text-gray-700">
              {EVIDENCE_CHECKLIST.map((item) => (
                <li key={item} className="rounded-modern border border-gray-100 bg-gray-50 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-gray-500">
              Incomplete evidence can delay case handling. Provide specific and verifiable information.
            </p>
          </article>

          <article className="rounded-modern border border-primary/20 bg-primary/5 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-primary">Start or Escalate a Case</h2>
            <div className="mt-3 space-y-2 text-sm text-gray-700">
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="block rounded-modern border border-gray-200 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100"
              >
                Email: {SUPPORT_EMAIL}
              </a>
              <a
                href={`tel:${SUPPORT_PHONE}`}
                className="block rounded-modern border border-gray-200 bg-white px-3 py-2 font-semibold text-gray-800 hover:bg-gray-100"
              >
                Phone: {SUPPORT_PHONE}
              </a>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/footer-links/contact-us" className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                Submit Support Request
              </Link>
              <Link href="/footer-links/report-product" className="rounded-modern border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                Report Product
              </Link>
            </div>
          </article>
        </section>

        <section className="rounded-modern bg-white p-6 shadow-modern">
          <h2 className="text-lg font-bold text-gray-900">Policy Notes</h2>
          <div className="mt-3 space-y-2 text-sm text-gray-700">
            <p>Disputes are reviewed based on order records, payment confirmation, communication logs, and provided evidence.</p>
            <p>Resolution options may include refund, replacement, correction, or dispute rejection where claims are not supported.</p>
            <p>Policy terms may be updated periodically to improve customer protection and vendor accountability.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/footer-links/return-policy" className="rounded-modern border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Return Policy
            </Link>
            <Link href="/footer-links/help-center" className="rounded-modern border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Help Center
            </Link>
            <Link href="/footer-links/terms-and-conditions" className="rounded-modern border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Terms & Conditions
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
