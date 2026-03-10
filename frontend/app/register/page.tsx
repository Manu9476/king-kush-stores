"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { registerUser } from "../../src/services/api";

type AccountRole = "customer" | "vendor";

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [role, setRole] = useState<AccountRole>("customer");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessLocation, setBusinessLocation] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [verificationDocument, setVerificationDocument] = useState<File | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const roleFromQuery = searchParams.get("role");
    if (roleFromQuery === "vendor") {
      setRole("vendor");
    } else if (roleFromQuery === "customer") {
      setRole("customer");
    }

    const queryEmail = searchParams.get("email")?.trim();
    const queryPhone = searchParams.get("phone_number")?.trim();
    const queryBusinessName = searchParams.get("business_name")?.trim();
    const queryBusinessEmail = searchParams.get("business_email")?.trim();
    const queryBusinessPhone = searchParams.get("business_phone")?.trim();
    const queryBusinessLocation = searchParams.get("business_location")?.trim();
    const queryProductCategory = searchParams.get("product_category")?.trim();

    if (queryEmail) {
      setEmail((prev) => prev || queryEmail);
      setBusinessEmail((prev) => prev || queryEmail);
    }
    if (queryPhone) {
      setPhoneNumber((prev) => prev || queryPhone);
      setBusinessPhone((prev) => prev || queryPhone);
    }
    if (queryBusinessName) {
      setBusinessName((prev) => prev || queryBusinessName);
    }
    if (queryBusinessEmail) {
      setBusinessEmail((prev) => prev || queryBusinessEmail);
      setEmail((prev) => prev || queryBusinessEmail);
    }
    if (queryBusinessPhone) {
      setBusinessPhone((prev) => prev || queryBusinessPhone);
      setPhoneNumber((prev) => prev || queryBusinessPhone);
    }
    if (queryBusinessLocation) {
      setBusinessLocation((prev) => prev || queryBusinessLocation);
    }
    if (queryProductCategory) {
      setProductCategory((prev) => prev || queryProductCategory);
    }
  }, [searchParams]);

  const parseBackendError = (err: any) => {
    try {
      const djangoError = JSON.parse(err.message);
      const firstErrorKey = Object.keys(djangoError)[0];
      const firstErrorValue = djangoError[firstErrorKey];
      const firstErrorMessage = Array.isArray(firstErrorValue) ? firstErrorValue[0] : String(firstErrorValue);
      const formattedKey = firstErrorKey.charAt(0).toUpperCase() + firstErrorKey.slice(1).replaceAll("_", " ");
      return `${formattedKey}: ${firstErrorMessage}`;
    } catch {
      return "An unexpected error occurred. Please try again.";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (role === "vendor" && !businessName.trim()) {
      setError("Business name is required for vendor registration.");
      return;
    }

    setIsLoading(true);
    try {
      if (role === "vendor") {
        const formData = new FormData();
        formData.append("first_name", firstName);
        formData.append("last_name", lastName);
        formData.append("email", email);
        formData.append("phone_number", phoneNumber);
        formData.append("password", password);
        formData.append("password_confirm", confirmPassword);
        formData.append("role", "vendor");
        formData.append("business_name", businessName);
        formData.append("business_description", businessDescription);
        formData.append("business_email", businessEmail || email);
        formData.append("business_phone", businessPhone || phoneNumber);
        formData.append("business_location", businessLocation);
        formData.append("product_category", productCategory);
        if (verificationDocument) {
          formData.append("verification_document", verificationDocument);
        }
        await registerUser(formData);
      } else {
        await registerUser({
          first_name: firstName,
          last_name: lastName,
          email,
          phone_number: phoneNumber,
          password,
          password_confirm: confirmPassword,
          role: "customer",
        });
      }

      router.push("/login");
    } catch (err: any) {
      setError(parseBackendError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="py-14 px-4 bg-gray-50 flex justify-center items-start min-h-[85vh]">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden w-full max-w-3xl">
        <div className="bg-primary px-8 py-8">
          <h2 className="font-heading font-bold text-h2 text-white">Create Your Account</h2>
          <p className="font-body text-gray-200 text-small mt-1">Choose your account type and complete setup.</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-small font-body text-center font-medium">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <section>
              <p className="text-small font-heading font-semibold text-gray-700 mb-3">Account Type</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("customer")}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                    role === "customer" ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary/40"
                  }`}
                >
                  <p className="font-heading font-semibold text-gray-900">Customer</p>
                  <p className="text-xs text-gray-600 mt-1">Buy products, track orders, manage account.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRole("vendor")}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                    role === "vendor" ? "border-primary bg-primary/5" : "border-gray-300 hover:border-primary/40"
                  }`}
                >
                  <p className="font-heading font-semibold text-gray-900">Vendor (Seller)</p>
                  <p className="text-xs text-gray-600 mt-1">Open your store and sell after admin approval.</p>
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-small font-heading font-semibold text-gray-700 mb-1">First Name</label>
                <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Last Name</label>
                <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Email</label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Phone Number</label>
                <input required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
            </section>

            {role === "vendor" && (
              <section className="rounded-xl border border-gray-200 p-4 bg-gray-50">
                <h3 className="font-heading font-semibold text-gray-900 mb-3">Vendor Registration Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Business Name</label>
                    <input required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Business Email</label>
                    <input required type="email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Business Phone</label>
                    <input required value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Business Location</label>
                    <input required value={businessLocation} onChange={(e) => setBusinessLocation(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Product Category</label>
                    <input required value={productCategory} onChange={(e) => setProductCategory(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white" />
                  </div>
                  <div>
                    <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Verification Document (Optional)</label>
                    <input type="file" onChange={(e) => setVerificationDocument(e.target.files?.[0] || null)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Business Description</label>
                    <textarea required value={businessDescription} onChange={(e) => setBusinessDescription(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white min-h-24" />
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-3">
                  Vendor accounts are submitted as <span className="font-semibold">Pending Review</span> and activated after admin approval.
                </p>
              </section>
            )}

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Password</label>
                <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-small font-heading font-semibold text-gray-700 mb-1">Confirm Password</label>
                <input required type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
            </section>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-lg shadow-md text-body-lg font-heading font-semibold text-white transition-all ${
                isLoading ? "bg-primary/70 cursor-not-allowed" : "bg-primary hover:bg-blue-900"
              }`}
            >
              {isLoading ? "Creating account..." : role === "vendor" ? "Submit Vendor Application" : "Create Customer Account"}
            </button>
          </form>

          <div className="mt-6 text-center border-t border-gray-100 pt-6">
            <p className="text-small font-body text-gray-600">
              Already have an account?{" "}
              <Link href="/login" className="font-heading font-semibold text-primary hover:text-accent transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="py-14 px-4 bg-gray-50 min-h-[85vh] text-center text-gray-600">Loading registration...</main>}>
      <RegisterPageContent />
    </Suspense>
  );
}
