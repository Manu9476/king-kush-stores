"use client";

import Link from "next/link";
import { Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";
import { useAuth } from "../../../src/context/AuthContext";
import {
  CompanyProfileData,
  CompanyProfilePayload,
  ContentDepartment,
  PersonProfileData,
  PersonProfilePayload,
  createAdminCreator,
  createAdminDepartment,
  createAdminTeamMember,
  deleteAdminCreator,
  deleteAdminDepartment,
  deleteAdminTeamMember,
  getAdminCompanyProfile,
  getAdminCreators,
  getAdminDepartments,
  getAdminTeamMembers,
  saveAdminCompanyProfile,
  updateAdminCreator,
  updateAdminDepartment,
  updateAdminTeamMember,
} from "../../../src/services/api";

const emptyCompany: CompanyProfilePayload = {
  company_name: "",
  description: "",
  mission_vision: "",
  email: "",
  phone_number: "",
  website_url: "",
  address: "",
  location: "",
  year_founded: null,
  category: "",
  facebook_url: "",
  instagram_url: "",
  x_url: "",
  linkedin_url: "",
  youtube_url: "",
  tiktok_url: "",
  is_published: true,
  is_active: true,
};

const emptyPerson: PersonProfilePayload = {
  full_name: "",
  role_title: "",
  bio: "",
  email: "",
  phone_number: "",
  facebook_url: "",
  instagram_url: "",
  x_url: "",
  linkedin_url: "",
  portfolio_url: "",
  joining_date: "",
  is_active: true,
  is_featured: false,
  is_published: true,
  sort_order: 0,
  department_ids: [],
};

function personToForm(item: PersonProfileData): PersonProfilePayload {
  return {
    full_name: item.full_name,
    role_title: item.role_title,
    bio: item.bio || "",
    email: item.email || "",
    phone_number: item.phone_number || "",
    facebook_url: item.facebook_url || "",
    instagram_url: item.instagram_url || "",
    x_url: item.x_url || "",
    linkedin_url: item.linkedin_url || "",
    portfolio_url: item.portfolio_url || "",
    joining_date: item.joining_date || "",
    is_active: item.is_active,
    is_featured: item.is_featured,
    is_published: item.is_published,
    sort_order: item.sort_order,
    department_ids: item.departments.map((dept) => dept.id),
  };
}

function companyToForm(item: CompanyProfileData): CompanyProfilePayload {
  return {
    company_name: item.company_name,
    description: item.description || "",
    mission_vision: item.mission_vision || "",
    email: item.email || "",
    phone_number: item.phone_number || "",
    website_url: item.website_url || "",
    address: item.address || "",
    location: item.location || "",
    year_founded: item.year_founded ?? null,
    category: item.category || "",
    facebook_url: item.facebook_url || "",
    instagram_url: item.instagram_url || "",
    x_url: item.x_url || "",
    linkedin_url: item.linkedin_url || "",
    youtube_url: item.youtube_url || "",
    tiktok_url: item.tiktok_url || "",
    is_published: item.is_published,
    is_active: item.is_active,
  };
}

export default function AdminContentPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, hasAdminPermission, canAccessAdminModule } = useAuth();
  const canManage = canAccessAdminModule("content") && hasAdminPermission("content.manage");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [company, setCompany] = useState<CompanyProfileData | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyProfilePayload>(emptyCompany);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);

  const [departments, setDepartments] = useState<ContentDepartment[]>([]);
  const [departmentForm, setDepartmentForm] = useState({ name: "", description: "", is_active: true, sort_order: 0 });
  const [editingDepartmentId, setEditingDepartmentId] = useState<number | null>(null);

  const [creators, setCreators] = useState<PersonProfileData[]>([]);
  const [creatorForm, setCreatorForm] = useState<PersonProfilePayload>(emptyPerson);
  const [editingCreatorId, setEditingCreatorId] = useState<number | null>(null);
  const [creatorPhoto, setCreatorPhoto] = useState<File | null>(null);

  const [teamMembers, setTeamMembers] = useState<PersonProfileData[]>([]);
  const [teamForm, setTeamForm] = useState<PersonProfilePayload>(emptyPerson);
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [teamPhoto, setTeamPhoto] = useState<File | null>(null);

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
    else if (userRole && userRole !== "admin") router.push("/");
    else if (isAuthenticated && userRole === "admin" && !canManage) router.push("/admin");
  }, [isAuthenticated, userRole, canManage, router]);

  const loadAll = useCallback(async () => {
    if (!token || !canManage) return;
    setLoading(true);
    try {
      const [companyData, departmentData, creatorData, teamData] = await Promise.all([
        getAdminCompanyProfile(token),
        getAdminDepartments(token),
        getAdminCreators(token),
        getAdminTeamMembers(token),
      ]);
      setCompany(companyData.company);
      setCompanyForm(companyData.company ? companyToForm(companyData.company) : emptyCompany);
      setDepartments(departmentData);
      setCreators(creatorData);
      setTeamMembers(teamData);
    } catch (err: any) {
      setError(err?.message || "Failed to load content desk.");
    } finally {
      setLoading(false);
    }
  }, [token, canManage]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canManage) loadAll();
  }, [isAuthenticated, token, userRole, canManage, loadAll]);

  const departmentBadges = useMemo(() => departments.map((item) => ({ id: item.id, label: item.name })), [departments]);

  const toggleDepartment = (
    form: PersonProfilePayload,
    setter: Dispatch<SetStateAction<PersonProfilePayload>>,
    departmentId: number,
  ) => {
    const existing = form.department_ids || [];
    setter({
      ...form,
      department_ids: existing.includes(departmentId)
        ? existing.filter((id) => id !== departmentId)
        : [...existing, departmentId],
    });
  };

  const submitCompany = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await saveAdminCompanyProfile(token, {
        ...companyForm,
        logo: logoFile,
        banner: bannerFile,
        featured_media_files: mediaFiles,
      });
      setCompany(response.company);
      setCompanyForm(companyToForm(response.company));
      setLogoFile(null);
      setBannerFile(null);
      setMediaFiles([]);
      setSuccess("Company section saved.");
    } catch (err: any) {
      setError(err?.message || "Failed to save company.");
    } finally {
      setSaving(false);
    }
  };

  const submitDepartment = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      const saved = editingDepartmentId
        ? await updateAdminDepartment(token, editingDepartmentId, departmentForm)
        : await createAdminDepartment(token, departmentForm);
      setDepartments((prev) =>
        editingDepartmentId
          ? prev.map((item) => (item.id === saved.id ? saved : item)).sort((a, b) => a.sort_order - b.sort_order)
          : [...prev, saved].sort((a, b) => a.sort_order - b.sort_order),
      );
      setDepartmentForm({ name: "", description: "", is_active: true, sort_order: 0 });
      setEditingDepartmentId(null);
      setSuccess(`Department ${editingDepartmentId ? "updated" : "created"}.`);
    } catch (err: any) {
      setError(err?.message || "Failed to save department.");
    } finally {
      setSaving(false);
    }
  };

  const submitPerson = async (kind: "creator" | "team", event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    try {
      if (kind === "creator") {
        const payload = { ...creatorForm, profile_photo: creatorPhoto };
        const saved = editingCreatorId
          ? await updateAdminCreator(token, editingCreatorId, payload)
          : await createAdminCreator(token, payload);
        setCreators((prev) =>
          editingCreatorId ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved],
        );
        setCreatorForm(emptyPerson);
        setCreatorPhoto(null);
        setEditingCreatorId(null);
      } else {
        const payload = { ...teamForm, profile_photo: teamPhoto };
        const saved = editingTeamId
          ? await updateAdminTeamMember(token, editingTeamId, payload)
          : await createAdminTeamMember(token, payload);
        setTeamMembers((prev) =>
          editingTeamId ? prev.map((item) => (item.id === saved.id ? saved : item)) : [...prev, saved],
        );
        setTeamForm(emptyPerson);
        setTeamPhoto(null);
        setEditingTeamId(null);
      }
      setSuccess(`${kind === "creator" ? "Creator" : "Team member"} saved.`);
    } catch (err: any) {
      setError(err?.message || `Failed to save ${kind}.`);
    } finally {
      setSaving(false);
    }
  };

  const renderPersonSection = (
    title: string,
    items: PersonProfileData[],
    form: PersonProfilePayload,
    setter: Dispatch<SetStateAction<PersonProfilePayload>>,
    fileSetter: Dispatch<SetStateAction<File | null>>,
    editingId: number | null,
    setEditingId: Dispatch<SetStateAction<number | null>>,
    kind: "creator" | "team",
  ) => (
    <section className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <form onSubmit={(event) => submitPerson(kind, event)} className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <input value={form.full_name || ""} onChange={(e) => setter((prev) => ({ ...prev, full_name: e.target.value }))} placeholder="Full name" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" />
        <input value={form.role_title || ""} onChange={(e) => setter((prev) => ({ ...prev, role_title: e.target.value }))} placeholder="Role / title" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" />
        <textarea value={form.bio || ""} onChange={(e) => setter((prev) => ({ ...prev, bio: e.target.value }))} placeholder="Bio / description" className="min-h-24 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" />
        <div className="grid gap-3 md:grid-cols-2">
          <input value={form.email || ""} onChange={(e) => setter((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
          <input value={form.phone_number || ""} onChange={(e) => setter((prev) => ({ ...prev, phone_number: e.target.value }))} placeholder="Phone" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
          <input value={form.portfolio_url || ""} onChange={(e) => setter((prev) => ({ ...prev, portfolio_url: e.target.value }))} placeholder="Portfolio / website" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
          <input type="date" value={form.joining_date || ""} onChange={(e) => setter((prev) => ({ ...prev, joining_date: e.target.value }))} className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
          <input type="number" value={form.sort_order || 0} onChange={(e) => setter((prev) => ({ ...prev, sort_order: Number(e.target.value || 0) }))} placeholder="Sort order" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
          <label className="rounded-xl border border-dashed border-gray-300 p-3 text-sm text-gray-700">Photo<input type="file" accept="image/*" className="mt-2 block w-full text-xs" onChange={(e) => fileSetter(e.target.files?.[0] || null)} /></label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input value={form.facebook_url || ""} onChange={(e) => setter((prev) => ({ ...prev, facebook_url: e.target.value }))} placeholder="Facebook URL" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
          <input value={form.instagram_url || ""} onChange={(e) => setter((prev) => ({ ...prev, instagram_url: e.target.value }))} placeholder="Instagram URL" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
          <input value={form.x_url || ""} onChange={(e) => setter((prev) => ({ ...prev, x_url: e.target.value }))} placeholder="X URL" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
          <input value={form.linkedin_url || ""} onChange={(e) => setter((prev) => ({ ...prev, linkedin_url: e.target.value }))} placeholder="LinkedIn URL" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs font-bold uppercase text-gray-500">Departments</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {departmentBadges.map((badge) => (
              <button key={badge.id} type="button" onClick={() => toggleDepartment(form, setter, badge.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${(form.department_ids || []).includes(badge.id) ? "bg-primary text-white" : "bg-gray-100 text-gray-700"}`}>
                {badge.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["is_active", "is_featured", "is_published"] as const).map((field) => (
            <label key={field} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-xs font-semibold text-gray-700">
              <input type="checkbox" checked={Boolean(form[field])} onChange={(e) => setter((prev) => ({ ...prev, [field]: e.target.checked }))} />
              {field.replace("is_", "")}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white">{editingId ? "Update" : "Create"} {title}</button>
          {editingId ? <button type="button" onClick={() => { setter(emptyPerson); setEditingId(null); }} className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700">Cancel</button> : null}
        </div>
      </form>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
            <div>
              <p className="font-semibold text-gray-900">{item.full_name}</p>
              <p className="mt-1 text-sm text-gray-600">{item.role_title}</p>
              <p className="mt-1 text-xs text-gray-500">{item.departments.map((dept) => dept.name).join(", ") || "No departments"} | sort {item.sort_order}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={kind === "creator" ? `/creators/${item.slug}` : `/our-team/${item.slug}`} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">Preview</Link>
                <button type="button" onClick={() => { setEditingId(item.id); setter(personToForm(item)); }} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">Edit</button>
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={async () => {
                if (!token) return;
                if (kind === "creator") {
                  const updated = await updateAdminCreator(token, item.id, { is_published: !item.is_published, is_featured: item.is_featured });
                  setCreators((prev) => prev.map((row) => (row.id === item.id ? updated : row)));
                } else {
                  const updated = await updateAdminTeamMember(token, item.id, { is_published: !item.is_published, is_featured: item.is_featured });
                  setTeamMembers((prev) => prev.map((row) => (row.id === item.id ? updated : row)));
                }
              }} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{item.is_published ? "Unpublish" : "Publish"}</button>
              <button type="button" onClick={async () => {
                if (!token) return;
                if (kind === "creator") {
                  await deleteAdminCreator(token, item.id);
                  setCreators((prev) => prev.filter((row) => row.id !== item.id));
                } else {
                  await deleteAdminTeamMember(token, item.id);
                  setTeamMembers((prev) => prev.filter((row) => row.id !== item.id));
                }
              }} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  if (!isAuthenticated || userRole !== "admin" || !canManage) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar active="content" />
      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="rounded-2xl border border-gray-200 bg-white p-5">
          <h1 className="text-2xl font-black text-gray-900">Content Desk</h1>
          <p className="mt-1 text-sm text-gray-600">Manage company content, creators, team members, and departments.</p>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}

        {loading ? <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading content data...</div> : null}

        {!loading ? (
          <>
            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-gray-900">My Company</h2>
                  <p className="text-sm text-gray-600">This appears first on the Creators page.</p>
                </div>
                <Link href="/creators" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">Preview Creators Page</Link>
              </div>
              <form onSubmit={submitCompany} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <input value={companyForm.company_name || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, company_name: e.target.value }))} placeholder="Company name" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <input value={companyForm.category || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, category: e.target.value }))} placeholder="Industry / category" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <input value={companyForm.email || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <input value={companyForm.phone_number || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, phone_number: e.target.value }))} placeholder="Phone" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <input value={companyForm.website_url || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, website_url: e.target.value }))} placeholder="Website URL" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <input value={companyForm.location || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, location: e.target.value }))} placeholder="Location" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <input value={companyForm.address || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" className="rounded-xl border border-gray-300 px-4 py-3 text-sm md:col-span-2" />
                </div>
                <textarea value={companyForm.description || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, description: e.target.value }))} placeholder="Company description" className="min-h-28 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                <textarea value={companyForm.mission_vision || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, mission_vision: e.target.value }))} placeholder="Mission / vision" className="min-h-24 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                <div className="grid gap-4 md:grid-cols-3">
                  <input value={companyForm.facebook_url || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, facebook_url: e.target.value }))} placeholder="Facebook URL" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <input value={companyForm.instagram_url || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, instagram_url: e.target.value }))} placeholder="Instagram URL" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <input value={companyForm.linkedin_url || ""} onChange={(e) => setCompanyForm((p) => ({ ...p, linkedin_url: e.target.value }))} placeholder="LinkedIn URL" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  <input type="number" value={companyForm.year_founded ?? ""} onChange={(e) => setCompanyForm((p) => ({ ...p, year_founded: e.target.value ? Number(e.target.value) : null }))} placeholder="Year founded" className="rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <label className="rounded-xl border border-dashed border-gray-300 p-3 text-sm text-gray-700">Logo<input type="file" accept="image/*" className="mt-2 block w-full text-xs" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} /></label>
                  <label className="rounded-xl border border-dashed border-gray-300 p-3 text-sm text-gray-700">Banner<input type="file" accept="image/*" className="mt-2 block w-full text-xs" onChange={(e) => setBannerFile(e.target.files?.[0] || null)} /></label>
                  <label className="rounded-xl border border-dashed border-gray-300 p-3 text-sm text-gray-700">Media<input type="file" accept="image/*" multiple className="mt-2 block w-full text-xs" onChange={(e) => setMediaFiles(Array.from(e.target.files || []))} /></label>
                </div>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-sm"><input type="checkbox" checked={Boolean(companyForm.is_active)} onChange={(e) => setCompanyForm((p) => ({ ...p, is_active: e.target.checked }))} /> Active</label>
                  <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-3 text-sm"><input type="checkbox" checked={Boolean(companyForm.is_published)} onChange={(e) => setCompanyForm((p) => ({ ...p, is_published: e.target.checked }))} /> Published</label>
                  <button type="submit" disabled={saving} className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white">{saving ? "Saving..." : "Save Company"}</button>
                </div>
                {company?.featured_media?.length ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-sm font-bold text-gray-900">Uploaded Company Media</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {company.featured_media.map((media) => (
                        <button key={media.id} type="button" onClick={async () => { if (!token) return; await deleteAdminCompanyMedia(token, media.id); setCompany((prev) => prev ? { ...prev, featured_media: prev.featured_media.filter((item) => item.id !== media.id) } : prev); }} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700">
                          Delete {media.caption || `Media ${media.id}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </form>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-xl font-black text-gray-900">Departments</h2>
              <div className="mt-4 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
                <form onSubmit={submitDepartment} className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <input value={departmentForm.name} onChange={(e) => setDepartmentForm((p) => ({ ...p, name: e.target.value }))} placeholder="Department name" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <textarea value={departmentForm.description} onChange={(e) => setDepartmentForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" className="min-h-24 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <input type="number" value={departmentForm.sort_order} onChange={(e) => setDepartmentForm((p) => ({ ...p, sort_order: Number(e.target.value || 0) }))} placeholder="Sort order" className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm" />
                  <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm"><input type="checkbox" checked={departmentForm.is_active} onChange={(e) => setDepartmentForm((p) => ({ ...p, is_active: e.target.checked }))} /> Active</label>
                  <button type="submit" className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white">{editingDepartmentId ? "Update Department" : "Create Department"}</button>
                </form>
                <div className="space-y-3">
                  {departments.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 p-4">
                      <div>
                        <p className="font-semibold text-gray-900">{item.name}</p>
                        <p className="mt-1 text-sm text-gray-600">{item.description || "No description"}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setEditingDepartmentId(item.id); setDepartmentForm({ name: item.name, description: item.description || "", is_active: item.is_active, sort_order: item.sort_order }); }} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">Edit</button>
                        <button type="button" onClick={async () => { if (!token) return; await deleteAdminDepartment(token, item.id); setDepartments((prev) => prev.filter((row) => row.id !== item.id)); }} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-black text-gray-900">Creators</h2>
                <Link href="/creators" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">Open Public Page</Link>
              </div>
              {renderPersonSection("Creator", creators, creatorForm, setCreatorForm, setCreatorPhoto, editingCreatorId, setEditingCreatorId, "creator")}
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-black text-gray-900">Our Team</h2>
                <Link href="/our-team" className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700">Open Public Page</Link>
              </div>
              {renderPersonSection("Team Member", teamMembers, teamForm, setTeamForm, setTeamPhoto, editingTeamId, setEditingTeamId, "team")}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
