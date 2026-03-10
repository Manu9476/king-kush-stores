"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiAlertCircle, FiArrowRight, FiBriefcase, FiDollarSign, FiRefreshCw, FiShoppingBag } from "react-icons/fi";
import AdminSidebar from "../../src/components/admin/AdminSidebar";
import { useAuth } from "../../src/context/AuthContext";
import {
  ChatbotConversationDetail,
  ChatbotConversationSummary,
  downloadReceiptPdf,
  generateReceiptForTransaction,
  getAdminFinanceSummary,
  getAdminJobApplications,
  getAdminProductReports,
  getAdminSupportTickets,
  getAdminVendorApplications,
  getChatbotConversationDetail,
  getChatbotConversations,
  getOrders,
} from "../../src/services/api";

type DashboardTab = "overview" | "orders" | "chatbot";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (["delivered", "completed", "fulfilled"].includes(normalized)) {
    return "bg-green-100 text-green-700";
  }
  if (["cancelled", "failed", "refunded"].includes(normalized)) {
    return "bg-red-100 text-red-700";
  }
  if (["processing", "in_transit", "shipped", "paid"].includes(normalized)) {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-amber-100 text-amber-700";
}

export default function AdminDashboard() {
  const router = useRouter();
  const { isAuthenticated, userEmail, token, userRole, hasAdminPermission, canAccessAdminModule } = useAuth();

  const canViewDashboard = canAccessAdminModule("dashboard") && hasAdminPermission("dashboard.view");
  const canViewOrders = hasAdminPermission("orders.view");
  const canViewFinance = canAccessAdminModule("finance") && hasAdminPermission("finance.view");
  const canViewCareers = hasAdminPermission("careers.view");
  const canViewVendors = hasAdminPermission("vendors.view");
  const canViewSupport = hasAdminPermission("support.view");
  const canViewChatbot = hasAdminPermission("chatbot.view");
  const canViewModeration = canAccessAdminModule("moderation") && hasAdminPermission("moderation.manage");

  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [platformCommission, setPlatformCommission] = useState(0);
  const [careerApplicationsCount, setCareerApplicationsCount] = useState(0);
  const [vendorPendingCount, setVendorPendingCount] = useState(0);
  const [supportPendingCount, setSupportPendingCount] = useState(0);
  const [moderationPendingCount, setModerationPendingCount] = useState(0);
  const [loadWarning, setLoadWarning] = useState("");
  const [chatError, setChatError] = useState("");

  const [chatConversations, setChatConversations] = useState<ChatbotConversationSummary[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [selectedConversationDetail, setSelectedConversationDetail] = useState<ChatbotConversationDetail | null>(null);
  const [conversationSearchInput, setConversationSearchInput] = useState("");
  const [receiptBusyOrderId, setReceiptBusyOrderId] = useState<number | null>(null);
  const [receiptMessage, setReceiptMessage] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canViewDashboard) {
      if (canAccessAdminModule("finance")) router.push("/admin/finance");
      else if (canAccessAdminModule("receipts")) router.push("/admin/receipts");
      else if (canAccessAdminModule("vendors")) router.push("/admin/vendors");
      else if (canAccessAdminModule("products")) router.push("/admin/products");
      else if (canAccessAdminModule("pickup")) router.push("/admin/pickup-stations");
      else if (canAccessAdminModule("promotions")) router.push("/admin/promotions");
      else if (canAccessAdminModule("careers")) router.push("/admin/careers");
      else if (canAccessAdminModule("support")) router.push("/admin/support");
      else if (canAccessAdminModule("moderation")) router.push("/admin/moderation");
      else if (canAccessAdminModule("advertising")) router.push("/admin/advertising");
      else if (canAccessAdminModule("staff")) router.push("/admin/staff");
    }
  }, [isAuthenticated, userRole, router, canViewDashboard, canAccessAdminModule]);

  const tabs = useMemo<Array<{ key: DashboardTab; label: string; show: boolean }>>(
    () => [
      { key: "overview", label: "Overview", show: true },
      { key: "orders", label: "Orders", show: canViewOrders },
      { key: "chatbot", label: "Chatbot", show: canViewChatbot },
    ],
    [canViewOrders, canViewChatbot],
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.show && tab.key === activeTab)) {
      setActiveTab("overview");
    }
  }, [tabs, activeTab]);

  const loadConversations = useCallback(
    async (query = "") => {
      if (!token || !canViewChatbot) return;
      setChatLoading(true);
      setChatError("");
      try {
        const list = await getChatbotConversations(token, query);
        setChatConversations(list);
        if (list.length === 0) {
          setSelectedConversationId(null);
          setSelectedConversationDetail(null);
          return;
        }
        const preferred = selectedConversationId && list.some((x) => x.id === selectedConversationId) ? selectedConversationId : list[0].id;
        setSelectedConversationId(preferred);
        const detail = await getChatbotConversationDetail(token, preferred);
        setSelectedConversationDetail(detail);
      } catch {
        setChatConversations([]);
        setSelectedConversationId(null);
        setSelectedConversationDetail(null);
        setChatError("Unable to load chatbot conversations right now.");
      } finally {
        setChatLoading(false);
      }
    },
    [token, canViewChatbot, selectedConversationId],
  );

  const loadDashboard = useCallback(async () => {
    if (!isAuthenticated || !token || userRole !== "admin") return;
    setIsLoading(true);
    setLoadWarning("");
    try {
      const results = await Promise.allSettled([
        canViewOrders ? getOrders(token) : Promise.resolve(null),
        canViewFinance ? getAdminFinanceSummary(token) : Promise.resolve(null),
        canViewCareers ? getAdminJobApplications(token) : Promise.resolve(null),
        canViewVendors ? getAdminVendorApplications(token, "", "pending_review") : Promise.resolve(null),
        canViewSupport ? getAdminSupportTickets(token, "", "pending") : Promise.resolve(null),
        canViewModeration ? getAdminProductReports(token, "", "pending") : Promise.resolve(null),
      ]);

      const [ordersResult, financeResult, careersResult, vendorsResult, supportResult, moderationResult] = results;
      const failedModules: string[] = [];

      if (canViewOrders && ordersResult.status === "fulfilled") {
        const orderData = ordersResult.value as any;
        setOrders(Array.isArray(orderData) ? orderData : orderData?.results || []);
      } else {
        setOrders([]);
        if (canViewOrders) failedModules.push("orders");
      }

      if (canViewFinance && financeResult.status === "fulfilled") {
        setPlatformCommission(Number((financeResult.value as any)?.totals?.platform_commission_earned || 0));
      } else {
        setPlatformCommission(0);
        if (canViewFinance) failedModules.push("finance");
      }

      if (canViewCareers && careersResult.status === "fulfilled") {
        setCareerApplicationsCount(Array.isArray(careersResult.value) ? careersResult.value.length : 0);
      } else {
        setCareerApplicationsCount(0);
        if (canViewCareers) failedModules.push("careers");
      }

      if (canViewVendors && vendorsResult.status === "fulfilled") {
        setVendorPendingCount(Array.isArray(vendorsResult.value) ? vendorsResult.value.length : 0);
      } else {
        setVendorPendingCount(0);
        if (canViewVendors) failedModules.push("vendors");
      }

      if (canViewSupport && supportResult.status === "fulfilled") {
        setSupportPendingCount(Array.isArray(supportResult.value) ? supportResult.value.length : 0);
      } else {
        setSupportPendingCount(0);
        if (canViewSupport) failedModules.push("support");
      }

      if (canViewModeration && moderationResult.status === "fulfilled") {
        setModerationPendingCount(Array.isArray(moderationResult.value) ? moderationResult.value.length : 0);
      } else {
        setModerationPendingCount(0);
        if (canViewModeration) failedModules.push("moderation");
      }

      if (failedModules.length > 0) {
        setLoadWarning(`Some modules did not load completely (${failedModules.join(", ")}).`);
      }

      if (!canViewChatbot) {
        setChatConversations([]);
        setSelectedConversationId(null);
        setSelectedConversationDetail(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    isAuthenticated,
    token,
    userRole,
    canViewOrders,
    canViewFinance,
    canViewCareers,
    canViewVendors,
    canViewSupport,
    canViewModeration,
    canViewChatbot,
  ]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (activeTab !== "chatbot" || !canViewChatbot || chatConversations.length > 0) return;
    loadConversations("");
  }, [activeTab, canViewChatbot, chatConversations.length, loadConversations]);

  const generateOrderReceipt = async (orderId: number) => {
    if (!token) return;
    setReceiptBusyOrderId(orderId);
    setReceiptMessage("");
    try {
      const receipt = await generateReceiptForTransaction(token, { entity_type: "order", entity_id: orderId });
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
      setReceiptMessage(`Receipt ${receipt.receipt_number} downloaded.`);
    } catch (error: any) {
      setReceiptMessage(error?.message || "Unable to generate receipt.");
    } finally {
      setReceiptBusyOrderId(null);
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canViewDashboard) return null;

  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const totalOrders = orders.length;
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const activeOrders = orders.filter((order) => !["delivered", "completed", "cancelled", "refunded"].includes(String(order.status || "").toLowerCase())).length;

  const quickLinks = [
    {
      href: "/admin/readiness",
      label: "Launch Readiness",
      show: canAccessAdminModule("dashboard"),
      count: "Live checklist",
      meta: "Production blockers, warnings, and launch score",
    },
    {
      href: "/admin/finance",
      label: "Finance Desk",
      show: canAccessAdminModule("finance"),
      count: formatCurrency(platformCommission),
      meta: "Commission earned",
    },
    {
      href: "/admin/receipts",
      label: "Receipt Center",
      show: canAccessAdminModule("receipts"),
      count: "Immutable records",
      meta: "Orders, payouts, pickups, approvals",
    },
    {
      href: "/admin/vendors",
      label: "Vendor Desk",
      show: canAccessAdminModule("vendors"),
      count: `${vendorPendingCount} pending`,
      meta: "Applications awaiting review",
    },
    {
      href: "/admin/products",
      label: "Product Desk",
      show: canAccessAdminModule("products"),
      count: "Catalog control",
      meta: "Compliance and listing quality",
    },
    {
      href: "/admin/pickup-stations",
      label: "Pickup Desk",
      show: canAccessAdminModule("pickup"),
      count: "Stations & operations",
      meta: "Branch assignments and pickup control",
    },
    {
      href: "/admin/promotions",
      label: "Promotions Desk",
      show: canAccessAdminModule("promotions"),
      count: "Campaign control",
      meta: "Black Friday, flash and seasonal offers",
    },
    {
      href: "/admin/support",
      label: "Support Desk",
      show: canAccessAdminModule("support"),
      count: `${supportPendingCount} pending`,
      meta: "Tickets and escalations",
    },
    {
      href: "/admin/moderation",
      label: "Moderation Desk",
      show: canAccessAdminModule("moderation"),
      count: `${moderationPendingCount} pending`,
      meta: "Reported products and enforcement",
    },
    {
      href: "/admin/careers",
      label: "Careers Desk",
      show: canAccessAdminModule("careers"),
      count: `${careerApplicationsCount} applicants`,
      meta: "Hiring pipeline",
    },
    {
      href: "/admin/advertising",
      label: "Advertising Desk",
      show: canAccessAdminModule("advertising"),
      count: "Campaign controls",
      meta: "Requests, placements, analytics",
    },
    {
      href: "/admin/staff",
      label: "Staff & Roles",
      show: canAccessAdminModule("staff"),
      count: "Permissions",
      meta: "Access governance",
    },
  ].filter((entry) => entry.show);

  const queueItems = [
    { label: "Launch readiness", value: "Checklist", href: "/admin/readiness", show: canAccessAdminModule("dashboard") },
    { label: "Vendor approvals", value: vendorPendingCount, href: "/admin/vendors", show: canAccessAdminModule("vendors") },
    { label: "Support tickets", value: supportPendingCount, href: "/admin/support", show: canAccessAdminModule("support") },
    { label: "Product reports", value: moderationPendingCount, href: "/admin/moderation", show: canAccessAdminModule("moderation") },
    { label: "Career applications", value: careerApplicationsCount, href: "/admin/careers", show: canAccessAdminModule("careers") },
    { label: "Pickup operations", value: "Desk", href: "/admin/pickup-stations", show: canAccessAdminModule("pickup") },
    { label: "Receipt center", value: "Desk", href: "/admin/receipts", show: canAccessAdminModule("receipts") },
    { label: "Open orders", value: activeOrders, href: "/admin", show: canViewOrders },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <AdminSidebar active="dashboard" />
      <main className="flex-1 overflow-y-auto p-5 pb-24 md:p-8 md:pb-8">
        <header className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Admin Control Center</h1>
              <p className="text-sm text-gray-600">Welcome back, {userEmail?.split("@")[0] || "Admin"}. Manage operations by desk.</p>
            </div>
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              <FiRefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {tabs.filter((tab) => tab.show).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  activeTab === tab.key ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </header>

        {loadWarning ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{loadWarning}</div>
        ) : null}
        {receiptMessage ? (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{receiptMessage}</div>
        ) : null}

        {isLoading ? (
          <div className="mt-6 flex h-64 items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-4 border-primary" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {activeTab === "overview" ? (
              <>
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                      <FiDollarSign className="h-3.5 w-3.5 text-emerald-600" /> Revenue
                    </p>
                    <p className="mt-2 text-2xl font-black text-gray-900">{formatCurrency(totalRevenue)}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                      <FiShoppingBag className="h-3.5 w-3.5 text-blue-600" /> Total Orders
                    </p>
                    <p className="mt-2 text-2xl font-black text-gray-900">{totalOrders}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                      <FiBriefcase className="h-3.5 w-3.5 text-indigo-600" /> Commission
                    </p>
                    <p className="mt-2 text-2xl font-black text-gray-900">{formatCurrency(platformCommission)}</p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="inline-flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                      <FiAlertCircle className="h-3.5 w-3.5 text-amber-600" /> Avg. Order Value
                    </p>
                    <p className="mt-2 text-2xl font-black text-gray-900">{formatCurrency(averageOrderValue)}</p>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-2">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Priority Queue</h2>
                    <p className="mt-1 text-xs text-gray-500">Resolve these items first.</p>
                    <div className="mt-4 space-y-2">
                      {queueItems.length === 0 ? (
                        <p className="rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500">No pending operational queue.</p>
                      ) : (
                        queueItems.map((item) => (
                          <Link
                            key={item.label}
                            href={item.href}
                            className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-3 hover:border-primary/40 hover:bg-blue-50/40"
                          >
                            <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-bold text-gray-700">{item.value}</span>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm xl:col-span-3">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Desks & Modules</h2>
                    <p className="mt-1 text-xs text-gray-500">Open a focused workspace for each operation.</p>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      {quickLinks.map((entry) => (
                        <Link
                          key={entry.href}
                          href={entry.href}
                          className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 hover:border-primary/40 hover:bg-white"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-gray-900">{entry.label}</p>
                            <FiArrowRight className="h-4 w-4 text-gray-500" />
                          </div>
                          <p className="mt-1 text-xs text-gray-700">{entry.count}</p>
                          <p className="mt-1 text-[11px] text-gray-500">{entry.meta}</p>
                        </Link>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Recent Activity</h2>
                    <span className="text-xs text-gray-500">Last {Math.min(8, orders.length)} orders</span>
                  </div>
                  {orders.length === 0 ? (
                    <p className="mt-4 rounded-lg bg-gray-50 px-3 py-3 text-sm text-gray-500">No recent order activity yet.</p>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {orders.slice(0, 8).map((order, index) => (
                        <div key={order.id || index} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 px-3 py-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{order.order_number || `#${order.id}`}</p>
                            <p className="text-xs text-gray-500">{order.user?.email || order.shipping_address?.full_name || "Customer unavailable"}</p>
                            {order.id ? (
                              <button
                                type="button"
                                onClick={() => generateOrderReceipt(Number(order.id))}
                                disabled={receiptBusyOrderId === Number(order.id)}
                                className="mt-2 rounded-lg border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                              >
                                {receiptBusyOrderId === Number(order.id) ? "Generating..." : "Generate Receipt"}
                              </button>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(String(order.status || "pending"))}`}>
                              {order.status || "Pending"}
                            </span>
                            <p className="mt-1 text-sm font-semibold text-gray-900">{formatCurrency(Number(order.total_amount || 0))}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : null}

            {activeTab === "orders" && canViewOrders ? (
              <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Recent Orders</h2>
                  <p className="text-xs text-gray-500 mt-1">Latest customer orders and totals.</p>
                </div>
                {orders.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-gray-500">No orders found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                          <th className="px-5 py-3">Order</th>
                          <th className="px-5 py-3">Customer</th>
                          <th className="px-5 py-3">Created</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3 text-right">Amount</th>
                          <th className="px-5 py-3 text-right">Receipt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.slice(0, 20).map((order, index) => (
                          <tr key={order.id || index} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-5 py-3 font-semibold text-gray-900">{order.order_number || `#${order.id}`}</td>
                            <td className="px-5 py-3 text-sm text-gray-700">{order.user?.email || order.shipping_address?.full_name || "N/A"}</td>
                            <td className="px-5 py-3 text-sm text-gray-600">{order.created_at ? formatDateTime(order.created_at) : "-"}</td>
                            <td className="px-5 py-3 text-sm">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(String(order.status || "Pending"))}`}>
                                {order.status || "Pending"}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-right text-sm font-semibold text-gray-900">{formatCurrency(Number(order.total_amount || 0))}</td>
                            <td className="px-5 py-3 text-right">
                              {order.id ? (
                                <button
                                  type="button"
                                  onClick={() => generateOrderReceipt(Number(order.id))}
                                  disabled={receiptBusyOrderId === Number(order.id)}
                                  className="rounded-lg border border-primary/30 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                                >
                                  {receiptBusyOrderId === Number(order.id) ? "Generating..." : "Generate"}
                                </button>
                              ) : (
                                "-"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}

            {activeTab === "chatbot" && canViewChatbot ? (
              <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Client-Bot Conversations</h2>
                      <p className="text-xs text-gray-500 mt-1">Review chatbot interactions and conversation quality.</p>
                    </div>
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        await loadConversations(conversationSearchInput);
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        value={conversationSearchInput}
                        onChange={(event) => setConversationSearchInput(event.target.value)}
                        placeholder="Search email, customer ID..."
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm md:w-72"
                      />
                      <button className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white">Search</button>
                    </form>
                  </div>
                </div>

                {chatError ? <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{chatError}</div> : null}

                <div className="grid grid-cols-1 lg:grid-cols-3 min-h-[420px]">
                  <div className="border-r border-gray-100 max-h-[560px] overflow-y-auto">
                    {chatConversations.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-gray-500">No conversations found.</p>
                    ) : (
                      chatConversations.map((conversation) => (
                        <button
                          key={conversation.id}
                          type="button"
                          onClick={async () => {
                            if (!token) return;
                            setSelectedConversationId(conversation.id);
                            setChatLoading(true);
                            try {
                              const detail = await getChatbotConversationDetail(token, conversation.id);
                              setSelectedConversationDetail(detail);
                            } finally {
                              setChatLoading(false);
                            }
                          }}
                          className={`w-full border-b border-gray-100 px-5 py-4 text-left hover:bg-gray-50 ${
                            selectedConversationId === conversation.id ? "bg-blue-50" : ""
                          }`}
                        >
                          <p className="text-sm font-semibold text-gray-900 truncate">{conversation.user_email}</p>
                          <p className="text-xs text-primary mt-1">{conversation.user_customer_id || "No customer ID"}</p>
                          <p className="text-xs text-gray-500 mt-1 truncate">{conversation.last_user_message || "No user message"}</p>
                          <p className="text-[11px] text-gray-400 mt-1">{formatDateTime(conversation.updated_at)}</p>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="lg:col-span-2 bg-gray-50/40 px-5 py-5 max-h-[560px] overflow-y-auto">
                    {chatLoading ? (
                      <div className="flex h-48 items-center justify-center">
                        <div className="h-9 w-9 animate-spin rounded-full border-b-4 border-primary" />
                      </div>
                    ) : !selectedConversationDetail ? (
                      <p className="text-sm text-gray-500">Select a conversation to read messages.</p>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500">
                          Session: {selectedConversationDetail.session_id} | Updated {formatDateTime(selectedConversationDetail.updated_at)}
                        </p>
                        {selectedConversationDetail.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`max-w-[90%] rounded-xl px-4 py-3 text-sm shadow-sm ${
                              message.role === "user" ? "ml-auto bg-primary text-white" : "mr-auto border border-gray-100 bg-white text-gray-800"
                            }`}
                          >
                            <p className="text-[11px] font-bold uppercase tracking-wide opacity-80 mb-1">
                              {message.role === "user" ? "Client" : "Bot"}
                            </p>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            ) : null}
            {activeTab === "chatbot" && !canViewChatbot ? (
              <section className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
                You do not have permission to view chatbot conversations.
              </section>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
