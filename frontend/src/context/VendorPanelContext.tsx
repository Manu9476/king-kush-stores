"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Category,
  VendorFinanceSummary,
  VendorDashboardSummary,
  VendorOrderRow,
  VendorPayoutRequest,
  VendorProduct,
  VendorProductPayload,
  VendorProfile,
  VendorApprovalStatus,
  changeMyPassword,
  createVendorPayoutRequest,
  createVendorProduct,
  deleteVendorProduct,
  getCategories,
  getVendorFinanceSummary,
  getVendorProfile,
  getVendorDashboardSummary,
  getVendorOrders,
  getVendorPayoutRequests,
  getVendorProducts,
  updateVendorProduct,
  updateVendorProfile,
} from "../services/api";
import { useAuth } from "./AuthContext";

type VendorProfileUpdatePayload = Parameters<typeof updateVendorProfile>[1];
type PasswordPayload = Parameters<typeof changeMyPassword>[1];

interface VendorPanelContextType {
  loading: boolean;
  saving: boolean;
  error: string;
  success: string;
  vendorProfile: VendorProfile | null;
  approvalStatus: VendorApprovalStatus;
  reviewNotes: string;
  statusMessage: string;
  categories: Category[];
  summary: VendorDashboardSummary | null;
  products: VendorProduct[];
  orders: VendorOrderRow[];
  financeSummary: VendorFinanceSummary | null;
  payoutRequests: VendorPayoutRequest[];
  isApproved: boolean;
  clearAlerts: () => void;
  reload: () => Promise<void>;
  reloadFinance: () => Promise<void>;
  saveVendorProfile: (payload: VendorProfileUpdatePayload) => Promise<VendorProfile>;
  updatePassword: (payload: PasswordPayload) => Promise<void>;
  createProduct: (payload: VendorProductPayload) => Promise<VendorProduct>;
  updateProductById: (productId: number, payload: Partial<VendorProductPayload>) => Promise<VendorProduct>;
  toggleProductActive: (product: VendorProduct) => Promise<VendorProduct>;
  removeProductById: (productId: number) => Promise<void>;
  requestPayout: (payload: { amount: string | number; phone_number: string; notes?: string }) => Promise<VendorPayoutRequest>;
}

const VendorPanelContext = createContext<VendorPanelContextType | undefined>(undefined);

