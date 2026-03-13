// frontend/src/services/api.ts
import { Product } from "../types";

function normalizeApiBase(rawUrl?: string): string {
    if (!rawUrl) return "";
    const trimmed = rawUrl.trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

const CONFIGURED_API_URL = normalizeApiBase(process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL);
const DEFAULT_PRODUCTION_API_URL = "https://king-kush-stores.onrender.com/api";
const CLIENT_PROTOCOL =
    typeof window !== "undefined" && window.location?.protocol
        ? window.location.protocol
        : "http:";
function isLocalHostname(hostname?: string): boolean {
    if (!hostname) return false;
    const value = hostname.toLowerCase();
    return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

// The API base must never silently fall back to localhost on live domains.
const SERVER_API_URL =
    CONFIGURED_API_URL ||
    (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api" : DEFAULT_PRODUCTION_API_URL);
const CLIENT_HOST =
    typeof window !== "undefined" && window.location?.hostname
        ? window.location.hostname
        : "localhost";
const CLIENT_API_URL =
    CONFIGURED_API_URL ||
    (typeof window !== "undefined" && !isLocalHostname(CLIENT_HOST)
        ? DEFAULT_PRODUCTION_API_URL
        : "http://127.0.0.1:8000/api");
const BACKEND_URL = CONFIGURED_API_URL
    ? CONFIGURED_API_URL.replace(/\/api$/, "")
    : CLIENT_API_URL.replace(/\/api$/, "");

function getStoredAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("accessToken");
}

function withAuthHeaders(authToken: string | null): Record<string, string> {
    const headers: Record<string, string> = {};
    if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`;
    }
    return headers;
}

function isFormDataBody(body: BodyInit | null | undefined): body is FormData {
    return typeof FormData !== "undefined" && body instanceof FormData;
}

function extractApiErrorMessage(errorData: any, fallback: string): string {
    if (!errorData || typeof errorData !== "object") {
        return fallback;
    }

    const detail = errorData.detail;
    if (typeof detail === "string" && detail.trim()) {
        const normalized = detail.toLowerCase();
        if (normalized.includes("token not valid") || normalized.includes("token is invalid or expired")) {
            return "Your session expired. Please sign in again.";
        }
        return detail;
    }
    if (Array.isArray(detail) && detail.length > 0) {
        return String(detail[0]);
    }

    const firstKey = Object.keys(errorData)[0];
    if (!firstKey) return fallback;
    const firstVal = errorData[firstKey];
    if (typeof firstVal === "string" && firstVal.trim()) {
        return `${firstKey}: ${firstVal}`;
    }
    if (Array.isArray(firstVal) && firstVal.length > 0) {
        return `${firstKey}: ${String(firstVal[0])}`;
    }
    return fallback;
}

function appendProductPayload(formData: FormData, payload: Partial<VendorProductPayload>) {
    if (payload.title !== undefined) formData.append("title", payload.title);
    if (payload.description !== undefined) formData.append("description", payload.description);
    if (payload.specifications !== undefined) formData.append("specifications", payload.specifications || "");
    if (payload.price !== undefined) formData.append("price", String(payload.price));
    if (payload.stock !== undefined) formData.append("stock", String(payload.stock));
    if (payload.sale_type !== undefined) formData.append("sale_type", payload.sale_type);
    if (payload.base_unit_label !== undefined) formData.append("base_unit_label", payload.base_unit_label);
    if (payload.base_quantity_value !== undefined) formData.append("base_quantity_value", String(payload.base_quantity_value));
    if (payload.stock_unit_label !== undefined) formData.append("stock_unit_label", payload.stock_unit_label);
    if (payload.auto_price_calculation !== undefined) formData.append("auto_price_calculation", String(payload.auto_price_calculation));
    if (payload.is_active !== undefined) formData.append("is_active", String(payload.is_active));
    if (payload.category_id !== undefined) {
        if (payload.category_id === null) {
            formData.append("category_id", "");
        } else {
            formData.append("category_id", String(payload.category_id));
        }
    }
    if (payload.replace_images !== undefined) formData.append("replace_images", String(payload.replace_images));
    if (payload.feature_image) formData.append("feature_image", payload.feature_image);
    if (payload.gallery_images && payload.gallery_images.length > 0) {
        payload.gallery_images.forEach((file) => formData.append("gallery_images", file));
    }
    if (payload.sale_options_payload !== undefined) {
        formData.append("sale_options_payload", JSON.stringify(payload.sale_options_payload));
    }
}

function getApiBaseCandidates(): string[] {
    const includeLocalFallbacks = isLocalHostname(CLIENT_HOST);
    const candidates = [
        CONFIGURED_API_URL,
        CLIENT_API_URL,
        DEFAULT_PRODUCTION_API_URL,
        ...(includeLocalFallbacks
            ? [
                  `${CLIENT_PROTOCOL}//${CLIENT_HOST}:8000/api`,
                  `${CLIENT_PROTOCOL}//localhost:8000/api`,
                  `${CLIENT_PROTOCOL}//127.0.0.1:8000/api`,
              ]
            : []),
    ].filter(Boolean);
    return Array.from(new Set(candidates));
}

