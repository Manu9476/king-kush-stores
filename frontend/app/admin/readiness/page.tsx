"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiClock, FiRefreshCw, FiShield } from "react-icons/fi";
import AdminSidebar from "../../../src/components/admin/AdminSidebar";
import { useAuth } from "../../../src/context/AuthContext";
import {
  AdminProductionReadinessResponse,
  AdminReadinessCheck,
  getAdminProductionReadiness,
} from "../../../src/services/api";

function statusPill(status: AdminReadinessCheck["status"]): string {
  if (status === "pass") return "bg-emerald-100 text-emerald-700";
  if (status === "warning") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

function scoreTone(score: number): string {
  if (score >= 85) return "text-emerald-700";
  if (score >= 65) return "text-amber-700";
  return "text-rose-700";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

export default function AdminReadinessPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, canAccessAdminModule, hasAdminPermission } = useAuth();
  const canViewReadiness = canAccessAdminModule("dashboard") && hasAdminPermission("dashboard.view");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<AdminProductionReadinessResponse | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (userRole && userRole !== "admin") {
      router.push("/");
      return;
    }
    if (isAuthenticated && userRole === "admin" && !canViewReadiness) {
      router.push("/admin");
    }
  }, [isAuthenticated, userRole, canViewReadiness, router]);

  const loadReadiness = useCallback(async () => {
    if (!token || !canViewReadiness) return;
    setLoading(true);
    setError("");
    try {
      const payload = await getAdminProductionReadiness(token);
      setData(payload);
    } catch (err: any) {
      setError(err?.message || "Failed to load production readiness.");
    } finally {
      setLoading(false);
    }
  }, [token, canViewReadiness]);

  useEffect(() => {
    if (isAuthenticated && token && userRole === "admin" && canViewReadiness) {
      loadReadiness();
    }
  }, [isAuthenticated, token, userRole, canViewReadiness, loadReadiness]);

  if (!isAuthenticated || userRole !== "admin" || !canViewReadiness) return null;

  const summary = data?.summary;

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">
      <AdminSidebar active="readiness" />
      <main className="flex-1 overflow-y-auto p-5 pb-24 md:p-8 md:pb-8">
        <header className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Production Readiness Checklist</h1>
              <p className="text-sm text-gray-600">
                Live launch blockers and stability checks across security, payments, commerce, and operations.
              </p>
            </div>
            <button
              type="button"
              onClick={loadReadiness}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-60"
            >
              <FiRefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          {data?.generated_at ? (
            <p className="mt-2 text-xs text-gray-500">Last updated: {formatDateTime(data.generated_at)}</p>
          ) : null}
        </header>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="mt-6 flex h-64 items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-4 border-primary" />
          </div>
        ) : data && summary ? (
          <div className="mt-6 space-y-6">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500">Readiness Score</p>
                <p className={`mt-2 text-2xl font-black ${scoreTone(summary.readiness_score)}`}>{summary.readiness_score}%</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500">Passed</p>
                <p className="mt-2 text-2xl font-black text-emerald-700">{summary.pass_count}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500">Warnings</p>
                <p className="mt-2 text-2xl font-black text-amber-700">{summary.warning_count}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500">Failed</p>
                <p className="mt-2 text-2xl font-black text-rose-700">{summary.fail_count}</p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-gray-500">Launch Status</p>
                <p className={`mt-2 text-base font-black ${summary.is_launch_blocked ? "text-rose-700" : "text-emerald-700"}`}>
                  {summary.is_launch_blocked ? "Blocked" : "Ready"}
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-700">
                  <FiAlertTriangle className="h-4 w-4 text-rose-600" />
                  Top Blockers
                </h2>
                {data.top_blockers.length === 0 ? (
                  <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-700">No hard blockers detected.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {data.top_blockers.map((check) => (
                      <div key={check.key} className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-3">
                        <p className="text-sm font-semibold text-rose-800">{check.label}</p>
                        <p className="mt-1 text-xs text-rose-700">{check.detail}</p>
                        {check.action ? <p className="mt-1 text-xs text-rose-800">Action: {check.action}</p> : null}
                        {check.fix_path ? (
                          check.fix_path.startsWith("/") ? (
                            <Link href={check.fix_path} className="mt-2 inline-block text-xs font-semibold text-primary hover:text-primary-hover">
                              Open {check.fix_path}
                            </Link>
                          ) : (
                            <p className="mt-2 text-xs text-gray-700">File: <code>{check.fix_path}</code></p>
                          )
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-700">
                  <FiShield className="h-4 w-4 text-primary" />
                  Environment Snapshot
                </h2>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Debug</p>
                    <p className={`mt-1 text-sm font-bold ${data.environment.debug ? "text-rose-700" : "text-emerald-700"}`}>
                      {String(data.environment.debug)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Payout Mode</p>
                    <p className="mt-1 text-sm font-bold text-gray-800">{data.environment.payout_mode}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">M-Pesa Live</p>
                    <p className={`mt-1 text-sm font-bold ${data.environment.mpesa_live_enabled ? "text-emerald-700" : "text-amber-700"}`}>
                      {String(data.environment.mpesa_live_enabled)}
                    </p>
                  </div>
                </div>
                <p className="mt-4 inline-flex items-center gap-1 text-xs text-gray-500">
                  <FiClock className="h-3.5 w-3.5" />
                  Checks are computed live from the backend at refresh time.
                </p>
              </div>
            </section>

            {data.sections.map((section) => (
              <section key={section.key} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <h3 className="text-base font-black text-gray-900">{section.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{section.description}</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[920px] text-left">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-500">
                        <th className="px-2 py-2">Check</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Metric</th>
                        <th className="px-2 py-2">Detail</th>
                        <th className="px-2 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.checks.map((check) => (
                        <tr key={check.key} className="border-b border-gray-50 align-top">
                          <td className="px-2 py-3 text-sm font-semibold text-gray-900">{check.label}</td>
                          <td className="px-2 py-3">
                            <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${statusPill(check.status)}`}>
                              {check.status === "pass" ? (
                                <span className="inline-flex items-center gap-1"><FiCheckCircle className="h-3.5 w-3.5" />Pass</span>
                              ) : check.status === "warning" ? (
                                "Warning"
                              ) : (
                                "Fail"
                              )}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-xs text-gray-600">{check.metric || "-"}</td>
                          <td className="px-2 py-3 text-xs text-gray-700">{check.detail}</td>
                          <td className="px-2 py-3 text-xs text-gray-700">
                            {check.action ? <p>{check.action}</p> : null}
                            {check.fix_path ? (
                              check.fix_path.startsWith("/") ? (
                                <Link href={check.fix_path} className="mt-1 inline-block font-semibold text-primary hover:text-primary-hover">
                                  Open {check.fix_path}
                                </Link>
                              ) : (
                                <p className="mt-1">
                                  File: <code>{check.fix_path}</code>
                                </p>
                              )
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}
