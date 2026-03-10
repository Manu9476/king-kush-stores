"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const methods = [
  {
    title: "M-Pesa",
    details: "Pay securely through STK push during checkout. Confirm the prompt on your phone to complete payment.",
    notes: ["Use an active Safaricom line.", "Enter your phone number in valid local format.", "Keep your line unlocked while waiting for prompt."],
  },
  {
    title: "Card Payment",
    details: "Card support is being expanded for broader checkout coverage. Saved card references remain protected and masked.",
    notes: ["Only masked card references are shown after save.", "Your CVV is never stored.", "Use a valid, unexpired card."],
  },
  {
    title: "Store Credit",
    details: "If you have eligible account credit, it is applied during checkout before charging other payment methods.",
    notes: ["Available credit depends on your account balance.", "Credit usage appears in order summary."],
  },
];

const faq = [
  {
    question: "Why did my M-Pesa payment fail?",
    answer:
      "This can happen if you enter a wrong number, have insufficient balance, decline the STK prompt, or your line times out. Retry with a correct active number and confirm the prompt quickly.",
  },
  {
    question: "Can I save payment methods to my account?",
    answer:
      "Yes. You can save card details (masked) or an M-Pesa number from your account panel, then reuse them at checkout.",
  },
  {
    question: "How do I confirm my order was paid?",
    answer:
      "After successful confirmation, your order status updates to paid. You can verify this in Track Your Order and your account order history.",
  },
  {
    question: "What should I do if I was charged but order is not updated?",
    answer:
      "Contact support immediately with your phone number and transaction reference so the team can verify and reconcile the payment.",
  },
];

export default function PaymentGuidelinesPage() {
  const { isAuthenticated, userRole } = useAuth();
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  const accountHref = useMemo(() => {
    if (!isAuthenticated) return "/login";
    if (userRole === "admin") return "/admin";
    if (userRole === "vendor") return "/vendor";
    return "/account";
  }, [isAuthenticated, userRole]);

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Checkout Support</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Payment Guidelines</h1>
          <p className="mt-2 text-sm text-gray-700">
            Use this page to choose the right payment method, avoid failed transactions, and complete checkout smoothly.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/checkout" className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors">
              Go to Checkout
            </Link>
            <Link href={accountHref} className="rounded-modern border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
              {isAuthenticated ? "Open My Account" : "Sign In to Save Methods"}
            </Link>
            <Link href="/footer-links/track-your-order" className="rounded-modern border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
              Track Order
            </Link>
            <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
              Contact Support
            </Link>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-6">
            <article className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
              <h2 className="text-lg font-bold text-gray-900">Accepted Payment Methods</h2>
              <p className="mt-1 text-sm text-gray-600">
                Payments currently support M-Pesa and account-level options, with card and additional channels expanding progressively.
              </p>

              <div className="mt-4 space-y-3">
                {methods.map((method) => (
                  <div key={method.title} className="rounded-modern border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-900">{method.title}</h3>
                    <p className="mt-1 text-sm text-gray-700">{method.details}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-gray-600">
                      {method.notes.map((note) => (
                        <li key={`${method.title}-${note}`}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
              <h2 className="text-lg font-bold text-gray-900">How Payment Processing Works</h2>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <p>Customers pay through King-Kush checkout where payments are validated before order processing starts.</p>
                <p>Verified transactions are recorded against the order, then fulfillment workflows begin.</p>
                <p>Vendor earnings are managed through the platform payout and wallet flow for traceability and control.</p>
              </div>
            </article>

            <article className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
              <h2 className="text-lg font-bold text-gray-900">Checkout Payment Flow</h2>
              <ol className="mt-3 space-y-3 text-sm text-gray-700">
                <li className="rounded-modern border border-gray-200 p-3">
                  <span className="font-semibold text-gray-900">1. Review your cart</span>
                  <p className="mt-1 text-xs text-gray-600">Confirm quantities and delivery details before opening checkout.</p>
                </li>
                <li className="rounded-modern border border-gray-200 p-3">
                  <span className="font-semibold text-gray-900">2. Select payment method</span>
                  <p className="mt-1 text-xs text-gray-600">Choose M-Pesa, card, or store credit based on availability.</p>
                </li>
                <li className="rounded-modern border border-gray-200 p-3">
                  <span className="font-semibold text-gray-900">3. Confirm payment</span>
                  <p className="mt-1 text-xs text-gray-600">Approve STK push or card authorization to finalize your order.</p>
                </li>
                <li className="rounded-modern border border-gray-200 p-3">
                  <span className="font-semibold text-gray-900">4. Verify order status</span>
                  <p className="mt-1 text-xs text-gray-600">Check paid status in your account or Track Your Order page.</p>
                </li>
              </ol>
            </article>
          </div>

          <aside className="space-y-6">
            <article className="rounded-modern border border-primary/20 bg-primary/5 p-6">
              <h2 className="text-sm font-bold text-primary">Safety Checklist</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-700">
                <li>Never share account passwords or OTPs.</li>
                <li>Only pay through the official checkout flow.</li>
                <li>Confirm your transaction reference after payment.</li>
                <li>Report suspicious prompts immediately.</li>
              </ul>
            </article>

            <article className="rounded-modern border border-amber-200 bg-amber-50 p-6">
              <h2 className="text-sm font-bold text-amber-800">Refunds & Payment Issues</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-900">
                <li>Raise payment issues quickly with order number and transaction reference.</li>
                <li>Refund requests are reviewed under return and payment verification rules.</li>
                <li>Use Contact Support for urgent payment reconciliation.</li>
              </ul>
            </article>

            <article className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
              <h2 className="text-lg font-bold text-gray-900">Payment FAQs</h2>
              <div className="mt-3 space-y-2">
                {faq.map((item, index) => {
                  const isOpen = activeFaq === index;
                  return (
                    <div key={item.question} className="rounded-modern border border-gray-200">
                      <button
                        type="button"
                        onClick={() => setActiveFaq(isOpen ? null : index)}
                        className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
                      >
                        {item.question}
                        <span className="text-primary">{isOpen ? "-" : "+"}</span>
                      </button>
                      {isOpen ? <p className="border-t border-gray-200 px-3 py-3 text-xs text-gray-600">{item.answer}</p> : null}
                    </div>
                  );
                })}
              </div>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
