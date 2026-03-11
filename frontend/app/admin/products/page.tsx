"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/context/AuthContext";
import {
  Category,
  VendorApplicationAdmin,
  VendorProduct,
  createAdminCategory,
  createAdminProduct,
  deleteAdminProduct,
  getAdminProducts,
  getAdminProductsBulkImportTemplate,
  getAdminVendorApplications,
  getCategories,
  importAdminProductsBulk,
  updateAdminProduct,
} from "../../../src/services/api";
import ProductEditorPanel from "../../../src/components/ProductEditorPanel";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";

export default function AdminProductsPage() {
  const router = useRouter();
  const { isAuthenticated, userEmail, userRole, token, hasAdminPermission, canAccessAdminModule } = useAuth();
  const canViewProducts = canAccessAdminModule("products") && hasAdminPermission("products.view");
  const canCreateProducts = hasAdminPermission("products.create");
  const canEditProducts = hasAdminPermission("products.edit");
  const canDeleteProducts = hasAdminPermission("products.delete");
  const canSelectVendors = hasAdminPermission("vendors.view");
  const canCreateProductsUI = canCreateProducts && canSelectVendors;
  const canEditProductsUI = canEditProducts && canSelectVendors;

  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [vendors, setVendors] = useState<VendorApplicationAdmin[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    parent: "" as number | "",
  });
  const [categorySaving, setCategorySaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<VendorProduct | null>(null);
  const [bulkJson, setBulkJson] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkVendorProfileId, setBulkVendorProfileId] = useState<number | "">("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canViewProducts) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, router, canViewProducts]);

  const load = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError("");
    try {
      const [productData, categoryData] = await Promise.all([
        getAdminProducts(token),
        getCategories(),
      ]);
      setProducts(productData);
      setCategories(categoryData);
      if (canSelectVendors && (canCreateProducts || canEditProducts)) {
        try {
          const vendorData = await getAdminVendorApplications(token, "", "approved");
          setVendors(vendorData);
        } catch {
          setVendors([]);
        }
      } else {
        setVendors([]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load product management data.");
    } finally {
      setIsLoading(false);
    }
  }, [token, canCreateProducts, canEditProducts, canSelectVendors]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canViewProducts) {
      load();
    }
  }, [isAuthenticated, token, userRole, load, canViewProducts]);

  const vendorOptions = useMemo(
    () =>
      vendors.map((vendor) => ({
        id: vendor.id,
        label: `${vendor.store_name} (${vendor.user.email})`,
      })),
    [vendors],
  );

  const createProduct = async (payload: any) => {
    if (!token) return;
    if (!canCreateProductsUI) return;
    setError("");
    setSuccess("");
    try {
      if (!payload.vendor_profile_id) {
        throw new Error("Please select a vendor store.");
      }
      const created = await createAdminProduct(token, payload);
      setProducts((prev) => [created, ...prev]);
      setSuccess("Product created successfully.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to create product.");
      throw err;
    }
  };

  const createCategory = async () => {
    if (!token || !canCreateProducts) return;
    const name = categoryForm.name.trim();
    if (!name) {
      setError("Category name is required.");
      return;
    }
    setCategorySaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await createAdminCategory(token, {
        name,
        description: categoryForm.description.trim() || "",
        parent: typeof categoryForm.parent === "number" ? categoryForm.parent : null,
      });
      setCategories((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCategoryForm({ name: "", description: "", parent: "" });
      setSuccess(`Category "${created.name}" created successfully.`);
    } catch (err: any) {
      setError(err?.message || "Failed to create category.");
    } finally {
      setCategorySaving(false);
    }
  };

  const loadBulkTemplate = async () => {
    if (!token) return;
    setBulkLoading(true);
    setBulkStatus("");
    try {
      const template = await getAdminProductsBulkImportTemplate(token);
      const sample = template?.template?.products || [];
      setBulkJson(JSON.stringify(sample, null, 2));
      setBulkStatus("Template loaded. Add vendor_profile_id per product or select fallback vendor below.");
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
      const result = await importAdminProductsBulk(
        token,
        products,
        typeof bulkVendorProfileId === "number" ? bulkVendorProfileId : null,
      );
      setBulkStatus(`Imported ${result.created_count} product(s), ${result.failed_count} failed.`);
      await load();
    } catch (err: any) {
      setBulkStatus(err?.message || "Bulk import failed.");
    } finally {
      setBulkLoading(false);
    }
  };

  const saveProductEdit = async (payload: any) => {
    if (!token || !editingProduct) return;
    if (!canEditProductsUI) return;
    setError("");
    setSuccess("");
    try {
      const updated = await updateAdminProduct(token, editingProduct.id, payload);
      setProducts((prev) => prev.map((item) => (item.id === editingProduct.id ? updated : item)));
      setSuccess("Product updated successfully.");
      setEditingProduct(null);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update product.");
      throw err;
    }
  };

  const toggleProductActive = async (product: VendorProduct) => {
    if (!token) return;
    if (!canEditProductsUI) return;
    try {
      const updated = await updateAdminProduct(token, product.id, {
        is_active: !product.is_active,
        vendor_profile_id: product.vendor_profile_id,
      });
      setProducts((prev) => prev.map((item) => (item.id === product.id ? updated : item)));
    } catch (err: any) {
      setError(err?.message || "Failed to update product status.");
    }
  };

  const removeProduct = async (productId: number) => {
    if (!token) return;
    if (!canDeleteProducts) return;
    try {
      await deleteAdminProduct(token, productId);
      setProducts((prev) => prev.filter((item) => item.id !== productId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete product.");
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canViewProducts) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <AdminSidebar active="products" />

      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Marketplace Products</h1>
            <p className="text-sm text-gray-600 mt-1">Admin and vendors use the same product schema and formatting standards.</p>
          </div>
          <div className="text-sm text-gray-600">{userEmail}</div>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Create Product Category</h2>
            <p className="mt-1 text-sm text-gray-600">Add categories here instead of going to Django admin.</p>
          </div>
          {canCreateProducts ? (
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <input
                value={categoryForm.name}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Category name (e.g. Electronics)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <select
                value={categoryForm.parent}
                onChange={(event) =>
                  setCategoryForm((prev) => ({
                    ...prev,
                    parent: event.target.value ? Number(event.target.value) : "",
                  }))
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">No parent category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <textarea
                value={categoryForm.description}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Optional description"
                className="min-h-20 rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
              />
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={createCategory}
                  disabled={categorySaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                >
                  {categorySaving ? "Creating..." : "Create Category"}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-5 py-4 text-sm text-gray-600">You have read-only access to categories.</div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Create Product</h2>
          </div>
          {canCreateProductsUI ? (
            <ProductEditorPanel categories={categories} vendorOptions={vendorOptions} onSubmit={createProduct} submitLabel="Create Product (Admin)" />
          ) : canCreateProducts ? (
            <div className="px-5 py-4 text-sm text-amber-700">Product creation requires `vendors.view` permission to select a vendor store.</div>
          ) : (
            <div className="px-5 py-4 text-sm text-gray-600">You have read-only access to products.</div>
          )}
          {editingProduct && canEditProductsUI && (
            <div className="border-t border-gray-100">
              <div className="px-5 py-4 bg-amber-50 border-b border-amber-200">
                <h3 className="text-sm font-bold text-amber-800">Edit Product: {editingProduct.title}</h3>
              </div>
              <ProductEditorPanel
                categories={categories}
                vendorOptions={vendorOptions}
                onSubmit={saveProductEdit}
                submitLabel="Save Product Changes"
                clearOnSubmit={false}
                onCancel={() => setEditingProduct(null)}
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
                  vendor_profile_id: editingProduct.vendor_profile_id,
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
              />
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Bulk Import Products (JSON)</h2>
          </div>
          <div className="space-y-3 p-5">
            {vendorOptions.length > 0 ? (
              <select
                value={bulkVendorProfileId}
                onChange={(event) => setBulkVendorProfileId(event.target.value ? Number(event.target.value) : "")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">No fallback vendor (vendor_profile_id required per row)</option>
                {vendorOptions.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    Use fallback vendor: {vendor.label}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadBulkTemplate}
                disabled={bulkLoading}
                className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Load Template
              </button>
              <button
                type="button"
                onClick={runBulkImport}
                disabled={bulkLoading || !bulkJson.trim()}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                {bulkLoading ? "Importing..." : "Import JSON"}
              </button>
            </div>
            <textarea
              value={bulkJson}
              onChange={(event) => setBulkJson(event.target.value)}
              placeholder='Paste array of products here. Example: [{"vendor_profile_id":1,"title":"Milk",...}]'
              className="min-h-56 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />
            {bulkStatus ? <p className="text-xs text-gray-700">{bulkStatus}</p> : null}
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">All Products ({products.length})</h2>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading products...</div>
          ) : products.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No products found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {products.map((product) => (
                <div key={product.id} className="p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{product.title}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      Vendor: {product.vendor_name} | KES {Number(product.price).toFixed(2)} | {product.display_price_label || product.base_unit_label} | Stock: {product.stock} {product.stock_unit_label} | {product.category?.name || "Uncategorized"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEditProductsUI ? (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleProductActive(product)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${product.is_active ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-700 border border-gray-200"}`}
                        >
                          {product.is_active ? "Active" : "Inactive"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingProduct(product)}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                        >
                          Edit
                        </button>
                      </>
                    ) : null}
                    {canDeleteProducts ? (
                      <button
                        type="button"
                        onClick={() => removeProduct(product.id)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-red-50 text-red-700 border border-red-200"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