export function VendorPanelProvider({ children }: { children: React.ReactNode }) {
  const { token, userRole } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [vendorProfile, setVendorProfile] = useState<VendorProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<VendorDashboardSummary | null>(null);
  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [orders, setOrders] = useState<VendorOrderRow[]>([]);
  const [financeSummary, setFinanceSummary] = useState<VendorFinanceSummary | null>(null);
  const [payoutRequests, setPayoutRequests] = useState<VendorPayoutRequest[]>([]);

  const approvalStatus = vendorProfile?.approval_status || "pending_review";
  const reviewNotes = vendorProfile?.review_notes || "";
  const isApproved = approvalStatus === "approved";

  const statusMessage = useMemo(() => {
    if (approvalStatus === "approved") return "Your vendor account is active and ready to sell.";
    if (approvalStatus === "needs_info") return "Admin requested more information. Update your profile and contact support.";
    if (approvalStatus === "rejected") return "Your vendor application was rejected. Contact support for guidance.";
    if (approvalStatus === "suspended") return "Your vendor access is suspended. Contact admin support.";
    return "Your vendor account is pending admin review.";
  }, [approvalStatus]);

  const clearAlerts = () => {
    setError("");
    setSuccess("");
  };

  const loadData = useCallback(async () => {
    if (!token || userRole !== "vendor") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [profile, categoryData] = await Promise.all([getVendorProfile(token), getCategories()]);

      setVendorProfile(profile);
      setCategories(categoryData);

      if (profile.approval_status === "approved") {
        const [summaryData, productData, orderData, financeData, payoutData] = await Promise.all([
          getVendorDashboardSummary(token),
          getVendorProducts(token),
          getVendorOrders(token),
          getVendorFinanceSummary(token),
          getVendorPayoutRequests(token),
        ]);
        setSummary(summaryData);
        setProducts(productData);
        setOrders(orderData);
        setFinanceSummary(financeData);
        setPayoutRequests(payoutData);
      } else {
        setSummary(null);
        setProducts([]);
        setOrders([]);
        setFinanceSummary(null);
        setPayoutRequests([]);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load vendor dashboard.");
    } finally {
      setLoading(false);
    }
  }, [token, userRole]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveVendorProfile = async (payload: VendorProfileUpdatePayload): Promise<VendorProfile> => {
    if (!token) throw new Error("Please sign in again.");
    setSaving(true);
    clearAlerts();
    try {
      const updated = await updateVendorProfile(token, payload);
      setVendorProfile(updated);
      setSuccess("Vendor profile updated.");
      await loadData();
      return updated;
    } catch (err: any) {
      setError(err?.message || "Failed to update vendor profile.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async (payload: PasswordPayload): Promise<void> => {
    if (!token) throw new Error("Please sign in again.");
    setSaving(true);
    clearAlerts();
    try {
      await changeMyPassword(token, payload);
      setSuccess("Password updated successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to update password.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const createProduct = async (payload: VendorProductPayload): Promise<VendorProduct> => {
    if (!token) throw new Error("Please sign in again.");
    setSaving(true);
    clearAlerts();
    try {
      const created = await createVendorProduct(token, payload);
      setProducts((prev) => [created, ...prev]);
      setSuccess("Product saved successfully.");
      await loadData();
      return created;
    } catch (err: any) {
      setError(err?.message || "Failed to create product.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const updateProductById = async (
    productId: number,
    payload: Partial<VendorProductPayload>,
  ): Promise<VendorProduct> => {
    if (!token) throw new Error("Please sign in again.");
    setSaving(true);
    clearAlerts();
    try {
      const updated = await updateVendorProduct(token, productId, payload);
      setProducts((prev) => prev.map((item) => (item.id === productId ? updated : item)));
      setSuccess("Product updated successfully.");
      await loadData();
      return updated;
    } catch (err: any) {
      setError(err?.message || "Failed to update product.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const toggleProductActive = async (product: VendorProduct): Promise<VendorProduct> => {
    if (!token) throw new Error("Please sign in again.");
    setSaving(true);
    clearAlerts();
    try {
      const updated = await updateVendorProduct(token, product.id, { is_active: !product.is_active });
      setProducts((prev) => prev.map((item) => (item.id === product.id ? updated : item)));
      setSuccess(`Product ${updated.is_active ? "activated" : "deactivated"}.`);
      await loadData();
      return updated;
    } catch (err: any) {
      setError(err?.message || "Failed to update product status.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const removeProductById = async (productId: number): Promise<void> => {
    if (!token) throw new Error("Please sign in again.");
    setSaving(true);
    clearAlerts();
    try {
      await deleteVendorProduct(token, productId);
      setProducts((prev) => prev.filter((item) => item.id !== productId));
      setSuccess("Product deleted successfully.");
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Failed to delete product.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const reloadFinance = useCallback(async () => {
    if (!token || userRole !== "vendor") return;
    const [financeData, payoutData] = await Promise.all([
      getVendorFinanceSummary(token),
      getVendorPayoutRequests(token),
    ]);
    setFinanceSummary(financeData);
    setPayoutRequests(payoutData);
  }, [token, userRole]);

  const requestPayout = async (
    payload: { amount: string | number; phone_number: string; notes?: string },
  ): Promise<VendorPayoutRequest> => {
    if (!token) throw new Error("Please sign in again.");
    setSaving(true);
    clearAlerts();
    try {
      const created = await createVendorPayoutRequest(token, payload);
      setSuccess(created.status === "paid" ? "Payout processed successfully." : "Payout request submitted.");
      await reloadFinance();
      return created;
    } catch (err: any) {
      setError(err?.message || "Failed to submit payout request.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return (
    <VendorPanelContext.Provider
      value={{
        loading,
        saving,
        error,
        success,
        vendorProfile,
        approvalStatus,
        reviewNotes,
        statusMessage,
        categories,
        summary,
        products,
        orders,
        financeSummary,
        payoutRequests,
        isApproved,
        clearAlerts,
        reload: loadData,
        reloadFinance,
        saveVendorProfile,
        updatePassword,
        createProduct,
        updateProductById,
        toggleProductActive,
        removeProductById,
        requestPayout,
      }}
    >
      {children}
    </VendorPanelContext.Provider>
  );
}

export function useVendorPanel() {
  const context = useContext(VendorPanelContext);
  if (!context) {
    throw new Error("useVendorPanel must be used inside VendorPanelProvider.");
  }
  return context;
}
