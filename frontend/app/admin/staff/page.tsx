"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/context/AuthContext";
import {
  AdminActivityLog,
  AdminPermissionCatalogGroup,
  AdminStaffAccount,
  AdminStaffRole,
  createAdminStaffAccount,
  createAdminStaffRole,
  deleteAdminStaffRole,
  getAdminActivityLogs,
  getAdminCapabilities,
  getAdminStaffAccounts,
  getAdminStaffRoles,
  updateAdminStaffAccount,
  updateAdminStaffRole,
} from "../../../src/services/api";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";

export default function AdminStaffPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, hasAdminPermission, canAccessAdminModule, isSuperAdmin } = useAuth();
  const canViewStaff = canAccessAdminModule("staff") && hasAdminPermission("staff.view");
  const canManageStaff = isSuperAdmin;

  const [roles, setRoles] = useState<AdminStaffRole[]>([]);
  const [accounts, setAccounts] = useState<AdminStaffAccount[]>([]);
  const [activityLogs, setActivityLogs] = useState<AdminActivityLog[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<AdminPermissionCatalogGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [roleForm, setRoleForm] = useState({
    name: "",
    slug: "",
    description: "",
    permissions: [] as string[],
    is_active: true,
  });

  const [staffForm, setStaffForm] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone_number: "",
    password: "",
    role_id: "",
    assignment_notes: "",
  });

  const [logQuery, setLogQuery] = useState("");
  const [staffQuery, setStaffQuery] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canViewStaff) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, router, canViewStaff]);

  const loadData = useCallback(async () => {
    if (!token || !canViewStaff) return;
    setIsLoading(true);
    setError("");
    try {
      const [rolesData, accountsData, logsData, capabilities] = await Promise.all([
        getAdminStaffRoles(token),
        getAdminStaffAccounts(token, { q: staffQuery }),
        getAdminActivityLogs(token, { q: logQuery, limit: 120 }),
        getAdminCapabilities(token),
      ]);
      setRoles(rolesData);
      setAccounts(accountsData);
      setActivityLogs(logsData);
      setPermissionCatalog(capabilities.permission_catalog || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load staff management data.");
    } finally {
      setIsLoading(false);
    }
  }, [token, canViewStaff, logQuery, staffQuery]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canViewStaff) {
      loadData();
    }
  }, [isAuthenticated, token, userRole, canViewStaff, loadData]);

  const roleCount = roles.length;
  const staffCount = accounts.filter((account) => account.admin_level === "staff").length;
  const superAdminCount = accounts.filter((account) => account.admin_level === "super_admin").length;

  const resetRoleForm = () => {
    setEditingRoleId(null);
    setRoleForm({
      name: "",
      slug: "",
      description: "",
      permissions: [],
      is_active: true,
    });
  };

  const handleRolePermissionToggle = (permissionCode: string) => {
    setRoleForm((prev) => {
      if (prev.permissions.includes(permissionCode)) {
        return { ...prev, permissions: prev.permissions.filter((code) => code !== permissionCode) };
      }
      return { ...prev, permissions: [...prev.permissions, permissionCode] };
    });
  };

  const submitRole = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManageStaff) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: roleForm.name.trim(),
        slug: roleForm.slug.trim(),
        description: roleForm.description.trim(),
        permissions: roleForm.permissions,
        is_active: roleForm.is_active,
      };
      if (editingRoleId) {
        const updated = await updateAdminStaffRole(token, editingRoleId, payload);
        setRoles((prev) => prev.map((role) => (role.id === editingRoleId ? updated : role)));
        setSuccess("Staff role updated.");
      } else {
        const created = await createAdminStaffRole(token, payload);
        setRoles((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setSuccess("Staff role created.");
      }
      resetRoleForm();
    } catch (err: any) {
      setError(err?.message || "Failed to save staff role.");
    } finally {
      setIsSaving(false);
    }
  };

  const editRole = (role: AdminStaffRole) => {
    setEditingRoleId(role.id);
    setRoleForm({
      name: role.name,
      slug: role.slug,
      description: role.description || "",
      permissions: role.permissions || [],
      is_active: role.is_active,
    });
  };

  const removeRole = async (roleId: number) => {
    if (!token || !canManageStaff) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      await deleteAdminStaffRole(token, roleId);
      setRoles((prev) => prev.filter((role) => role.id !== roleId));
      setSuccess("Staff role deleted.");
      if (editingRoleId === roleId) resetRoleForm();
    } catch (err: any) {
      setError(err?.message || "Failed to delete staff role.");
    } finally {
      setIsSaving(false);
    }
  };

  const submitStaffAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManageStaff) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const created = await createAdminStaffAccount(token, {
        email: staffForm.email.trim(),
        first_name: staffForm.first_name.trim(),
        last_name: staffForm.last_name.trim(),
        phone_number: staffForm.phone_number.trim(),
        password: staffForm.password,
        role_id: staffForm.role_id ? Number(staffForm.role_id) : null,
        assignment_notes: staffForm.assignment_notes.trim(),
      });
      setAccounts((prev) => [created, ...prev]);
      setStaffForm({
        email: "",
        first_name: "",
        last_name: "",
        phone_number: "",
        password: "",
        role_id: "",
        assignment_notes: "",
      });
      setSuccess("Staff account created.");
    } catch (err: any) {
      setError(err?.message || "Failed to create staff account.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStaffActive = async (account: AdminStaffAccount) => {
    if (!token || !canManageStaff) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateAdminStaffAccount(token, account.id, { is_active: !account.is_active });
      setAccounts((prev) => prev.map((item) => (item.id === account.id ? updated : item)));
      setSuccess(`Staff account ${updated.is_active ? "activated" : "suspended"}.`);
    } catch (err: any) {
      setError(err?.message || "Failed to update account status.");
    } finally {
      setIsSaving(false);
    }
  };

  const assignStaffRole = async (account: AdminStaffAccount, roleId: number | null) => {
    if (!token || !canManageStaff) return;
    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateAdminStaffAccount(token, account.id, { role_id: roleId });
      setAccounts((prev) => prev.map((item) => (item.id === account.id ? updated : item)));
      setSuccess("Staff role assignment updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to assign role.");
    } finally {
      setIsSaving(false);
    }
  };

  const roleOptions = useMemo(
    () =>
      roles
        .filter((role) => role.is_active)
        .map((role) => ({ id: role.id, label: role.name })),
    [roles],
  );

  if (!isAuthenticated || userRole !== "admin" || !canViewStaff) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar active="staff" />

      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="bg-white rounded-2xl border border-gray-200 p-5">
          <h1 className="text-2xl font-black text-gray-900">Staff & Role Management</h1>
          <p className="text-sm text-gray-600 mt-1">
            Assign department-based permissions, manage staff access, and monitor admin activity logs.
          </p>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}
        {!canManageStaff ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You have view-only access. Only the Super Admin can create or modify staff roles/accounts.
          </div>
        ) : null}

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs uppercase text-gray-500 font-bold">Department Roles</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{roleCount}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs uppercase text-gray-500 font-bold">Staff Accounts</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{staffCount}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs uppercase text-gray-500 font-bold">Super Admins</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{superAdminCount}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-5">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Department Roles</h2>
            </div>
            <form onSubmit={submitRole} className="p-5 border-b border-gray-100 space-y-3">
              <input
                value={roleForm.name}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Role name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
                disabled={!canManageStaff}
              />
              <input
                value={roleForm.slug}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder="Slug (optional)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!canManageStaff}
              />
              <textarea
                value={roleForm.description}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Role description"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-20"
                disabled={!canManageStaff}
              />
              <div className="rounded-lg border border-gray-200 p-3 max-h-56 overflow-y-auto space-y-3">
                {permissionCatalog.map((group) => (
                  <div key={group.module}>
                    <p className="text-xs font-bold uppercase text-gray-500 mb-2">{group.module}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.permissions.map((permission) => (
                        <label key={permission.code} className="text-xs text-gray-700 flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={roleForm.permissions.includes(permission.code)}
                            onChange={() => handleRolePermissionToggle(permission.code)}
                            disabled={!canManageStaff}
                          />
                          {permission.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <label className="text-xs text-gray-600 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={roleForm.is_active}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, is_active: event.target.checked }))}
                  disabled={!canManageStaff}
                />
                Role is active
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={!canManageStaff || isSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                >
                  {editingRoleId ? "Save Role" : "Create Role"}
                </button>
                {editingRoleId ? (
                  <button
                    type="button"
                    onClick={resetRoleForm}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {roles.map((role) => (
                <div key={role.id} className="p-4 space-y-2">
                  <p className="font-semibold text-gray-900">{role.name}</p>
                  <p className="text-xs text-gray-600">{role.slug} | {role.is_active ? "Active" : "Inactive"}</p>
                  <p className="text-xs text-gray-600">{role.permissions.length} permissions</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => editRole(role)}
                      disabled={!canManageStaff}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 disabled:opacity-60"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRole(role.id)}
                      disabled={!canManageStaff}
                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Staff Accounts</h2>
            </div>
            <form onSubmit={submitStaffAccount} className="p-5 border-b border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={staffForm.email}
                onChange={(event) => setStaffForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="Email"
                type="email"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
                disabled={!canManageStaff}
              />
              <input
                value={staffForm.password}
                onChange={(event) => setStaffForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Temporary password"
                type="password"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
                disabled={!canManageStaff}
              />
              <input
                value={staffForm.first_name}
                onChange={(event) => setStaffForm((prev) => ({ ...prev, first_name: event.target.value }))}
                placeholder="First name"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!canManageStaff}
              />
              <input
                value={staffForm.last_name}
                onChange={(event) => setStaffForm((prev) => ({ ...prev, last_name: event.target.value }))}
                placeholder="Last name"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!canManageStaff}
              />
              <input
                value={staffForm.phone_number}
                onChange={(event) => setStaffForm((prev) => ({ ...prev, phone_number: event.target.value }))}
                placeholder="Phone number"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!canManageStaff}
              />
              <select
                value={staffForm.role_id}
                onChange={(event) => setStaffForm((prev) => ({ ...prev, role_id: event.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={!canManageStaff}
              >
                <option value="">No role assigned</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>{role.label}</option>
                ))}
              </select>
              <textarea
                value={staffForm.assignment_notes}
                onChange={(event) => setStaffForm((prev) => ({ ...prev, assignment_notes: event.target.value }))}
                placeholder="Assignment notes"
                className="md:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-20"
                disabled={!canManageStaff}
              />
              <button
                type="submit"
                disabled={!canManageStaff || isSaving}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                Create Staff Account
              </button>
            </form>

            <div className="p-4 border-b border-gray-100">
              <input
                value={staffQuery}
                onChange={(event) => setStaffQuery(event.target.value)}
                placeholder="Search by name, email, phone, customer ID..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={loadData}
                className="mt-2 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
              >
                Refresh Staff List
              </button>
            </div>

            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {accounts.map((account) => (
                <div key={account.id} className="p-4 space-y-2">
                  <p className="font-semibold text-gray-900">{account.full_name}</p>
                  <p className="text-xs text-gray-600">{account.email} | {account.customer_id}</p>
                  <p className="text-xs text-gray-600">
                    {account.admin_level === "super_admin" ? "Super Admin" : "Staff"} | {account.is_active ? "Active" : "Suspended"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={account.staff_assignment?.role?.id || ""}
                      onChange={(event) => assignStaffRole(account, event.target.value ? Number(event.target.value) : null)}
                      disabled={!canManageStaff || account.admin_level === "super_admin"}
                      className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                    >
                      <option value="">No role</option>
                      {roleOptions.map((role) => (
                        <option key={role.id} value={role.id}>{role.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => toggleStaffActive(account)}
                      disabled={!canManageStaff || account.admin_level === "super_admin"}
                      className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
                    >
                      {account.is_active ? "Suspend" : "Activate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">Admin Activity Logs</h2>
            <div className="flex gap-2">
              <input
                value={logQuery}
                onChange={(event) => setLogQuery(event.target.value)}
                placeholder="Search action, actor, target..."
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={loadData}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
              >
                Search
              </button>
            </div>
          </div>
          {isLoading ? (
            <div className="p-6 text-sm text-gray-500">Loading activity logs...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-gray-600">When</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Actor</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Action</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Target</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {activityLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 text-gray-600">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-700">{log.actor_email || "system"}</td>
                      <td className="px-4 py-3 text-gray-700">{log.action}</td>
                      <td className="px-4 py-3 text-gray-600">{log.target_type} {log.target_id ? `#${log.target_id}` : ""}</td>
                      <td className="px-4 py-3 text-gray-700">{log.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
