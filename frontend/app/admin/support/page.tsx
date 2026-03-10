"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../../src/context/AuthContext";
import {
  SupportCategoryKey,
  SupportEntryType,
  SupportKnowledgeBaseEntry,
  SupportTicketDetail,
  SupportTicketStatus,
  SupportTicketSummary,
  createAdminSupportKnowledgeEntry,
  deleteAdminSupportKnowledgeEntry,
  getAdminSupportKnowledgeBase,
  getAdminSupportTicketDetail,
  getAdminSupportTickets,
  replyAdminSupportTicket,
  updateAdminSupportKnowledgeEntry,
  updateAdminSupportTicket,
} from "../../../src/services/api";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";

type TabKey = "tickets" | "knowledge";

const EMPTY_KB_FORM = {
  title: "",
  category: "general" as SupportCategoryKey,
  entry_type: "faq" as SupportEntryType,
  short_answer: "",
  content: "",
  sort_order: 1,
  is_published: true,
};

export default function AdminSupportPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, hasAdminPermission, canAccessAdminModule } = useAuth();
  const canViewTickets = canAccessAdminModule("support") && hasAdminPermission("support.view");
  const canReplyTickets = hasAdminPermission("support.reply");
  const canManageHelpCenter = hasAdminPermission("helpcenter.manage");
  const canViewSupportPage = canViewTickets || canManageHelpCenter;

  const [tab, setTab] = useState<TabKey>("tickets");

  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketDetail | null>(null);
  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyStatus, setReplyStatus] = useState<SupportTicketStatus | "">("");
  const [adminNotes, setAdminNotes] = useState("");

  const [knowledgeEntries, setKnowledgeEntries] = useState<SupportKnowledgeBaseEntry[]>([]);
  const [knowledgeCategories, setKnowledgeCategories] = useState<Array<{ key: string; label: string }>>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeCategory, setKnowledgeCategory] = useState("");
  const [knowledgeType, setKnowledgeType] = useState("");
  const [knowledgeForm, setKnowledgeForm] = useState(EMPTY_KB_FORM);
  const [editingKnowledgeId, setEditingKnowledgeId] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canViewSupportPage) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, router, canViewSupportPage]);

  useEffect(() => {
    if (!canViewTickets) {
      setTab("knowledge");
    }
  }, [canViewTickets]);

  const loadTickets = useCallback(async () => {
    if (!token || !canViewTickets) {
      setTickets([]);
      setSelectedTicketId(null);
      setSelectedTicket(null);
      setAdminNotes("");
      return;
    }
    const data = await getAdminSupportTickets(token, ticketQuery, ticketStatusFilter);
    setTickets(data);
    if (data.length === 0) {
      setSelectedTicketId(null);
      setSelectedTicket(null);
      setAdminNotes("");
      return;
    }
    const preferredId = selectedTicketId && data.some((item) => item.id === selectedTicketId) ? selectedTicketId : data[0].id;
    setSelectedTicketId(preferredId);
    const detail = await getAdminSupportTicketDetail(token, preferredId);
    setSelectedTicket(detail);
    setAdminNotes(detail.admin_notes || "");
  }, [token, ticketQuery, ticketStatusFilter, selectedTicketId, canViewTickets]);

  const loadKnowledge = useCallback(async () => {
    if (!token || (!canViewTickets && !canManageHelpCenter)) return;
    const data = await getAdminSupportKnowledgeBase(token, knowledgeQuery, knowledgeCategory, knowledgeType);
    setKnowledgeEntries(data.entries);
    setKnowledgeCategories(data.categories);
  }, [token, knowledgeQuery, knowledgeCategory, knowledgeType, canViewTickets, canManageHelpCenter]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const jobs: Promise<void>[] = [];
      if (canViewTickets) jobs.push(loadTickets());
      if (canViewTickets || canManageHelpCenter) jobs.push(loadKnowledge());
      await Promise.all(jobs);
    } catch (err: any) {
      setError(err?.message || "Failed to load support admin data.");
    } finally {
      setLoading(false);
    }
  }, [token, loadTickets, loadKnowledge, canViewTickets, canManageHelpCenter]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canViewSupportPage) {
      loadAll();
    }
  }, [isAuthenticated, token, userRole, loadAll, canViewSupportPage]);

  const counts = useMemo(
    () => ({
      pending: tickets.filter((item) => item.status === "pending").length,
      inProgress: tickets.filter((item) => item.status === "in_progress").length,
      resolved: tickets.filter((item) => item.status === "resolved").length,
    }),
    [tickets],
  );

  const isProductReportTicket = (selectedTicket?.subject || "").toLowerCase().includes("[product report]");
  const isAffiliateTicket = (selectedTicket?.subject || "").toLowerCase().includes("[affiliate application]");

  const openTicket = async (ticketId: number) => {
    if (!token || !canViewTickets) return;
    setSaving(true);
    setError("");
    try {
      const detail = await getAdminSupportTicketDetail(token, ticketId);
      setSelectedTicketId(ticketId);
      setSelectedTicket(detail);
      setAdminNotes(detail.admin_notes || "");
      setReplyStatus("");
      setReplyText("");
    } catch (err: any) {
      setError(err?.message || "Unable to load ticket detail.");
    } finally {
      setSaving(false);
    }
  };

  const saveTicketNotes = async () => {
    if (!token || !selectedTicket || !canReplyTickets) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateAdminSupportTicket(token, selectedTicket.id, { admin_notes: adminNotes });
      setSelectedTicket(updated);
      setTickets((prev) =>
        prev.map((item) => (item.id === updated.id ? { ...item, admin_notes: updated.admin_notes, status: updated.status } : item)),
      );
      setSuccess(`Notes saved for ticket #${updated.id}.`);
    } catch (err: any) {
      setError(err?.message || "Failed to save admin notes.");
    } finally {
      setSaving(false);
    }
  };

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !selectedTicket || !replyText.trim() || !canReplyTickets) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await replyAdminSupportTicket(token, selectedTicket.id, {
        message: replyText.trim(),
        status: replyStatus || undefined,
      });
      setSelectedTicket(updated);
      setTickets((prev) =>
        prev.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                status: updated.status,
                updated_at: updated.updated_at,
                last_message: updated.messages[updated.messages.length - 1]?.content || item.last_message,
                message_count: updated.messages.length,
              }
            : item,
        ),
      );
      setReplyText("");
      setReplyStatus("");
      setSuccess("Reply sent successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to send reply.");
    } finally {
      setSaving(false);
    }
  };

  const submitKnowledgeSearch = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await loadKnowledge();
    } catch (err: any) {
      setError(err?.message || "Failed to search help center entries.");
    }
  };

  const submitKnowledgeForm = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManageHelpCenter) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editingKnowledgeId) {
        const updated = await updateAdminSupportKnowledgeEntry(token, editingKnowledgeId, knowledgeForm);
        setKnowledgeEntries((prev) => prev.map((entry) => (entry.id === editingKnowledgeId ? updated : entry)));
        setSuccess("Help Center entry updated.");
      } else {
        const created = await createAdminSupportKnowledgeEntry(token, knowledgeForm);
        setKnowledgeEntries((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
        setSuccess("Help Center entry created.");
      }
      setEditingKnowledgeId(null);
      setKnowledgeForm(EMPTY_KB_FORM);
    } catch (err: any) {
      setError(err?.message || "Failed to save help center entry.");
    } finally {
      setSaving(false);
    }
  };

  const editKnowledge = (entry: SupportKnowledgeBaseEntry) => {
    setEditingKnowledgeId(entry.id);
    setKnowledgeForm({
      title: entry.title,
      category: entry.category,
      entry_type: entry.entry_type,
      short_answer: entry.short_answer || "",
      content: entry.content,
      sort_order: entry.sort_order,
      is_published: entry.is_published,
    });
    setTab("knowledge");
  };

  const removeKnowledge = async (entryId: number) => {
    if (!token || !canManageHelpCenter) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await deleteAdminSupportKnowledgeEntry(token, entryId);
      setKnowledgeEntries((prev) => prev.filter((entry) => entry.id !== entryId));
      if (editingKnowledgeId === entryId) {
        setEditingKnowledgeId(null);
        setKnowledgeForm(EMPTY_KB_FORM);
      }
      setSuccess("Help Center entry deleted.");
    } catch (err: any) {
      setError(err?.message || "Failed to delete help center entry.");
    } finally {
      setSaving(false);
    }
  };

  const toggleKnowledgePublish = async (entry: SupportKnowledgeBaseEntry) => {
    if (!token || !canManageHelpCenter) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateAdminSupportKnowledgeEntry(token, entry.id, { is_published: !entry.is_published });
      setKnowledgeEntries((prev) => prev.map((item) => (item.id === entry.id ? updated : item)));
      setSuccess(`Entry ${updated.is_published ? "published" : "unpublished"}.`);
    } catch (err: any) {
      setError(err?.message || "Failed to update publish status.");
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated || userRole !== "admin" || !canViewSupportPage) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar active="support" />

      <main className="flex-1 space-y-6 p-5 pb-24 md:p-8 md:pb-8">
        <header className="bg-white rounded-2xl border border-gray-200 p-5">
          <h1 className="text-2xl font-black text-gray-900">Support Management</h1>
          <p className="text-sm text-gray-600 mt-1">Manage customer support tickets and Help Center content.</p>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div> : null}

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs uppercase text-gray-500 font-bold">Pending</p><p className="text-2xl font-black">{counts.pending}</p></div>
          <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs uppercase text-gray-500 font-bold">In Progress</p><p className="text-2xl font-black">{counts.inProgress}</p></div>
          <div className="bg-white border border-gray-200 rounded-xl p-4"><p className="text-xs uppercase text-gray-500 font-bold">Resolved</p><p className="text-2xl font-black">{counts.resolved}</p></div>
        </section>

        <section className="bg-white rounded-2xl border border-gray-200">
          <div className="border-b border-gray-100 px-5 py-4 flex flex-wrap gap-2">
            {canViewTickets ? (
              <button
                type="button"
                onClick={() => setTab("tickets")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "tickets" ? "bg-primary text-white" : "border border-gray-200 text-gray-700"}`}
              >
                Support Tickets
              </button>
            ) : null}
            {(canViewTickets || canManageHelpCenter) ? (
              <button
                type="button"
                onClick={() => setTab("knowledge")}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === "knowledge" ? "bg-primary text-white" : "border border-gray-200 text-gray-700"}`}
              >
                Help Center Content
              </button>
            ) : null}
          </div>

          {loading ? (
            <div className="p-6 text-sm text-gray-500">Loading support data...</div>
          ) : tab === "tickets" && canViewTickets ? (
            <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] min-h-[560px]">
              <div className="border-r border-gray-100">
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setError("");
                    try {
                      await loadTickets();
                    } catch (err: any) {
                      setError(err?.message || "Failed to filter tickets.");
                    }
                  }}
                  className="p-4 border-b border-gray-100 space-y-2"
                >
                  <input
                    value={ticketQuery}
                    onChange={(event) => setTicketQuery(event.target.value)}
                    placeholder="Search name, email, subject..."
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <select
                      value={ticketStatusFilter}
                      onChange={(event) => setTicketStatusFilter(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">All statuses</option>
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                    <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">Filter</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTicketQuery("[PRODUCT REPORT]");
                        setTicketStatusFilter("");
                      }}
                      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                    >
                      Product Reports
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTicketQuery("[AFFILIATE APPLICATION]");
                        setTicketStatusFilter("");
                      }}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700"
                    >
                      Affiliate Applications
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTicketQuery("");
                        setTicketStatusFilter("");
                      }}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-700"
                    >
                      Clear
                    </button>
                  </div>
                </form>

                <div className="max-h-[500px] overflow-y-auto divide-y divide-gray-100">
                  {tickets.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">No support requests found.</div>
                  ) : (
                    tickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => openTicket(ticket.id)}
                        className={`w-full text-left px-4 py-4 transition-colors ${selectedTicketId === ticket.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                      >
                        <p className="text-sm font-semibold text-gray-900">#{ticket.id} - {ticket.subject}</p>
                        <p className="text-xs text-gray-600 mt-1">{ticket.name} | {ticket.email}</p>
                        <p className="text-xs text-gray-500 mt-1">{ticket.status.replace("_", " ")}</p>
                        {ticket.has_attachments ? <p className="text-[11px] text-primary mt-1">Has attachment</p> : null}
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ticket.last_message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="p-5 space-y-4">
                {!selectedTicket ? (
                  <p className="text-sm text-gray-500">Select a support ticket to read and respond.</p>
                ) : (
                  <>
                    <div className="rounded-xl border border-gray-100 p-4">
                      <p className="font-semibold text-gray-900">#{selectedTicket.id} - {selectedTicket.subject}</p>
                      <p className="text-xs text-gray-500 mt-1">{selectedTicket.name} ({selectedTicket.email})</p>
                      <p className="text-xs text-gray-500 mt-1">Created: {new Date(selectedTicket.created_at).toLocaleString()}</p>
                      <p className="text-xs text-gray-500 mt-1">Status: {selectedTicket.status.replace("_", " ")}</p>
                    </div>

                    {selectedTicket.attachments.length > 0 ? (
                      <div className="rounded-xl border border-gray-100 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Attachments</p>
                        <div className="mt-2 space-y-2">
                          {selectedTicket.attachments.map((attachment) => (
                            <a
                              key={attachment.id}
                              href={attachment.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg border border-gray-200 px-3 py-2 text-sm text-primary hover:bg-blue-50"
                            >
                              {attachment.original_name || `Attachment #${attachment.id}`}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {isProductReportTicket ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Moderation Shortcuts</p>
                        <p className="mt-1 text-xs text-amber-800">
                          Review the reported listing and vendor account using the admin moderation desks below.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link href="/admin/products" className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-amber-800 border border-amber-300">
                            Open Product Desk
                          </Link>
                          <Link href="/admin/vendors" className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-amber-800 border border-amber-300">
                            Open Vendor Desk
                          </Link>
                        </div>
                      </div>
                    ) : null}

                    {isAffiliateTicket ? (
                      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Affiliate Review</p>
                        <p className="mt-1 text-xs text-indigo-800">
                          Validate affiliate details, reply with onboarding steps, and mark status as resolved once approved.
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-gray-100 p-4 max-h-72 overflow-y-auto space-y-3 bg-gray-50">
                      {selectedTicket.messages.map((message) => (
                        <div
                          key={message.id}
                          className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                            message.sender_type === "admin"
                              ? "ml-auto bg-primary text-white"
                              : "mr-auto border border-gray-200 bg-white text-gray-800"
                          }`}
                        >
                          <p className="text-[11px] opacity-80 mb-1 uppercase">{message.sender_type}</p>
                          <p>{message.content}</p>
                          <p className="text-[10px] opacity-70 mt-1">{new Date(message.created_at).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-gray-100 p-4 space-y-3">
                      <label className="block text-xs font-semibold text-gray-600">Admin Notes</label>
                      <textarea
                        value={adminNotes}
                        onChange={(event) => setAdminNotes(event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-20"
                        placeholder="Internal notes for this ticket..."
                      />
                      <button
                        type="button"
                        disabled={saving || !canReplyTickets}
                        onClick={saveTicketNotes}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-60"
                      >
                        Save Notes
                      </button>
                    </div>

                    <form onSubmit={submitReply} className="rounded-xl border border-gray-100 p-4 space-y-3">
                      <label className="block text-xs font-semibold text-gray-600">Reply to Customer</label>
                      <textarea
                        value={replyText}
                        onChange={(event) => setReplyText(event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-24"
                        placeholder="Write your response..."
                        required
                      />
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={replyStatus}
                          onChange={(event) => setReplyStatus(event.target.value as SupportTicketStatus | "")}
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="">Keep current status</option>
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                        <button
                          type="submit"
                          disabled={saving || !canReplyTickets}
                          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
                        >
                          Send Reply
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5 space-y-5">
              <form onSubmit={submitKnowledgeSearch} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <input
                  value={knowledgeQuery}
                  onChange={(event) => setKnowledgeQuery(event.target.value)}
                  placeholder="Search title/content..."
                  className="md:col-span-2 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                <select value={knowledgeCategory} onChange={(event) => setKnowledgeCategory(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">All categories</option>
                  {knowledgeCategories.map((categoryOption) => (
                    <option key={categoryOption.key} value={categoryOption.key}>{categoryOption.label}</option>
                  ))}
                </select>
                <select value={knowledgeType} onChange={(event) => setKnowledgeType(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">All types</option>
                  <option value="faq">FAQ</option>
                  <option value="guide">Guide</option>
                </select>
              </form>

              <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-900">Existing Help Center Entries</h3>
                  </div>
                  <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
                    {knowledgeEntries.length === 0 ? (
                      <div className="p-4 text-sm text-gray-500">No entries found.</div>
                    ) : (
                      knowledgeEntries.map((entry) => (
                        <div key={entry.id} className="p-4 space-y-2">
                          <p className="text-sm font-semibold text-gray-900">{entry.title}</p>
                          <p className="text-xs text-gray-600">{entry.category_label} | {entry.entry_type_label}</p>
                          <p className="text-xs text-gray-500 line-clamp-2">{entry.short_answer || entry.content}</p>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={!canManageHelpCenter} onClick={() => editKnowledge(entry)} className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 disabled:opacity-60">Edit</button>
                            <button type="button" disabled={!canManageHelpCenter} onClick={() => toggleKnowledgePublish(entry)} className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 disabled:opacity-60">
                              {entry.is_published ? "Unpublish" : "Publish"}
                            </button>
                            <button type="button" disabled={!canManageHelpCenter} onClick={() => removeKnowledge(entry.id)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-60">Delete</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <form onSubmit={submitKnowledgeForm} className="rounded-xl border border-gray-100 p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-900">{editingKnowledgeId ? "Edit Entry" : "Create Entry"}</h3>
                  <input
                    value={knowledgeForm.title}
                    onChange={(event) => setKnowledgeForm((prev) => ({ ...prev, title: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Title / Question"
                    required
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <select
                      value={knowledgeForm.category}
                      onChange={(event) => setKnowledgeForm((prev) => ({ ...prev, category: event.target.value as SupportCategoryKey }))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      {knowledgeCategories.map((categoryOption) => (
                        <option key={categoryOption.key} value={categoryOption.key}>{categoryOption.label}</option>
                      ))}
                    </select>
                    <select
                      value={knowledgeForm.entry_type}
                      onChange={(event) => setKnowledgeForm((prev) => ({ ...prev, entry_type: event.target.value as SupportEntryType }))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="faq">FAQ</option>
                      <option value="guide">Guide</option>
                    </select>
                  </div>
                  <input
                    value={knowledgeForm.short_answer}
                    onChange={(event) => setKnowledgeForm((prev) => ({ ...prev, short_answer: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Short answer / summary"
                  />
                  <textarea
                    value={knowledgeForm.content}
                    onChange={(event) => setKnowledgeForm((prev) => ({ ...prev, content: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-32"
                    placeholder="Detailed answer or guide"
                    required
                  />
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="number"
                      min={0}
                      value={knowledgeForm.sort_order}
                      onChange={(event) => setKnowledgeForm((prev) => ({ ...prev, sort_order: Number(event.target.value || 0) }))}
                      className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={knowledgeForm.is_published}
                        onChange={(event) => setKnowledgeForm((prev) => ({ ...prev, is_published: event.target.checked }))}
                      />
                      Published
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving || !canManageHelpCenter} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-60">
                      {editingKnowledgeId ? "Save Changes" : "Create Entry"}
                    </button>
                    {editingKnowledgeId ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingKnowledgeId(null);
                          setKnowledgeForm(EMPTY_KB_FORM);
                        }}
                        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
