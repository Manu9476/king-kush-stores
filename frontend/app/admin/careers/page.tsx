"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/context/AuthContext";
import {
  AdminJobApplication,
  CareerApplicationField,
  CareerJobOpening,
  createAdminCareerFormField,
  createAdminCareerOpening,
  deleteAdminCareerFormField,
  getAdminCareerFormFields,
  getAdminCareerOpenings,
  getAdminJobApplications,
  getBackendFileUrl,
  updateAdminCareerFormField,
  updateAdminCareerOpening,
  updateAdminJobApplication,
} from "../../../src/services/api";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";

const employmentTypeLabel: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  internship: "Internship",
  remote: "Remote",
};

export default function AdminCareersPage() {
  const router = useRouter();
  const { isAuthenticated, token, userEmail, userRole, hasAdminPermission, canAccessAdminModule } = useAuth();
  const canViewCareers =
    canAccessAdminModule("careers") && (hasAdminPermission("careers.view") || hasAdminPermission("careers.manage"));
  const canManageCareers = hasAdminPermission("careers.manage");

  const [applications, setApplications] = useState<AdminJobApplication[]>([]);
  const [fields, setFields] = useState<CareerApplicationField[]>([]);
  const [openings, setOpenings] = useState<CareerJobOpening[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedApplicationId, setSelectedApplicationId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const [newField, setNewField] = useState({
    key: "",
    label: "",
    field_type: "text",
    is_required: false,
    sort_order: 10,
  });

  const [newOpening, setNewOpening] = useState({
    title: "",
    department: "",
    location: "",
    employment_type: "full_time",
    summary: "",
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
    if (isAuthenticated && userRole === "admin" && !canViewCareers) {
      router.push("/admin");
    }
  }, [isAuthenticated, router, userRole, canViewCareers]);

  const loadData = useCallback(
    async (searchText: string = "") => {
      if (!token) return;

      setIsLoading(true);
      setError("");
      try {
        const [applicationData, fieldData, openingData] = await Promise.all([
          getAdminJobApplications(token, searchText),
          getAdminCareerFormFields(token),
          getAdminCareerOpenings(token),
        ]);
        setApplications(applicationData);
        if (applicationData.length > 0) {
          const preferred = selectedApplicationId && applicationData.some((item) => item.id === selectedApplicationId)
            ? selectedApplicationId
            : applicationData[0].id;
          setSelectedApplicationId(preferred);
          const selected = applicationData.find((item) => item.id === preferred);
          setReviewNotes(selected?.admin_notes || "");
        } else {
          setSelectedApplicationId(null);
          setReviewNotes("");
        }
        setFields(fieldData);
        setOpenings(openingData);
      } catch (err: any) {
        setError(err?.message || "Unable to load careers admin data.");
      } finally {
        setIsLoading(false);
      }
    },
    [token, selectedApplicationId],
  );

  useEffect(() => {
    if (isAuthenticated && token && canViewCareers) {
      loadData("");
    }
  }, [isAuthenticated, token, loadData, canViewCareers]);

  const counts = useMemo(() => {
    return {
      pending: applications.filter((item) => item.status === "pending").length,
      reviewed: applications.filter((item) => item.status === "reviewed").length,
      shortlisted: applications.filter((item) => item.status === "shortlisted").length,
      rejected: applications.filter((item) => item.status === "rejected").length,
    };
  }, [applications]);

  const selectedApplication = useMemo(
    () => applications.find((item) => item.id === selectedApplicationId) || null,
    [applications, selectedApplicationId],
  );

  const submitSearch = async (e: FormEvent) => {
    e.preventDefault();
    await loadData(query);
  };

  const updateApplicationStatus = async (applicationId: number, status: AdminJobApplication["status"]) => {
    if (!token) return;
    if (!canManageCareers) return;
    setIsSaving(applicationId);
    setError("");
    setSuccess("");
    try {
      const updated = await updateAdminJobApplication(token, applicationId, { status });
      setApplications((prev) => prev.map((item) => (item.id === applicationId ? updated : item)));
      setSuccess(`Application #${applicationId} updated successfully.`);
    } catch (err: any) {
      setError(err?.message || "Failed to update application.");
    } finally {
      setIsSaving(null);
    }
  };

  const openApplicationReview = (application: AdminJobApplication) => {
    setSelectedApplicationId(application.id);
    setReviewNotes(application.admin_notes || "");
    setError("");
    setSuccess("");
  };

  const saveApplicationNotes = async () => {
    if (!token || !selectedApplication) return;
    if (!canManageCareers) return;
    setIsSaving(selectedApplication.id);
    setError("");
    setSuccess("");
    try {
      const updated = await updateAdminJobApplication(token, selectedApplication.id, { admin_notes: reviewNotes });
      setApplications((prev) => prev.map((item) => (item.id === selectedApplication.id ? updated : item)));
      setSuccess(`Notes saved for application #${selectedApplication.id}.`);
    } catch (err: any) {
      setError(err?.message || "Failed to save review notes.");
    } finally {
      setIsSaving(null);
    }
  };

  const createField = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!canManageCareers) return;
    setError("");
    setSuccess("");
    try {
      const created = await createAdminCareerFormField(token, {
        key: newField.key.trim().toLowerCase(),
        label: newField.label.trim(),
        field_type: newField.field_type as any,
        is_required: newField.is_required,
        sort_order: Number(newField.sort_order),
      });
      setFields((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
      setNewField({ key: "", label: "", field_type: "text", is_required: false, sort_order: 10 });
      setSuccess("Form field created.");
    } catch (err: any) {
      setError(err?.message || "Failed to create form field.");
    }
  };

  const toggleField = async (field: CareerApplicationField, key: "is_active" | "is_required") => {
    if (!token) return;
    if (!canManageCareers) return;
    try {
      const updated = await updateAdminCareerFormField(token, field.id, {
        [key]: !field[key],
      });
      setFields((prev) => prev.map((item) => (item.id === field.id ? updated : item)));
    } catch (err: any) {
      setError(err?.message || "Failed to update form field.");
    }
  };

  const removeField = async (fieldId: number) => {
    if (!token) return;
    if (!canManageCareers) return;
    try {
      await deleteAdminCareerFormField(token, fieldId);
      setFields((prev) => prev.filter((item) => item.id !== fieldId));
    } catch (err: any) {
      setError(err?.message || "Failed to delete form field.");
    }
  };

  const createOpening = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!canManageCareers) return;
    setError("");
    setSuccess("");
    try {
      const created = await createAdminCareerOpening(token, {
        title: newOpening.title.trim(),
        department: newOpening.department.trim(),
        location: newOpening.location.trim(),
        employment_type: newOpening.employment_type as any,
        summary: newOpening.summary.trim(),
      });
      setOpenings((prev) => [created, ...prev]);
      setNewOpening({ title: "", department: "", location: "", employment_type: "full_time", summary: "" });
      setSuccess("Career opening created.");
    } catch (err: any) {
      setError(err?.message || "Failed to create opening.");
    }
  };

  const toggleOpeningActive = async (opening: CareerJobOpening) => {
    if (!token) return;
    if (!canManageCareers) return;
    try {
      const updated = await updateAdminCareerOpening(token, opening.id, { is_active: !opening.is_active });
      setOpenings((prev) => prev.map((item) => (item.id === opening.id ? updated : item)));
    } catch (err: any) {
      setError(err?.message || "Failed to update opening.");
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canViewCareers) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar active="careers" />

      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Careers Management</h1>
            <p className="text-sm text-gray-600 mt-1">Review candidates, update statuses, and manage the application form.</p>
          </div>
          <div className="text-sm text-gray-600 font-medium">{userEmail}</div>
        </header>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}
        {!canManageCareers && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Your role has read-only access to careers data.
          </div>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase font-bold">Pending</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{counts.pending}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase font-bold">Reviewed</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{counts.reviewed}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase font-bold">Shortlisted</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{counts.shortlisted}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase font-bold">Rejected</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{counts.rejected}</p>
          </div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h2 className="text-lg font-bold text-gray-900">Job Applications</h2>
            <form onSubmit={submitSearch} className="flex gap-2 w-full md:w-auto">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by applicant, email, role..."
                className="w-full md:w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button type="submit" className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold hover:bg-primary-hover transition-colors">
                Search
              </button>
            </form>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-gray-600">Loading applications...</div>
          ) : applications.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">No applications found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {applications.map((application) => (
                <div key={application.id} className="p-5 space-y-3 hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">
                        {application.full_name || "Unnamed Applicant"}{" "}
                        <span className="text-sm font-medium text-gray-500">#{application.id}</span>
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {application.email} | {application.phone_number || "No phone"} | {application.country_location || "No location"}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Position: {application.job_opening?.title || "General"} | Applied: {new Date(application.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openApplicationReview(application)}
                        className="rounded-lg border border-primary/30 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
                      >
                        Review Details
                      </button>
                      <select
                        value={application.status}
                        onChange={(e) => updateApplicationStatus(application.id, e.target.value as AdminJobApplication["status"])}
                        disabled={isSaving === application.id || !canManageCareers}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="shortlisted">Shortlisted</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{application.cover_letter || "No cover letter text submitted."}</p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <a
                      href={getBackendFileUrl(application.cv_file)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-primary/30 px-3 py-1.5 text-primary font-semibold hover:bg-primary/5 transition-colors"
                    >
                      Download CV
                    </a>
                    {application.cover_letter_file && (
                      <a
                        href={getBackendFileUrl(application.cover_letter_file)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-primary/30 px-3 py-1.5 text-primary font-semibold hover:bg-primary/5 transition-colors"
                      >
                        Download Cover Letter
                      </a>
                    )}
                    {application.certificates_file && (
                      <a
                        href={getBackendFileUrl(application.certificates_file)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-primary/30 px-3 py-1.5 text-primary font-semibold hover:bg-primary/5 transition-colors"
                      >
                        Download Certificates
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Application Review Panel</h2>
              <p className="text-sm text-gray-600 mt-1">Select an application to review full details, attachments, and notes.</p>
            </div>
          </div>

          {!selectedApplication ? (
            <div className="p-6 text-sm text-gray-500">Click “Review Details” on any application to open its full profile.</div>
          ) : (
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs uppercase text-gray-500 font-bold">Applicant</p>
                  <p className="mt-2 font-semibold text-gray-900">{selectedApplication.full_name || "N/A"}</p>
                  <p className="text-gray-700 mt-1">{selectedApplication.email || "N/A"}</p>
                  <p className="text-gray-700 mt-1">{selectedApplication.phone_number || "N/A"}</p>
                  <p className="text-gray-700 mt-1">{selectedApplication.country_location || "N/A"}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs uppercase text-gray-500 font-bold">Role & Timeline</p>
                  <p className="mt-2 font-semibold text-gray-900">{selectedApplication.job_opening?.title || "General Application"}</p>
                  <p className="text-gray-700 mt-1">Status: {selectedApplication.status}</p>
                  <p className="text-gray-700 mt-1">Applied: {new Date(selectedApplication.created_at).toLocaleString()}</p>
                  <p className="text-gray-700 mt-1">
                    Reviewed: {selectedApplication.reviewed_at ? new Date(selectedApplication.reviewed_at).toLocaleString() : "Not reviewed yet"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs uppercase text-gray-500 font-bold">Experience</p>
                  <p className="mt-2 text-gray-800">{selectedApplication.years_of_experience || "N/A"}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs uppercase text-gray-500 font-bold">Education</p>
                  <p className="mt-2 text-gray-800">{selectedApplication.education_level || "N/A"}</p>
                </div>
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="text-xs uppercase text-gray-500 font-bold">LinkedIn / Portfolio</p>
                  {selectedApplication.linkedin_portfolio ? (
                    <a href={selectedApplication.linkedin_portfolio} target="_blank" rel="noreferrer" className="mt-2 inline-block text-primary font-semibold hover:underline break-all">
                      {selectedApplication.linkedin_portfolio}
                    </a>
                  ) : (
                    <p className="mt-2 text-gray-800">N/A</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase text-gray-500 font-bold">Professional Skills</p>
                <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{selectedApplication.professional_skills || "N/A"}</p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase text-gray-500 font-bold">Cover Letter</p>
                <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{selectedApplication.cover_letter || "N/A"}</p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase text-gray-500 font-bold">Additional Answers</p>
                {Object.entries(selectedApplication.additional_answers || {}).length === 0 ? (
                  <p className="mt-2 text-sm text-gray-600">No additional custom answers.</p>
                ) : (
                  <div className="mt-2 space-y-2 text-sm">
                    {Object.entries(selectedApplication.additional_answers || {}).map(([key, value]) => (
                      <div key={key} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                        <p className="font-semibold text-gray-900">{key}</p>
                        <p className="text-gray-700 mt-1 whitespace-pre-wrap">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <p className="text-xs uppercase text-gray-500 font-bold mb-3">Application Files</p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={getBackendFileUrl(selectedApplication.cv_file)}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-primary/30 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
                  >
                    Open CV
                  </a>
                  {selectedApplication.cover_letter_file && (
                    <a
                      href={getBackendFileUrl(selectedApplication.cover_letter_file)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-primary/30 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
                    >
                      Open Cover Letter File
                    </a>
                  )}
                  {selectedApplication.certificates_file && (
                    <a
                      href={getBackendFileUrl(selectedApplication.certificates_file)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-primary/30 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
                    >
                      Open Certificates
                    </a>
                  )}
                </div>
                <p className="mt-3 text-xs text-gray-500 break-all">CV URL: {getBackendFileUrl(selectedApplication.cv_file)}</p>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <label htmlFor="admin_notes" className="block text-xs uppercase text-gray-500 font-bold mb-2">
                  Internal Review Notes
                </label>
                <textarea
                  id="admin_notes"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-28 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="Add internal notes for this application..."
                />
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={saveApplicationNotes}
                    disabled={isSaving === selectedApplication.id || !canManageCareers}
                    className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60"
                  >
                    {isSaving === selectedApplication.id ? "Saving..." : "Save Notes"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Application Form Fields</h2>
              <p className="text-sm text-gray-600 mt-1">Add, activate, deactivate, require, or remove application fields.</p>
            </div>

            <form onSubmit={createField} className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3 border-b border-gray-100">
              <input
                placeholder="Field key (e.g. github_profile)"
                value={newField.key}
                onChange={(e) => setNewField((prev) => ({ ...prev, key: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <input
                placeholder="Field label"
                value={newField.label}
                onChange={(e) => setNewField((prev) => ({ ...prev, label: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <select
                value={newField.field_type}
                onChange={(e) => setNewField((prev) => ({ ...prev, field_type: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="text">Text</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="number">Number</option>
                <option value="textarea">Textarea</option>
                <option value="url">URL</option>
                <option value="select">Select</option>
              </select>
              <input
                type="number"
                placeholder="Sort Order"
                value={newField.sort_order}
                onChange={(e) => setNewField((prev) => ({ ...prev, sort_order: Number(e.target.value) }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <label className="text-sm text-gray-700 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newField.is_required}
                  onChange={(e) => setNewField((prev) => ({ ...prev, is_required: e.target.checked }))}
                />
                Required
              </label>
              <button type="submit" disabled={!canManageCareers} className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60">
                Add Field
              </button>
            </form>

            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {fields.map((field) => (
                <div key={field.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{field.label}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {field.key} | {field.field_type} | sort: {field.sort_order}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => toggleField(field, "is_required")}
                      disabled={!canManageCareers}
                      className={`px-2.5 py-1.5 rounded-md font-semibold transition-colors ${
                        field.is_required ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-600"
                      } disabled:opacity-60`}
                    >
                      {field.is_required ? "Required" : "Optional"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleField(field, "is_active")}
                      disabled={!canManageCareers}
                      className={`px-2.5 py-1.5 rounded-md font-semibold transition-colors ${
                        field.is_active ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-100 text-gray-600"
                      } disabled:opacity-60`}
                    >
                      {field.is_active ? "Active" : "Inactive"}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeField(field.id)}
                      disabled={!canManageCareers}
                      className="px-2.5 py-1.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-semibold disabled:opacity-60"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">Career Openings</h2>
              <p className="text-sm text-gray-600 mt-1">Manage positions that appear in the application dropdown.</p>
            </div>

            <form onSubmit={createOpening} className="p-5 grid grid-cols-1 gap-3 border-b border-gray-100">
              <input
                placeholder="Job title"
                value={newOpening.title}
                onChange={(e) => setNewOpening((prev) => ({ ...prev, title: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  placeholder="Department"
                  value={newOpening.department}
                  onChange={(e) => setNewOpening((prev) => ({ ...prev, department: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                />
                <input
                  placeholder="Location"
                  value={newOpening.location}
                  onChange={(e) => setNewOpening((prev) => ({ ...prev, location: e.target.value }))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <select
                value={newOpening.employment_type}
                onChange={(e) => setNewOpening((prev) => ({ ...prev, employment_type: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
                <option value="remote">Remote</option>
              </select>
              <textarea
                placeholder="Role summary"
                value={newOpening.summary}
                onChange={(e) => setNewOpening((prev) => ({ ...prev, summary: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-24"
                required
              />
              <button type="submit" disabled={!canManageCareers} className="rounded-lg bg-primary text-white px-4 py-2 text-sm font-semibold hover:bg-primary-hover transition-colors disabled:opacity-60">
                Add Opening
              </button>
            </form>

            <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
              {openings.map((opening) => (
                <div key={opening.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{opening.title}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {opening.department} | {opening.location} | {employmentTypeLabel[opening.employment_type] || opening.employment_type}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleOpeningActive(opening)}
                    disabled={!canManageCareers}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      opening.is_active ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-600"
                    } disabled:opacity-60`}
                  >
                    {opening.is_active ? "Active" : "Inactive"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
