"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";
import { useAuth } from "../../../src/context/AuthContext";
import { createAdminPosOrder, getProducts, Order } from "../../../src/services/api";
import { Product, ProductSaleOption } from "../../../src/types";

type PosLineItem = {
  product_id: number;
  quantity: number;
  sale_option_id: number | null;
};

function formatKes(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(amount);
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getActiveSaleOptions(product: Product): ProductSaleOption[] {
  if (!Array.isArray(product.sale_options)) return [];
  return product.sale_options.filter((option) => option.is_active !== false);
}

function getLineUnitPrice(product: Product, saleOptionId: number | null): number {
  const options = getActiveSaleOptions(product);
  const option = options.find((row) => row.id === saleOptionId) || null;
  if (!option) return toNumber(product.effective_price || product.price);
  if (option.use_manual_price && option.manual_price) {
    return toNumber(option.manual_price);
  }
  return toNumber(option.computed_unit_price || product.effective_price || product.price);
}

function getOptionLabel(product: Product, saleOptionId: number | null): string {
  const options = getActiveSaleOptions(product);
  const option = options.find((row) => row.id === saleOptionId) || null;
  if (!option) return product.base_unit_label || "item";
  return option.display_label || option.label || product.base_unit_label || "item";
}

export default function AdminPosPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, canAccessAdminModule, hasAdminPermission } = useAuth();
  const canViewPos = canAccessAdminModule("pos") && hasAdminPermission("pos.view");
  const canManagePos = hasAdminPermission("pos.manage") || hasAdminPermission("orders.edit");

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [lastOrder, setLastOrder] = useState<Order | null>(null);

  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa" | "card" | "bank_transfer" | "pending">("cash");
  const [markAsPaid, setMarkAsPaid] = useState(true);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PosLineItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<number | "">("");
  const [barcodeInput, setBarcodeInput] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canViewPos) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, canViewPos, router]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const all = await getProducts();
      setProducts((all || []).filter((row) => row.is_active && toNumber(row.stock) > 0));
    } catch (err: any) {
      setError(err?.message || "Failed to load products for POS.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && canViewPos) {
      loadProducts();
    }
  }, [isAuthenticated, canViewPos, loadProducts]);

  const productMap = useMemo(() => {
    return new Map<number, Product>(products.map((item) => [item.id, item]));
  }, [products]);

  const addLine = () => {
    if (!selectedProductId) return;
    const product = productMap.get(Number(selectedProductId));
    if (!product) return;
    const defaultOption =
      getActiveSaleOptions(product).find((row) => row.is_default) || getActiveSaleOptions(product)[0] || null;
    setLines((prev) => [
      ...prev,
      {
        product_id: product.id,
        quantity: 1,
        sale_option_id: defaultOption?.id ?? null,
      },
    ]);
    setSelectedProductId("");
  };

  const addLineByBarcode = () => {
    const code = barcodeInput.trim();
    if (!code) return;
    const product = products.find((row) => (row.barcode || "").trim() === code);
    if (!product) {
      setError(`No product found for barcode "${code}".`);
      return;
    }
    const defaultOption =
      getActiveSaleOptions(product).find((row) => row.is_default) || getActiveSaleOptions(product)[0] || null;
    setLines((prev) => [
      ...prev,
      {
        product_id: product.id,
        quantity: 1,
        sale_option_id: defaultOption?.id ?? null,
      },
    ]);
    setBarcodeInput("");
    setError("");
  };

  const updateLine = (index: number, patch: Partial<PosLineItem>) => {
    setLines((prev) => prev.map((line, idx) => (idx === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const lineTotals = useMemo(() => {
    return lines.map((line) => {
      const product = productMap.get(line.product_id);
      if (!product) return 0;
      const unitPrice = getLineUnitPrice(product, line.sale_option_id);
      return unitPrice * Math.max(1, Number(line.quantity || 1));
    });
  }, [lines, productMap]);

  const grandTotal = useMemo(() => lineTotals.reduce((sum, value) => sum + value, 0), [lineTotals]);

  const submitPosOrder = async () => {
    if (!token || !canManagePos) return;
    if (lines.length === 0) {
      setError("Add at least one item before creating a POS order.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    setLastOrder(null);
    try {
      const response = await createAdminPosOrder(token, {
        customer_email: customerEmail.trim() || undefined,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        payment_method: paymentMethod,
        mark_as_paid: paymentMethod === "pending" ? false : markAsPaid,
        notes: notes.trim() || undefined,
        items: lines.map((line) => ({
          product_id: line.product_id,
          quantity: Math.max(1, Number(line.quantity || 1)),
          sale_option_id: line.sale_option_id ?? undefined,
        })),
      });
      setSuccess(response.detail || "POS order created successfully.");
      setLastOrder(response.order);
      setLines([]);
      setNotes("");
    } catch (err: any) {
      setError(err?.message || "Failed to create POS order.");
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canViewPos) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <AdminSidebar active="pos" />
      <main className="flex-1 overflow-y-auto p-6 pb-24 md:p-8 md:pb-8">
        <div className="space-y-4">
          <div className="rounded-modern border border-gray-200 bg-white p-5">
            <h1 className="text-2xl font-bold text-gray-900">POS Desk</h1>
            <p className="text-sm text-gray-600">Create in-store orders and push them to customer, vendor, and admin order flows instantly.</p>
          </div>

          {error ? <div className="rounded-modern border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}
          {success ? <div className="rounded-modern border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{success}</div> : null}

          <section className="rounded-modern border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Customer & Payment</h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-gray-700">Customer Email (optional for walk-in)</span>
                <input
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full rounded-modern border border-gray-300 px-3 py-2 outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-gray-700">Customer Name</span>
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in customer"
                  className="w-full rounded-modern border border-gray-300 px-3 py-2 outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-gray-700">Customer Phone</span>
                <input
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="07XXXXXXXX"
                  className="w-full rounded-modern border border-gray-300 px-3 py-2 outline-none focus:border-primary"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-gray-700">Payment Method</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as "cash" | "mpesa" | "card" | "bank_transfer" | "pending")}
                  className="w-full rounded-modern border border-gray-300 px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="cash">Cash</option>
                  <option value="mpesa">M-Pesa</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="pending">Pending Payment</option>
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={paymentMethod === "pending" ? false : markAsPaid}
                onChange={(e) => setMarkAsPaid(e.target.checked)}
                disabled={paymentMethod === "pending"}
              />
              Mark order as paid now
            </label>
            <label className="space-y-1 text-sm block">
              <span className="font-medium text-gray-700">Notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Cashier note, till reference, etc."
                className="w-full rounded-modern border border-gray-300 px-3 py-2 outline-none focus:border-primary"
              />
            </label>
          </section>

          <section className="rounded-modern border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Items</h2>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addLineByBarcode();
                    }
                  }}
                  placeholder="Scan barcode here (scanner acts like keyboard)"
                  className="w-full rounded-modern border border-gray-300 px-3 py-2 outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addLineByBarcode}
                  disabled={!barcodeInput.trim() || loading}
                  className="rounded-modern border border-primary/30 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 disabled:opacity-60"
                >
                  Scan Add
                </button>
              </div>
              <div className="text-xs text-gray-500 md:col-span-1 md:text-right">
                Tip: Click inside the barcode box once, then scan physically.
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value ? Number(e.target.value) : "")}
                className="w-full rounded-modern border border-gray-300 px-3 py-2 outline-none focus:border-primary"
              >
                <option value="">Select product...</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.title} - {formatKes(toNumber(product.effective_price || product.price))}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={addLine}
                disabled={!selectedProductId || loading}
                className="rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
              >
                Add Item
              </button>
              <button
                type="button"
                onClick={loadProducts}
                className="rounded-modern border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Refresh Products
              </button>
            </div>

            {loading ? <p className="text-sm text-gray-500">Loading products...</p> : null}

            <div className="space-y-2">
              {lines.map((line, index) => {
                const product = productMap.get(line.product_id);
                if (!product) return null;
                const options = getActiveSaleOptions(product);
                const lineTotal = lineTotals[index] || 0;
                return (
                  <div key={`${line.product_id}-${index}`} className="rounded-modern border border-gray-200 p-3">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-5 md:items-end">
                      <div className="md:col-span-2">
                        <p className="text-sm font-semibold text-gray-900">{product.title}</p>
                        <p className="text-xs text-gray-500">Stock: {product.stock}</p>
                      </div>
                      <label className="text-sm">
                        <span className="block text-xs text-gray-600 mb-1">Unit</span>
                        <select
                          value={line.sale_option_id ?? ""}
                          onChange={(e) =>
                            updateLine(index, {
                              sale_option_id: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className="w-full rounded-modern border border-gray-300 px-3 py-2 outline-none focus:border-primary"
                        >
                          <option value="">Default ({product.base_unit_label})</option>
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.display_label || option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        <span className="block text-xs text-gray-600 mb-1">Quantity</span>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(index, { quantity: Math.max(1, Number(e.target.value || 1)) })}
                          className="w-full rounded-modern border border-gray-300 px-3 py-2 outline-none focus:border-primary"
                        />
                      </label>
                      <div className="flex items-center justify-between gap-2 md:justify-end">
                        <div className="text-right">
                          <p className="text-xs text-gray-600">{getOptionLabel(product, line.sale_option_id)}</p>
                          <p className="text-sm font-bold text-gray-900">{formatKes(lineTotal)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(index)}
                          className="rounded-modern border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-modern border border-primary/20 bg-primary/5 px-4 py-3">
              <span className="text-sm font-semibold text-gray-700">Grand Total</span>
              <span className="text-lg font-bold text-primary">{formatKes(grandTotal)}</span>
            </div>

            <button
              type="button"
              onClick={submitPosOrder}
              disabled={saving || !canManagePos || lines.length === 0}
              className="w-full rounded-modern bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? "Creating POS Order..." : "Create POS Order"}
            </button>
          </section>

          {lastOrder ? (
            <section className="rounded-modern border border-emerald-200 bg-emerald-50 p-5">
              <h3 className="text-base font-semibold text-emerald-800">Last POS Order Created</h3>
              <p className="mt-1 text-sm text-emerald-900">
                Order <strong>{lastOrder.order_number}</strong> created for{" "}
                <strong>{formatKes(toNumber(lastOrder.total_amount))}</strong> ({lastOrder.status}).
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                It is now visible in Admin Orders, Vendor Orders, Customer Orders, and Finance dashboards.
              </p>
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
