"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Category,
  VendorProductPayload,
  VendorProductSaleOptionPayload,
} from "../services/api";

interface VendorOption {
  id: number;
  label: string;
}

interface ProductEditorPanelProps {
  categories: Category[];
  onSubmit: (payload: VendorProductPayload & { vendor_profile_id?: number }) => Promise<void>;
  submitLabel: string;
  vendorOptions?: VendorOption[];
  defaultVendorProfileId?: number | null;
  initialValues?: Partial<VendorProductPayload & { vendor_profile_id?: number }>;
  clearOnSubmit?: boolean;
  onCancel?: () => void;
}

type SaleOptionForm = VendorProductSaleOptionPayload & { localId: string };

function createDefaultSaleOption(index = 0): SaleOptionForm {
  return {
    localId: `opt-${Date.now()}-${index}`,
    label: index === 0 ? "Single Item" : `Option ${index + 1}`,
    quantity_value: "1",
    quantity_unit: "item",
    base_quantity_equivalent: "1",
    stock_units_consumed: 1,
    use_manual_price: false,
    manual_price: null,
    sort_order: index,
    is_default: index === 0,
    is_active: true,
  };
}

export default function ProductEditorPanel({
  categories,
  onSubmit,
  submitLabel,
  vendorOptions,
  defaultVendorProfileId = null,
  initialValues,
  clearOnSubmit = true,
  onCancel,
}: ProductEditorPanelProps) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    specifications: "",
    price: "",
    stock: 1,
    sale_type: "single_item" as VendorProductPayload["sale_type"],
    base_unit_label: "item",
    base_quantity_value: "1",
    stock_unit_label: "unit",
    auto_price_calculation: true,
    category_id: "",
    is_active: true,
    replace_images: true,
    vendor_profile_id: defaultVendorProfileId ? String(defaultVendorProfileId) : "",
  });
  const [featureImage, setFeatureImage] = useState<File | null>(null);
  const [galleryImages, setGalleryImages] = useState<File[]>([]);
  const [saleOptions, setSaleOptions] = useState<SaleOptionForm[]>([createDefaultSaleOption(0)]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!initialValues) return;
    setForm((prev) => ({
      ...prev,
      title: initialValues.title || "",
      description: initialValues.description || "",
      specifications: initialValues.specifications || "",
      price: initialValues.price || "",
      stock: Number(initialValues.stock ?? 1),
      sale_type: initialValues.sale_type || "single_item",
      base_unit_label: initialValues.base_unit_label || "item",
      base_quantity_value: initialValues.base_quantity_value || "1",
      stock_unit_label: initialValues.stock_unit_label || "unit",
      auto_price_calculation: initialValues.auto_price_calculation ?? true,
      category_id: initialValues.category_id ? String(initialValues.category_id) : "",
      is_active: initialValues.is_active ?? true,
      replace_images: initialValues.replace_images ?? false,
      vendor_profile_id: initialValues.vendor_profile_id ? String(initialValues.vendor_profile_id) : prev.vendor_profile_id,
    }));

    const options = Array.isArray(initialValues.sale_options_payload) ? initialValues.sale_options_payload : [];
    if (options.length > 0) {
      setSaleOptions(
        options.map((option, index) => ({
          ...option,
          localId: `opt-${option.id ?? "new"}-${index}`,
          label: option.label || `Option ${index + 1}`,
          quantity_value: option.quantity_value || "1",
          quantity_unit: option.quantity_unit || initialValues.base_unit_label || "item",
          base_quantity_equivalent: option.base_quantity_equivalent || "1",
          stock_units_consumed: Number(option.stock_units_consumed || 1),
          use_manual_price: option.use_manual_price ?? false,
          manual_price: option.manual_price ?? null,
          sort_order: option.sort_order ?? index,
          is_default: option.is_default ?? index === 0,
          is_active: option.is_active ?? true,
        })),
      );
    }
  }, [initialValues]);

  const updateForm = (key: string, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const optionCount = useMemo(() => saleOptions.length, [saleOptions.length]);

  const updateOption = (localId: string, patch: Partial<SaleOptionForm>) => {
    setSaleOptions((prev) =>
      prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)),
    );
  };

  const setDefaultOption = (localId: string) => {
    setSaleOptions((prev) =>
      prev.map((row) => ({ ...row, is_default: row.localId === localId })),
    );
  };

  const removeOption = (localId: string) => {
    setSaleOptions((prev) => {
      const next = prev.filter((row) => row.localId !== localId);
      if (next.length === 0) {
        return [createDefaultSaleOption(0)];
      }
      if (!next.some((row) => row.is_default)) {
        next[0] = { ...next[0], is_default: true };
      }
      return next.map((row, index) => ({ ...row, sort_order: index }));
    });
  };

  const addOption = () => {
    setSaleOptions((prev) => [
      ...prev,
      createDefaultSaleOption(prev.length),
    ]);
  };

  const normalizedSaleOptions: VendorProductSaleOptionPayload[] = saleOptions
    .map((row, index) => ({
      id: row.id,
      label: row.label.trim(),
      quantity_value: String(row.quantity_value || "1"),
      quantity_unit: row.quantity_unit?.trim() || form.base_unit_label || "item",
      base_quantity_equivalent: String(row.base_quantity_equivalent || "1"),
      stock_units_consumed: Number(row.stock_units_consumed || 1),
      use_manual_price: Boolean(row.use_manual_price),
      manual_price: row.use_manual_price ? (row.manual_price || null) : null,
      sort_order: index,
      is_default: Boolean(row.is_default),
      is_active: Boolean(row.is_active),
    }))
    .filter((row) => row.label.length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit({
        title: form.title,
        description: form.description,
        specifications: form.specifications,
        price: form.price,
        stock: Number(form.stock),
        sale_type: form.sale_type,
        base_unit_label: form.base_unit_label.trim() || "item",
        base_quantity_value: form.base_quantity_value,
        stock_unit_label: form.stock_unit_label.trim() || "unit",
        auto_price_calculation: form.auto_price_calculation,
        category_id: form.category_id ? Number(form.category_id) : null,
        is_active: form.is_active,
        replace_images: form.replace_images,
        feature_image: featureImage,
        gallery_images: galleryImages,
        sale_options_payload: normalizedSaleOptions,
        vendor_profile_id: form.vendor_profile_id ? Number(form.vendor_profile_id) : undefined,
      });
      if (clearOnSubmit) {
        setForm((prev) => ({
          ...prev,
          title: "",
          description: "",
          specifications: "",
          price: "",
          stock: 1,
          sale_type: "single_item",
          base_unit_label: "item",
          base_quantity_value: "1",
          stock_unit_label: "unit",
          auto_price_calculation: true,
          category_id: "",
        }));
        setFeatureImage(null);
        setGalleryImages([]);
        setSaleOptions([createDefaultSaleOption(0)]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-gray-100">
      {vendorOptions && (
        <select
          value={form.vendor_profile_id}
          onChange={(e) => updateForm("vendor_profile_id", e.target.value)}
          className="md:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          required
        >
          <option value="">Select vendor store</option>
          {vendorOptions.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.label}
            </option>
          ))}
        </select>
      )}

      <input
        required
        value={form.title}
        onChange={(e) => updateForm("title", e.target.value)}
        placeholder="Product title"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        required
        value={form.price}
        onChange={(e) => updateForm("price", e.target.value)}
        placeholder="Base price (e.g 120.00)"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        required
        type="number"
        min={0}
        value={form.stock}
        onChange={(e) => updateForm("stock", Number(e.target.value))}
        placeholder="Stock Units"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <select
        value={form.category_id}
        onChange={(e) => updateForm("category_id", e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">Select category</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>

      <textarea
        required
        value={form.description}
        onChange={(e) => updateForm("description", e.target.value)}
        placeholder="Product description"
        className="md:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-24"
      />
      <textarea
        value={form.specifications}
        onChange={(e) => updateForm("specifications", e.target.value)}
        placeholder="Specifications (dimensions, materials, key features)"
        className="md:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-20"
      />

      <div className="md:col-span-2 rounded-lg border border-gray-200 p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-900">Quantity & Unit Model</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            value={form.sale_type}
            onChange={(e) => updateForm("sale_type", e.target.value as VendorProductPayload["sale_type"])}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="single_item">Single Item</option>
            <option value="piece_based">Piece Based</option>
            <option value="pack_based">Pack Based</option>
            <option value="weight_based">Weight Based</option>
            <option value="volume_based">Volume Based</option>
            <option value="set_bundle">Set / Bundle</option>
            <option value="custom">Custom</option>
          </select>
          <input
            value={form.base_unit_label}
            onChange={(e) => updateForm("base_unit_label", e.target.value)}
            placeholder="Base unit (item, kg, litre, piece)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={form.base_quantity_value}
            onChange={(e) => updateForm("base_quantity_value", e.target.value)}
            placeholder="Base quantity value (1, 1000, 0.5)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            value={form.stock_unit_label}
            onChange={(e) => updateForm("stock_unit_label", e.target.value)}
            placeholder="Stock unit label (unit, ml, egg)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <label className="text-sm text-gray-700 flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.auto_price_calculation}
            onChange={(e) => updateForm("auto_price_calculation", e.target.checked)}
          />
          Auto-calculate option prices from base price and conversion
        </label>
      </div>

      <div className="md:col-span-2 rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">Purchase Options ({optionCount})</h4>
          <button
            type="button"
            onClick={addOption}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Add Option
          </button>
        </div>

        {saleOptions.map((option, index) => (
          <div key={option.localId} className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={option.label}
                onChange={(e) => updateOption(option.localId, { label: e.target.value })}
                placeholder="Label (e.g. 500 ml, 12 eggs, Pair)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={option.quantity_unit || ""}
                onChange={(e) => updateOption(option.localId, { quantity_unit: e.target.value })}
                placeholder="Display unit (ml, eggs, pair)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={option.quantity_value}
                onChange={(e) => updateOption(option.localId, { quantity_value: e.target.value })}
                placeholder="Display quantity (e.g. 500)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={option.base_quantity_equivalent}
                onChange={(e) => updateOption(option.localId, { base_quantity_equivalent: e.target.value })}
                placeholder="Base quantity equivalent"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={1}
                value={option.stock_units_consumed}
                onChange={(e) => updateOption(option.localId, { stock_units_consumed: Number(e.target.value || 1) })}
                placeholder="Stock units consumed per purchase"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={option.manual_price || ""}
                onChange={(e) => updateOption(option.localId, { manual_price: e.target.value })}
                placeholder="Manual price (optional)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!option.use_manual_price}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs text-gray-700 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={option.use_manual_price ?? false}
                  onChange={(e) => updateOption(option.localId, { use_manual_price: e.target.checked })}
                />
                Manual Price Override
              </label>
              <label className="text-xs text-gray-700 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={option.is_active ?? true}
                  onChange={(e) => updateOption(option.localId, { is_active: e.target.checked })}
                />
                Active
              </label>
              <label className="text-xs text-gray-700 flex items-center gap-1">
                <input
                  type="radio"
                  name="default-sale-option"
                  checked={option.is_default ?? false}
                  onChange={() => setDefaultOption(option.localId)}
                />
                Default Option
              </label>
              <button
                type="button"
                onClick={() => removeOption(option.localId)}
                className="ml-auto rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Remove
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Option #{index + 1} affects stock deduction by <strong>{option.stock_units_consumed}</strong> unit(s) per purchase.
            </p>
          </div>
        ))}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Feature Image (JPG/PNG/WEBP, max 5MB)</label>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={(e) => setFeatureImage(e.target.files?.[0] || null)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Gallery Images (up to 6)</label>
        <input
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          multiple
          onChange={(e) => setGalleryImages(Array.from(e.target.files || []).slice(0, 6))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
      <label className="text-sm text-gray-700 flex items-center gap-2">
        <input type="checkbox" checked={form.is_active} onChange={(e) => updateForm("is_active", e.target.checked)} />
        Active Listing
      </label>
      <label className="text-sm text-gray-700 flex items-center gap-2">
        <input type="checkbox" checked={form.replace_images} onChange={(e) => updateForm("replace_images", e.target.checked)} />
        Replace Existing Images
      </label>
      <button
        type="submit"
        disabled={isSubmitting}
        className="md:col-span-2 rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
      >
        {isSubmitting ? "Saving..." : submitLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="md:col-span-2 rounded-lg border border-gray-300 text-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
