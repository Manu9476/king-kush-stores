"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { useAuth } from "../../../src/context/AuthContext";
import { loginUser } from "../../../src/services/api";

function decodeTokenPayload(token: string): Record<string, any> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function vendorStatusLabel(status: string | null): string {
  if (!status) return "Pending Review";
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function vendorStatusClass(status: string | null): string {
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "needs_info") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "rejected" || status === "suspended") return "border-red-200 bg-red-50 text-red-700";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

export default function VendorHubPage() {
  const router = useRouter();
  const { isAuthenticated, userRole, vendorApprovalStatus, displayName, userEmail, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isVendor = isAuthenticated && userRole === "vendor";
  const isNonVendorUser = isAuthenticated && userRole !== "vendor";

  const vendorStatusMessage = useMemo(() => {
    if (vendorApprovalStatus === "approved") return "Your vendor account is active. Open your dashboard to manage products and orders.";
    if (vendorApprovalStatus === "needs_info") return "Your application needs more information. Update your vendor profile and contact support.";
    if (vendorApprovalStatus === "rejected") return "Your vendor application was rejected. Please contact support for next steps.";
    if (vendorApprovalStatus === "suspended") return "Your vendor account is suspended. Please contact support.";
    return "Your vendor application is pending admin review.";
  }, [vendorApprovalStatus]);

  const handleVendorLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await loginUser(email, password);
      const payload = decodeTokenPayload(data.access);
      const role = payload?.role;
      if (role !== "vendor") {
        setError("This account is not a vendor account. Please use a registered vendor account.");
        setLoading(false);
        return;
      }
      login(data.access, data.refresh, email);
      router.push("/vendor");
    } catch {
      setError("Invalid vendor credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-bg px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-modern bg-white p-6 shadow-modern">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Vendor Portal</p>
          <h1 className="mt-1 text-h2 font-heading font-bold text-primary">Welcome to the Vendor Hub</h1>
          <p className="mt-1 text-sm text-gray-600">
            Access vendor tools, review application status, and manage your seller account.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="rounded-modern bg-white p-6 shadow-modern">
            {isVendor ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-gray-900">Vendor Account Status</h2>
                <p className="text-sm text-gray-600">
                  Signed in as <strong>{displayName}</strong> ({userEmail})
                </p>
                <div className={`rounded-modern border px-4 py-3 text-sm ${vendorStatusClass(vendorApprovalStatus)}`}>
                  <p className="font-semibold">Status: {vendorStatusLabel(vendorApprovalStatus)}</p>
                  <p className="mt-1">{vendorStatusMessage}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href="/vendor" className="rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">
                    Open Vendor Dashboard
                  </Link>
                  <Link href="/vendor/profile" className="rounded-modern border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                    Vendor Profile
                  </Link>
                </div>
              </div>
            ) : isNonVendorUser ? (
              <div className="space-y-4">
                <h2 className="text-lg font-bold text-gray-900">Switch to a Vendor Account</h2>
                <p className="text-sm text-gray-600">
                  You are signed in as a <strong>{userRole}</strong> account ({userEmail}). To use vendor tools, sign in with a vendor account or create one.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      router.push("/register?role=vendor");
                    }}
                    className="rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
                  >
                    Create Vendor Account
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                    }}
                    className="rounded-modern border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-lg font-bold text-gray-900">Vendor Login</h2>
                <p className="mt-1 text-sm text-gray-600">Sign in with your vendor account to access the seller dashboard.</p>
                {error ? <div className="mt-3 rounded-modern border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
                <form onSubmit={handleVendorLogin} className="mt-4 space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Vendor Email"
                    className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                    required
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
                    required
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-70"
                  >
                    {loading ? "Signing in..." : "Sign In as Vendor"}
                  </button>
                </form>
                <p className="mt-4 text-xs text-gray-600">
                  Don’t have a vendor account?{" "}
                  <Link href="/register?role=vendor" className="font-semibold text-primary hover:underline">
                    Apply as Vendor
                  </Link>
                </p>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="rounded-modern bg-white p-6 shadow-modern">
              <h3 className="text-lg font-bold text-gray-900">Seller Resources</h3>
              <div className="mt-3 space-y-2 text-sm text-gray-700">
                <div className="rounded-modern border border-gray-100 bg-gray-50 px-3 py-2">
                  <strong>Seller University:</strong> Learn product listing, pricing, and store optimization.
                </div>
                <div className="rounded-modern border border-gray-100 bg-gray-50 px-3 py-2">
                  <strong>Performance Analytics:</strong> Track sales, order trends, and store growth.
                </div>
                <div className="rounded-modern border border-gray-100 bg-gray-50 px-3 py-2">
                  <strong>Vendor Support:</strong> Get onboarding and operational support from our team.
                </div>
              </div>
            </div>

            <div className="rounded-modern border border-primary/20 bg-primary/5 p-6">
              <h3 className="text-sm font-bold text-primary">Need Help?</h3>
              <p className="mt-2 text-sm text-gray-700">
                Contact support for approval updates, onboarding questions, or seller dashboard guidance.
              </p>
              <Link href="/footer-links/contact-us" className="mt-3 inline-flex rounded-modern bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                Contact Support
              </Link>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