async function requestWithApiBaseFallbackAnonymous(
    pathFromApiRoot: string,
    init: RequestInit,
): Promise<Response> {
    let lastResponse: Response | null = null;
    let lastError: any = null;

    const bases = getApiBaseCandidates();
    for (const base of bases) {
        try {
            const response = await fetch(`${base}${pathFromApiRoot}`, init);
            if (response.ok) {
                return response;
            }
            if (response.status === 400 || response.status === 404) {
                lastResponse = response;
                continue;
            }
            return response;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastResponse) {
        return lastResponse;
    }
    if (lastError instanceof Error && lastError.message) {
        throw new Error(
            `Unable to reach backend. Confirm Django is running and your frontend origin is allowed by CORS. (${lastError.message})`,
        );
    }
    throw new Error("Unable to reach backend. Confirm Django is running and your frontend origin is allowed by CORS.");
}

async function requestWithApiBaseFallback(
    pathFromApiRoot: string,
    init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
    token: string | null,
    allowAnonymousRetry: boolean = false,
): Promise<Response> {
    let lastResponse: Response | null = null;
    let lastError: any = null;

    const bases = getApiBaseCandidates();
    for (const base of bases) {
        try {
            const response = await requestWithAuthRetry(`${base}${pathFromApiRoot}`, init, token, allowAnonymousRetry);
            if (response.ok) {
                return response;
            }

            // These usually indicate host mismatch / wrong local base URL in dev mode.
            if (response.status === 400 || response.status === 404) {
                lastResponse = response;
                continue;
            }
            return response;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastResponse) {
        return lastResponse;
    }
    throw lastError || new Error("Unable to reach backend.");
}

export interface UserProfile {
    id: number;
    customer_id: string;
    email: string;
    first_name: string;
    last_name: string;
    phone_number: string | null;
    role: "customer" | "vendor" | "admin";
    vendor_profile?: VendorProfile | null;
}

export type VendorApprovalStatus = "pending_review" | "needs_info" | "approved" | "rejected" | "suspended";

export interface VendorProfile {
    id: number;
    store_name: string;
    store_description: string | null;
    business_email: string | null;
    business_phone: string | null;
    business_hours: string | null;
    business_location: string | null;
    business_address_line_1: string | null;
    business_address_line_2: string | null;
    business_city: string | null;
    business_postal_code: string | null;
    business_country: string | null;
    product_category: string | null;
    verification_document: string | null;
    verification_document_url: string;
    store_logo: string | null;
    store_logo_url: string;
    store_banner: string | null;
    store_banner_url: string;
    approval_status: VendorApprovalStatus;
    is_approved: boolean;
    review_notes: string | null;
    reviewed_by: number | null;
    reviewed_by_email: string;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface VendorApplicationAdmin {
    id: number;
    user: UserProfile;
    store_name: string;
    store_description: string | null;
    business_email: string | null;
    business_phone: string | null;
    business_hours: string | null;
    business_location: string | null;
    business_address_line_1: string | null;
    business_address_line_2: string | null;
    business_city: string | null;
    business_postal_code: string | null;
    business_country: string | null;
    product_category: string | null;
    verification_document: string | null;
    verification_document_url: string;
    store_logo: string | null;
    store_logo_url: string;
    store_banner: string | null;
    store_banner_url: string;
    approval_status: VendorApprovalStatus;
    is_approved: boolean;
    review_notes: string | null;
    reviewed_by: number | null;
    reviewed_by_email: string;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface VendorDashboardSummary {
    store_name: string;
    approval_status: VendorApprovalStatus;
    products_total: number;
    products_active: number;
    orders_total: number;
    units_sold: number;
    sales_total: string;
}

export interface VendorOrderRow {
    vendor_order_id?: number;
    order_reference?: string;
    order_id: number;
    order_number: string;
    order_status: string;
    is_paid: boolean;
    ordered_at: string;
    customer_email: string;
    product_id: number;
    product_title: string;
    quantity: number;
    selected_unit_label?: string;
    price_at_purchase: string;
    shipping_city: string;
    shipping_country: string;
}

export interface Category {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    parent: number | null;
}

export interface AdminCategoryPayload {
    name: string;
    description?: string;
    parent?: number | null;
}

export interface VendorProduct {
    id: number;
    vendor_profile_id: number;
    vendor_name: string;
    title: string;
    slug: string;
    description: string;
    specifications?: string | null;
    price: string;
    stock: number;
    sale_type:
        | "single_item"
        | "piece_based"
        | "pack_based"
        | "weight_based"
        | "volume_based"
        | "set_bundle"
        | "custom";
    base_unit_label: string;
    base_quantity_value: string;
    stock_unit_label: string;
    auto_price_calculation: boolean;
    is_active: boolean;
    category: Category | null;
    sale_options: VendorProductSaleOption[];
    default_sale_option_id?: number | null;
    display_price_label?: string;
    images: Array<{ id: number; image: string; alt_text: string | null; is_feature: boolean }>;
    image: string | null;
    created_at: string;
}

export interface VendorProductSaleOption {
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

export interface VendorProductSaleOptionPayload {
    id?: number;
    label: string;
    quantity_value: string;
    quantity_unit?: string;
    base_quantity_equivalent: string;
    stock_units_consumed: number;
    use_manual_price?: boolean;
    manual_price?: string | null;
    sort_order?: number;
    is_default?: boolean;
    is_active?: boolean;
}

export interface VendorProductPayload {
    title: string;
    description: string;
    specifications?: string;
    price: string;
    stock: number;
    sale_type:
        | "single_item"
        | "piece_based"
        | "pack_based"
        | "weight_based"
        | "volume_based"
        | "set_bundle"
        | "custom";
    base_unit_label: string;
    base_quantity_value: string;
    stock_unit_label: string;
    auto_price_calculation: boolean;
    is_active?: boolean;
    category_id?: number | null;
    feature_image?: File | null;
    gallery_images?: File[];
    replace_images?: boolean;
    sale_options_payload?: VendorProductSaleOptionPayload[];
}

export interface BulkProductImportResult {
    created_count: number;
    failed_count: number;
    created: VendorProduct[];
    errors: Array<Record<string, any>>;
}

export interface ShippingAddress {
    id: number;
    user: number;
    full_name: string;
    phone_number: string;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    postal_code: string | null;
    country: string;
    is_default: boolean;
}

export type PickupAssignmentRole = "manager" | "staff";

export interface PickupStation {
    id: number;
    ownership_type: "platform" | "vendor";
    vendor_profile: number | null;
    vendor_store_name: string;
    vendor_email: string;
    name: string;
    city: string;
    address: string;
    operating_hours: string;
    contact_phone: string;
    contact_email: string | null;
    services: string[];
    is_active: boolean;
    supports_pickup: boolean;
    supports_returns: boolean;
    approval_status: "pending" | "approved" | "suspended" | "rejected";
    is_visible_to_customers: boolean;
    sync_name: boolean;
    sync_address: boolean;
    sync_contact: boolean;
    sync_operating_hours: boolean;
    sync_active_status: boolean;
    last_vendor_sync_at: string | null;
    temporary_notice: string;
    notice_updated_at: string | null;
    created_by: number | null;
    updated_by: number | null;
    created_at: string;
    updated_at: string;
}

export interface PickupStationAssignment {
    id: number;
    station: number;
    station_name: string;
    user: number;
    user_email: string;
    user_full_name: string;
    role: PickupAssignmentRole;
    can_manage_local_staff: boolean;
    is_active: boolean;
    notes: string;
    assigned_by: number | null;
    assigned_by_email: string;
    assigned_at: string;
    updated_at: string;
}

export interface PickupOrderOperation {
    id: number;
    station: number;
    station_name: string;
    order: number | null;
    order_number: string;
    actor: number | null;
    actor_email: string;
    event_type: "ready_for_pickup" | "collected" | "return_dropoff" | "notice_update";
    notes: string;
    metadata: Record<string, any>;
    created_at: string;
}

export interface PickupOrderSummary {
    id: number;
    order_number: string;
    status: "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled";
    is_paid: boolean;
    total_amount: string;
    created_at: string;
    updated_at: string;
    fulfillment_method: "delivery" | "pickup";
    pickup_ready_at: string | null;
    picked_up_at: string | null;
    station_name: string;
    customer_email: string;
    shipping_city: string;
}

export interface OrderItem {
    id: number;
    product: {
        id: number;
        title: string;
        slug: string;
    };
    price_at_purchase: string;
    quantity: number;
    sale_option: number | null;
    sale_option_label: string;
    sale_option_quantity_value: string | null;
    sale_option_quantity_unit: string;
    sale_option_stock_units_consumed: number;
    selected_unit_label: string;
}

export interface Order {
    id: number;
    user: UserProfile;
    order_number: string;
    shipping_address: ShippingAddress;
    fulfillment_method: "delivery" | "pickup";
    pickup_station: PickupStation | null;
    pickup_ready_at: string | null;
    picked_up_at: string | null;
    total_amount: string;
    status: "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled";
    is_paid: boolean;
    paid_at: string | null;
    payment_verified_at?: string | null;
    created_at: string;
    items: OrderItem[];
}

export type PaymentMethodType = "card" | "mpesa";

export interface MarketplacePayment {
    id: number;
    order: number;
    order_number: string;
    customer: number;
    customer_email: string;
    provider: "mpesa" | "card" | "paypal" | "bank_transfer";
    payment_channel: string;
    amount: string;
    currency: string;
    phone_number: string | null;
    status: "initiated" | "pending_confirmation" | "confirmed" | "failed" | "cancelled" | "refunded" | "reversed";
    merchant_request_id: string | null;
    checkout_request_id: string | null;
    transaction_id: string | null;
    mpesa_receipt_number: string | null;
    result_code: string | null;
    result_desc: string | null;
    initiated_at: string;
    confirmed_at: string | null;
    metadata: Record<string, any>;
}

export interface VendorOrderItemSplit {
    id: number;
    order_item: number;
    product_id: number;
    product_title: string;
    quantity: number;
    selected_unit_label: string;
    price_at_purchase: string;
    line_total: string;
}

export interface VendorOrderSplit {
    id: number;
    order: number;
    order_number: string;
    order_reference: string;
    vendor: number;
    vendor_name: string;
    vendor_email: string;
    customer_email: string;
    status: "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled" | "Refunded";
    gross_amount: string;
    platform_commission_rate: string;
    platform_commission_amount: string;
    vendor_earning_amount: string;
    refunded_amount: string;
    payout_status: "pending_wallet" | "available_for_payout" | "partially_paid" | "paid_out" | "refunded";
    earnings_released: boolean;
    released_at: string | null;
    created_at: string;
    updated_at: string;
    items: VendorOrderItemSplit[];
}

export interface VendorWallet {
    id: number;
    vendor: number;
    vendor_name: string;
    available_balance: string;
    pending_balance: string;
    lifetime_earnings: string;
    total_paid_out: string;
    total_refunded: string;
    updated_at: string;
}

export interface VendorWalletTransaction {
    id: number;
    transaction_type: string;
    direction: "credit" | "debit";
    amount: string;
    balance_after: string;
    status: string;
    description: string;
    order_reference: string;
    created_at: string;
    metadata: Record<string, any>;
}

export interface VendorPayoutRequest {
    id: number;
    vendor: number;
    vendor_name: string;
    vendor_email: string;
    wallet: number;
    amount: string;
    phone_number: string;
    status: "requested" | "under_review" | "approved" | "rejected" | "paid" | "failed" | "cancelled";
    requested_at: string;
    reviewed_at: string | null;
    paid_at: string | null;
    reviewed_by: number | null;
    external_reference: string | null;
    notes: string;
    metadata: Record<string, any>;
}

export interface VendorFinanceSummary {
    wallet: VendorWallet;
    totals: {
        total_sales: string;
        placed_order_value?: string;
        unpaid_order_value?: string;
        platform_commission: string;
        net_earnings: string;
        refunded_total: string;
        payouts_completed: string;
        pending_payout_requests: string;
        withdrawable_balance: string;
        pending_balance: string;
        open_order_count?: string;
    };
    recent_transactions: VendorWalletTransaction[];
    payout_history: VendorPayoutRequest[];
    payout_policy?: {
        mode: "automatic" | "manual";
        earnings_release_policy: "on_payment" | "on_delivery";
    };
}

export interface AdminFinanceSummary {
    totals: {
        marketplace_revenue_collected: string;
        orders_gross_value?: string;
        orders_unpaid_value?: string;
        orders_paid_value?: string;
        platform_commission_earned: string;
        vendor_net_earnings: string;
        vendor_payouts_completed: string;
        refunds_total: string;
        merchant_account_balance: string;
        vendor_wallet_available_liability: string;
        vendor_wallet_pending_liability: string;
    };
    payout_config?: {
        mode: "automatic" | "manual";
        earnings_release_policy: "on_payment" | "on_delivery";
    };
    open_items: {
        pending_payout_requests: number;
        payment_disputes_or_failed: number;
        open_orders_count?: number;
    };
    reports: {
        latest_payments: MarketplacePayment[];
        latest_payouts: VendorPayoutRequest[];
    };
}

export type ReceiptCategory = "customer" | "vendor" | "admin" | "station" | "system";
export type ReceiptOwnerType = "customer" | "vendor" | "admin" | "station_staff" | "platform" | "system";
export type ReceiptStatus = "issued" | "voided" | "replaced";
export type ReceiptEntityType = "order" | "payment" | "vendor_order" | "payout_request" | "refund" | "wallet_transaction";

export interface ReceiptRecord {
    id: number;
    receipt_number: string;
    category: ReceiptCategory;
    receipt_type: string;
    owner_type: ReceiptOwnerType;
    owner_user: number | null;
    owner_email: string;
    customer: number | null;
    customer_email: string;
    vendor: number | null;
    vendor_name: string;
    station: number | null;
    station_name: string;
    order: number | null;
    payment: number | null;
    refund: number | null;
    payout_request: number | null;
    vendor_order: number | null;
    related_entity_type: string;
    related_entity_id: string;
    related_reference: string;
    currency: string;
    gross_amount: string;
    fee_amount: string;
    commission_amount: string;
    tax_amount: string;
    net_amount: string;
    payment_method: string;
    status: ReceiptStatus;
    summary: Record<string, any>;
    actor_snapshot: Record<string, any>;
    revision_of: number | null;
    pdf_file_url: string;
    created_at: string;
}

interface GenerateReceiptResponse {
    created: boolean;
    receipt: ReceiptRecord;
}

export interface StoredPaymentMethod {
    id: number;
    user: number;
    method_type: PaymentMethodType;
    provider: string | null;
    cardholder_name: string | null;
    card_last4: string | null;
    card_expiry_month: number | null;
    card_expiry_year: number | null;
    mpesa_phone_masked: string | null;
    billing_email: string | null;
    is_default: boolean;
    created_at: string;
    updated_at: string;
    display_name: string;
    masked_reference: string;
}

export interface CreateCardPaymentMethodPayload {
    method_type: "card";
    provider?: string;
    cardholder_name: string;
    card_number: string;
    card_expiry: string;
    billing_email?: string;
    is_default?: boolean;
}

export interface CreateMpesaPaymentMethodPayload {
    method_type: "mpesa";
    mpesa_phone: string;
    billing_email?: string;
    is_default?: boolean;
}

export type CreatePaymentMethodPayload = CreateCardPaymentMethodPayload | CreateMpesaPaymentMethodPayload;

export type CareerEmploymentType = "full_time" | "part_time" | "contract" | "internship" | "remote";
export type CareerApplicationStatus = "pending" | "reviewed" | "shortlisted" | "rejected";
export type CareerFieldType = "text" | "email" | "phone" | "number" | "textarea" | "url" | "select";
export type SupportCategoryKey = "orders" | "shipping" | "payments" | "returns" | "account" | "vendor" | "general";
export type SupportEntryType = "faq" | "guide";
export type SupportTicketStatus = "pending" | "in_progress" | "resolved";
export type AdvertisingBusinessType = "vendor" | "brand" | "agency" | "platform" | "other";
export type AdvertisingRequestStatus = "pending_review" | "needs_info" | "approved" | "rejected";
export type AdvertisingCampaignSource = "internal" | "external" | "vendor";
export type AdvertisingCampaignStatus = "draft" | "scheduled" | "active" | "paused" | "rejected" | "expired" | "completed";
export type AdvertisingCampaignPurpose =
    | "sales"
    | "awareness"
    | "new_arrival"
    | "flash_sale"
    | "vendor_spotlight"
    | "brand_promotion"
    | "other";
export type AdvertisingEventType = "impression" | "click";

export interface AdvertisingPlacement {
    id: number;
    key: string;
    name: string;
    description: string;
    max_ads_per_page: number;
    default_image_width: number;
    default_image_height: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AdvertisingRequest {
    id: number;
    requester: number | null;
    requester_email: string;
    vendor_profile: number | null;
    full_name: string;
    company_name: string;
    email: string;
    phone_number: string;
    business_type: AdvertisingBusinessType;
    ad_objective: string;
    preferred_placement: AdvertisingPlacement | null;
    campaign_duration: string;
    budget_range: string;
    message: string;
    status: AdvertisingRequestStatus;
    admin_notes: string;
    reviewed_by: number | null;
    reviewed_by_email: string;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateAdvertisingRequestPayload {
    full_name: string;
    company_name?: string;
    email: string;
    phone_number?: string;
    business_type: AdvertisingBusinessType;
    ad_objective: string;
    preferred_placement_id?: number | null;
    campaign_duration: string;
    budget_range: string;
    message?: string;
}

export interface AdvertisingCampaign {
    id: number;
    source_type: AdvertisingCampaignSource;
    purpose: AdvertisingCampaignPurpose;
    linked_request: number | null;
    placement: AdvertisingPlacement;
    owner: number | null;
    owner_email: string;
    vendor_context: number | null;
    title: string;
    subtitle: string;
    description: string;
    target_url: string;
    cta_label: string;
    creative_image: string | null;
    creative_image_url: string;
    category_context: string;
    status: AdvertisingCampaignStatus;
    is_visible: boolean;
    is_sponsored: boolean;
    priority: number;
    start_at: string | null;
    end_at: string | null;
    budget_amount: string | null;
    pricing_notes: string;
    impression_count: number;
    click_count: number;
    ctr: number;
    approved_by: number | null;
    approved_by_email: string;
    approved_at: string | null;
    approval_notes: string;
    created_by: number | null;
    last_served_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface AdvertisingPublicDataResponse {
    placements: AdvertisingPlacement[];
    campaigns: AdvertisingCampaign[];
}

export interface AdvertisingAnalyticsResponse {
    totals: {
        campaigns_total: number;
        campaigns_active: number;
        pending_requests: number;
        impressions: number;
        clicks: number;
        ctr: number;
    };
    placement_performance: Array<{
        placement_key: string;
        placement_name: string;
        campaigns_count: number;
        impressions: number;
        clicks: number;
        ctr: number;
    }>;
    purpose_performance: Array<{
        purpose_key: AdvertisingCampaignPurpose;
        campaigns_count: number;
        impressions: number;
        clicks: number;
        ctr: number;
    }>;
    top_campaigns: AdvertisingCampaign[];
}

export interface AdminAdvertisingCampaignPayload {
    source_type: AdvertisingCampaignSource;
    purpose?: AdvertisingCampaignPurpose;
    linked_request?: number | null;
    placement_id: number;
    owner?: number | null;
    vendor_context?: number | null;
    title: string;
    subtitle?: string;
    description?: string;
    target_url?: string;
    cta_label?: string;
    creative_image?: File | null;
    category_context?: string;
    status: AdvertisingCampaignStatus;
    is_visible?: boolean;
    is_sponsored?: boolean;
    priority?: number;
    start_at?: string | null;
    end_at?: string | null;
    budget_amount?: string | null;
    pricing_notes?: string;
    approval_notes?: string;
}

export interface AdminAdvertisingPlacementPayload {
    key: string;
    name: string;
    description?: string;
    max_ads_per_page?: number;
    default_image_width?: number;
    default_image_height?: number;
    is_active?: boolean;
}

export interface CareerJobOpening {
    id: number;
    title: string;
    department: string;
    location: string;
    employment_type: CareerEmploymentType;
    summary: string;
    responsibilities: string;
    requirements: string;
    is_active: boolean;
    posted_at: string;
    updated_at: string;
}

export interface CareerApplicationField {
    id: number;
    key: string;
    label: string;
    field_type: CareerFieldType;
    is_required: boolean;
    placeholder: string;
    help_text: string;
    select_options: string[];
    sort_order: number;
    is_active: boolean;
}

export interface JobApplicationSubmissionPayload {
    job_opening: number | null;
    answers: Record<string, string>;
    cv_file: File;
    cover_letter_file?: File | null;
    certificates_file?: File | null;
}

export interface AdminJobApplication {
    id: number;
    job_opening: CareerJobOpening | null;
    full_name: string;
    email: string;
    phone_number: string;
    country_location: string;
    years_of_experience: string;
    education_level: string;
    professional_skills: string;
    linkedin_portfolio: string;
    cover_letter: string;
    additional_answers: Record<string, string>;
    cv_file: string;
    cover_letter_file: string | null;
    certificates_file: string | null;
    status: CareerApplicationStatus;
    admin_notes: string;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    applicant_email: string;
}

export interface AdminCareerOpeningPayload {
    title: string;
    department: string;
    location: string;
    employment_type: CareerEmploymentType;
    summary: string;
    responsibilities?: string;
    requirements?: string;
    is_active?: boolean;
}

export interface AdminCareerFieldPayload {
    key: string;
    label: string;
    field_type: CareerFieldType;
    is_required?: boolean;
    placeholder?: string;
    help_text?: string;
    select_options?: string[];
    sort_order?: number;
    is_active?: boolean;
}

export interface SupportKnowledgeBaseEntry {
    id: number;
    title: string;
    slug: string;
    category: SupportCategoryKey;
    category_label: string;
    entry_type: SupportEntryType;
    entry_type_label: string;
    short_answer: string;
    content: string;
    is_published: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface SupportCategoryOption {
    key: SupportCategoryKey;
    label: string;
}

export interface HelpCenterContentResponse {
    categories: SupportCategoryOption[];
    entries: SupportKnowledgeBaseEntry[];
    content_source?: "database" | "fallback";
    support_contact: {
        email: string;
        phone: string;
    };
}

export interface CreateSupportTicketPayload {
    name: string;
    email: string;
    subject: string;
    message: string;
    attachment?: File | null;
}

export interface CreateSupportTicketResponse {
    id: number;
    status: SupportTicketStatus;
    detail: string;
}

export interface SupportTicketSummary {
    id: number;
    name: string;
    email: string;
    user_email: string;
    subject: string;
    status: SupportTicketStatus;
    admin_notes: string;
    message_count: number;
    last_message: string;
    has_attachments: boolean;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
}

export interface SupportTicketAttachment {
    id: number;
    original_name: string;
    file_url: string;
    created_at: string;
}

export interface SupportTicketMessage {
    id: number;
    sender_type: "user" | "admin" | "system";
    sender_email: string;
    content: string;
    is_internal: boolean;
    created_at: string;
}

export interface SupportTicketDetail {
    id: number;
    name: string;
    email: string;
    user_email: string;
    subject: string;
    status: SupportTicketStatus;
    admin_notes: string;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    messages: SupportTicketMessage[];
    attachments: SupportTicketAttachment[];
}

export interface AdminModerationProductCandidate {
    id: number;
    title: string;
    slug: string;
    is_active: boolean;
    vendor_profile_id: number;
    vendor_name: string;
    vendor_approval_status: string;
    price: string;
    stock: number;
    category_name: string;
}

export interface AdminProductReportItem {
    id: number;
    subject: string;
    status: SupportTicketStatus;
    name: string;
    email: string;
    user_email: string;
    admin_notes: string;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    reporter_name: string;
    reporter_email: string;
    product_reference: string;
    reason: string;
    issue_details: string;
    attachments: SupportTicketAttachment[];
    candidates: AdminModerationProductCandidate[];
    primary_candidate: AdminModerationProductCandidate | null;
}

export interface AdminProductReportActionResponse {
    detail: string;
    ticket: {
        id: number;
        status: SupportTicketStatus;
        admin_notes: string;
        resolved_at: string | null;
        product_reference: string;
        reason: string;
        issue_details: string;
        candidates: AdminModerationProductCandidate[];
        primary_candidate: AdminModerationProductCandidate | null;
    };
    result: Record<string, any>;
}

export interface AdminProductReportBulkActionResponse {
    detail: string;
    processed_count: number;
    success_count: number;
    failure_count: number;
    successes: Array<{ ticket_id: number; ticket: AdminProductReportActionResponse["ticket"]; result: Record<string, any> }>;
    failures: Array<{ ticket_id: number; error: string }>;
}

export interface PublicVendorStore {
    id: number;
    store_name: string;
    store_description: string | null;
    business_email: string | null;
    business_phone: string | null;
    business_hours: string | null;
    business_location: string | null;
    business_address_line_1: string | null;
    business_address_line_2: string | null;
    business_city: string | null;
    business_postal_code: string | null;
    business_country: string | null;
    product_category: string | null;
    store_logo_url: string;
    store_banner_url: string;
    total_products: number;
    store_score: number;
    catalog_categories: string[];
    updated_at: string;
}

export interface PublicVendorStoreResponse {
    stores: PublicVendorStore[];
    meta: {
        count: number;
        city_options: string[];
        category_options: string[];
    };
}

export type AdminLevel = "super_admin" | "staff";

export interface AdminPermissionOption {
    code: string;
    action: string;
    label: string;
}

export interface AdminPermissionCatalogGroup {
    module: string;
    permissions: AdminPermissionOption[];
}

export interface AdminStaffRole {
    id: number;
    name: string;
    slug: string;
    description: string;
    permissions: string[];
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AdminStaffAssignment {
    id: number;
    role: AdminStaffRole | null;
    is_active: boolean;
    assigned_by: number | null;
    assigned_by_email: string;
    assigned_at: string;
    notes: string;
    updated_at: string;
}

export interface AdminStaffAccount {
    id: number;
    customer_id: string;
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
    phone_number: string | null;
    is_active: boolean;
    date_joined: string;
    last_login: string | null;
    role: "admin";
    admin_level: AdminLevel;
    is_super_admin: boolean;
    staff_assignment: AdminStaffAssignment | null;
    effective_permissions: string[];
    allowed_modules: string[];
}

export interface AdminActivityLog {
    id: number;
    actor: number | null;
    actor_email: string;
    action: string;
    target_type: string;
    target_id: string;
    description: string;
    metadata: Record<string, any>;
    created_at: string;
}

export interface AdminCapabilitiesResponse {
    is_super_admin: boolean;
    admin_level: string;
    permissions: string[];
    modules: string[];
    permission_catalog: AdminPermissionCatalogGroup[];
    staff_assignment: Record<string, any>;
}

export type AdminReadinessStatus = "pass" | "warning" | "fail";

export interface AdminReadinessCheck {
    key: string;
    label: string;
    status: AdminReadinessStatus;
    detail: string;
    metric: string;
    action: string;
    fix_path: string;
}

export interface AdminReadinessSection {
    key: string;
    title: string;
    description: string;
    checks: AdminReadinessCheck[];
}

export interface AdminProductionReadinessResponse {
    generated_at: string;
    summary: {
        total_checks: number;
        pass_count: number;
        warning_count: number;
        fail_count: number;
        readiness_score: number;
        is_launch_blocked: boolean;
    };
    environment: {
        debug: boolean;
        payout_mode: string;
        mpesa_live_enabled: boolean;
    };
    sections: AdminReadinessSection[];
    top_blockers: AdminReadinessCheck[];
}

export interface CreateOrderPayload {
    full_name?: string;
    phone_number?: string;
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    postal_code?: string;
    country?: string;
    shipping_address_id?: number;
    fulfillment_method?: "delivery" | "pickup";
    pickup_station_id?: number;
    idempotency_key?: string;
    items: Array<{
        product_id: number;
        quantity: number;
        sale_option_id?: number | null;
    }>;
}

// ==========================================
// --- PRODUCT API CALLS (SERVER) ---
// ==========================================

export async function getProducts(): Promise<Product[]> {
    const productApiBases = Array.from(
        new Set([SERVER_API_URL, CONFIGURED_API_URL, CLIENT_API_URL].filter(Boolean)),
    );

    let lastError: Error | null = null;
    for (const base of productApiBases) {
        try {
            const response = await fetch(`${base}/products/`, {
                next: { revalidate: 60 },
            });
            if (!response.ok) {
                lastError = new Error(`Products API returned ${response.status} from ${base}.`);
                continue;
            }

            const products = await response.json();
            return products.map((product: any) => {
                const rawSlug = typeof product.slug === "string" ? product.slug.trim() : "";
                const isSafeSlug = rawSlug.length > 0 && /^[a-zA-Z0-9_-]+$/.test(rawSlug);
                if (!isSafeSlug) {
                    product.slug = String(product.id);
                }
                product.sale_type = product.sale_type || "single_item";
                product.base_unit_label = product.base_unit_label || "item";
                product.base_quantity_value = String(product.base_quantity_value ?? "1");
                product.stock_unit_label = product.stock_unit_label || "unit";
                product.auto_price_calculation = product.auto_price_calculation !== false;
                product.sale_options = Array.isArray(product.sale_options) ? product.sale_options : [];
                if (product.default_sale_option_id == null && product.sale_options.length > 0) {
                    const explicitDefault = product.sale_options.find((row: any) => row.is_default);
                    product.default_sale_option_id = explicitDefault?.id ?? product.sale_options[0]?.id ?? null;
                }
                if (!product.display_price_label) {
                    product.display_price_label = `${product.effective_price || product.price} / ${product.base_unit_label}`;
                }
                if (product.image && typeof product.image === 'string' && !product.image.startsWith('http')) {
                    product.image = `${BACKEND_URL}${product.image}`;
                }
                if (product.images && Array.isArray(product.images)) {
                    product.images.forEach((img: any) => {
                        if (img.image && typeof img.image === 'string' && !img.image.startsWith('http')) {
                            img.image = `${BACKEND_URL}${img.image}`;
                        }
                    });
                }
                return product as Product;
            });
        } catch (error: any) {
            lastError = error instanceof Error ? error : new Error("Failed to fetch products.");
        }
    }

    throw lastError || new Error("Failed to fetch products.");
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
    const normalizeToken = (value: string) =>
        decodeURIComponent(String(value || ""))
            .trim()
            .toLowerCase();

    try {
        const response = await fetch(`${SERVER_API_URL}/products/${slug}/`, {
            cache: 'no-store'
        });

        if (!response.ok) {
            const allProducts = await getProducts();
            const token = normalizeToken(slug);
            const fallback = allProducts.find((candidate: any) => {
                const candidateSlug = normalizeToken(candidate.slug || "");
                const candidateId = normalizeToken(String(candidate.id || ""));
                const candidateTitle = normalizeToken(candidate.title || "");
                return token === candidateSlug || token === candidateId || token === candidateTitle;
            });
            return fallback || null;
        }

        const product: any = await response.json();
        product.sale_type = product.sale_type || "single_item";
        product.base_unit_label = product.base_unit_label || "item";
        product.base_quantity_value = String(product.base_quantity_value ?? "1");
        product.stock_unit_label = product.stock_unit_label || "unit";
        product.auto_price_calculation = product.auto_price_calculation !== false;
        product.sale_options = Array.isArray(product.sale_options) ? product.sale_options : [];
        if (product.default_sale_option_id == null && product.sale_options.length > 0) {
            const explicitDefault = product.sale_options.find((row: any) => row.is_default);
            product.default_sale_option_id = explicitDefault?.id ?? product.sale_options[0]?.id ?? null;
        }
        if (!product.display_price_label) {
            product.display_price_label = `${product.effective_price || product.price} / ${product.base_unit_label}`;
        }
        
        if (product.image && typeof product.image === 'string' && !product.image.startsWith('http')) {
            product.image = `${BACKEND_URL}${product.image}`;
        }
        if (product.images && Array.isArray(product.images)) {
            product.images.forEach((img: any) => {
                if (img.image && typeof img.image === 'string' && !img.image.startsWith('http')) {
                    img.image = `${BACKEND_URL}${img.image}`;
                }
            });
        }
        return product as Product;
    } catch {
        return null;
    }
}

// ==========================================
// --- AUTHENTICATION API CALLS (CLIENT) ---
// ==========================================

export async function loginUser(email: string, password: string) {
    const response = await requestWithApiBaseFallbackAnonymous("/users/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Invalid email or password. Please try again."));
    }
    return await response.json();
}

export async function registerUser(userData: any) {
    const isFormData = typeof FormData !== "undefined" && userData instanceof FormData;
    const response = await requestWithApiBaseFallbackAnonymous("/users/register/", {
        method: "POST",
        headers: isFormData ? {} : { "Content-Type": "application/json" },
        body: isFormData ? userData : JSON.stringify(userData),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Registration failed. Please review your details and try again."));
    }
    return await response.json();
}

// ==========================================
// --- ORDER & CHECKOUT API CALLS (CLIENT) ---
// ==========================================

export async function createOrder(
    orderData: CreateOrderPayload,
    token: string,
    options: { idempotencyKey?: string } = {},
): Promise<Order> {
    const payload: CreateOrderPayload = {
        ...orderData,
        ...(options.idempotencyKey ? { idempotency_key: options.idempotencyKey } : {}),
    };
    const response = await requestWithApiBaseFallback(
        "/orders/create/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to process order."));
    }
    return (await response.json()) as Order;
}

export async function initiateMpesaPayment(
    payload: { order_id: number; phone_number: string },
    token: string,
    options: { idempotencyKey?: string } = {},
): Promise<{ detail: string; platform_collection_account: string; payment: MarketplacePayment }> {
    const response = await requestWithApiBaseFallback(
        "/orders/payments/mpesa/initiate/",
        {
            method: "POST",
            headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : undefined,
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to initiate M-Pesa payment."));
    }
    return await response.json();
}

export async function mockConfirmMpesaPayment(
    paymentId: number,
    token: string,
): Promise<{ status: string; order_id?: number; order_number?: string; vendor_orders?: string[]; message?: string }> {
    const response = await requestWithApiBaseFallback(
        `/orders/payments/mpesa/mock-confirm/${paymentId}/`,
        {
            method: "POST",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Payment confirmation failed."));
    }
    return await response.json();
}

export async function getMyMarketplacePayments(token: string): Promise<MarketplacePayment[]> {
    const response = await requestWithApiBaseFallback(
        "/orders/payments/my/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch payment history."));
    }
    return await response.json();
}

export async function getOrders(token: string) {
    const response = await requestWithApiBaseFallback(
        "/orders/list/",
        {
            method: "GET",
        },
        token,
    );

    if (!response.ok) throw new Error("Failed to fetch orders");
    return await response.json();
}

export async function updateAdminOrder(
    token: string,
    orderId: number,
    payload: { status?: Order["status"]; is_paid?: boolean },
): Promise<Order> {
    const response = await requestWithApiBaseFallback(
        `/orders/admin/orders/${orderId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update order."));
    }
    return await response.json();
}

export async function releaseAdminExpiredReservations(
    token: string,
    payload: { limit?: number } = {},
): Promise<{ released_orders: number; detail: string }> {
    const response = await requestWithApiBaseFallback(
        "/orders/admin/orders/release-expired-reservations/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to release expired reservations."));
    }
    return await response.json();
}

export async function getCategories(): Promise<Category[]> {
    const response = await fetch(`${CLIENT_API_URL}/products/categories/`, {
        method: "GET",
        cache: "no-store",
    });
    if (!response.ok) {
        throw new Error("Failed to load categories.");
    }
    return await response.json();
}

export async function createAdminCategory(
    token: string,
    payload: AdminCategoryPayload,
): Promise<Category> {
    const response = await requestWithApiBaseFallback(
        "/products/admin/categories/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create category."));
    }
    return await response.json();
}

export async function getMyOrders(token: string): Promise<Order[]> {
    const response = await requestWithApiBaseFallback(
        "/orders/my-orders/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch your orders.");
    }
    return await response.json();
}

export async function trackMyOrder(orderNumber: string, token: string): Promise<Order> {
    const safeOrderNumber = encodeURIComponent(orderNumber.trim());
    const response = await requestWithApiBaseFallback(
        `/orders/track/${safeOrderNumber}/`,
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Unable to find that order.");
    }
    return await response.json();
}

export async function cancelMyOrder(orderId: number, token: string): Promise<Order> {
    const response = await requestWithApiBaseFallback(
        `/orders/${orderId}/cancel/`,
        {
            method: "PATCH",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to cancel order.");
    }
    return await response.json();
}

export async function getPublicPickupStations(params: { q?: string; city?: string } = {}): Promise<PickupStation[]> {
    const searchParams = new URLSearchParams();
    if (params.q?.trim()) searchParams.set("q", params.q.trim());
    if (params.city?.trim()) searchParams.set("city", params.city.trim());
    const response = await requestWithApiBaseFallback(
        `/pickup/stations/public/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        {
            method: "GET",
            cache: "no-store",
        },
        null,
        true,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to load pickup stations."));
    }
    return await response.json();
}

export async function getAdminPickupStations(
    token: string,
    params: { q?: string; city?: string; active?: boolean; ownership_type?: "platform" | "vendor"; vendor_profile_id?: number } = {},
): Promise<PickupStation[]> {
    const searchParams = new URLSearchParams();
    if (params.q?.trim()) searchParams.set("q", params.q.trim());
    if (params.city?.trim()) searchParams.set("city", params.city.trim());
    if (typeof params.active === "boolean") searchParams.set("active", String(params.active));
    if (params.ownership_type) searchParams.set("ownership_type", params.ownership_type);
    if (typeof params.vendor_profile_id === "number") searchParams.set("vendor_profile_id", String(params.vendor_profile_id));
    const response = await requestWithApiBaseFallback(
        `/pickup/admin/stations/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        { method: "GET", cache: "no-store" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to load pickup stations."));
    }
    return await response.json();
}

export async function createAdminPickupStation(
    token: string,
    payload: Partial<
        Pick<
            PickupStation,
            | "name"
            | "city"
            | "address"
            | "operating_hours"
            | "contact_phone"
            | "contact_email"
            | "services"
            | "is_active"
            | "supports_pickup"
            | "supports_returns"
            | "temporary_notice"
            | "ownership_type"
            | "vendor_profile"
            | "approval_status"
            | "is_visible_to_customers"
            | "sync_name"
            | "sync_address"
            | "sync_contact"
            | "sync_operating_hours"
            | "sync_active_status"
        >
    >,
): Promise<PickupStation> {
    const response = await requestWithApiBaseFallback(
        "/pickup/admin/stations/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create pickup station."));
    }
    return await response.json();
}

export async function updateAdminPickupStation(
    token: string,
    stationId: number,
    payload: Partial<
        Pick<
            PickupStation,
            | "name"
            | "city"
            | "address"
            | "operating_hours"
            | "contact_phone"
            | "contact_email"
            | "services"
            | "is_active"
            | "supports_pickup"
            | "supports_returns"
            | "temporary_notice"
            | "ownership_type"
            | "vendor_profile"
            | "approval_status"
            | "is_visible_to_customers"
            | "sync_name"
            | "sync_address"
            | "sync_contact"
            | "sync_operating_hours"
            | "sync_active_status"
        >
    >,
): Promise<PickupStation> {
    const response = await requestWithApiBaseFallback(
        `/pickup/admin/stations/${stationId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update pickup station."));
    }
    return await response.json();
}

export async function deleteAdminPickupStation(token: string, stationId: number): Promise<void> {
    const response = await requestWithApiBaseFallback(
        `/pickup/admin/stations/${stationId}/`,
        {
            method: "DELETE",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete pickup station."));
    }
}

export async function getAdminPickupAssignments(
    token: string,
    params: { station_id?: number; active?: boolean } = {},
): Promise<PickupStationAssignment[]> {
    const searchParams = new URLSearchParams();
    if (typeof params.station_id === "number") searchParams.set("station_id", String(params.station_id));
    if (typeof params.active === "boolean") searchParams.set("active", String(params.active));
    const response = await requestWithApiBaseFallback(
        `/pickup/admin/assignments/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        { method: "GET", cache: "no-store" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to load station assignments."));
    }
    return await response.json();
}

export async function createAdminPickupAssignment(
    token: string,
    payload: {
        station: number;
        user: number;
        role: PickupAssignmentRole;
        can_manage_local_staff?: boolean;
        is_active?: boolean;
        notes?: string;
    },
): Promise<PickupStationAssignment> {
    const response = await requestWithApiBaseFallback(
        "/pickup/admin/assignments/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create station assignment."));
    }
    return await response.json();
}

export async function updateAdminPickupAssignment(
    token: string,
    assignmentId: number,
    payload: Partial<{
        station: number;
        user: number;
        role: PickupAssignmentRole;
        can_manage_local_staff: boolean;
        is_active: boolean;
        notes: string;
    }>,
): Promise<PickupStationAssignment> {
    const response = await requestWithApiBaseFallback(
        `/pickup/admin/assignments/${assignmentId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update station assignment."));
    }
    return await response.json();
}

export async function deleteAdminPickupAssignment(token: string, assignmentId: number): Promise<void> {
    const response = await requestWithApiBaseFallback(
        `/pickup/admin/assignments/${assignmentId}/`,
        {
            method: "DELETE",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete station assignment."));
    }
}

export async function getAdminPickupOperations(
    token: string,
    params: { station_id?: number; event_type?: string } = {},
): Promise<PickupOrderOperation[]> {
    const searchParams = new URLSearchParams();
    if (typeof params.station_id === "number") searchParams.set("station_id", String(params.station_id));
    if (params.event_type?.trim()) searchParams.set("event_type", params.event_type.trim());
    const response = await requestWithApiBaseFallback(
        `/pickup/admin/operations/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        { method: "GET", cache: "no-store" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to load pickup operations."));
    }
    return await response.json();
}

export async function getMyStationOperationStations(token: string): Promise<PickupStation[]> {
    const response = await requestWithApiBaseFallback(
        "/pickup/station/me/stations/",
        { method: "GET", cache: "no-store" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to load assigned stations."));
    }
    return await response.json();
}

export async function getMyStationOperationOrders(
    token: string,
    params: { station_id?: number; status?: string } = {},
): Promise<PickupOrderSummary[]> {
    const searchParams = new URLSearchParams();
    if (typeof params.station_id === "number") searchParams.set("station_id", String(params.station_id));
    if (params.status?.trim()) searchParams.set("status", params.status.trim());
    const response = await requestWithApiBaseFallback(
        `/pickup/station/me/orders/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        { method: "GET", cache: "no-store" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to load pickup orders."));
    }
    return await response.json();
}

export async function markStationOrderReady(token: string, orderId: number, notes: string = ""): Promise<PickupOrderSummary> {
    const response = await requestWithApiBaseFallback(
        `/pickup/station/me/orders/${orderId}/ready/`,
        {
            method: "POST",
            body: JSON.stringify({ notes }),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to mark order as ready."));
    }
    return await response.json();
}

export async function markStationOrderCollected(token: string, orderId: number, notes: string = ""): Promise<PickupOrderSummary> {
    const response = await requestWithApiBaseFallback(
        `/pickup/station/me/orders/${orderId}/collect/`,
        {
            method: "POST",
            body: JSON.stringify({ notes }),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to mark order as collected."));
    }
    return await response.json();
}

export async function markStationOrderReturnDropoff(token: string, orderId: number, notes: string = ""): Promise<{ detail: string }> {
    const response = await requestWithApiBaseFallback(
        `/pickup/station/me/orders/${orderId}/return-dropoff/`,
        {
            method: "POST",
            body: JSON.stringify({ notes }),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to record return drop-off."));
    }
    return await response.json();
}

export async function updateStationNotice(
    token: string,
    stationId: number,
    temporary_notice: string,
): Promise<PickupStation> {
    const response = await requestWithApiBaseFallback(
        `/pickup/station/me/stations/${stationId}/notice/`,
        {
            method: "PATCH",
            body: JSON.stringify({ temporary_notice }),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update station notice."));
    }
    return await response.json();
}

export async function updateMyStationOperationalSettings(
    token: string,
    stationId: number,
    payload: Partial<Pick<PickupStation, "services" | "supports_pickup" | "supports_returns" | "temporary_notice">>,
): Promise<PickupStation> {
    const response = await requestWithApiBaseFallback(
        `/pickup/station/me/stations/${stationId}/settings/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update station operational settings."));
    }
    return await response.json();
}

export async function getMyProfile(token: string): Promise<UserProfile> {
    const response = await requestWithApiBaseFallback(
        "/users/me/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch profile.");
    }
    return await response.json();
}

export async function updateMyProfile(
    payload: Partial<Pick<UserProfile, "first_name" | "last_name" | "email" | "phone_number">>,
    token: string,
): Promise<UserProfile> {
    const response = await requestWithApiBaseFallback(
        "/users/me/",
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update profile."));
    }
    return await response.json();
}

export async function changeMyPassword(
    token: string,
    payload: { current_password: string; new_password: string; confirm_password: string },
): Promise<{ detail: string }> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/users/change-password/`, {
        method: "POST",
        body: JSON.stringify(payload),
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to change password."));
    }
    return await response.json();
}

export async function getVendorProfile(token: string): Promise<VendorProfile> {
    const response = await requestWithApiBaseFallback(
        "/users/vendor/profile/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch vendor profile."));
    }
    return await response.json();
}

export async function updateVendorProfile(
    token: string,
    payload: Partial<
        Pick<
            VendorProfile,
            | "store_name"
            | "store_description"
            | "business_email"
            | "business_phone"
            | "business_hours"
            | "business_location"
            | "business_address_line_1"
            | "business_address_line_2"
            | "business_city"
            | "business_postal_code"
            | "business_country"
            | "product_category"
        >
    > & { store_logo?: File | null; store_banner?: File | null },
): Promise<VendorProfile> {
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (value instanceof File) {
            formData.append(key, value);
        } else {
            formData.append(key, String(value));
        }
    });

    const response = await requestWithApiBaseFallback(
        "/users/vendor/profile/",
        {
            method: "PATCH",
            body: formData,
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update vendor profile."));
    }
    return await response.json();
}

export async function getAdminVendorApplications(token: string, query: string = "", statusFilter: string = ""): Promise<VendorApplicationAdmin[]> {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter.trim()) params.set("status", statusFilter.trim());
    const endpoint = `${CLIENT_API_URL}/users/admin/vendor-applications/${params.toString() ? `?${params.toString()}` : ""}`;

    const response = await requestWithAuthRetry(endpoint, {
        method: "GET",
        cache: "no-store",
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch vendor applications."));
    }
    return await response.json();
}

export async function reviewAdminVendorApplication(
    token: string,
    vendorProfileId: number,
    payload: { approval_status?: VendorApprovalStatus; review_notes?: string },
): Promise<VendorApplicationAdmin> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/users/admin/vendor-applications/${vendorProfileId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to review vendor application."));
    }
    return await response.json();
}

export async function getAdminCapabilities(token: string): Promise<AdminCapabilitiesResponse> {
    const response = await requestWithApiBaseFallback(
        "/users/admin/capabilities/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch admin capabilities."));
    }
    return await response.json();
}

export async function getAdminProductionReadiness(token: string): Promise<AdminProductionReadinessResponse> {
    const response = await requestWithApiBaseFallback(
        "/users/admin/production-readiness/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch production readiness checklist."));
    }
    return await response.json();
}

export async function getAdminStaffRoles(token: string): Promise<AdminStaffRole[]> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/users/admin/staff-roles/`, {
        method: "GET",
        cache: "no-store",
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch staff roles."));
    }
    return await response.json();
}

export async function createAdminStaffRole(
    token: string,
    payload: Pick<AdminStaffRole, "name" | "slug" | "description" | "permissions" | "is_active">,
): Promise<AdminStaffRole> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/users/admin/staff-roles/`, {
        method: "POST",
        body: JSON.stringify(payload),
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create staff role."));
    }
    return await response.json();
}

export async function updateAdminStaffRole(
    token: string,
    roleId: number,
    payload: Partial<Pick<AdminStaffRole, "name" | "slug" | "description" | "permissions" | "is_active">>,
): Promise<AdminStaffRole> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/users/admin/staff-roles/${roleId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update staff role."));
    }
    return await response.json();
}

export async function deleteAdminStaffRole(token: string, roleId: number): Promise<void> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/users/admin/staff-roles/${roleId}/`, {
        method: "DELETE",
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete staff role."));
    }
}

export async function getAdminStaffAccounts(
    token: string,
    filters: { q?: string; admin_level?: string; role_id?: number | null; active?: boolean } = {},
): Promise<AdminStaffAccount[]> {
    const params = new URLSearchParams();
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    if (filters.admin_level?.trim()) params.set("admin_level", filters.admin_level.trim());
    if (typeof filters.role_id === "number") params.set("role_id", String(filters.role_id));
    if (typeof filters.active === "boolean") params.set("active", String(filters.active));

    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/users/admin/staff-accounts/${params.toString() ? `?${params.toString()}` : ""}`,
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch staff accounts."));
    }
    return await response.json();
}

export async function createAdminStaffAccount(
    token: string,
    payload: {
        email: string;
        first_name?: string;
        last_name?: string;
        phone_number?: string;
        password: string;
        is_active?: boolean;
        role_id?: number | null;
        assignment_active?: boolean;
        assignment_notes?: string;
    },
): Promise<AdminStaffAccount> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/users/admin/staff-accounts/`, {
        method: "POST",
        body: JSON.stringify(payload),
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create staff account."));
    }
    return await response.json();
}

export async function updateAdminStaffAccount(
    token: string,
    userId: number,
    payload: {
        first_name?: string;
        last_name?: string;
        phone_number?: string;
        email?: string;
        is_active?: boolean;
        admin_level?: AdminLevel;
        role_id?: number | null;
        assignment_active?: boolean;
        assignment_notes?: string;
        clear_assignment?: boolean;
        new_password?: string;
    },
): Promise<AdminStaffAccount> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/users/admin/staff-accounts/${userId}/`, {
        method: "PATCH",
        body: JSON.stringify(payload),
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update staff account."));
    }
    return await response.json();
}

export async function getAdminActivityLogs(
    token: string,
    filters: { q?: string; action?: string; actor_id?: number; target_type?: string; limit?: number } = {},
): Promise<AdminActivityLog[]> {
    const params = new URLSearchParams();
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    if (filters.action?.trim()) params.set("action", filters.action.trim());
    if (typeof filters.actor_id === "number") params.set("actor_id", String(filters.actor_id));
    if (filters.target_type?.trim()) params.set("target_type", filters.target_type.trim());
    if (typeof filters.limit === "number") params.set("limit", String(filters.limit));

    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/users/admin/activity-logs/${params.toString() ? `?${params.toString()}` : ""}`,
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch activity logs."));
    }
    return await response.json();
}

export async function getShippingAddresses(token: string): Promise<ShippingAddress[]> {
    const response = await requestWithApiBaseFallback(
        "/orders/addresses/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch addresses.");
    }
    return await response.json();
}

export async function createShippingAddress(payload: Omit<ShippingAddress, "id" | "user">, token: string): Promise<ShippingAddress> {
    const response = await requestWithApiBaseFallback(
        "/orders/addresses/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to create address.");
    }
    return await response.json();
}

export async function updateShippingAddress(
    addressId: number,
    payload: Partial<Omit<ShippingAddress, "id" | "user">>,
    token: string,
): Promise<ShippingAddress> {
    const response = await requestWithApiBaseFallback(
        `/orders/addresses/${addressId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to update address.");
    }
    return await response.json();
}

export async function deleteShippingAddress(addressId: number, token: string): Promise<void> {
    const response = await requestWithApiBaseFallback(
        `/orders/addresses/${addressId}/`,
        {
            method: "DELETE",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to delete address.");
    }
}

export async function getPaymentMethods(token: string): Promise<StoredPaymentMethod[]> {
    const response = await requestWithApiBaseFallback(
        "/orders/payment-methods/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to fetch payment methods.");
    }
    return await response.json();
}

export async function createPaymentMethod(
    payload: CreatePaymentMethodPayload,
    token: string,
): Promise<StoredPaymentMethod> {
    const response = await requestWithApiBaseFallback(
        "/orders/payment-methods/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to add payment method."));
    }
    return await response.json();
}

export async function updatePaymentMethod(
    paymentMethodId: number,
    payload: Partial<CreatePaymentMethodPayload> & { is_default?: boolean },
    token: string,
): Promise<StoredPaymentMethod> {
    const response = await requestWithApiBaseFallback(
        `/orders/payment-methods/${paymentMethodId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update payment method."));
    }
    return await response.json();
}

export async function deletePaymentMethod(paymentMethodId: number, token: string): Promise<void> {
    const response = await requestWithApiBaseFallback(
        `/orders/payment-methods/${paymentMethodId}/`,
        {
            method: "DELETE",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete payment method."));
    }
}

// ==========================================
// --- VENDOR API CALLS (CLIENT) ---
// ==========================================

export async function getVendorDashboardSummary(token: string): Promise<VendorDashboardSummary> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/vendor/dashboard/`, {
        method: "GET",
        cache: "no-store",
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch vendor dashboard summary."));
    }
    return await response.json();
}

export async function getVendorProducts(token: string): Promise<VendorProduct[]> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/vendor/products/`, {
        method: "GET",
        cache: "no-store",
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch vendor products."));
    }
    return await response.json();
}

export async function createVendorProduct(token: string, payload: VendorProductPayload): Promise<VendorProduct> {
    const formData = new FormData();
    appendProductPayload(formData, payload);

    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/vendor/products/`, {
        method: "POST",
        body: formData,
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create product."));
    }
    return await response.json();
}

export async function updateVendorProduct(token: string, productId: number, payload: Partial<VendorProductPayload>): Promise<VendorProduct> {
    const formData = new FormData();
    appendProductPayload(formData, payload);

    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/vendor/products/${productId}/`, {
        method: "PATCH",
        body: formData,
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update product."));
    }
    return await response.json();
}

export async function deleteVendorProduct(token: string, productId: number): Promise<void> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/vendor/products/${productId}/`, {
        method: "DELETE",
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete product."));
    }
}

export async function getVendorProductsBulkImportTemplate(token: string): Promise<Record<string, any>> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/vendor/products/bulk-import/`, {
        method: "GET",
        cache: "no-store",
    }, token);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to load vendor bulk-import template."));
    }
    return await response.json();
}

export async function importVendorProductsBulk(
    token: string,
    products: Array<Record<string, any>>,
): Promise<BulkProductImportResult> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/vendor/products/bulk-import/`, {
        method: "POST",
        body: JSON.stringify({ products }),
    }, token);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Vendor bulk import failed."));
    }
    return await response.json();
}

