// frontend/src/types/index.ts

export interface Category {
    id: number;
    name: string;
    slug: string;
    description?: string;
}

export interface ProductImage {
    id: number;
    image: string;
    alt_text: string | null;
    is_feature: boolean;
}

export type ProductSaleType =
    | "single_item"
    | "piece_based"
    | "pack_based"
    | "weight_based"
    | "volume_based"
    | "set_bundle"
    | "custom";

export interface ProductSaleOption {
    id: number;
    label: string;
    quantity_value: string;
    quantity_unit: string;
    base_quantity_equivalent: string;
    stock_units_consumed: number;
    use_manual_price: boolean;
    manual_price: string | null;
    sort_order: number;
    is_default: boolean;
    is_active: boolean;
    computed_unit_price: string;
    display_label: string;
}

export interface Product {
    id: number;
    vendor_profile_id?: number;
    title: string;
    slug: string;
    barcode?: string | null;
    description: string;
    specifications?: string | null;
    price: string; // Django decimals are sent as strings in JSON to preserve precision
    effective_price?: string;
    original_price?: string;
    savings_amount?: string;
    savings_percent?: number;
    promotion_active?: boolean;
    promotion_badge?: string;
    promotion_ends_at?: string | null;
    urgency_text?: string;
    stock: number;
    sale_type: ProductSaleType;
    base_unit_label: string;
    base_quantity_value: string;
    stock_unit_label: string;
    auto_price_calculation: boolean;
    sale_options: ProductSaleOption[];
    default_sale_option_id?: number | null;
    display_price_label?: string;
    is_active: boolean;
    vendor_name: string;
    category: Category | null;
    images: ProductImage[];
    image: string;
    created_at: string;
}
