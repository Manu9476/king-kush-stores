"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

interface SiteActivityEntry {
  path: string;
  timestamp: string;
}

const STORAGE_KEY = "siteActivityLog";
const MAX_ENTRIES = 80;

export default function ActivityTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams?.toString();
    const fullPath = query ? `${pathname}?${query}` : pathname;
    if (!fullPath) return;

    const existingRaw = localStorage.getItem(STORAGE_KEY);
    let existing: SiteActivityEntry[] = [];
    if (existingRaw) {
      try {
        existing = JSON.parse(existingRaw) as SiteActivityEntry[];
      } catch {
        existing = [];
      }
    }

    const now = new Date().toISOString();
    const latest = existing[0];
    if (latest && latest.path === fullPath) {
      existing[0] = { ...latest, timestamp: now };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing.slice(0, MAX_ENTRIES)));
      return;
    }

    const next = [{ path: fullPath, timestamp: now }, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [pathname, searchParams]);

  return null;
}