export async function getAdminProducts(token: string): Promise<VendorProduct[]> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/admin/products/`, {
        method: "GET",
        cache: "no-store",
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch products."));
    }
    return await response.json();
}

export async function createAdminProduct(
    token: string,
    payload: VendorProductPayload & { vendor_profile_id: number },
): Promise<VendorProduct> {
    const formData = new FormData();
    appendProductPayload(formData, payload);
    formData.append("vendor_profile_id", String(payload.vendor_profile_id));

    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/admin/products/`, {
        method: "POST",
        body: formData,
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create admin product."));
    }
    return await response.json();
}

export async function updateAdminProduct(
    token: string,
    productId: number,
    payload: Partial<VendorProductPayload> & { vendor_profile_id?: number },
): Promise<VendorProduct> {
    const formData = new FormData();
    appendProductPayload(formData, payload);
    if (payload.vendor_profile_id) {
        formData.append("vendor_profile_id", String(payload.vendor_profile_id));
    }

    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/admin/products/${productId}/`, {
        method: "PATCH",
        body: formData,
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update admin product."));
    }
    return await response.json();
}

export async function deleteAdminProduct(token: string, productId: number): Promise<void> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/admin/products/${productId}/`, {
        method: "DELETE",
    }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete admin product."));
    }
}

