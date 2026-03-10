"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const steps = [
  {
    number: "1",
    title: "Find Your Product",
    description:
      "Browse categories or search by product, category, or vendor name. Open any item to review details before buying.",
    actions: [
      { label: "Start Shopping", href: "/" },
      { label: "Browse All Results", href: "/search?q=" },
    ],
  },
  {
    number: "2",
    title: "Add to Cart",
    description:
      "On a product page, choose quantity and tap Add to Cart. Review your selected items from the cart page.",
    actions: [{ label: "Open Cart", href: "/cart" }],
  },
  {
    number: "3",
    title: "Review and Checkout",
    description:
      "Confirm quantities and totals, then proceed to checkout. If you are not signed in, login or register first.",
    actions: [
      { label: "Go to Checkout", href: "/checkout" },
      { label: "Login", href: "/login" },
      { label: "Register", href: "/register" },
    ],
  },
  {
    number: "4",
    title: "Confirm and Pay",
    description:
      "Provide delivery details, confirm your M-Pesa payment prompt, and complete the order securely.",
    actions: [
      { label: "Track Your Order", href: "/footer-links/track-your-order" },
      { label: "Payment Guidelines", href: "/footer-links/payment-guidelines" },
    ],
  },
];

export default function HowToOrderPage() {
  const router = useRouter();
  const { isAuthenticated, userRole } = useAuth();
  const [query, setQuery] = useState("");

  const accountHref = !isAuthenticated
    ? "/login"
    : userRole === "admin"
      ? "/admin"
      : userRole === "vendor"
        ? "/vendor"
        : "/account";

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    router.push(`/search?q=${encodeURIComponent(value)}`);
  };

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-12 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="rounded-modern border border-gray-100 bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.18em] text-gray-500">Order Guide</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">How to Place an Order</h1>
          <p className="mt-2 text-sm text-gray-700">
            Follow these steps to shop, checkout, and track your order successfully on King-Kush.
          </p>

          <form onSubmit={onSearch} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product, category, or vendor"
              className="w-full rounded-modern border border-gray-300 px-4 py-3 text-sm"
            />
            <button type="submit" className="rounded-modern bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-hover">
              Search
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={accountHref} className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              {isAuthenticated ? "Open My Account" : "Sign In"}
            </Link>
            <Link href="/cart" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              View Cart
            </Link>
            <Link href="/checkout" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Checkout
            </Link>
            <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
              Contact Support
            </Link>
          </div>
        </header>

        <section className="space-y-4">
          {steps.map((step) => (
            <article key={step.number} className="rounded-modern border border-gray-100 bg-white p-5 shadow-modern">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-white">
                  {step.number}
                </div>
                <div className="grow">
                  <h2 className="text-xl font-semibold text-gray-900">{step.title}</h2>
                  <p className="mt-2 text-sm text-gray-700">{step.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {step.actions.map((action) => (
                      <Link
                        key={`${step.number}-${action.href}-${action.label}`}
                        href={action.href}
                        className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        {action.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
