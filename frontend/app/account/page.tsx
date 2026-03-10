"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../src/context/AuthContext";
import { useCart } from "../../src/context/CartContext";
import { useDashboardTheme } from "../../src/hooks/useDashboardTheme";
import AdSlot from "../../src/components/ads/AdSlot";
import { Product } from "../../src/types";
import {
  ChatHistoryMessage,
  CreatePaymentMethodPayload,
  Order,
  ShippingAddress,
  StoredPaymentMethod,
  UserProfile,
  cancelMyOrder,
  createPaymentMethod,
  createShippingAddress,
  downloadReceiptPdf,
  deletePaymentMethod,
  deleteShippingAddress,
  generateReceiptForTransaction,
  getMyOrders,
  getMyProfile,
  getPaymentMethods,
  getShippingAddresses,
  sendMessageToBot,
  updateMyProfile,
  updatePaymentMethod,
  updateShippingAddress,
} from "../../src/services/api";

type Section =
  | "overview"
  | "orders"
  | "wishlist"
  | "cart"
  | "addresses"
  | "payments"
  | "settings"
  | "returns"
  | "support"
  | "security"
  | "seller";

interface ReturnRequest {
  id: string;
  order_number: string;
  status: "Requested" | "Approved" | "Refunded";
  created_at: string;
}

interface AssistantMessage {
  sender: "user" | "bot";
  text: string;
}

interface SiteActivityEntry {
  path: string;
  timestamp: string;
}

const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "orders", label: "My Orders" },
  { key: "wishlist", label: "Wishlist" },
  { key: "cart", label: "Shopping Activity" },
  { key: "addresses", label: "Address Book" },
  { key: "payments", label: "Payment Section" },
  { key: "settings", label: "Account Settings" },
  { key: "returns", label: "Returns & Refunds" },
  { key: "support", label: "Support Center" },
  { key: "security", label: "Security & Privacy" },
  { key: "seller", label: "Seller Tools" },
];

const EMPTY_ADDRESS: Omit<ShippingAddress, "id" | "user"> = {
  full_name: "",
  phone_number: "",
  address_line_1: "",
  address_line_2: null,
  city: "",
  postal_code: null,
  country: "Kenya",
  is_default: false,
};

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function money(amount: number): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", currencyDisplay: "code", maximumFractionDigits: 0 }).format(amount);
}

function statusBadge(status: string): string {
  if (status === "Delivered") return "bg-emerald-100 text-emerald-700";
  if (status === "Cancelled") return "bg-red-100 text-red-700";
  if (status === "Shipped") return "bg-blue-100 text-blue-700";
  if (status === "Processing") return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-700";
}

