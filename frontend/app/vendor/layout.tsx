"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../src/context/AuthContext";
import { VendorPanelProvider, useVendorPanel } from "../../src/context/VendorPanelContext";
import { useDashboardTheme } from "../../src/hooks/useDashboardTheme";

const NAV_ITEMS: Array<{
  href: string;
  label: string;
  description: string;
  requiresApproval?: boolean;
}> = [
  { href: "/vendor/overview", label: "Overview", description: "Store status and performance snapshot" },
  { href: "/vendor/products", label: "Products", description: "Create, edit, and manage listings", requiresApproval: true },
  { href: "/vendor/orders", label: "Orders", description: "Orders for your products", requiresApproval: true },
  { href: "/vendor/finance", label: "Finance", description: "Wallet, commissions, and payouts", requiresApproval: true },
  { href: "/vendor/receipts", label: "Receipts", description: "Payout, settlement, and commission records", requiresApproval: true },
  { href: "/station-ops", label: "Pickup Operations", description: "Manage pickup station notices and order handovers", requiresApproval: true },
  { href: "/vendor/profile", label: "Store Profile", description: "Business details, branding, and contacts" },
  { href: "/vendor/security", label: "Security", description: "Password and account protection" },
];

function prettyStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function VendorPanelShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, userRole } = useAuth();
  const { loading, error, success, vendorProfile, approvalStatus, reviewNotes, statusMessage, isApproved } = useVendorPanel();
  const { theme } = useDashboardTheme();
  const [hasLocalToken, setHasLocalToken] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasLocalToken(Boolean(localStorage.getItem("accessToken")));
    }
    setAuthChecked(true);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!authChecked) return;
    if (!isAuthenticated && !hasLocalToken) {
      router.replace("/login");
      return;
    }
    if (isAuthenticated && userRole && userRole !== "vendor") {
      router.replace("/");
    }
  }, [authChecked, hasLocalToken, isAuthenticated, userRole, router]);

  const statusClass = useMemo(() => {
    if (approvalStatus === "approved") return "bg-emerald-100 text-emerald-700 border-emerald-200";
    if (approvalStatus === "needs_info") return "bg-amber-100 text-amber-700 border-amber-200";
    if (approvalStatus === "rejected") return "bg-red-100 text-red-700 border-red-200";
    if (approvalStatus === "suspended") return "bg-red-100 text-red-700 border-red-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
  }, [approvalStatus]);

  if (!authChecked || (!isAuthenticated && !hasLocalToken)) {
    return null;
  }

  return (
    <main data-theme={theme} className="dashboard-shell min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-modern bg-white p-5 shadow-modern">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">King-Kush Vendor Panel</p>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-h2 font-heading font-bold text-primary">{vendorProfile?.store_name || "Vendor Account"}</h1>
              <p className="text-sm text-gray-600">{statusMessage}</p>
            </div>
            <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-semibold ${statusClass}`}>
              {prettyStatus(approvalStatus)}
            </span>
          </div>
          {reviewNotes ? <p className="mt-3 rounded-modern bg-amber-50 px-3 py-2 text-sm text-amber-700">Admin note: {reviewNotes}</p> : null}
        </div>

        {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-modern bg-white p-3 shadow-modern">
            <div className="flex gap-2 overflow-x-auto lg:flex-col">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const locked = Boolean(item.requiresApproval) && !isApproved;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-modern border px-3 py-2 text-left transition-all ${
                      active
                        ? "border-primary bg-primary text-white shadow-sm"
                        : "border-gray-200 bg-gray-50 text-gray-700 hover:border-primary/40 hover:bg-white"
                    }`}
                  >
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className={`mt-0.5 text-xs ${active ? "text-white/80" : "text-gray-500"}`}>{item.description}</p>
                    {locked ? <p className={`mt-1 text-[11px] ${active ? "text-white/80" : "text-amber-700"}`}>Unlocks after approval</p> : null}
                  </Link>
                );
              })}
            </div>
          </aside>

          <section className="rounded-modern bg-white p-5 shadow-modern">
            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-b-4 border-primary" />
              </div>
            ) : (
              children
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return (
    <VendorPanelProvider>
      <VendorPanelShell>{children}</VendorPanelShell>
    </VendorPanelProvider>
  );
}
