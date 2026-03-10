import { Product } from "../types";

// frontend/src/lib/utils.ts

export const formatCurrency = (amount: number | string) => {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    currencyDisplay: 'code',
    maximumFractionDigits: 0,
  }).format(numericAmount);
};

export const getProductEffectivePrice = (product: Partial<Product> | null | undefined): number => {
  if (!product) return 0;
  const raw = product.effective_price ?? product.price ?? 0;
  const numeric = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const getProductOriginalPrice = (product: Partial<Product> | null | undefined): number => {
  if (!product) return 0;
  const raw = product.original_price ?? product.price ?? 0;
  const numeric = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
};

export const getProductSaleOptionById = (
  product: Partial<Product> | null | undefined,
  optionId: number | null | undefined,
) => {
  if (!product || !Array.isArray(product.sale_options) || optionId == null) return null;
  return product.sale_options.find((row) => row.id === optionId) || null;
};

export const getProductDefaultSaleOption = (product: Partial<Product> | null | undefined) => {
  if (!product || !Array.isArray(product.sale_options) || product.sale_options.length === 0) return null;
  const explicit = product.sale_options.find((row) => row.is_default);
  if (explicit) return explicit;
  const byId =
    product.default_sale_option_id != null
      ? product.sale_options.find((row) => row.id === product.default_sale_option_id)
      : null;
  return byId || product.sale_options[0];
};

function parseNumeric(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export const getUnitAwareEffectivePrice = (
  product: Partial<Product> | null | undefined,
  optionId?: number | null,
): number => {
  if (!product) return 0;
  const option = optionId != null ? getProductSaleOptionById(product, optionId) : getProductDefaultSaleOption(product);
  if (!option) return getProductEffectivePrice(product);

  const optionOriginal = parseNumeric(option.computed_unit_price || option.manual_price);
  if (optionOriginal <= 0) return getProductEffectivePrice(product);

  const defaultEffective = getProductEffectivePrice(product);
  const defaultOriginal = getProductOriginalPrice(product);
  if (defaultOriginal > 0 && defaultEffective > 0 && defaultEffective < defaultOriginal) {
    const promoFactor = defaultEffective / defaultOriginal;
    return optionOriginal * promoFactor;
  }
  return optionOriginal;
};

export const getUnitAwareOriginalPrice = (
  product: Partial<Product> | null | undefined,
  optionId?: number | null,
): number => {
  if (!product) return 0;
  const option = optionId != null ? getProductSaleOptionById(product, optionId) : getProductDefaultSaleOption(product);
  if (!option) return getProductOriginalPrice(product);
  const optionOriginal = parseNumeric(option.computed_unit_price || option.manual_price);
  if (optionOriginal > 0) return optionOriginal;
  return getProductOriginalPrice(product);
};

export const getUnitLabelForOption = (
  product: Partial<Product> | null | undefined,
  optionId?: number | null,
): string => {
  if (!product) return "unit";
  const option = optionId != null ? getProductSaleOptionById(product, optionId) : getProductDefaultSaleOption(product);
  if (option?.label) return option.label;
  return product.base_unit_label || "unit";
};