export default function AccountPage() {
  const router = useRouter();
  const { isAuthenticated, token, userEmail, customerId, displayName, userRole, logout } = useAuth();
  const { cartItems, addToCart } = useCart();
  const { theme } = useDashboardTheme();

  const [section, setSection] = useState<Section>("overview");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<ShippingAddress[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<StoredPaymentMethod[]>([]);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<Product[]>([]);
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [twoFactor, setTwoFactor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [receiptBusyOrderId, setReceiptBusyOrderId] = useState<number | null>(null);

  const [addressForm, setAddressForm] = useState(EMPTY_ADDRESS);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [profileForm, setProfileForm] = useState({ first_name: "", last_name: "", email: "", phone_number: "" });
  const [paymentForm, setPaymentForm] = useState({
    method_type: "card" as "card" | "mpesa",
    provider: "Visa",
    cardholder_name: "",
    card_number: "",
    card_expiry: "",
    mpesa_phone: "",
    billing_email: "",
    is_default: false,
  });

  const [assistantInput, setAssistantInput] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantSessionId, setAssistantSessionId] = useState(`account-${Date.now()}`);

  const fullName = useMemo(() => (profile?.first_name?.trim() ? profile.first_name : displayName), [profile?.first_name, displayName]);
  const totalSpend = useMemo(() => orders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0), [orders]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole === "vendor") {
      router.push("/vendor");
      return;
    }
    if (userRole === "admin") {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, router]);

  useEffect(() => {
    setWishlist(lsGet<Product[]>("wishlistItems", []));
    setRecentlyViewed(lsGet<Product[]>("recentlyViewedProducts", []));
    setReturns(lsGet<ReturnRequest[]>("returnRequests", []));
    setTwoFactor(lsGet<boolean>("twoFactorEnabled", false));
  }, []);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoading(true);
      const [p, o, a, pm] = await Promise.allSettled([
        getMyProfile(token),
        getMyOrders(token),
        getShippingAddresses(token),
        getPaymentMethods(token),
      ]);
      if (p.status === "fulfilled") {
        setProfile(p.value);
        setProfileForm({
          first_name: p.value.first_name || "",
          last_name: p.value.last_name || "",
          email: p.value.email || "",
          phone_number: p.value.phone_number || "",
        });
        setPaymentForm((prev) => ({ ...prev, billing_email: p.value.email || userEmail || "" }));
      }
      if (o.status === "fulfilled") setOrders(o.value);
      if (a.status === "fulfilled") setAddresses(a.value);
      if (pm.status === "fulfilled") setPaymentMethods(pm.value);
      setLoading(false);
    };
    load();
  }, [token, userEmail]);

  useEffect(() => localStorage.setItem("wishlistItems", JSON.stringify(wishlist)), [wishlist]);
  useEffect(() => localStorage.setItem("returnRequests", JSON.stringify(returns)), [returns]);
  useEffect(() => localStorage.setItem("twoFactorEnabled", JSON.stringify(twoFactor)), [twoFactor]);

  if (!isAuthenticated || userRole === "vendor" || userRole === "admin") return null;

  const saveAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      const payload = {
        ...addressForm,
        full_name: addressForm.full_name.trim(),
        phone_number: addressForm.phone_number.trim(),
        address_line_1: addressForm.address_line_1.trim(),
        city: addressForm.city.trim(),
      };
      const result = editingAddressId
        ? await updateShippingAddress(editingAddressId, payload, token)
        : await createShippingAddress(payload, token);
      setAddresses((prev) => {
        if (editingAddressId) return prev.map((row) => (row.id === editingAddressId ? result : row));
        return [result, ...prev];
      });
      setEditingAddressId(null);
      setAddressForm(EMPTY_ADDRESS);
      setMessage("Address saved.");
    } catch (error: any) {
      setMessage(error.message || "Unable to save address.");
    }
  };

  const savePayment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;
    try {
      let payload: CreatePaymentMethodPayload;
      if (paymentForm.method_type === "card") {
        payload = {
          method_type: "card",
          provider: paymentForm.provider,
          cardholder_name: paymentForm.cardholder_name,
          card_number: paymentForm.card_number.replace(/\D/g, ""),
          card_expiry: paymentForm.card_expiry,
          billing_email: paymentForm.billing_email || undefined,
          is_default: paymentForm.is_default,
        };
      } else {
        payload = {
          method_type: "mpesa",
          mpesa_phone: paymentForm.mpesa_phone.replace(/\D/g, ""),
          billing_email: paymentForm.billing_email || undefined,
          is_default: paymentForm.is_default,
        };
      }
      const created = await createPaymentMethod(payload, token);
      setPaymentMethods((prev) => [created, ...prev.map((row) => ({ ...row, is_default: created.is_default ? false : row.is_default }))]);
      setPaymentForm((prev) => ({ ...prev, cardholder_name: "", card_number: "", card_expiry: "", mpesa_phone: "", is_default: false }));
      setMessage("Payment method saved.");
    } catch (error: any) {
      setMessage(error.message || "Unable to save payment method.");
    }
  };

  const removeAddress = async (id: number) => {
    if (!token) return;
    try {
      await deleteShippingAddress(id, token);
      setAddresses((prev) => prev.filter((row) => row.id !== id));
      setMessage("Address removed.");
    } catch (error: any) {
      setMessage(error.message || "Unable to remove address.");
    }
  };

  const setDefaultAddress = async (id: number) => {
    if (!token) return;
    try {
      const updated = await updateShippingAddress(id, { is_default: true }, token);
      setAddresses((prev) => prev.map((row) => (row.id === id ? updated : { ...row, is_default: false })));
      setMessage("Default address updated.");
    } catch (error: any) {
      setMessage(error.message || "Unable to set default address.");
    }
  };

  const removePaymentMethod = async (id: number) => {
    if (!token) return;
    try {
      await deletePaymentMethod(id, token);
      setPaymentMethods((prev) => prev.filter((row) => row.id !== id));
      setMessage("Payment method removed.");
    } catch (error: any) {
      setMessage(error.message || "Unable to remove payment method.");
    }
  };

  const setDefaultPaymentMethod = async (id: number) => {
    if (!token) return;
    try {
      const updated = await updatePaymentMethod(id, { is_default: true }, token);
      setPaymentMethods((prev) => prev.map((row) => (row.id === id ? updated : { ...row, is_default: false })));
      setMessage("Default payment method updated.");
    } catch (error: any) {
      setMessage(error.message || "Unable to set default payment method.");
    }
  };

  const cancelOrder = async (orderId: number) => {
    if (!token) return;
    try {
      const updated = await cancelMyOrder(orderId, token);
      setOrders((prev) => prev.map((row) => (row.id === orderId ? updated : row)));
      setMessage(`Order ${updated.order_number} cancelled.`);
    } catch (error: any) {
      setMessage(error.message || "Unable to cancel order.");
    }
  };

  const generateOrderReceipt = async (orderId: number) => {
    if (!token) return;
    setReceiptBusyOrderId(orderId);
    setMessage(null);
    try {
      const receipt = await generateReceiptForTransaction(token, { entity_type: "order", entity_id: orderId });
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
      setMessage(`Receipt ${receipt.receipt_number} downloaded.`);
    } catch (error: any) {
      setMessage(error.message || "Unable to generate receipt.");
    } finally {
      setReceiptBusyOrderId(null);
    }
  };

  const askAssistant = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = assistantInput.trim();
    if (!question) return;
    const siteActivity = lsGet<SiteActivityEntry[]>("siteActivityLog", []).slice(0, 8).map((a) => a.path).join(", ");
    const activityContext = [
      `User email: ${profile?.email || userEmail || "guest"}`,
      `Customer ID: ${customerId || "N/A"}`,
      `Recent pages: ${siteActivity || "none"}`,
      `Recently viewed: ${recentlyViewed.slice(0, 5).map((p) => p.title).join(", ") || "none"}`,
      `Cart: ${cartItems.slice(0, 5).map((p) => `${p.title} x${p.quantity}`).join(", ") || "none"}`,
      `Orders: ${orders.slice(0, 5).map((o) => `${o.order_number}:${o.status}`).join(", ") || "none"}`,
      "Website coverage includes products, checkout, payment guidelines, shipping, returns, track order, privacy notice, terms, help center, contact and chat pages.",
    ].join("\n");

    const visibleUserMessage: AssistantMessage = { sender: "user", text: question };
    const nextMessages = [...assistantMessages, visibleUserMessage];
    setAssistantMessages(nextMessages);
    setAssistantInput("");
    setAssistantLoading(true);

    const history: ChatHistoryMessage[] = nextMessages.slice(-8).map((m) => ({ sender: m.sender, text: m.text }));
    const prompt = `Customer question: ${question}\n\nUse this context for a personalized accurate response:\n${activityContext}`;
    try {
      const result = await sendMessageToBot(prompt, history, assistantSessionId, token);
      if (result.session_id) setAssistantSessionId(result.session_id);
      setAssistantMessages((prev) => [...prev, { sender: "bot", text: result.reply }]);
    } catch (error: any) {
      setAssistantMessages((prev) => [...prev, { sender: "bot", text: error.message || "I could not process that request." }]);
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <main data-theme={theme} className="dashboard-shell min-h-screen px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-modern bg-white p-5 shadow-modern">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">King-Kush Account</p>
          </div>
          <h1 className="text-h2 font-heading font-bold text-primary">Welcome, {fullName}</h1>
          <p className="text-sm text-gray-600">{profile?.email || userEmail} {customerId ? `| ${customerId}` : ""}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded-modern bg-white p-3 shadow-modern">
            <div className="flex gap-2 overflow-x-auto lg:flex-col">
              {SECTIONS.map((entry) => (
                <button key={entry.key} type="button" onClick={() => setSection(entry.key)} className={`shrink-0 rounded-modern px-3 py-2 text-sm font-semibold transition-colors ${section === entry.key ? "bg-primary text-white shadow-sm" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{entry.label}</button>
              ))}
            </div>
          </aside>

          <section className="rounded-modern bg-white p-5 shadow-modern">
            <div className="mb-4">
              <AdSlot placementKey="dashboard_promo_card" pagePath="/account" />
            </div>
            {loading ? <div className="flex min-h-65 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-b-4 border-primary" /></div> : (
              <div className="space-y-4">
                {message ? <div className="rounded-modern bg-blue-50 px-3 py-2 text-sm text-blue-800">{message}</div> : null}

                {section === "overview" ? <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-modern border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Orders</p><p className="text-2xl font-bold">{orders.length}</p></div>
                    <div className="rounded-modern border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Pending</p><p className="text-2xl font-bold">{orders.filter((o) => o.status !== "Delivered" && o.status !== "Cancelled").length}</p></div>
                    <div className="rounded-modern border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Wishlist</p><p className="text-2xl font-bold">{wishlist.length}</p></div>
                    <div className="rounded-modern border border-gray-100 bg-gray-50 p-4"><p className="text-xs text-gray-500">Total Spend</p><p className="text-2xl font-bold">{money(totalSpend)}</p></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/account/receipts" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
                      Open Receipt Center
                    </Link>
                  </div>
                </> : null}

                {section === "orders" ? <div className="space-y-3">
                  {orders.map((order) => <div key={order.id} className="rounded-modern border border-gray-100 p-4">
                    <div className="flex justify-between"><p className="text-sm font-semibold">{order.order_number}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(order.status)}`}>{order.status}</span></div>
                    <p className="mt-1 text-xs text-gray-500">{new Date(order.created_at).toLocaleString()} | {money(Number(order.total_amount || 0))}</p>
                    <div className="mt-3 flex gap-2">
                      <Link href={`/account/orders/${encodeURIComponent(order.order_number)}`} className="rounded-modern bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors">Order Details</Link>
                      <button
                        type="button"
                        onClick={() => generateOrderReceipt(order.id)}
                        disabled={receiptBusyOrderId === order.id}
                        className="rounded-modern border border-primary/30 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
                      >
                        {receiptBusyOrderId === order.id ? "Generating..." : "Generate Receipt"}
                      </button>
                      <button type="button" onClick={() => cancelOrder(order.id)} className="rounded-modern border border-red-200 px-3 py-2 text-xs font-semibold text-red-700" disabled={!(order.status === "Pending" || order.status === "Processing")}>Cancel</button>
                    </div>
                  </div>)}
                </div> : null}

                {section === "wishlist" ? <div className="space-y-3">
                  {wishlist.length === 0 ? <p className="text-sm text-gray-500">No saved items yet.</p> : null}
                  {wishlist.map((item) => <div key={item.id} className="rounded-modern border border-gray-100 p-4">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => { addToCart(item); setWishlist((prev) => prev.filter((row) => row.id !== item.id)); }} className="rounded-modern bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors">Move to Cart</button>
                      <button type="button" onClick={() => setWishlist((prev) => prev.filter((row) => row.id !== item.id))} className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-100 transition-colors">Remove</button>
                    </div>
                  </div>)}
                </div> : null}

                {section === "cart" ? <div className="space-y-2 text-sm">{cartItems.length === 0 ? <p className="text-gray-500">No recent cart activity.</p> : cartItems.map((item) => <p key={item.id}>{item.title} | Qty {item.quantity}</p>)}</div> : null}

                {section === "addresses" ? <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
                  <div className="space-y-3">{addresses.map((row) => <div key={row.id} className="rounded-modern border border-gray-100 p-4">
                    <p className="text-sm font-semibold">{row.full_name} {row.is_default ? "| Default" : ""}</p>
                    <p className="text-xs text-gray-600">{row.address_line_1}, {row.city}</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={() => { setEditingAddressId(row.id); setAddressForm({ full_name: row.full_name, phone_number: row.phone_number, address_line_1: row.address_line_1, address_line_2: row.address_line_2, city: row.city, postal_code: row.postal_code, country: row.country, is_default: row.is_default }); }} className="rounded-modern border border-gray-200 px-3 py-1 text-xs font-semibold">Edit</button>
                      <button type="button" onClick={() => removeAddress(row.id)} className="rounded-modern border border-red-200 px-3 py-1 text-xs font-semibold text-red-700">Delete</button>
                      {!row.is_default ? <button type="button" onClick={() => setDefaultAddress(row.id)} className="rounded-modern border border-primary/30 px-3 py-1 text-xs font-semibold text-primary">Set Default</button> : null}
                    </div>
                  </div>)}</div>
                  <form onSubmit={saveAddress} className="space-y-2 rounded-modern border border-gray-100 p-4">
                    <input required value={addressForm.full_name} onChange={(e) => setAddressForm((p) => ({ ...p, full_name: e.target.value }))} placeholder="Full Name" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                    <input required value={addressForm.phone_number} onChange={(e) => setAddressForm((p) => ({ ...p, phone_number: e.target.value }))} placeholder="Phone" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                    <input required value={addressForm.address_line_1} onChange={(e) => setAddressForm((p) => ({ ...p, address_line_1: e.target.value }))} placeholder="Address" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                    <input required value={addressForm.city} onChange={(e) => setAddressForm((p) => ({ ...p, city: e.target.value }))} placeholder="City" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                    <button type="submit" className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white">{editingAddressId ? "Update Address" : "Add Address"}</button>
                  </form>
                </div> : null}

                {section === "payments" ? <div className="space-y-4">
                  <div className="space-y-2">
                    {paymentMethods.length === 0 ? <p className="text-sm text-gray-500">No saved payment methods yet.</p> : paymentMethods.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-modern border border-gray-200 p-3">
                      <div><p className="text-sm font-semibold">{row.display_name}</p><p className="text-xs text-gray-500">{row.masked_reference}</p></div>
                      <div className="flex gap-2">{row.is_default ? <span className="rounded-modern bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">Default</span> : <button type="button" onClick={() => setDefaultPaymentMethod(row.id)} className="rounded-modern border border-primary/30 px-2 py-1 text-xs font-semibold text-primary">Set Default</button>}<button type="button" onClick={() => removePaymentMethod(row.id)} className="rounded-modern border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">Remove</button></div>
                    </div>)}
                  </div>

                  <form onSubmit={savePayment} className="space-y-2 rounded-modern border border-gray-100 p-4">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setPaymentForm((p) => ({ ...p, method_type: "card" }))} className={`rounded-modern px-3 py-2 text-xs font-semibold ${paymentForm.method_type === "card" ? "bg-primary text-white" : "border border-gray-200 text-gray-700"}`}>Card</button>
                      <button type="button" onClick={() => setPaymentForm((p) => ({ ...p, method_type: "mpesa" }))} className={`rounded-modern px-3 py-2 text-xs font-semibold ${paymentForm.method_type === "mpesa" ? "bg-primary text-white" : "border border-gray-200 text-gray-700"}`}>M-Pesa</button>
                    </div>
                    {paymentForm.method_type === "card" ? <>
                      <input required value={paymentForm.provider} onChange={(e) => setPaymentForm((p) => ({ ...p, provider: e.target.value }))} placeholder="Card Brand" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                      <input required value={paymentForm.cardholder_name} onChange={(e) => setPaymentForm((p) => ({ ...p, cardholder_name: e.target.value }))} placeholder="Cardholder Name" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                      <input required value={paymentForm.card_number} onChange={(e) => setPaymentForm((p) => ({ ...p, card_number: e.target.value }))} placeholder="Card Number" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                      <input required value={paymentForm.card_expiry} onChange={(e) => setPaymentForm((p) => ({ ...p, card_expiry: e.target.value }))} placeholder="Expiry MM/YY" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                    </> : <input required value={paymentForm.mpesa_phone} onChange={(e) => setPaymentForm((p) => ({ ...p, mpesa_phone: e.target.value }))} placeholder="M-Pesa Phone Number" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />}
                    <input value={paymentForm.billing_email} onChange={(e) => setPaymentForm((p) => ({ ...p, billing_email: e.target.value }))} placeholder="Billing Email" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                    <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={paymentForm.is_default} onChange={(e) => setPaymentForm((p) => ({ ...p, is_default: e.target.checked }))} />Set as default</label>
                    <button type="submit" className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white">Save Payment Method</button>
                  </form>
                </div> : null}

                {section === "settings" ? <form onSubmit={(e) => { e.preventDefault(); updateMyProfile({ first_name: profileForm.first_name, last_name: profileForm.last_name, email: profileForm.email, phone_number: profileForm.phone_number || null }, token as string).then((updated) => { setProfile(updated); localStorage.setItem("userEmail", updated.email); }); }} className="space-y-2">
                  <input value={profileForm.first_name} onChange={(e) => setProfileForm((p) => ({ ...p, first_name: e.target.value }))} placeholder="First Name" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                  <input value={profileForm.last_name} onChange={(e) => setProfileForm((p) => ({ ...p, last_name: e.target.value }))} placeholder="Last Name" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                  <input type="email" value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                  <input value={profileForm.phone_number} onChange={(e) => setProfileForm((p) => ({ ...p, phone_number: e.target.value }))} placeholder="Phone" className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                  <button type="submit" className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white">Save Settings</button>
                </form> : null}

                {section === "returns" ? <div className="space-y-2">
                  {orders.filter((row) => row.status === "Delivered").map((order) => <button key={order.id} type="button" onClick={() => setReturns((prev) => prev.some((r) => r.order_number === order.order_number) ? prev : [{ id: `${Date.now()}`, order_number: order.order_number, status: "Requested", created_at: new Date().toISOString() }, ...prev])} className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-100 transition-colors">Request return for {order.order_number}</button>)}
                  {returns.map((row) => <p key={row.id} className="text-sm">{row.order_number} | {row.status}</p>)}
                </div> : null}

                {section === "support" ? <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Link href="/footer-links/contact-us" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-100 transition-colors">Contact Support</Link>
                    <Link href="/footer-links/help-center" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-100 transition-colors">Help Center</Link>
                    <Link href="/footer-links/chat-with-us" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-100 transition-colors">Chat with Us</Link>
                  </div>
                  <div className="rounded-modern border border-gray-100 p-4">
                    <p className="text-sm font-semibold">Personal Account Assistant</p>
                    <p className="mt-1 text-xs text-gray-600">Uses full website support content + your activity context for tailored answers.</p>
                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-modern bg-gray-50 p-3">
                      {assistantMessages.length === 0 ? <p className="text-xs text-gray-500">Ask about products, payments, shipping, returns, orders, or any website section.</p> : assistantMessages.map((entry, idx) => <div key={`${entry.sender}-${idx}`} className={`rounded-modern px-3 py-2 text-sm ${entry.sender === "user" ? "ml-auto max-w-[90%] bg-primary text-white" : "mr-auto max-w-[90%] border border-gray-200 bg-white text-gray-800"}`}>{entry.text}</div>)}
                      {assistantLoading ? <p className="text-xs text-gray-500">Assistant is typing...</p> : null}
                    </div>
                    <form onSubmit={askAssistant} className="mt-3 flex gap-2">
                      <input value={assistantInput} onChange={(e) => setAssistantInput(e.target.value)} placeholder="Ask a question..." className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm" />
                      <button type="submit" className="rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white">Send</button>
                    </form>
                  </div>
                </div> : null}

                {section === "security" ? <div className="space-y-2 text-sm">
                  <p>Login Activity: {profile?.email || userEmail}</p>
                  <p>Role: {profile?.role || userRole || "customer"}</p>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={twoFactor} onChange={(e) => setTwoFactor(e.target.checked)} />Enable two-factor authentication</label>
                  <button type="button" onClick={() => { logout(); router.push("/"); }} className="rounded-modern bg-red-600 px-4 py-2 text-xs font-semibold text-white">Logout</button>
                </div> : null}

                {section === "seller" ? <div className="flex flex-wrap gap-2">
                  <Link href="/footer-links/sell" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-100 transition-colors">Sell on King-Kush</Link>
                  <Link href="/footer-links/vendor-hub" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-100 transition-colors">Vendor Dashboard</Link>
                  <Link href="/footer-links/corporate-purchase" className="rounded-modern border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-100 transition-colors">Bulk Purchase Tools</Link>
                </div> : null}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
