"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../../src/context/AuthContext";
import {
  PickupOrderSummary,
  PickupStation,
  downloadReceiptPdf,
  generateReceiptForTransaction,
  getMyStationOperationOrders,
  getMyStationOperationStations,
  markStationOrderCollected,
  markStationOrderReady,
  markStationOrderReturnDropoff,
  updateMyStationOperationalSettings,
  updateStationNotice,
} from "../../src/services/api";

function formatMoney(value: string): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", currencyDisplay: "code", maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function StationOperationsPage() {
  const router = useRouter();
  const { isAuthenticated, token, userRole, vendorIsApproved, canAccessAdminModule, hasAdminPermission } = useAuth();

  const canOperate =
    (userRole === "admin" &&
      canAccessAdminModule("pickup") &&
      (hasAdminPermission("pickup.operations") || hasAdminPermission("pickup.manage"))) ||
    (userRole === "vendor" && vendorIsApproved);

  const [stations, setStations] = useState<PickupStation[]>([]);
  const [orders, setOrders] = useState<PickupOrderSummary[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [noticeDraft, setNoticeDraft] = useState("");
  const [servicesDraft, setServicesDraft] = useState("");
  const [supportsPickupDraft, setSupportsPickupDraft] = useState(true);
  const [supportsReturnsDraft, setSupportsReturnsDraft] = useState(true);
  const [receiptBusyOrderId, setReceiptBusyOrderId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!canOperate) {
      router.push(userRole === "vendor" ? "/vendor" : "/admin");
    }
  }, [isAuthenticated, canOperate, userRole, router]);

  const loadStations = useCallback(async () => {
    if (!token || !canOperate) return;
    setIsLoading(true);
    setError("");
    try {
      const stationData = await getMyStationOperationStations(token);
      setStations(stationData);
      if (stationData.length > 0 && !selectedStationId) {
        setSelectedStationId(stationData[0].id);
        setNoticeDraft(stationData[0].temporary_notice || "");
        setServicesDraft((stationData[0].services || []).join(", "));
        setSupportsPickupDraft(Boolean(stationData[0].supports_pickup));
        setSupportsReturnsDraft(Boolean(stationData[0].supports_returns));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load assigned stations.");
    } finally {
      setIsLoading(false);
    }
  }, [token, canOperate, selectedStationId]);

  const loadOrders = useCallback(async () => {
    if (!token || !canOperate) return;
    setIsLoading(true);
    setError("");
    try {
      const orderData = await getMyStationOperationOrders(token, {
        station_id: typeof selectedStationId === "number" ? selectedStationId : undefined,
        status: statusFilter || undefined,
      });
      setOrders(orderData);
    } catch (err: any) {
      setError(err?.message || "Failed to load pickup orders.");
    } finally {
      setIsLoading(false);
    }
  }, [token, canOperate, selectedStationId, statusFilter]);

  useEffect(() => {
    if (isAuthenticated && token && canOperate) {
      loadStations();
    }
  }, [isAuthenticated, token, canOperate, loadStations]);

  useEffect(() => {
    if (isAuthenticated && token && canOperate) {
      loadOrders();
    }
  }, [isAuthenticated, token, canOperate, loadOrders]);

  const selectedStation = useMemo(
    () => stations.find((station) => station.id === selectedStationId) || null,
    [stations, selectedStationId],
  );

  const runOrderAction = async (
    action: "ready" | "collect" | "return",
    orderId: number,
  ) => {
    if (!token) return;
    const notes = window.prompt("Optional notes for this action:", "") || "";
    setIsWorking(true);
    setError("");
    setSuccess("");
    try {
      if (action === "ready") {
        await markStationOrderReady(token, orderId, notes);
        setSuccess("Order marked as ready for pickup.");
      } else if (action === "collect") {
        await markStationOrderCollected(token, orderId, notes);
        setSuccess("Order marked as collected.");
      } else {
        await markStationOrderReturnDropoff(token, orderId, notes);
        setSuccess("Return drop-off recorded.");
      }
      await loadOrders();
    } catch (err: any) {
      setError(err?.message || "Failed to run station action.");
    } finally {
      setIsWorking(false);
    }
  };

  const generateReceipt = async (orderId: number) => {
    if (!token) return;
    setReceiptBusyOrderId(orderId);
    setError("");
    setSuccess("");
    try {
      const receipt = await generateReceiptForTransaction(token, { entity_type: "order", entity_id: orderId });
      await downloadReceiptPdf(token, receipt.id, receipt.receipt_number);
      setSuccess(`Receipt ${receipt.receipt_number} downloaded.`);
    } catch (err: any) {
      setError(err?.message || "Failed to generate receipt.");
    } finally {
      setReceiptBusyOrderId(null);
    }
  };

  const saveNotice = async () => {
    if (!token || typeof selectedStationId !== "number") return;
    setIsWorking(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateStationNotice(token, selectedStationId, noticeDraft);
      setStations((prev) => prev.map((station) => (station.id === updated.id ? updated : station)));
      setSuccess("Station notice updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to update station notice.");
    } finally {
      setIsWorking(false);
    }
  };

  const saveOperationalSettings = async () => {
    if (!token || typeof selectedStationId !== "number") return;
    setIsWorking(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateMyStationOperationalSettings(token, selectedStationId, {
        services: servicesDraft
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
        supports_pickup: supportsPickupDraft,
        supports_returns: supportsReturnsDraft,
      });
      setStations((prev) => prev.map((station) => (station.id === updated.id ? updated : station)));
      setSuccess("Station operational settings updated.");
    } catch (err: any) {
      setError(err?.message || "Failed to update station operational settings.");
    } finally {
      setIsWorking(false);
    }
  };

  if (!isAuthenticated || !canOperate) return null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black text-gray-900">Station Operations Portal</h1>
              <p className="mt-1 text-sm text-gray-600">Run pickup readiness, collection, return drop-offs, and branch notices.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={loadOrders} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                Refresh Orders
              </button>
              {userRole === "admin" ? (
                <>
                  <Link href="/admin/pickup-stations" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                    Open Central Pickup Admin
                  </Link>
                  <Link href="/admin/receipts" className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                    Receipt Center
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/vendor/profile" className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover">
                    Open Store Profile
                  </Link>
                  <Link href="/vendor/receipts" className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                    Receipt Center
                  </Link>
                </>
              )}
            </div>
          </div>
        </header>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_2fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-bold text-gray-900">Assigned Station</h2>
              <select
                value={selectedStationId}
                onChange={(event) => {
                  const next = event.target.value ? Number(event.target.value) : "";
                  setSelectedStationId(next);
                  const selected = stations.find((station) => station.id === Number(next));
                  setNoticeDraft(selected?.temporary_notice || "");
                  setServicesDraft((selected?.services || []).join(", "));
                  setSupportsPickupDraft(Boolean(selected?.supports_pickup));
                  setSupportsReturnsDraft(Boolean(selected?.supports_returns));
                }}
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name} ({station.city})
                  </option>
                ))}
              </select>
              {selectedStation ? (
                <div className="mt-3 space-y-1 text-xs text-gray-600">
                  <p>{selectedStation.address}</p>
                  <p>{selectedStation.operating_hours}</p>
                  <p>{selectedStation.contact_phone}</p>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-bold text-gray-900">Temporary Notice</h2>
              <textarea
                value={noticeDraft}
                onChange={(event) => setNoticeDraft(event.target.value)}
                placeholder="Set delay alerts, early closure notes, or service messages..."
                className="mt-3 min-h-24 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={saveNotice}
                disabled={isWorking || typeof selectedStationId !== "number"}
                className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                Save Notice
              </button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="text-lg font-bold text-gray-900">Operational Settings</h2>
              <input
                value={servicesDraft}
                onChange={(event) => setServicesDraft(event.target.value)}
                placeholder="Services (comma-separated)"
                className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-700">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={supportsPickupDraft}
                    onChange={(event) => setSupportsPickupDraft(event.target.checked)}
                  />
                  Supports pickup
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={supportsReturnsDraft}
                    onChange={(event) => setSupportsReturnsDraft(event.target.checked)}
                  />
                  Supports returns/drop-offs
                </label>
              </div>
              <button
                type="button"
                onClick={saveOperationalSettings}
                disabled={isWorking || typeof selectedStationId !== "number"}
                className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
              >
                Save Operational Settings
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-gray-900">Pickup Orders</h2>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-xs"
                >
                  <option value="">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Processing">Processing</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {isLoading ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-b-4 border-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 font-semibold text-gray-600">Order</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Customer</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Total</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Ready At</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Collected At</th>
                      <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-4 py-3 text-gray-900">{order.order_number}</td>
                        <td className="px-4 py-3 text-gray-700">{order.customer_email}</td>
                        <td className="px-4 py-3 text-gray-700">{order.status}</td>
                        <td className="px-4 py-3 text-gray-700">{formatMoney(order.total_amount)}</td>
                        <td className="px-4 py-3 text-gray-600">{order.pickup_ready_at ? new Date(order.pickup_ready_at).toLocaleString() : "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{order.picked_up_at ? new Date(order.picked_up_at).toLocaleString() : "-"}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => runOrderAction("ready", order.id)}
                              disabled={isWorking || order.status === "Cancelled"}
                              className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                            >
                              Ready
                            </button>
                            <button
                              type="button"
                              onClick={() => runOrderAction("collect", order.id)}
                              disabled={isWorking || order.status === "Cancelled"}
                              className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              Collected
                            </button>
                            <button
                              type="button"
                              onClick={() => runOrderAction("return", order.id)}
                              disabled={isWorking}
                              className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                            >
                              Return Drop-off
                            </button>
                            <button
                              type="button"
                              onClick={() => generateReceipt(order.id)}
                              disabled={receiptBusyOrderId === order.id}
                              className="rounded-lg border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                            >
                              {receiptBusyOrderId === order.id ? "Generating..." : "Receipt"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-sm text-gray-500">
                          No pickup orders match this station/status filter.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