export async function getAdminProductsBulkImportTemplate(token: string): Promise<Record<string, any>> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/admin/products/bulk-import/`, {
        method: "GET",
        cache: "no-store",
    }, token);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to load admin bulk-import template."));
    }
    return await response.json();
}

export async function importAdminProductsBulk(
    token: string,
    products: Array<Record<string, any>>,
    vendorProfileId?: number | null,
): Promise<BulkProductImportResult> {
    const payload: Record<string, any> = { products };
    if (vendorProfileId) payload.vendor_profile_id = vendorProfileId;
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/products/admin/products/bulk-import/`, {
        method: "POST",
        body: JSON.stringify(payload),
    }, token);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Admin bulk import failed."));
    }
    return await response.json();
}

export async function getVendorOrders(token: string): Promise<VendorOrderRow[]> {
    const response = await requestWithApiBaseFallback(
        "/orders/vendor/orders/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch vendor orders."));
    }
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.flatMap((row: any) => {
        if (typeof row?.order_reference === "string" && Array.isArray(row?.items)) {
            const orderId = Number(row.order) || 0;
            return row.items.map((item: any) => ({
                vendor_order_id: Number(row.id) || undefined,
                order_reference: row.order_reference || "",
                order_id: orderId,
                order_number: row.order_number || row.order_reference || "",
                order_status: row.status || "Pending",
                is_paid: Boolean(row.earnings_released || row.payout_status !== "pending_wallet"),
                ordered_at: row.created_at || new Date().toISOString(),
                customer_email: row.customer_email || "",
                product_id: Number(item.product_id) || 0,
                product_title: item.product_title || "Product",
                quantity: Number(item.quantity) || 0,
                selected_unit_label: item.selected_unit_label || "unit",
                price_at_purchase: String(item.price_at_purchase || "0.00"),
                shipping_city: "",
                shipping_country: "",
            })) as VendorOrderRow[];
        }
        return [
            {
                ...row,
                vendor_order_id: row?.vendor_order_id ?? undefined,
                order_reference: row?.order_reference || "",
            } as VendorOrderRow,
        ];
    });
}

