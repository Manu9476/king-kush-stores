"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { HelpCenterContentResponse, SupportKnowledgeBaseEntry, getHelpCenterContent } from "../../../src/services/api";

const FALLBACK_CONTENT: HelpCenterContentResponse = {
  categories: [
    { key: "orders", label: "Orders" },
    { key: "shipping", label: "Shipping" },
    { key: "payments", label: "Payments" },
    { key: "returns", label: "Returns" },
    { key: "account", label: "Account Issues" },
    { key: "vendor", label: "Vendor Support" },
    { key: "general", label: "General" },
  ],
  support_contact: {
    email: "emmanuelmacharia408@gmail.com",
    phone: "0701137747",
  },
  entries: [
    {
      id: 1,
      title: "How do I track my order?",
      slug: "how-do-i-track-my-order",
      category: "orders",
      category_label: "Orders",
      entry_type: "faq",
      entry_type_label: "FAQ",
      short_answer: "Open Track Your Order and use your order number.",
      content: "Go to the Track Your Order page, enter your order number, and you will see live status updates.",
      is_published: true,
      sort_order: 1,
      created_at: "",
      updated_at: "",
    },
    {
      id: 2,
      title: "How do I request a return?",
      slug: "how-do-i-request-a-return",
      category: "returns",
      category_label: "Returns",
      entry_type: "faq",
      entry_type_label: "FAQ",
      short_answer: "Request returns from your orders page.",
      content: "Visit My Account, open your order details, and use the return request action where eligible.",
      is_published: true,
      sort_order: 2,
      created_at: "",
      updated_at: "",
    },
    {
      id: 3,
      title: "How to place an order on King-Kush",
      slug: "how-to-place-order-on-king-kush",
      category: "orders",
      category_label: "Orders",
      entry_type: "guide",
      entry_type_label: "Guide",
      short_answer: "Search products, add to cart, checkout, and confirm payment.",
      content:
        "Browse products, add items to cart, review quantities, choose your address and payment method, then place your order.",
      is_published: true,
      sort_order: 1,
      created_at: "",
      updated_at: "",
    },
    {
      id: 4,
      title: "How vendors start selling",
      slug: "how-vendors-start-selling",
      category: "vendor",
      category_label: "Vendor Support",
      entry_type: "guide",
      entry_type_label: "Guide",
      short_answer: "Create a vendor account and wait for admin approval.",
      content:
        "Register as a vendor, complete your business profile, submit verification, and start listing products after approval.",
      is_published: true,
      sort_order: 2,
      created_at: "",
      updated_at: "",
    },
  ],
};

