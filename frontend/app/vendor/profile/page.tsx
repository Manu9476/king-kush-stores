"use client";

import { FormEvent, useEffect, useState } from "react";
import { useVendorPanel } from "../../../src/context/VendorPanelContext";

export default function VendorProfilePage() {
  const { vendorProfile, saving, saveVendorProfile } = useVendorPanel();

  const [storeName, setStoreName] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessHours, setBusinessHours] = useState("");
  const [businessLocation, setBusinessLocation] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  useEffect(() => {
    if (!vendorProfile) return;
    setStoreName(vendorProfile.store_name || "");
    setStoreDescription(vendorProfile.store_description || "");
    setBusinessEmail(vendorProfile.business_email || "");
    setBusinessPhone(vendorProfile.business_phone || "");
    setBusinessHours(vendorProfile.business_hours || "");
    setBusinessLocation(vendorProfile.business_location || "");
    setProductCategory(vendorProfile.product_category || "");
    setAddress1(vendorProfile.business_address_line_1 || "");
    setAddress2(vendorProfile.business_address_line_2 || "");
    setCity(vendorProfile.business_city || "");
    setPostalCode(vendorProfile.business_postal_code || "");
    setCountry(vendorProfile.business_country || "");
  }, [vendorProfile]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    await saveVendorProfile({
      store_name: storeName,
      store_description: storeDescription,
      business_email: businessEmail,
      business_phone: businessPhone,
      business_hours: businessHours,
      business_location: businessLocation,
      product_category: productCategory,
      business_address_line_1: address1,
      business_address_line_2: address2,
      business_city: city,
      business_postal_code: postalCode,
      business_country: country,
      store_logo: logoFile || undefined,
      store_banner: bannerFile || undefined,
    });
    setLogoFile(null);
    setBannerFile(null);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Store Profile</h2>
      <p className="text-sm text-gray-600">Manage store identity, contact details, and business information.</p>

      <form onSubmit={saveProfile} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <input
          value={storeName}
          onChange={(event) => setStoreName(event.target.value)}
          placeholder="Store Name"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
          required
        />
        <input
          value={productCategory}
          onChange={(event) => setProductCategory(event.target.value)}
          placeholder="Primary Product Category"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
          required
        />
        <input
          type="email"
          value={businessEmail}
          onChange={(event) => setBusinessEmail(event.target.value)}
          placeholder="Business Email"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={businessPhone}
          onChange={(event) => setBusinessPhone(event.target.value)}
          placeholder="Business Phone"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={businessHours}
          onChange={(event) => setBusinessHours(event.target.value)}
          placeholder="Business Hours (e.g. Mon-Sat 8:00 AM - 6:00 PM)"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={businessLocation}
          onChange={(event) => setBusinessLocation(event.target.value)}
          placeholder="Business Location"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={address1}
          onChange={(event) => setAddress1(event.target.value)}
          placeholder="Address Line 1"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={address2}
          onChange={(event) => setAddress2(event.target.value)}
          placeholder="Address Line 2"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="City"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={postalCode}
          onChange={(event) => setPostalCode(event.target.value)}
          placeholder="Postal Code"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
        />
        <input
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          placeholder="Country"
          className="rounded-modern border border-gray-200 px-3 py-2 text-sm"
        />
        <textarea
          value={storeDescription}
          onChange={(event) => setStoreDescription(event.target.value)}
          placeholder="Store Description"
          className="min-h-24 rounded-modern border border-gray-200 px-3 py-2 text-sm md:col-span-2"
        />

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Store Logo</label>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
            className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Store Banner</label>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            onChange={(event) => setBannerFile(event.target.files?.[0] || null)}
            className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70 md:col-span-2"
        >
          {saving ? "Saving..." : "Save Store Profile"}
        </button>
      </form>

      {(vendorProfile?.store_logo_url || vendorProfile?.store_banner_url) ? (
        <div className="rounded-modern border border-gray-100 p-4 text-xs text-gray-600">
          {vendorProfile?.store_logo_url ? (
            <a
              href={vendorProfile.store_logo_url}
              target="_blank"
              rel="noreferrer"
              className="block text-primary transition-colors hover:text-primary-hover"
            >
              View current logo
            </a>
          ) : null}
          {vendorProfile?.store_banner_url ? (
            <a
              href={vendorProfile.store_banner_url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block text-primary transition-colors hover:text-primary-hover"
            >
              View current banner
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