export async function updateVendorOrderStatus(
    token: string,
    orderId: number,
    payload: { status: "Pending" | "Processing" | "Shipped" | "Delivered" | "Cancelled" },
): Promise<{ detail: string; order: Order; vendor_order_status: string }> {
    const response = await requestWithApiBaseFallback(
        `/orders/vendor/orders/${orderId}/status/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update vendor order status."));
    }
    return await response.json();
}

export async function getVendorFinanceSummary(token: string): Promise<VendorFinanceSummary> {
    const response = await requestWithApiBaseFallback(
        "/orders/vendor/finance/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch vendor finance summary."));
    }
    return await response.json();
}

export async function getVendorPayoutRequests(token: string): Promise<VendorPayoutRequest[]> {
    const response = await requestWithApiBaseFallback(
        "/orders/vendor/payout-requests/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch payout requests."));
    }
    return await response.json();
}

export async function createVendorPayoutRequest(
    token: string,
    payload: { amount: string | number; phone_number: string; notes?: string },
): Promise<VendorPayoutRequest> {
    const response = await requestWithApiBaseFallback(
        "/orders/vendor/payout-requests/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create payout request."));
    }
    return await response.json();
}

export async function getAdminFinanceSummary(token: string): Promise<AdminFinanceSummary> {
    const response = await requestWithApiBaseFallback(
        "/orders/admin/finance/summary/",
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch finance summary."));
    }
    return await response.json();
}

export async function getAdminMarketplacePayments(
    token: string,
    filters: { status?: string; q?: string } = {},
): Promise<MarketplacePayment[]> {
    const params = new URLSearchParams();
    if (filters.status?.trim()) params.set("status", filters.status.trim());
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    const response = await requestWithApiBaseFallback(
        `/orders/admin/finance/payments/${params.toString() ? `?${params.toString()}` : ""}`,
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch marketplace payments."));
    }
    return await response.json();
}

export async function getAdminVendorOrders(
    token: string,
    filters: { status?: string; payout_status?: string; q?: string } = {},
): Promise<VendorOrderSplit[]> {
    const params = new URLSearchParams();
    if (filters.status?.trim()) params.set("status", filters.status.trim());
    if (filters.payout_status?.trim()) params.set("payout_status", filters.payout_status.trim());
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    const response = await requestWithApiBaseFallback(
        `/orders/admin/finance/vendor-orders/${params.toString() ? `?${params.toString()}` : ""}`,
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch vendor split orders."));
    }
    return await response.json();
}

export async function getAdminPayoutRequests(
    token: string,
    filters: { status?: string; q?: string } = {},
): Promise<VendorPayoutRequest[]> {
    const params = new URLSearchParams();
    if (filters.status?.trim()) params.set("status", filters.status.trim());
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    const response = await requestWithApiBaseFallback(
        `/orders/admin/finance/payout-requests/${params.toString() ? `?${params.toString()}` : ""}`,
        {
            method: "GET",
            cache: "no-store",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch payout requests."));
    }
    return await response.json();
}

export async function updateAdminPayoutRequest(
    token: string,
    payoutRequestId: number,
    payload: { action: "approve" | "reject" | "mark_paid"; notes?: string; external_reference?: string },
): Promise<VendorPayoutRequest> {
    const response = await requestWithApiBaseFallback(
        `/orders/admin/finance/payout-requests/${payoutRequestId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update payout request."));
    }
    return await response.json();
}

export async function createAdminOrderRefund(
    token: string,
    orderId: number,
    payload: { amount?: string | number; reason?: string; mpesa_reversal_reference?: string } = {},
): Promise<any> {
    const response = await requestWithApiBaseFallback(
        `/orders/admin/orders/${orderId}/refund/`,
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to process refund."));
    }
    return await response.json();
}

function buildReceiptQuery(params: {
    q?: string;
    category?: string;
    receipt_type?: string;
    owner_type?: string;
    status?: string;
    reference?: string;
} = {}): string {
    const searchParams = new URLSearchParams();
    if (params.q?.trim()) searchParams.set("q", params.q.trim());
    if (params.category?.trim()) searchParams.set("category", params.category.trim());
    if (params.receipt_type?.trim()) searchParams.set("receipt_type", params.receipt_type.trim());
    if (params.owner_type?.trim()) searchParams.set("owner_type", params.owner_type.trim());
    if (params.status?.trim()) searchParams.set("status", params.status.trim());
    if (params.reference?.trim()) searchParams.set("reference", params.reference.trim());
    return searchParams.toString() ? `?${searchParams.toString()}` : "";
}

export async function getMyReceipts(
    token: string,
    params: { q?: string; category?: string; receipt_type?: string; status?: string; reference?: string } = {},
): Promise<ReceiptRecord[]> {
    const response = await requestWithApiBaseFallback(
        `/receipts/my/${buildReceiptQuery(params)}`,
        { method: "GET", cache: "no-store" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch customer receipts."));
    }
    return await response.json();
}

export async function getVendorReceipts(
    token: string,
    params: { q?: string; category?: string; receipt_type?: string; status?: string; reference?: string } = {},
): Promise<ReceiptRecord[]> {
    const response = await requestWithApiBaseFallback(
        `/receipts/vendor/${buildReceiptQuery(params)}`,
        { method: "GET", cache: "no-store" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch vendor receipts."));
    }
    return await response.json();
}

export async function getAdminReceipts(
    token: string,
    params: { q?: string; category?: string; receipt_type?: string; owner_type?: string; status?: string; reference?: string } = {},
): Promise<ReceiptRecord[]> {
    const response = await requestWithApiBaseFallback(
        `/receipts/admin/${buildReceiptQuery(params)}`,
        { method: "GET", cache: "no-store" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch admin receipts."));
    }
    return await response.json();
}

export async function getMyStationReceipts(
    token: string,
    params: { q?: string; category?: string; receipt_type?: string; status?: string; reference?: string } = {},
): Promise<ReceiptRecord[]> {
    const response = await requestWithApiBaseFallback(
        `/receipts/station/me/${buildReceiptQuery(params)}`,
        { method: "GET", cache: "no-store" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch station receipts."));
    }
    return await response.json();
}

export async function regenerateReceipt(
    token: string,
    receiptId: number,
    reason: string = "",
): Promise<ReceiptRecord> {
    const response = await requestWithApiBaseFallback(
        `/receipts/${receiptId}/regenerate/`,
        {
            method: "POST",
            body: JSON.stringify({ reason }),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to regenerate receipt."));
    }
    return await response.json();
}

export async function createAdminManualReceipt(
    token: string,
    payload: {
        category: ReceiptCategory;
        receipt_type: string;
        owner_type?: ReceiptOwnerType;
        related_entity_type?: string;
        related_entity_id?: string;
        related_reference?: string;
        currency?: string;
        gross_amount?: string | number;
        fee_amount?: string | number;
        commission_amount?: string | number;
        tax_amount?: string | number;
        net_amount?: string | number;
        payment_method?: string;
        summary?: Record<string, any>;
    },
): Promise<ReceiptRecord> {
    const response = await requestWithApiBaseFallback(
        "/receipts/admin/manual/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create manual receipt."));
    }
    return await response.json();
}

export async function generateReceiptForTransaction(
    token: string,
    payload: { entity_type: ReceiptEntityType; entity_id: number },
): Promise<ReceiptRecord> {
    const response = await requestWithApiBaseFallback(
        "/receipts/generate/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to generate receipt."));
    }
    const data = (await response.json()) as GenerateReceiptResponse | ReceiptRecord;
    if (typeof (data as GenerateReceiptResponse)?.receipt === "object") {
        return (data as GenerateReceiptResponse).receipt;
    }
    return data as ReceiptRecord;
}

export async function downloadReceiptPdf(token: string, receiptId: number, receiptNumber: string = "receipt"): Promise<void> {
    const response = await requestWithApiBaseFallback(
        `/receipts/${receiptId}/download/`,
        { method: "GET" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to download receipt PDF."));
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `${receiptNumber}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(blobUrl);
}

// ==========================================
// --- CAREERS API CALLS (CLIENT) ---
// ==========================================

export function getBackendFileUrl(filePath: string | null | undefined): string {
    if (!filePath) return "";
    if (filePath.startsWith("http")) return filePath;
    return `${BACKEND_URL}${filePath}`;
}

export async function getCareerJobOpenings(): Promise<CareerJobOpening[]> {
    const response = await fetch(`${CLIENT_API_URL}/careers/openings/`, {
        method: "GET",
        cache: "no-store",
    });

    if (!response.ok) throw new Error("Failed to load career openings.");
    return await response.json();
}

export async function getCareerApplicationFormFields(): Promise<CareerApplicationField[]> {
    const response = await fetch(`${CLIENT_API_URL}/careers/form-fields/`, {
        method: "GET",
        cache: "no-store",
    });

    if (!response.ok) throw new Error("Failed to load application form fields.");
    return await response.json();
}

export async function createJobApplication(
    payload: JobApplicationSubmissionPayload,
    token: string | null = null,
): Promise<{ id: number; detail: string }> {
    const formData = new FormData();
    if (payload.job_opening) {
        formData.append("job_opening", String(payload.job_opening));
    }

    Object.entries(payload.answers).forEach(([key, value]) => {
        formData.append(key, value ?? "");
    });

    formData.append("cv_file", payload.cv_file);
    if (payload.cover_letter_file) {
        formData.append("cover_letter_file", payload.cover_letter_file);
    }
    if (payload.certificates_file) {
        formData.append("certificates_file", payload.certificates_file);
    }

    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/careers/applications/`,
        {
            method: "POST",
            body: formData,
        },
        token,
        true,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to submit your application."));
    }
    return await response.json();
}

export async function getAdminJobApplications(token: string, query: string = ""): Promise<AdminJobApplication[]> {
    const searchParams = new URLSearchParams();
    if (query.trim()) searchParams.set("q", query.trim());

    const endpoint = `${CLIENT_API_URL}/careers/admin/applications/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    const response = await requestWithAuthRetry(endpoint, { method: "GET" }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch job applications."));
    }
    return await response.json();
}

export async function updateAdminJobApplication(
    token: string,
    applicationId: number,
    payload: Partial<Pick<AdminJobApplication, "status" | "admin_notes">>,
): Promise<AdminJobApplication> {
    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/careers/admin/applications/${applicationId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update job application."));
    }
    return await response.json();
}

export async function getAdminCareerFormFields(token: string): Promise<CareerApplicationField[]> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/careers/admin/form-fields/`, { method: "GET" }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch career form fields."));
    }
    return await response.json();
}

export async function createAdminCareerFormField(token: string, payload: AdminCareerFieldPayload): Promise<CareerApplicationField> {
    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/careers/admin/form-fields/`,
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create form field."));
    }
    return await response.json();
}

export async function updateAdminCareerFormField(
    token: string,
    fieldId: number,
    payload: Partial<AdminCareerFieldPayload>,
): Promise<CareerApplicationField> {
    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/careers/admin/form-fields/${fieldId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update form field."));
    }
    return await response.json();
}

export async function deleteAdminCareerFormField(token: string, fieldId: number): Promise<void> {
    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/careers/admin/form-fields/${fieldId}/`,
        {
            method: "DELETE",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete form field."));
    }
}

export async function getAdminCareerOpenings(token: string): Promise<CareerJobOpening[]> {
    const response = await requestWithAuthRetry(`${CLIENT_API_URL}/careers/admin/openings/`, { method: "GET" }, token);

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch career openings."));
    }
    return await response.json();
}

export async function createAdminCareerOpening(token: string, payload: AdminCareerOpeningPayload): Promise<CareerJobOpening> {
    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/careers/admin/openings/`,
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create career opening."));
    }
    return await response.json();
}

export async function updateAdminCareerOpening(
    token: string,
    openingId: number,
    payload: Partial<AdminCareerOpeningPayload>,
): Promise<CareerJobOpening> {
    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/careers/admin/openings/${openingId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update career opening."));
    }
    return await response.json();
}

export async function deleteAdminCareerOpening(token: string, openingId: number): Promise<void> {
    const response = await requestWithAuthRetry(
        `${CLIENT_API_URL}/careers/admin/openings/${openingId}/`,
        {
            method: "DELETE",
        },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete career opening."));
    }
}

// ==========================================
// --- SUPPORT API CALLS (CLIENT) ---
// ==========================================

export async function getHelpCenterContent(
    params: { q?: string; category?: string; entry_type?: string } = {},
): Promise<HelpCenterContentResponse> {
    const searchParams = new URLSearchParams();
    if (params.q?.trim()) searchParams.set("q", params.q.trim());
    if (params.category?.trim()) searchParams.set("category", params.category.trim());
    if (params.entry_type?.trim()) searchParams.set("entry_type", params.entry_type.trim());

    const response = await requestWithApiBaseFallback(
        `/support/help-center/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        {
            method: "GET",
            cache: "no-store",
        },
        null,
        true,
    );

    if (!response.ok) {
        throw new Error("Failed to load help center content.");
    }
    return await response.json();
}

