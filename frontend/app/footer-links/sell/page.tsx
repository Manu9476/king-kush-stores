"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../../../src/context/AuthContext";

export default function SellOnKingKushPage() {
  const router = useRouter();
  const { isAuthenticated, userRole } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [error, setError] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!businessName.trim() || !businessEmail.trim() || !businessPhone.trim()) {
      setError("Business name, email, and phone are required.");
      return;
    }

    const params = new URLSearchParams({
      role: "vendor",
      business_name: businessName.trim(),
      business_email: businessEmail.trim(),
      business_phone: businessPhone.trim(),
    });

    if (productCategory.trim()) {
      params.set("product_category", productCategory.trim());
    }

    router.push(`/register?${params.toString()}`);
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <section className="container mx-auto px-4 py-14">
        <div className="mx-auto max-w-5xl rounded-3xl border border-gray-200 bg-white p-8 shadow-sm md:p-10">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Marketplace Seller Program</p>
              <h1 className="mt-3 text-4xl font-black text-gray-900 md:text-5xl">Sell on King-Kush</h1>
              <p className="mt-4 text-base text-gray-600">
                Join the marketplace and list your products to customers across Kenya. Vendor onboarding includes admin review for quality and trust.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-900">Reach More Customers</p>
                  <p className="mt-1 text-xs text-gray-600">Show your catalog on a growing marketplace.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-900">Vendor Tools</p>
                  <p className="mt-1 text-xs text-gray-600">Manage products, orders, store profile, and payouts.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-900">Secure Payments</p>
                  <p className="mt-1 text-xs text-gray-600">Platform-verified payment and commission handling.</p>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-bold text-gray-900">Admin Support</p>
                  <p className="mt-1 text-xs text-gray-600">Application review and guided onboarding support.</p>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                {isAuthenticated && userRole === "vendor" ? (
                  <Link href="/vendor" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-hover">
                    Open Vendor Dashboard
                  </Link>
                ) : (
                  <Link href="/register?role=vendor" className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white hover:bg-primary-hover">
                    Create Vendor Account
                  </Link>
                )}
                <Link href="/footer-links/vendor-hub" className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                  Go to Vendor Hub
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">Start Vendor Registration</h2>
              <p className="mt-1 text-sm text-gray-600">Complete this quick step and continue to full vendor signup.</p>

              <form onSubmit={submit} className="mt-5 space-y-4">
                <div>
                  <label htmlFor="business_name" className="mb-1 block text-sm font-semibold text-gray-700">
                    Business Name
                  </label>
                  <input
                    id="business_name"
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="e.g., Nairobi Fashion Hub"
                  />
                </div>
                <div>
                  <label htmlFor="business_email" className="mb-1 block text-sm font-semibold text-gray-700">
                    Business Email
                  </label>
                  <input
                    id="business_email"
                    type="email"
                    value={businessEmail}
                    onChange={(event) => setBusinessEmail(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="name@business.com"
                  />
                </div>
                <div>
                  <label htmlFor="business_phone" className="mb-1 block text-sm font-semibold text-gray-700">
                    Phone Number
                  </label>
                  <input
                    id="business_phone"
                    value={businessPhone}
                    onChange={(event) => setBusinessPhone(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="0700 000 000"
                  />
                </div>
                <div>
                  <label htmlFor="product_category" className="mb-1 block text-sm font-semibold text-gray-700">
                    Product Category (Optional)
                  </label>
                  <input
                    id="product_category"
                    value={productCategory}
                    onChange={(event) => setProductCategory(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Electronics, Fashion, Beauty..."
                  />
                </div>

                {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

                <button
                  type="submit"
                  className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
                >
                  Continue to Vendor Signup
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
