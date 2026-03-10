"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiActivity,
  FiBell,
  FiBriefcase,
  FiCheckCircle,
  FiCommand,
  FiDollarSign,
  FiFileText,
  FiGrid,
  FiHeadphones,
  FiMapPin,
  FiPackage,
  FiSearch,
  FiSettings,
  FiShield,
  FiZap,
} from "react-icons/fi";
import { useAuth } from "../../context/AuthContext";

type AdminSidebarProps = {
  active:
    | "dashboard"
    | "readiness"
    | "finance"
    | "receipts"
    | "vendors"
    | "products"
    | "careers"
    | "support"
    | "staff"
    | "advertising"
    | "promotions"
    | "moderation"
    | "pickup";
};

type NavItem = {
  key: AdminSidebarProps["active"];
  href: string;
  label: string;
  description: string;
  module: string;
  group: "core" | "operations" | "people";
  icon: React.ComponentType<{ className?: string }>;
};

type CommandItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    href: "/admin",
    label: "Dashboard",
    description: "Overview and system health",
    module: "dashboard",
    group: "core",
    icon: FiGrid,
  },
  {
    key: "readiness",
    href: "/admin/readiness",
    label: "Readiness",
    description: "Live launch blockers and quality checks",
    module: "dashboard",
    group: "core",
    icon: FiCheckCircle,
  },
  {
    key: "finance",
    href: "/admin/finance",
    label: "Finance",
    description: "Payments, commissions, payouts",
    module: "finance",
    group: "operations",
    icon: FiDollarSign,
  },
  {
    key: "receipts",
    href: "/admin/receipts",
    label: "Receipts",
    description: "Transaction and operations proof center",
    module: "receipts",
    group: "operations",
    icon: FiFileText,
  },
  {
    key: "vendors",
    href: "/admin/vendors",
    label: "Vendors",
    description: "Approvals and seller management",
    module: "vendors",
    group: "operations",
    icon: FiBriefcase,
  },
  {
    key: "products",
    href: "/admin/products",
    label: "Products",
    description: "Catalog and listing quality",
    module: "products",
    group: "operations",
    icon: FiPackage,
  },
  {
    key: "pickup",
    href: "/admin/pickup-stations",
    label: "Pickup",
    description: "Stations, assignments, operations",
    module: "pickup",
    group: "operations",
    icon: FiMapPin,
  },
  {
    key: "advertising",
    href: "/admin/advertising",
    label: "Advertising",
    description: "Ad requests, campaigns, analytics",
    module: "advertising",
    group: "operations",
    icon: FiBell,
  },
  {
    key: "promotions",
    href: "/admin/promotions",
    label: "Promotions",
    description: "Black Friday and sale campaigns",
    module: "promotions",
    group: "operations",
    icon: FiZap,
  },
  {
    key: "support",
    href: "/admin/support",
    label: "Support",
    description: "Tickets and help center",
    module: "support",
    group: "people",
    icon: FiHeadphones,
  },
  {
    key: "moderation",
    href: "/admin/moderation",
    label: "Moderation",
    description: "Reported products and enforcement",
    module: "moderation",
    group: "operations",
    icon: FiShield,
  },
  {
    key: "careers",
    href: "/admin/careers",
    label: "Careers",
    description: "Openings and applications",
    module: "careers",
    group: "people",
    icon: FiActivity,
  },
  {
    key: "staff",
    href: "/admin/staff",
    label: "Staff & Roles",
    description: "RBAC and team permissions",
    module: "staff",
    group: "people",
    icon: FiShield,
  },
];

const GROUP_LABELS: Record<NavItem["group"], string> = {
  core: "Core",
  operations: "Operations",
  people: "Team & Support",
};

