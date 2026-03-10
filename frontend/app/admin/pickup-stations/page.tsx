"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";
import { useAuth } from "../../../src/context/AuthContext";
import {
  AdminStaffAccount,
  VendorApplicationAdmin,
  PickupOrderOperation,
  PickupStation,
  PickupStationAssignment,
  getAdminVendorApplications,
  createAdminPickupAssignment,
  createAdminPickupStation,
  deleteAdminPickupAssignment,
  deleteAdminPickupStation,
  getAdminPickupAssignments,
  getAdminPickupOperations,
  getAdminPickupStations,
  getAdminStaffAccounts,
  updateAdminPickupAssignment,
  updateAdminPickupStation,
} from "../../../src/services/api";

function parseServices(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function AdminPickupStationsPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, canAccessAdminModule, hasAdminPermission } = useAuth();

  const canView = canAccessAdminModule("pickup") && (hasAdminPermission("pickup.view") || hasAdminPermission("pickup.manage"));
  const canManageStations = hasAdminPermission("pickup.manage");
  const canManageAssignments = hasAdminPermission("pickup.assign") || hasAdminPermission("pickup.manage");
  const canViewOperations = hasAdminPermission("pickup.view");

  const [stations, setStations] = useState<PickupStation[]>([]);
  const [assignments, setAssignments] = useState<PickupStationAssignment[]>([]);
  const [operations, setOperations] = useState<PickupOrderOperation[]>([]);
  const [staffAccounts, setStaffAccounts] = useState<AdminStaffAccount[]>([]);
  const [vendors, setVendors] = useState<VendorApplicationAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [stationSearch, setStationSearch] = useState("");
  const [stationForm, setStationForm] = useState({
    id: 0,
    name: "",
    city: "",
    address: "",
    operating_hours: "",
    contact_phone: "",
    contact_email: "",
    services_text: "",
    is_active: true,
    supports_pickup: true,
    supports_returns: true,
    temporary_notice: "",
    ownership_type: "platform" as "platform" | "vendor",
    vendor_profile: "",
    approval_status: "approved" as "pending" | "approved" | "suspended" | "rejected",
    is_visible_to_customers: true,
    sync_name: false,
    sync_address: false,
    sync_contact: false,
    sync_operating_hours: false,
    sync_active_status: false,
  });
  const [assignmentForm, setAssignmentForm] = useState({
    id: 0,
    station: "",
    user: "",
    role: "staff" as "manager" | "staff",
    can_manage_local_staff: false,
    is_active: true,
    notes: "",
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canView) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, canView, router]);

  const loadData = useCallback(async () => {
    if (!token || !canView) return;
    setIsLoading(true);
    setError("");
    try {
      const [stationsData, assignmentsData, operationsData, staffData] = await Promise.all([
        getAdminPickupStations(token),
        canManageAssignments ? getAdminPickupAssignments(token) : Promise.resolve([]),
        canViewOperations ? getAdminPickupOperations(token) : Promise.resolve([]),
        canManageAssignments ? getAdminStaffAccounts(token, { active: true }).catch(() => [] as AdminStaffAccount[]) : Promise.resolve([]),
      ]);
      const vendorData = hasAdminPermission("vendors.view")
        ? await getAdminVendorApplications(token, "", "approved").catch(() => [] as VendorApplicationAdmin[])
        : [];
      setStations(stationsData);
      setAssignments(assignmentsData);
      setOperations(operationsData);
      setStaffAccounts(staffData);
      setVendors(vendorData);
    } catch (err: any) {
      setError(err?.message || "Failed to load pickup management data.");
    } finally {
      setIsLoading(false);
    }
  }, [token, canView, canManageAssignments, canViewOperations, hasAdminPermission]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canView) {
      loadData();
    }
  }, [isAuthenticated, token, userRole, canView, loadData]);

  const filteredStations = useMemo(() => {
    const query = stationSearch.trim().toLowerCase();
    if (!query) return stations;
    return stations.filter((station) =>
      `${station.name} ${station.city} ${station.address} ${station.services.join(" ")}`.toLowerCase().includes(query),
    );
  }, [stations, stationSearch]);

  const staffChoices = useMemo(
    () => staffAccounts.filter((account) => account.role === "admin"),
    [staffAccounts],
  );

  const resetStationForm = () => {
    setStationForm({
      id: 0,
      name: "",
      city: "",
      address: "",
      operating_hours: "",
      contact_phone: "",
      contact_email: "",
      services_text: "",
      is_active: true,
      supports_pickup: true,
      supports_returns: true,
      temporary_notice: "",
      ownership_type: "platform",
      vendor_profile: "",
      approval_status: "approved",
      is_visible_to_customers: true,
      sync_name: false,
      sync_address: false,
      sync_contact: false,
      sync_operating_hours: false,
      sync_active_status: false,
    });
  };

  const resetAssignmentForm = () => {
    setAssignmentForm({
      id: 0,
      station: "",
      user: "",
      role: "staff",
      can_manage_local_staff: false,
      is_active: true,
      notes: "",
    });
  };

  const saveStation = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManageStations) return;
    if (stationForm.ownership_type === "vendor" && !stationForm.vendor_profile) {
      setError("Select an approved vendor for vendor-managed stations.");
      return;
    }
    setIsSaving(true);
    setError("");
    setSuccess("");
    const payload = {
      name: stationForm.name.trim(),
      city: stationForm.city.trim(),
      address: stationForm.address.trim(),
      operating_hours: stationForm.operating_hours.trim(),
      contact_phone: stationForm.contact_phone.trim(),
      contact_email: stationForm.contact_email.trim() || null,
      services: parseServices(stationForm.services_text),
      is_active: stationForm.is_active,
      supports_pickup: stationForm.supports_pickup,
      supports_returns: stationForm.supports_returns,
      temporary_notice: stationForm.temporary_notice.trim(),
      ownership_type: stationForm.ownership_type,
      vendor_profile: stationForm.ownership_type === "vendor" && stationForm.vendor_profile ? Number(stationForm.vendor_profile) : null,
      approval_status: stationForm.approval_status,
      is_visible_to_customers: stationForm.is_visible_to_customers,
      sync_name: stationForm.ownership_type === "vendor" ? stationForm.sync_name : false,
      sync_address: stationForm.ownership_type === "vendor" ? stationForm.sync_address : false,
      sync_contact: stationForm.ownership_type === "vendor" ? stationForm.sync_contact : false,
      sync_operating_hours: stationForm.ownership_type === "vendor" ? stationForm.sync_operating_hours : false,
      sync_active_status: stationForm.ownership_type === "vendor" ? stationForm.sync_active_status : false,
    };
    try {
      if (stationForm.id) {
        const updated = await updateAdminPickupStation(token, stationForm.id, payload);
        setStations((prev) => prev.map((station) => (station.id === stationForm.id ? updated : station)));
        setSuccess("Station updated.");
      } else {
        const created = await createAdminPickupStation(token, payload);
        setStations((prev) => [created, ...prev]);
        setSuccess("Station created.");
      }
      resetStationForm();
    } catch (err: any) {
      setError(err?.message || "Failed to save station.");
    } finally {
      setIsSaving(false);
    }
  };

  const saveAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManageAssignments) return;
    const stationId = Number(assignmentForm.station);
    const userId = Number(assignmentForm.user);
    if (!stationId || !userId) {
      setError("Choose both station and staff account.");
      return;
    }
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        station: stationId,
        user: userId,
        role: assignmentForm.role,
        can_manage_local_staff: assignmentForm.can_manage_local_staff,
        is_active: assignmentForm.is_active,
        notes: assignmentForm.notes.trim(),
      };
      if (assignmentForm.id) {
        const updated = await updateAdminPickupAssignment(token, assignmentForm.id, payload);
        setAssignments((prev) => prev.map((entry) => (entry.id === assignmentForm.id ? updated : entry)));
        setSuccess("Assignment updated.");
      } else {
        const created = await createAdminPickupAssignment(token, payload);
        setAssignments((prev) => [created, ...prev]);
        setSuccess("Assignment created.");
      }
      resetAssignmentForm();
    } catch (err: any) {
      setError(err?.message || "Failed to save assignment.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeStation = async (stationId: number) => {
    if (!token || !canManageStations) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      await deleteAdminPickupStation(token, stationId);
      await loadData();
      setSuccess("Station deleted.");
    } catch (err: any) {
      setError(err?.message || "Failed to delete station.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeAssignment = async (assignmentId: number) => {
    if (!token || !canManageAssignments) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      await deleteAdminPickupAssignment(token, assignmentId);
      await loadData();
      setSuccess("Assignment removed.");
    } catch (err: any) {
      setError(err?.message || "Failed to remove assignment.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canView) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <AdminSidebar active="pickup" />
      <main className="flex-1 space-y-5 p-5 pb-24 md:p-8 md:pb-8">
        <header className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Pickup Station Control</h1>
              <p className="mt-1 text-sm text-gray-600">Manage stations, assignments, and station operations.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={loadData} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                Refresh
              </button>
              <Link href="/station-ops" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                Station Operations Portal
              </Link>
            </div>
          </div>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        {isLoading ? (
          <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-gray-200 bg-white">
            <div className="h-10 w-10 animate-spin rounded-full border-b-4 border-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
            <section className="space-y-5">
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Stations</h2>
                  <input
                    value={stationSearch}
                    onChange={(event) => setStationSearch(event.target.value)}
                    placeholder="Search by city, station, or services..."
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="max-h-[300px] divide-y divide-gray-100 overflow-y-auto">
                  {filteredStations.map((station) => (
                    <div key={station.id} className="space-y-2 px-5 py-3">
                      <p className="text-sm font-semibold text-gray-900">{station.name} ({station.city})</p>
                      <p className="text-xs text-gray-500">
                        Ownership: {station.ownership_type === "vendor" ? `Vendor (${station.vendor_store_name || "linked"})` : "Platform"} | Approval: {station.approval_status} | Visible: {station.is_visible_to_customers ? "Yes" : "No"}
                      </p>
                      <p className="text-xs text-gray-600">{station.address} | {station.operating_hours}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          onClick={() =>
                            setStationForm({
                              id: station.id,
                              name: station.name,
                              city: station.city,
                              address: station.address,
                              operating_hours: station.operating_hours,
                              contact_phone: station.contact_phone,
                              contact_email: station.contact_email || "",
                              services_text: station.services.join(", "),
                              is_active: station.is_active,
                              supports_pickup: station.supports_pickup,
                              supports_returns: station.supports_returns,
                              temporary_notice: station.temporary_notice || "",
                              ownership_type: station.ownership_type,
                              vendor_profile: station.vendor_profile ? String(station.vendor_profile) : "",
                              approval_status: station.approval_status,
                              is_visible_to_customers: station.is_visible_to_customers,
                              sync_name: station.sync_name,
                              sync_address: station.sync_address,
                              sync_contact: station.sync_contact,
                              sync_operating_hours: station.sync_operating_hours,
                              sync_active_status: station.sync_active_status,
                            })
                          }
                        >
                          Edit
                        </button>
                        {canManageStations ? (
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            onClick={() => removeStation(station.id)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-lg font-bold text-gray-900">Assignments</h2>
                </div>
                <div className="max-h-[280px] divide-y divide-gray-100 overflow-y-auto">
                  {assignments.map((entry) => (
                    <div key={entry.id} className="space-y-2 px-5 py-3">
                      <p className="text-sm font-semibold text-gray-900">{entry.user_email} - {entry.station_name}</p>
                      <p className="text-xs text-gray-600">Role: {entry.role} | {entry.is_active ? "Active" : "Inactive"}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          onClick={() =>
                            setAssignmentForm({
                              id: entry.id,
                              station: String(entry.station),
                              user: String(entry.user),
                              role: entry.role,
                              can_manage_local_staff: entry.can_manage_local_staff,
                              is_active: entry.is_active,
                              notes: entry.notes || "",
                            })
                          }
                        >
                          Edit
                        </button>
                        {canManageAssignments ? (
                          <button
                            type="button"
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                            onClick={() => removeAssignment(entry.id)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <form onSubmit={saveStation} className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
                <h3 className="text-lg font-bold text-gray-900">{stationForm.id ? "Edit Station" : "Create Station"}</h3>
                <input value={stationForm.name} onChange={(event) => setStationForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Station name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                <input value={stationForm.city} onChange={(event) => setStationForm((prev) => ({ ...prev, city: event.target.value }))} placeholder="City" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                <input value={stationForm.address} onChange={(event) => setStationForm((prev) => ({ ...prev, address: event.target.value }))} placeholder="Address" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                <input value={stationForm.operating_hours} onChange={(event) => setStationForm((prev) => ({ ...prev, operating_hours: event.target.value }))} placeholder="Operating hours" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                <input value={stationForm.contact_phone} onChange={(event) => setStationForm((prev) => ({ ...prev, contact_phone: event.target.value }))} placeholder="Contact phone" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required />
                <input value={stationForm.contact_email} onChange={(event) => setStationForm((prev) => ({ ...prev, contact_email: event.target.value }))} placeholder="Contact email" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={stationForm.ownership_type}
                    onChange={(event) =>
                      setStationForm((prev) => ({
                        ...prev,
                        ownership_type: event.target.value as "platform" | "vendor",
                        vendor_profile: event.target.value === "vendor" ? prev.vendor_profile : "",
                        sync_name: event.target.value === "vendor",
                        sync_address: event.target.value === "vendor",
                        sync_contact: event.target.value === "vendor",
                        sync_operating_hours: event.target.value === "vendor",
                        sync_active_status: event.target.value === "vendor",
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="platform">Platform-managed</option>
                    <option value="vendor">Vendor-managed</option>
                  </select>
                  <select
                    value={stationForm.vendor_profile}
                    onChange={(event) => setStationForm((prev) => ({ ...prev, vendor_profile: event.target.value }))}
                    disabled={stationForm.ownership_type !== "vendor"}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                  >
                    <option value="">Select approved vendor</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.store_name} ({vendor.user.email})
                      </option>
                    ))}
                  </select>
                </div>
                <input value={stationForm.services_text} onChange={(event) => setStationForm((prev) => ({ ...prev, services_text: event.target.value }))} placeholder="Services comma-separated" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <textarea value={stationForm.temporary_notice} onChange={(event) => setStationForm((prev) => ({ ...prev, temporary_notice: event.target.value }))} placeholder="Temporary notice" className="min-h-20 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    value={stationForm.approval_status}
                    onChange={(event) =>
                      setStationForm((prev) => ({
                        ...prev,
                        approval_status: event.target.value as "pending" | "approved" | "suspended" | "rejected",
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="approved">Approved</option>
                    <option value="pending">Pending</option>
                    <option value="suspended">Suspended</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={stationForm.is_visible_to_customers}
                      onChange={(event) => setStationForm((prev) => ({ ...prev, is_visible_to_customers: event.target.checked }))}
                    />
                    Visible to customers
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs text-gray-700 sm:grid-cols-3">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={stationForm.is_active} onChange={(event) => setStationForm((prev) => ({ ...prev, is_active: event.target.checked }))} />Active</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={stationForm.supports_pickup} onChange={(event) => setStationForm((prev) => ({ ...prev, supports_pickup: event.target.checked }))} />Supports pickup</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={stationForm.supports_returns} onChange={(event) => setStationForm((prev) => ({ ...prev, supports_returns: event.target.checked }))} />Supports returns</label>
                </div>
                {stationForm.ownership_type === "vendor" ? (
                  <div className="grid grid-cols-1 gap-2 text-xs text-gray-700 sm:grid-cols-2">
                    <label className="inline-flex items-center gap-2"><input type="checkbox" checked={stationForm.sync_name} onChange={(event) => setStationForm((prev) => ({ ...prev, sync_name: event.target.checked }))} />Sync station name from vendor store</label>
                    <label className="inline-flex items-center gap-2"><input type="checkbox" checked={stationForm.sync_address} onChange={(event) => setStationForm((prev) => ({ ...prev, sync_address: event.target.checked }))} />Sync address and city</label>
                    <label className="inline-flex items-center gap-2"><input type="checkbox" checked={stationForm.sync_contact} onChange={(event) => setStationForm((prev) => ({ ...prev, sync_contact: event.target.checked }))} />Sync phone and email</label>
                    <label className="inline-flex items-center gap-2"><input type="checkbox" checked={stationForm.sync_operating_hours} onChange={(event) => setStationForm((prev) => ({ ...prev, sync_operating_hours: event.target.checked }))} />Sync operating hours</label>
                    <label className="inline-flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={stationForm.sync_active_status} onChange={(event) => setStationForm((prev) => ({ ...prev, sync_active_status: event.target.checked }))} />Sync active status from vendor approval</label>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <button type="submit" disabled={isSaving || !canManageStations} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
                    {stationForm.id ? "Save Station" : "Create Station"}
                  </button>
                  {stationForm.id ? <button type="button" onClick={resetStationForm} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">Cancel</button> : null}
                </div>
              </form>

              <form onSubmit={saveAssignment} className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
                <h3 className="text-lg font-bold text-gray-900">{assignmentForm.id ? "Edit Assignment" : "Create Assignment"}</h3>
                <select value={assignmentForm.station} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, station: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
                  <option value="">Select station</option>
                  {stations.map((station) => <option key={station.id} value={station.id}>{station.name} ({station.city})</option>)}
                </select>
                <select value={assignmentForm.user} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, user: event.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" required>
                  <option value="">Select admin/staff account</option>
                  {staffChoices.map((account) => <option key={account.id} value={account.id}>{account.full_name || account.email}</option>)}
                </select>
                <select value={assignmentForm.role} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, role: event.target.value as "manager" | "staff" }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="staff">Station Staff</option>
                  <option value="manager">Station Manager</option>
                </select>
                <textarea value={assignmentForm.notes} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Notes" className="min-h-16 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                <div className="grid grid-cols-1 gap-2 text-xs text-gray-700 sm:grid-cols-2">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={assignmentForm.is_active} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, is_active: event.target.checked }))} />Active assignment</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={assignmentForm.can_manage_local_staff} onChange={(event) => setAssignmentForm((prev) => ({ ...prev, can_manage_local_staff: event.target.checked }))} />Can manage local staff</label>
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={isSaving || !canManageAssignments} className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
                    {assignmentForm.id ? "Save Assignment" : "Create Assignment"}
                  </button>
                  {assignmentForm.id ? <button type="button" onClick={resetAssignmentForm} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">Cancel</button> : null}
                </div>
              </form>
            </section>
          </div>
        )}

        <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-lg font-bold text-gray-900">Operations Log</h2>
          </div>
          <div className="max-h-[320px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600">Time</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Station</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Order</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Event</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {operations.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 text-gray-600">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-800">{entry.station_name}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.order_number || "-"}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.event_type}</td>
                    <td className="px-4 py-3 text-gray-700">{entry.actor_email || "system"}</td>
                  </tr>
                ))}
                {operations.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-gray-500" colSpan={5}>No operation records yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