export async function submitSupportTicket(
    payload: CreateSupportTicketPayload,
    token: string | null = null,
): Promise<CreateSupportTicketResponse> {
    const formData = new FormData();
    formData.append("name", payload.name);
    formData.append("email", payload.email);
    formData.append("subject", payload.subject);
    formData.append("message", payload.message);
    if (payload.attachment) {
        formData.append("attachment", payload.attachment);
    }

    const response = await requestWithApiBaseFallback(
        "/support/contact/",
        {
            method: "POST",
            body: payload.attachment ? formData : JSON.stringify(payload),
        },
        token,
        true,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to submit support request."));
    }
    return await response.json();
}

export async function getPublicVendorStores(params: {
    q?: string;
    city?: string;
    country?: string;
    category?: string;
    min_score?: number;
} = {}): Promise<PublicVendorStoreResponse> {
    const searchParams = new URLSearchParams();
    if (params.q?.trim()) searchParams.set("q", params.q.trim());
    if (params.city?.trim()) searchParams.set("city", params.city.trim());
    if (params.country?.trim()) searchParams.set("country", params.country.trim());
    if (params.category?.trim()) searchParams.set("category", params.category.trim());
    if (typeof params.min_score === "number" && Number.isFinite(params.min_score)) {
        searchParams.set("min_score", String(params.min_score));
    }

    const response = await requestWithApiBaseFallback(
        `/users/vendors/public/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        {
            method: "GET",
            cache: "no-store",
        },
        null,
        true,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to load vendor stores."));
    }
    return await response.json();
}

export async function getAdminSupportTickets(
    token: string,
    query: string = "",
    statusFilter: string = "",
): Promise<SupportTicketSummary[]> {
    const searchParams = new URLSearchParams();
    if (query.trim()) searchParams.set("q", query.trim());
    if (statusFilter.trim()) searchParams.set("status", statusFilter.trim());

    const response = await requestWithApiBaseFallback(
        `/support/admin/tickets/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        { method: "GET" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch support tickets."));
    }
    return await response.json();
}

export async function getAdminSupportTicketDetail(token: string, ticketId: number): Promise<SupportTicketDetail> {
    const response = await requestWithApiBaseFallback(`/support/admin/tickets/${ticketId}/`, { method: "GET" }, token);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch support ticket details."));
    }
    return await response.json();
}