export default function AdminSidebar({ active }: AdminSidebarProps) {
  const router = useRouter();
  const { canAccessAdminModule, isSuperAdmin } = useAuth();
  const [filter, setFilter] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const paletteInputRef = useRef<HTMLInputElement | null>(null);

  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => isSuperAdmin || canAccessAdminModule(item.module)),
    [canAccessAdminModule, isSuperAdmin],
  );

  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return visibleItems;
    return visibleItems.filter((item) => {
      const haystack = `${item.label} ${item.description}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleItems, filter]);

  const grouped = useMemo(() => {
    const groupedMap: Record<NavItem["group"], NavItem[]> = {
      core: [],
      operations: [],
      people: [],
    };
    filteredItems.forEach((item) => groupedMap[item.group].push(item));
    return groupedMap;
  }, [filteredItems]);

  const commands = useMemo<CommandItem[]>(
    () => [
      ...visibleItems.map((item) => ({
        id: `module-${item.key}`,
        label: item.label,
        description: item.description,
        href: item.href,
        keywords: `${item.label} ${item.description} ${item.module}`,
        icon: item.icon,
      })),
      {
        id: "module-admin-home",
        label: "Admin Home",
        description: "Go to admin dashboard overview",
        href: "/admin",
        keywords: "admin home dashboard overview",
        icon: FiGrid,
      },
      {
        id: "module-store",
        label: "Back to Store",
        description: "Open storefront",
        href: "/",
        keywords: "store home website",
        icon: FiSettings,
      },
    ],
    [visibleItems],
  );

  const paletteResults = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((command) => `${command.label} ${command.description} ${command.keywords}`.toLowerCase().includes(q));
  }, [commands, paletteQuery]);

  const openPalette = () => {
    setPaletteOpen(true);
    setPaletteQuery("");
    setPaletteIndex(0);
  };

  const closePalette = () => {
    setPaletteOpen(false);
    setPaletteQuery("");
    setPaletteIndex(0);
  };

  const executeCommand = (command: CommandItem | null | undefined) => {
    if (!command) return;
    closePalette();
    router.push(command.href);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (isShortcut) {
        event.preventDefault();
        openPalette();
        return;
      }
      if (event.key === "Escape" && paletteOpen) {
        event.preventDefault();
        closePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen]);

  useEffect(() => {
    if (paletteOpen) {
      setTimeout(() => paletteInputRef.current?.focus(), 0);
    }
  }, [paletteOpen]);

  useEffect(() => {
    setPaletteIndex(0);
  }, [paletteQuery]);

  return (
    <>
      <aside className="hidden w-72 shrink-0 bg-primary text-white md:flex md:flex-col md:sticky md:top-0 md:h-screen shadow-xl">
        <div className="border-b border-blue-800 px-6 py-5">
          <h2 className="text-2xl font-black tracking-tight">
            King-Kush<span className="text-green-500">.</span>
          </h2>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-blue-200">Admin Portal</p>
        </div>

        <div className="px-4 py-3 border-b border-blue-800/80">
          <label className="relative block">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-200" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find module..."
              className="w-full rounded-xl border border-blue-800/60 bg-blue-900/40 py-2 pl-9 pr-3 text-sm text-white placeholder:text-blue-200/80 focus:outline-none focus:ring-2 focus:ring-blue-300/40"
            />
          </label>
          <button
            type="button"
            onClick={openPalette}
            className="mt-2 inline-flex w-full items-center justify-between rounded-xl border border-blue-800/60 bg-blue-900/40 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-800/40"
          >
            <span className="inline-flex items-center gap-2">
              <FiCommand className="h-4 w-4" />
              Command Palette
            </span>
            <span className="rounded-md border border-blue-700/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
              Ctrl K
            </span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {(Object.keys(GROUP_LABELS) as Array<NavItem["group"]>).map((groupKey) => {
            const items = grouped[groupKey];
            if (items.length === 0) return null;
            return (
              <div key={groupKey} className="mb-4">
                <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/90">
                  {GROUP_LABELS[groupKey]}
                </p>
                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.key === active;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={`group block rounded-xl border px-3 py-2 transition-colors ${
                          isActive
                            ? "border-blue-300/60 bg-blue-800/60 text-white"
                            : "border-transparent text-blue-100 hover:border-blue-700/70 hover:bg-blue-800/35"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-blue-200 group-hover:text-white"}`} />
                          <span className="text-sm font-semibold">{item.label}</span>
                        </div>
                        <p className={`mt-1 pl-6 text-xs ${isActive ? "text-blue-100" : "text-blue-200/90"}`}>
                          {item.description}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 ? (
            <p className="rounded-xl border border-blue-800/70 bg-blue-900/35 px-3 py-3 text-xs text-blue-200">
              No module matched your search.
            </p>
          ) : null}
        </nav>

        <div className="mt-auto border-t border-blue-800 px-4 py-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Link href="/admin" className="rounded-lg border border-blue-700/70 px-3 py-1.5 text-blue-100 hover:bg-blue-800/40">
              Admin Home
            </Link>
            <Link href="/" className="rounded-lg border border-blue-700/70 px-3 py-1.5 text-blue-100 hover:bg-blue-800/40">
              Store
            </Link>
          </div>
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden">
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  isActive ? "bg-primary text-white" : "bg-gray-100 text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <Link href="/" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
            <FiSettings className="h-4 w-4" />
            Store
          </Link>
          <button
            type="button"
            onClick={openPalette}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
          >
            <FiCommand className="h-4 w-4" />
            Cmd
          </button>
        </div>
      </div>

      {paletteOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] p-4 sm:p-8" onClick={closePalette}>
          <div
            className="mx-auto mt-8 w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-gray-100 px-4 py-3 sm:px-5">
              <div className="flex items-center gap-2">
                <FiSearch className="h-4 w-4 text-gray-500" />
                <input
                  ref={paletteInputRef}
                  value={paletteQuery}
                  onChange={(event) => setPaletteQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setPaletteIndex((prev) => Math.min(prev + 1, Math.max(paletteResults.length - 1, 0)));
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setPaletteIndex((prev) => Math.max(prev - 1, 0));
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      executeCommand(paletteResults[paletteIndex]);
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      closePalette();
                    }
                  }}
                  placeholder="Search modules and actions..."
                  className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none"
                />
                <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                  ESC
                </span>
              </div>
            </div>
            <div className="max-h-[58vh] overflow-y-auto p-2">
              {paletteResults.length === 0 ? (
                <p className="rounded-xl px-3 py-3 text-sm text-gray-500">No matching command.</p>
              ) : (
                paletteResults.map((command, index) => {
                  const Icon = command.icon;
                  const selected = index === paletteIndex;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      onMouseEnter={() => setPaletteIndex(index)}
                      onClick={() => executeCommand(command)}
                      className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                        selected ? "bg-primary text-white" : "text-gray-800 hover:bg-gray-100"
                      }`}
                    >
                      <Icon className={`mt-0.5 h-4 w-4 ${selected ? "text-white" : "text-gray-600"}`} />
                      <span className="block">
                        <span className="block text-sm font-semibold">{command.label}</span>
                        <span className={`block text-xs ${selected ? "text-blue-100" : "text-gray-500"}`}>
                          {command.description}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
              Use <strong>↑</strong> <strong>↓</strong> and <strong>Enter</strong> to navigate.
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
