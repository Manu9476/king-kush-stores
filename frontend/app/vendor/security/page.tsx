"use client";

import { FormEvent, useState } from "react";
import { useVendorPanel } from "../../../src/context/VendorPanelContext";

export default function VendorSecurityPage() {
  const { saving, updatePassword } = useVendorPanel();
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    await updatePassword(form);
    setForm({
      current_password: "",
      new_password: "",
      confirm_password: "",
    });
  };

  return (
    <div className="max-w-xl space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Security</h2>
      <p className="text-sm text-gray-600">Update your password to keep vendor access secure.</p>

      <form onSubmit={savePassword} className="space-y-3 rounded-modern border border-gray-100 p-4">
        <input
          type="password"
          value={form.current_password}
          onChange={(event) => setForm((prev) => ({ ...prev, current_password: event.target.value }))}
          placeholder="Current Password"
          className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          value={form.new_password}
          onChange={(event) => setForm((prev) => ({ ...prev, new_password: event.target.value }))}
          placeholder="New Password"
          className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          value={form.confirm_password}
          onChange={(event) => setForm((prev) => ({ ...prev, confirm_password: event.target.value }))}
          placeholder="Confirm New Password"
          className="w-full rounded-modern border border-gray-200 px-3 py-2 text-sm"
          required
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-modern bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "Saving..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