export async function updateAdminSupportTicket(
    token: string,
    ticketId: number,
    payload: Partial<Pick<SupportTicketDetail, "status" | "admin_notes">>,
): Promise<SupportTicketDetail> {
    const response = await requestWithApiBaseFallback(
        `/support/admin/tickets/${ticketId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update support ticket."));
    }
    return await response.json();
}

export async function replyAdminSupportTicket(
    token: string,
    ticketId: number,
    payload: { message: string; status?: SupportTicketStatus; is_internal?: boolean },
): Promise<SupportTicketDetail> {
    const response = await requestWithApiBaseFallback(
        `/support/admin/tickets/${ticketId}/reply/`,
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to post support reply."));
    }
    return await response.json();
}

export async function getAdminSupportKnowledgeBase(
    token: string,
    query: string = "",
    category: string = "",
    entryType: string = "",
): Promise<{ categories: SupportCategoryOption[]; entries: SupportKnowledgeBaseEntry[] }> {
    const searchParams = new URLSearchParams();
    if (query.trim()) searchParams.set("q", query.trim());
    if (category.trim()) searchParams.set("category", category.trim());
    if (entryType.trim()) searchParams.set("entry_type", entryType.trim());

    const response = await requestWithApiBaseFallback(
        `/support/admin/help-center/entries/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        { method: "GET" },
        token,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch help center entries."));
    }
    return await response.json();
}

export async function createAdminSupportKnowledgeEntry(
    token: string,
    payload: Partial<
        Pick<
            SupportKnowledgeBaseEntry,
            "title" | "category" | "entry_type" | "short_answer" | "content" | "is_published" | "sort_order"
        >
    >,
): Promise<SupportKnowledgeBaseEntry> {
    const response = await requestWithApiBaseFallback(
        `/support/admin/help-center/entries/`,
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create help center entry."));
    }
    return await response.json();
}