export default function HelpCenterPage() {
  const [loading, setLoading] = useState(true);
  const [loadMessage, setLoadMessage] = useState("");
  const [usingFallback, setUsingFallback] = useState(false);
  const [content, setContent] = useState<HelpCenterContentResponse>(FALLBACK_CONTENT);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  const loadHelpContent = async (): Promise<boolean> => {
    setLoading(true);
    setLoadMessage("");
    setUsingFallback(false);
    try {
      const data = await getHelpCenterContent();
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        setContent(data);
        setUsingFallback(data.content_source === "fallback");
        if (data.content_source === "fallback") {
          setLoadMessage("Help articles are temporarily served from backup content while we refresh the latest entries.");
          return true;
        }
        return false;
      } else {
        setContent(FALLBACK_CONTENT);
        setUsingFallback(true);
        setLoadMessage("We are showing backup Help Center content right now. Core support actions are still available.");
        return true;
      }
    } catch {
      setContent(FALLBACK_CONTENT);
      setUsingFallback(true);
      setLoadMessage("Help Center is temporarily using backup content. You can still contact support directly.");
      return true;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadWithRetry = async () => {
      const firstUsedFallback = await loadHelpContent();
      if (!firstUsedFallback) return;

      try {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const data = await getHelpCenterContent();
        if (Array.isArray(data.entries) && data.entries.length > 0 && data.content_source !== "fallback") {
          setContent(data);
          setUsingFallback(false);
          setLoadMessage("");
        }
      } catch {
        // Keep backup content active if retry also fails.
      }
    };

    loadWithRetry();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return content.entries.filter((entry) => {
      const categoryMatch = category === "all" ? true : entry.category === category;
      if (!categoryMatch) return false;
      if (!normalized) return true;
      return (
        entry.title.toLowerCase().includes(normalized) ||
        entry.short_answer.toLowerCase().includes(normalized) ||
        entry.content.toLowerCase().includes(normalized)
      );
    });
  }, [content.entries, query, category]);

  const faqs = filtered.filter((entry) => entry.entry_type === "faq");
  const guides = filtered.filter((entry) => entry.entry_type === "guide");

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(content.support_contact.email);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 1800);
    } catch {
      setEmailCopied(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern bg-white p-6 shadow-modern border border-gray-100">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Support</p>
          <h1 className="text-h2 font-heading font-bold text-primary mt-1">Help Center</h1>
          <p className="text-sm text-gray-600 mt-1">
            Search common answers, browse support categories, and read step-by-step guides.
          </p>
        </header>

        {loadMessage ? (
          <div
            className={`rounded-modern px-4 py-3 text-sm ${
              usingFallback ? "border border-amber-200 bg-amber-50 text-amber-700" : "border border-blue-200 bg-blue-50 text-blue-700"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{loadMessage}</span>
              {usingFallback ? (
                <button
                  type="button"
                  onClick={loadHelpContent}
                  className="shrink-0 rounded-modern border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  Retry
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="rounded-modern bg-white p-6 shadow-modern space-y-5 border border-gray-100">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for orders, shipping, returns, payment, account, or vendor support..."
              className="w-full rounded-modern border border-gray-300 px-5 py-3.5 text-base text-gray-800 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Link
              href="/footer-links/contact-us"
              className="rounded-modern bg-primary px-5 py-3.5 text-sm font-semibold text-white text-center hover:bg-primary-hover transition-colors shadow-sm hover:shadow-md"
            >
              Contact Support
            </Link>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                category === "all" ? "bg-primary text-white" : "border border-gray-200 text-gray-700 hover:bg-gray-100"
              }`}
            >
              All
            </button>
            {content.categories.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setCategory(item.key)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  category === item.key
                    ? "bg-primary text-white"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-modern bg-white shadow-modern overflow-hidden border border-gray-100">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-bold text-gray-900">Frequently Asked Questions</h2>
              <p className="text-xs text-gray-500 mt-1">{loading ? "Loading..." : `${faqs.length} questions found`}</p>
            </div>
            <div className="divide-y divide-gray-100">
              {loading ? (
                <div className="p-5 space-y-3">
                  {[1, 2, 3, 4].map((row) => (
                    <div key={row} className="animate-pulse rounded-modern border border-gray-100 p-4">
                      <div className="h-4 w-2/3 rounded bg-gray-200" />
                      <div className="mt-2 h-3 w-full rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ) : faqs.length === 0 ? (
                <div className="px-5 py-6 text-sm text-gray-500">
                  No FAQs matched your search. Try another keyword or contact support.
                </div>
              ) : (
                faqs.map((faq) => (
                  <div key={faq.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId((prev) => (prev === faq.id ? null : faq.id))}
                      className="w-full px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">{faq.title}</p>
                        <span className="text-xs text-gray-500">{openId === faq.id ? "Hide" : "Open"}</span>
                      </div>
                      {faq.short_answer ? <p className="text-xs text-gray-500 mt-1">{faq.short_answer}</p> : null}
                    </button>
                    {openId === faq.id ? <div className="px-5 pb-4 text-sm text-gray-700">{faq.content}</div> : null}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-modern bg-white p-5 shadow-modern border border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Platform Guides</h2>
              <div className="mt-3 space-y-3">
                {loading ? (
                  <div className="space-y-3">
                    {[1, 2].map((row) => (
                      <div key={row} className="animate-pulse rounded-modern border border-gray-100 p-3">
                        <div className="h-4 w-1/2 rounded bg-gray-200" />
                        <div className="mt-2 h-3 w-3/4 rounded bg-gray-100" />
                        <div className="mt-2 h-3 w-full rounded bg-gray-100" />
                      </div>
                    ))}
                  </div>
                ) : guides.length === 0 ? (
                  <p className="text-sm text-gray-500">No guides matched your search yet.</p>
                ) : (
                  guides.map((guide: SupportKnowledgeBaseEntry) => (
                    <article key={guide.id} className="rounded-modern border border-gray-100 p-3">
                      <p className="text-sm font-semibold text-gray-900">{guide.title}</p>
                      <p className="text-xs text-gray-500 mt-1">{guide.short_answer || guide.category_label}</p>
                      <p className="text-sm text-gray-700 mt-2">{guide.content}</p>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-modern border border-primary/20 bg-primary/5 p-5">
              <h3 className="text-sm font-bold text-primary">Need direct assistance?</h3>
              <p className="text-sm text-gray-700 mt-2">
                Contact support for order issues, payment problems, delivery disputes, account recovery, or vendor help.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`mailto:${content.support_contact.email}`}
                  className="rounded-modern border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Email Support
                </a>
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(content.support_contact.email)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-modern border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Open Gmail
                </a>
                <button
                  type="button"
                  onClick={copyEmail}
                  className="rounded-modern border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  {emailCopied ? "Email Copied" : "Copy Email"}
                </button>
                <a
                  href={`tel:${content.support_contact.phone.replace(/\s+/g, "")}`}
                  className="rounded-modern border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Call Support
                </a>
                <Link
                  href="/footer-links/contact-us"
                  className="rounded-modern bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors"
                >
                  Open Contact Form
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
