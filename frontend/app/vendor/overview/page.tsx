"use client";

import Link from "next/link";
import { useVendorPanel } from "../../../src/context/VendorPanelContext";
import AdSlot from "../../../src/components/ads/AdSlot";

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default function VendorOverviewPage() {
  const { summary, orders, products, approvalStatus, statusMessage, isApproved } = useVendorPanel();

  if (!isApproved) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Overview</h2>
        <div className="rounded-modern border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">Current status: {approvalStatus.replace(/_/g, " ")}</p>
          <p className="mt-1 text-sm text-gray-600">{statusMessage}</p>
          <p className="mt-3 text-sm text-gray-600">
            Keep your store profile complete so admin can review quickly. You can still update profile and security while approval is pending.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/vendor/profile" className="rounded-modern bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors">
              Update Profile
            </Link>
            <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900">Overview</h2>
      <AdSlot placementKey="dashboard_promo_card" pagePath="/vendor/overview" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Products</p>
          <p className="text-2xl font-bold text-gray-900">{summary?.products_total || products.length}</p>
        </div>
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Active Listings</p>
          <p className="text-2xl font-bold text-gray-900">{summary?.products_active || 0}</p>
        </div>
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Orders</p>
          <p className="text-2xl font-bold text-gray-900">{summary?.orders_total || orders.length}</p>
        </div>
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Units Sold</p>
          <p className="text-2xl font-bold text-gray-900">{summary?.units_sold || 0}</p>
        </div>
        <div className="rounded-modern border border-gray-100 bg-gray-50 p-4">
          <p className="text-xs text-gray-500">Sales</p>
          <p className="text-2xl font-bold text-gray-900">{formatMoney(summary?.sales_total || 0)}</p>
        </div>
      </div>

      <div className="rounded-modern border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-900">Quick Actions</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/vendor/products" className="rounded-modern bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors">
            Manage Products
          </Link>
          <Link href="/vendor/orders" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            View Orders
          </Link>
          <Link href="/vendor/receipts" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            View Receipts
          </Link>
          <Link href="/station-ops" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            Pickup Operations
          </Link>
          <Link href="/vendor/profile" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            Edit Store Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
