"use client";

import { useState } from "react";
import ProductEditorPanel from "../../../src/components/ProductEditorPanel";
import {
  VendorProductPayload,
  VendorProduct,
  getVendorProductsBulkImportTemplate,
  importVendorProductsBulk,
} from "../../../src/services/api";
import { useVendorPanel } from "../../../src/context/VendorPanelContext";
import { useAuth } from "../../../src/context/AuthContext";

export default function VendorProductsPage() {
  const {
    categories,
    products,
    isApproved,
    saving,
    createProduct,
    updateProductById,
    toggleProductActive,
    removeProductById,
    reload,
  } = useVendorPanel();
  const { token } = useAuth();
  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null);
  const [bulkJson, setBulkJson] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const createNewProduct = async (payload: VendorProductPayload & { vendor_profile_id?: number }) => {
    const { vendor_profile_id, ...cleanPayload } = payload;
    void vendor_profile_id;
    await createProduct(cleanPayload);
  };

  const saveProductEdit = async (payload: VendorProductPayload & { vendor_profile_id?: number }) => {
    if (!editingProduct) return;
    const { vendor_profile_id, ...cleanPayload } = payload;
    void vendor_profile_id;
    await updateProductById(editingProduct.id, cleanPayload);
    setEditingProduct(null);
  };

  if (!isApproved) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-gray-900">Products</h2>
        <p className="rounded-modern border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Product tools unlock after your vendor account is approved by admin.
        </p>
      </div>
    );
  }

  const loadBulkTemplate = async () => {
    if (!token) return;
    setBulkLoading(true);
    setBulkStatus("");
    try {
      const template = await getVendorProductsBulkImportTemplate(token);
      const sample = template?.template?.products || [];
      setBulkJson(JSON.stringify(sample, null, 2));
      setBulkStatus("Template loaded. You can edit and import.");
    } catch (err: any) {
      setBulkStatus(err?.message || "Failed to load bulk template.");
    } finally {
      setBulkLoading(false);
    }
  };

  const runBulkImport = async () => {
    if (!token) return;
    setBulkLoading(true);
    setBulkStatus("");
    try {
      const parsed = JSON.parse(bulkJson || "[]");
      const products = Array.isArray(parsed) ? parsed : parsed?.products;
      if (!Array.isArray(products)) {
        throw new Error("Bulk JSON must be an array or an object with { products: [] }.");
      }
      const result = await importVendorProductsBulk(token, products);
      setBulkStatus(`Imported ${result.created_count} product(s), ${result.failed_count} failed.`);
      await reload();
    } catch (err: any) {
      setBulkStatus(err?.message || "Bulk import failed.");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Products</h2>
        <p className="text-sm text-gray-600">Use the standardized marketplace product structure for every listing.</p>
      </div>

      <div className="rounded-modern border border-gray-100">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Create Product</h3>
        </div>
        <ProductEditorPanel categories={categories} onSubmit={createNewProduct} submitLabel="Create Product" />
      </div>

      <div className="rounded-modern border border-gray-100">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Bulk Import Products (JSON)</h3>
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadBulkTemplate}
              disabled={bulkLoading}
              className="rounded-modern border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Load Template
            </button>
            <button
              type="button"
              onClick={runBulkImport}
              disabled={bulkLoading || !bulkJson.trim()}
              className="rounded-modern bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {bulkLoading ? "Importing..." : "Import JSON"}
            </button>
          </div>
          <textarea
            value={bulkJson}
            onChange={(event) => setBulkJson(event.target.value)}
            placeholder='Paste array of products here. Example: [{"title":"Milk", ...}]'
            className="min-h-52 w-full rounded-modern border border-gray-300 px-3 py-2 font-mono text-xs"
          />
          {bulkStatus ? <p className="text-xs text-gray-700">{bulkStatus}</p> : null}
        </div>
      </div>

      {editingProduct ? (
        <div className="rounded-modern border border-amber-200">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
            <h3 className="text-sm font-semibold text-amber-800">Editing: {editingProduct.title}</h3>
          </div>
          <ProductEditorPanel
            categories={categories}
            onSubmit={saveProductEdit}
            submitLabel="Save Product Changes"
            clearOnSubmit={false}
            initialValues={{
              title: editingProduct.title,
              description: editingProduct.description,
              specifications: editingProduct.specifications || "",
              price: editingProduct.price,
              stock: editingProduct.stock,
              sale_type: editingProduct.sale_type,
              base_unit_label: editingProduct.base_unit_label,
              base_quantity_value: editingProduct.base_quantity_value,
              stock_unit_label: editingProduct.stock_unit_label,
              auto_price_calculation: editingProduct.auto_price_calculation,
              is_active: editingProduct.is_active,
              category_id: editingProduct.category?.id || null,
              sale_options_payload: editingProduct.sale_options?.map((row) => ({
                id: row.id,
                label: row.label,
                quantity_value: row.quantity_value,
                quantity_unit: row.quantity_unit,
                base_quantity_equivalent: row.base_quantity_equivalent,
                stock_units_consumed: row.stock_units_consumed,
                use_manual_price: row.use_manual_price,
                manual_price: row.manual_price,
                sort_order: row.sort_order,
                is_default: row.is_default,
                is_active: row.is_active,
              })),
              replace_images: false,
            }}
            onCancel={() => setEditingProduct(null)}
          />
        </div>
      ) : null}

      <div className="rounded-modern border border-gray-100">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Your Listings</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {products.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No products yet.</div>
          ) : (
            products.map((product) => (
              <div key={product.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{product.title}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    KES {Number(product.price).toFixed(2)} | {product.display_price_label || product.base_unit_label} | Stock: {product.stock} {product.stock_unit_label} | {product.category?.name || "No category"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => toggleProductActive(product)}
                    className={`rounded-modern border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      product.is_active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 bg-gray-100 text-gray-700"
                    }`}
                  >
                    {product.is_active ? "Active" : "Inactive"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingProduct(product)}
                    className="rounded-modern border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => removeProductById(product.id)}
                    className="rounded-modern border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
