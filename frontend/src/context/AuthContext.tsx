// frontend/src/context/AuthContext.tsx
"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { getAdminCapabilities } from "../services/api";

type UserRole = "customer" | "vendor" | "admin";
type VendorApprovalStatus = "pending_review" | "needs_info" | "approved" | "rejected" | "suspended";
type AdminLevel = "super_admin" | "staff";

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  customerId: string | null;
  userRole: UserRole | null;
  vendorApprovalStatus: VendorApprovalStatus | null;
  vendorIsApproved: boolean;
  adminLevel: AdminLevel | null;
  isSuperAdmin: boolean;
  adminPermissions: string[];
  adminModules: string[];
  hasAdminPermission: (permissionCode: string) => boolean;
  canAccessAdminModule: (moduleKey: string) => boolean;
  displayName: string;
  login: (accessToken: string, refreshToken: string, fallbackEmail?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface TokenPayload {
  email?: string;
  customer_id?: string;
  first_name?: string;
  last_name?: string;
  role?: UserRole;
  vendor_approval_status?: VendorApprovalStatus | null;
  vendor_is_approved?: boolean;
  admin_level?: AdminLevel | null;
  is_super_admin?: boolean;
  admin_permissions?: string[];
  admin_modules?: string[];
}

function decodeTokenPayload(token: string): TokenPayload | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const jsonPayload = atob(padded);
    return JSON.parse(jsonPayload) as TokenPayload;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);
  const [userLastName, setUserLastName] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [vendorApprovalStatus, setVendorApprovalStatus] = useState<VendorApprovalStatus | null>(null);
  const [vendorIsApproved, setVendorIsApproved] = useState<boolean>(false);
  const [adminLevel, setAdminLevel] = useState<AdminLevel | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);
  const [adminModules, setAdminModules] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("accessToken");
    const storedEmail = localStorage.getItem("userEmail");
    
    if (storedToken) {
      const payload = decodeTokenPayload(storedToken);
      setToken(storedToken);
      setUserEmail(payload?.email || storedEmail);
      setUserFirstName(payload?.first_name || null);
      setUserLastName(payload?.last_name || null);
      setCustomerId(payload?.customer_id || null);
      setUserRole(payload?.role || null);
      setVendorApprovalStatus(payload?.vendor_approval_status || null);
      setVendorIsApproved(Boolean(payload?.vendor_is_approved));
      setAdminLevel((payload?.admin_level as AdminLevel) || null);
      setIsSuperAdmin(Boolean(payload?.is_super_admin));
      setAdminPermissions(Array.isArray(payload?.admin_permissions) ? payload.admin_permissions : []);
      setAdminModules(Array.isArray(payload?.admin_modules) ? payload.admin_modules : []);
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function syncAdminCapabilities() {
      if (!token || userRole !== "admin") return;
      try {
        const payload = await getAdminCapabilities(token);
        if (!isMounted) return;
        setAdminLevel((payload?.admin_level as AdminLevel) || null);
        setIsSuperAdmin(Boolean(payload?.is_super_admin));
        setAdminPermissions(Array.isArray(payload?.permissions) ? payload.permissions : []);
        setAdminModules(Array.isArray(payload?.modules) ? payload.modules : []);
      } catch {
        // Keep token-derived permissions as fallback.
      }
    }

    syncAdminCapabilities();
    return () => {
      isMounted = false;
    };
  }, [token, userRole]);

  const login = (accessToken: string, refreshToken: string, fallbackEmail?: string) => {
    const payload = decodeTokenPayload(accessToken);
    const resolvedEmail = payload?.email || fallbackEmail || null;

    localStorage.setItem("accessToken", accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    if (resolvedEmail) {
      localStorage.setItem("userEmail", resolvedEmail);
    }
    
    setToken(accessToken);
    setUserEmail(resolvedEmail);
    setUserFirstName(payload?.first_name || null);
    setUserLastName(payload?.last_name || null);
    setCustomerId(payload?.customer_id || null);
    setUserRole(payload?.role || null);
    setVendorApprovalStatus(payload?.vendor_approval_status || null);
    setVendorIsApproved(Boolean(payload?.vendor_is_approved));
    setAdminLevel((payload?.admin_level as AdminLevel) || null);
    setIsSuperAdmin(Boolean(payload?.is_super_admin));
    setAdminPermissions(Array.isArray(payload?.admin_permissions) ? payload.admin_permissions : []);
    setAdminModules(Array.isArray(payload?.admin_modules) ? payload.admin_modules : []);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userEmail");
    
    setToken(null);
    setUserEmail(null);
    setUserFirstName(null);
    setUserLastName(null);
    setCustomerId(null);
    setUserRole(null);
    setVendorApprovalStatus(null);
    setVendorIsApproved(false);
    setAdminLevel(null);
    setIsSuperAdmin(false);
    setAdminPermissions([]);
    setAdminModules([]);
    setIsAuthenticated(false);
  };

  const emailPrefix = userEmail ? userEmail.split("@")[0] : "";
  const firstName = userFirstName?.trim();
  const displayName = firstName || emailPrefix || "Account";

  const hasAdminPermission = (permissionCode: string) => {
    if (isSuperAdmin) return true;
    return adminPermissions.includes(permissionCode);
  };

  const canAccessAdminModule = (moduleKey: string) => {
    if (isSuperAdmin) return true;
    return adminModules.includes(moduleKey);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        token,
        userEmail,
        userFirstName,
        userLastName,
        customerId,
        userRole,
        vendorApprovalStatus,
        vendorIsApproved,
        adminLevel,
        isSuperAdmin,
        adminPermissions,
        adminModules,
        hasAdminPermission,
        canAccessAdminModule,
        displayName,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