export async function updateAdminSupportKnowledgeEntry(
    token: string,
    entryId: number,
    payload: Partial<
        Pick<
            SupportKnowledgeBaseEntry,
            "title" | "category" | "entry_type" | "short_answer" | "content" | "is_published" | "sort_order"
        >
    >,
): Promise<SupportKnowledgeBaseEntry> {
    const response = await requestWithApiBaseFallback(
        `/support/admin/help-center/entries/${entryId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update help center entry."));
    }
    return await response.json();
}

export async function deleteAdminSupportKnowledgeEntry(token: string, entryId: number): Promise<void> {
    const response = await requestWithApiBaseFallback(
        `/support/admin/help-center/entries/${entryId}/`,
        {
            method: "DELETE",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete help center entry."));
    }
}

export async function getAdminProductReports(
    token: string,
    query: string = "",
    statusFilter: string = "",
): Promise<AdminProductReportItem[]> {
    const searchParams = new URLSearchParams();
    if (query.trim()) searchParams.set("q", query.trim());
    if (statusFilter.trim()) searchParams.set("status", statusFilter.trim());

    const response = await requestWithApiBaseFallback(
        `/support/admin/product-reports/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        { method: "GET" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch product reports."));
    }
    return await response.json();
}

export async function performAdminProductReportAction(
    token: string,
    ticketId: number,
    payload: {
        action: "deactivate_product" | "suspend_vendor" | "resolve" | "resolve_and_deactivate";
        notes?: string;
        product_id?: number;
        vendor_profile_id?: number;
    },
): Promise<AdminProductReportActionResponse> {
    const response = await requestWithApiBaseFallback(
        `/support/admin/product-reports/${ticketId}/action/`,
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to run moderation action."));
    }
    return await response.json();
}

export async function performAdminProductReportsBulkAction(
    token: string,
    payload: {
        action: "deactivate_product" | "resolve" | "resolve_and_deactivate" | "suspend_vendor";
        ticket_ids: number[];
        notes?: string;
        confirm_suspend?: boolean;
    },
): Promise<AdminProductReportBulkActionResponse> {
    const response = await requestWithApiBaseFallback(
        `/support/admin/product-reports/bulk-action/`,
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to run bulk moderation action."));
    }
    return await response.json();
}

// ==========================================
// --- ADVERTISING API CALLS (CLIENT) ---
// ==========================================

function buildAdvertisingCampaignFormData(payload: Partial<AdminAdvertisingCampaignPayload>): FormData {
    const formData = new FormData();
    if (payload.source_type !== undefined) formData.append("source_type", payload.source_type);
    if (payload.purpose !== undefined) formData.append("purpose", payload.purpose);
    if (payload.linked_request !== undefined) formData.append("linked_request", payload.linked_request ? String(payload.linked_request) : "");
    if (payload.placement_id !== undefined) formData.append("placement_id", String(payload.placement_id));
    if (payload.owner !== undefined) formData.append("owner", payload.owner ? String(payload.owner) : "");
    if (payload.vendor_context !== undefined) formData.append("vendor_context", payload.vendor_context ? String(payload.vendor_context) : "");
    if (payload.title !== undefined) formData.append("title", payload.title);
    if (payload.subtitle !== undefined) formData.append("subtitle", payload.subtitle || "");
    if (payload.description !== undefined) formData.append("description", payload.description || "");
    if (payload.target_url !== undefined) formData.append("target_url", payload.target_url || "");
    if (payload.cta_label !== undefined) formData.append("cta_label", payload.cta_label || "");
    if (payload.creative_image !== undefined && payload.creative_image) formData.append("creative_image", payload.creative_image);
    if (payload.category_context !== undefined) formData.append("category_context", payload.category_context || "");
    if (payload.status !== undefined) formData.append("status", payload.status);
    if (payload.is_visible !== undefined) formData.append("is_visible", String(payload.is_visible));
    if (payload.is_sponsored !== undefined) formData.append("is_sponsored", String(payload.is_sponsored));
    if (payload.priority !== undefined) formData.append("priority", String(payload.priority));
    if (payload.start_at !== undefined) formData.append("start_at", payload.start_at || "");
    if (payload.end_at !== undefined) formData.append("end_at", payload.end_at || "");
    if (payload.budget_amount !== undefined) formData.append("budget_amount", payload.budget_amount || "");
    if (payload.pricing_notes !== undefined) formData.append("pricing_notes", payload.pricing_notes || "");
    if (payload.approval_notes !== undefined) formData.append("approval_notes", payload.approval_notes || "");
    return formData;
}

export async function getAdvertisingPublicData(params: {
    placement?: string;
    category?: string;
    limit?: number;
} = {}): Promise<AdvertisingPublicDataResponse> {
    const searchParams = new URLSearchParams();
    if (params.placement?.trim()) searchParams.set("placement", params.placement.trim());
    if (params.category?.trim()) searchParams.set("category", params.category.trim());
    if (params.limit && Number.isFinite(params.limit)) searchParams.set("limit", String(params.limit));

    const response = await requestWithApiBaseFallback(
        `/advertising/public/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        {
            method: "GET",
            cache: "no-store",
        },
        null,
        true,
    );
    if (!response.ok) {
        throw new Error("Failed to load advertising content.");
    }
    return await response.json();
}

export async function submitAdvertisingRequest(
    payload: CreateAdvertisingRequestPayload,
    token: string | null = null,
): Promise<{ id: number; status: AdvertisingRequestStatus; detail: string }> {
    const response = await requestWithApiBaseFallback(
        "/advertising/requests/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
        true,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to submit advertising request."));
    }
    return await response.json();
}

export async function trackAdvertisingEvent(
    payload: {
        campaign_id: number;
        event_type: AdvertisingEventType;
        page_path?: string;
        context_key?: string;
        session_id?: string;
    },
    token: string | null = null,
): Promise<{ id: number; detail: string }> {
    const response = await requestWithApiBaseFallback(
        "/advertising/events/",
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
        true,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to record advertising event."));
    }
    return await response.json();
}

export async function getAdminAdvertisingRequests(
    token: string,
    query: string = "",
    statusFilter: string = "",
): Promise<AdvertisingRequest[]> {
    const searchParams = new URLSearchParams();
    if (query.trim()) searchParams.set("q", query.trim());
    if (statusFilter.trim()) searchParams.set("status", statusFilter.trim());

    const response = await requestWithApiBaseFallback(
        `/advertising/admin/requests/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        { method: "GET" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch advertising requests."));
    }
    return await response.json();
}

export async function reviewAdminAdvertisingRequest(
    token: string,
    requestId: number,
    payload: Partial<Pick<AdvertisingRequest, "status" | "admin_notes">>,
): Promise<AdvertisingRequest> {
    const response = await requestWithApiBaseFallback(
        `/advertising/admin/requests/${requestId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to review advertising request."));
    }
    return await response.json();
}

export async function getAdminAdvertisingPlacements(token: string): Promise<AdvertisingPlacement[]> {
    const response = await requestWithApiBaseFallback(`/advertising/admin/placements/`, { method: "GET" }, token);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch ad placements."));
    }
    return await response.json();
}

export async function createAdminAdvertisingPlacement(
    token: string,
    payload: AdminAdvertisingPlacementPayload,
): Promise<AdvertisingPlacement> {
    const response = await requestWithApiBaseFallback(
        `/advertising/admin/placements/`,
        {
            method: "POST",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create ad placement."));
    }
    return await response.json();
}

export async function updateAdminAdvertisingPlacement(
    token: string,
    placementId: number,
    payload: Partial<AdminAdvertisingPlacementPayload>,
): Promise<AdvertisingPlacement> {
    const response = await requestWithApiBaseFallback(
        `/advertising/admin/placements/${placementId}/`,
        {
            method: "PATCH",
            body: JSON.stringify(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update ad placement."));
    }
    return await response.json();
}

export async function getAdminAdvertisingCampaigns(
    token: string,
    params: {
        q?: string;
        status?: string;
        placement?: string;
        source_type?: string;
        purpose?: string;
    } = {},
): Promise<AdvertisingCampaign[]> {
    const searchParams = new URLSearchParams();
    if (params.q?.trim()) searchParams.set("q", params.q.trim());
    if (params.status?.trim()) searchParams.set("status", params.status.trim());
    if (params.placement?.trim()) searchParams.set("placement", params.placement.trim());
    if (params.source_type?.trim()) searchParams.set("source_type", params.source_type.trim());
    if (params.purpose?.trim()) searchParams.set("purpose", params.purpose.trim());

    const response = await requestWithApiBaseFallback(
        `/advertising/admin/campaigns/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        { method: "GET" },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch advertising campaigns."));
    }
    return await response.json();
}

export async function createAdminAdvertisingCampaign(
    token: string,
    payload: AdminAdvertisingCampaignPayload,
): Promise<AdvertisingCampaign> {
    const response = await requestWithApiBaseFallback(
        `/advertising/admin/campaigns/`,
        {
            method: "POST",
            body: buildAdvertisingCampaignFormData(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to create advertising campaign."));
    }
    return await response.json();
}

export async function updateAdminAdvertisingCampaign(
    token: string,
    campaignId: number,
    payload: Partial<AdminAdvertisingCampaignPayload>,
): Promise<AdvertisingCampaign> {
    const response = await requestWithApiBaseFallback(
        `/advertising/admin/campaigns/${campaignId}/`,
        {
            method: "PATCH",
            body: buildAdvertisingCampaignFormData(payload),
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to update advertising campaign."));
    }
    return await response.json();
}

export async function deleteAdminAdvertisingCampaign(token: string, campaignId: number): Promise<void> {
    const response = await requestWithApiBaseFallback(
        `/advertising/admin/campaigns/${campaignId}/`,
        {
            method: "DELETE",
        },
        token,
    );
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to delete advertising campaign."));
    }
}

export async function getAdminAdvertisingAnalytics(token: string): Promise<AdvertisingAnalyticsResponse> {
    const response = await requestWithApiBaseFallback(`/advertising/admin/analytics/`, { method: "GET" }, token);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to fetch advertising analytics."));
    }
    return await response.json();
}

// ==========================================
// --- CHATBOT API CALLS (CLIENT) ---
// ==========================================

export interface ChatHistoryMessage {
    sender: "user" | "bot";
    text: string;
}

export interface ChatbotConversationSummary {
    id: number;
    session_id: string;
    user_email: string;
    user_customer_id: string | null;
    last_user_message: string;
    last_bot_message: string;
    message_count: number;
    started_at: string;
    updated_at: string;
}

export interface ChatbotConversationDetail {
    id: number;
    session_id: string;
    user_email: string;
    user_customer_id: string | null;
    started_at: string;
    updated_at: string;
    messages: Array<{
        id: number;
        role: "user" | "bot";
        content: string;
        created_at: string;
    }>;
}

async function refreshAccessTokenIfPossible(): Promise<string | null> {
    if (typeof window === "undefined") {
        return null;
    }

    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
        return null;
    }

    let response: Response;
    try {
        response = await requestWithApiBaseFallbackAnonymous("/users/token/refresh/", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh: refreshToken }),
        });
    } catch {
        return null;
    }

    if (!response.ok) {
        return null;
    }

    const data = await response.json().catch(() => ({}));
    const newAccessToken = data?.access;
    if (!newAccessToken || typeof newAccessToken !== "string") {
        return null;
    }

    localStorage.setItem("accessToken", newAccessToken);
    return newAccessToken;
}

async function requestWithAuthRetry(
    endpoint: string,
    init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
    token: string | null,
    allowAnonymousRetry: boolean = false,
): Promise<Response> {
    let activeToken = getStoredAccessToken() || token;

    const execute = async (authToken: string | null) => {
        const mergedHeaders: Record<string, string> = {
            ...withAuthHeaders(authToken),
            ...(init.headers || {}),
        };
        const hasContentType = Object.keys(mergedHeaders).some((key) => key.toLowerCase() === "content-type");
        if (init.body && !isFormDataBody(init.body) && !hasContentType) {
            mergedHeaders["Content-Type"] = "application/json";
        }
        try {
            return await fetch(endpoint, { ...init, headers: mergedHeaders });
        } catch {
            throw new Error(
                `Unable to reach backend at ${endpoint}. Confirm Django is running and CORS allows your frontend origin.`,
            );
        }
    };

    let response = await execute(activeToken);
    if (response.status === 401 && activeToken) {
        const refreshed = await refreshAccessTokenIfPossible();
        if (refreshed) {
            activeToken = refreshed;
            response = await execute(activeToken);
        } else if (allowAnonymousRetry) {
            response = await execute(null);
        }
    }

    return response;
}

export async function sendMessageToBot(
    message: string,
    history: ChatHistoryMessage[] = [],
    sessionId: string = "",
    token: string | null = null,
): Promise<{ reply: string; session_id?: string; conversation_id?: number }> {
    const response = await requestWithApiBaseFallback(
        "/chatbot/",
        {
            method: "POST",
            body: JSON.stringify({ message, history, session_id: sessionId }),
        },
        token,
        true,
    );

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractApiErrorMessage(errorData, "Failed to get a response from the bot."));
    }
    return await response.json();
}

export async function getChatbotConversations(token: string, query: string = ""): Promise<ChatbotConversationSummary[]> {
    const searchParams = new URLSearchParams();
    if (query.trim()) {
        searchParams.set("q", query.trim());
    }
    const response = await requestWithApiBaseFallback(
        `/chatbot/conversations/${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
        {
            method: "GET",
        },
        token,
    );

    if (!response.ok) throw new Error("Failed to fetch chatbot conversations.");
    return await response.json();
}

export async function getChatbotConversationDetail(token: string, conversationId: number): Promise<ChatbotConversationDetail> {
    const response = await requestWithApiBaseFallback(
        `/chatbot/conversations/${conversationId}/`,
        {
            method: "GET",
        },
        token,
    );

    if (!response.ok) throw new Error("Failed to fetch chatbot conversation detail.");
    return await response.json();
}
