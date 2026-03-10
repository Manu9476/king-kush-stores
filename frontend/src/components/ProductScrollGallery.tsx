"use client";

import { useMemo, useRef, useState } from "react";
import ProductGridCard from "@/components/ProductGridCard";
import { Product } from "@/types";

export interface ProductScrollItem {
  product: Product;
  badgeText?: string;
  onOpen?: () => void;
  keyId?: string | number;
}

interface ProductScrollGalleryProps {
  items: ProductScrollItem[];
  showFilters?: boolean;
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function chunkItems<T>(list: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) return [list];
  const chunks: T[][] = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    chunks.push(list.slice(i, i + chunkSize));
  }
  return chunks;
}

const ROW_CAPACITY = 4;

type TouchAxis = "undecided" | "horizontal" | "vertical";

type RowTouchState = {
  startX: number;
  startY: number;
  lastX: number;
  axis: TouchAxis;
};

function handleRowWheel(event: React.WheelEvent<HTMLDivElement>) {
  const rowEl = event.currentTarget;

  // Keep normal vertical page scroll so all rows/columns move together.
  if (!event.shiftKey && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    return;
  }

  // Horizontal intent (trackpad horizontal swipe or Shift + wheel) should move only this row.
  const horizontalDelta = event.shiftKey ? event.deltaY : event.deltaX;
  if (horizontalDelta === 0) return;

  event.preventDefault();
  rowEl.scrollLeft += horizontalDelta;
}

export default function ProductScrollGallery({ items, showFilters = true }: ProductScrollGalleryProps) {
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const rowTouchStateRef = useRef<RowTouchState | null>(null);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    for (const entry of items) {
      const name = entry.product.category?.name?.trim();
      if (name) unique.add(name);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const vendors = useMemo(() => {
    const unique = new Set<string>();
    for (const entry of items) {
      const name = entry.product.vendor_name?.trim();
      if (name) unique.add(name);
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(
    () =>
      items.filter((entry) => {
        const categoryName = entry.product.category?.name || "";
        const vendorName = entry.product.vendor_name || "";
        const categoryPass =
          categoryFilter === "all" || normalizeValue(categoryName) === normalizeValue(categoryFilter);
        const vendorPass = vendorFilter === "all" || normalizeValue(vendorName) === normalizeValue(vendorFilter);
        return categoryPass && vendorPass;
      }),
    [items, categoryFilter, vendorFilter],
  );

  const rows = useMemo(() => {
    // Must: vertical-first growth. Products are chunked into short rows so new items continue downward.
    // Optional: when no explicit filter is active, prefer grouping similar items in same row by category/vendor.
    if (categoryFilter === "all" && vendorFilter === "all") {
      const grouped = new Map<string, ProductScrollItem[]>();
      const groupOrder: string[] = [];

      for (const entry of filteredItems) {
        const categoryName = entry.product.category?.name?.trim();
        const vendorName = entry.product.vendor_name?.trim();
        const groupKey = categoryName || vendorName || "Other";
        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, []);
          groupOrder.push(groupKey);
        }
        grouped.get(groupKey)!.push(entry);
      }

      const groupedRows: ProductScrollItem[][] = [];
      for (const key of groupOrder) {
        const groupItems = grouped.get(key) || [];
        groupedRows.push(...chunkItems(groupItems, ROW_CAPACITY));
      }
      return groupedRows;
    }

    return chunkItems(filteredItems, ROW_CAPACITY);
  }, [filteredItems, categoryFilter, vendorFilter]);

  const handleRowTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      rowTouchStateRef.current = null;
      return;
    }
    const touch = event.touches[0];
    rowTouchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      axis: "undecided",
    };
  };

  const handleRowTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const state = rowTouchStateRef.current;
    if (!state || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - state.startX;
    const deltaY = touch.clientY - state.startY;

    if (state.axis === "undecided" && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
      state.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
    }

    if (state.axis === "horizontal") {
      // Horizontal gesture: move only this row.
      event.preventDefault();
      const rowEl = event.currentTarget;
      rowEl.scrollLeft -= (touch.clientX - state.lastX) * 1.2;
    }
    // Vertical gesture: do nothing and let the page scroll naturally.
    state.lastX = touch.clientX;
  };

  const clearTouchState = () => {
    rowTouchStateRef.current = null;
  };

  return (
    <div className="space-y-3">
      {showFilters ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700"
          >
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            value={vendorFilter}
            onChange={(event) => setVendorFilter(event.target.value)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700"
          >
            <option value="all">All Vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor} value={vendor}>
                {vendor}
              </option>
            ))}
          </select>

          <span className="text-xs font-semibold text-gray-500">
            {filteredItems.length} item{filteredItems.length === 1 ? "" : "s"} shown
          </span>
        </div>
      ) : null}

      <div className="space-y-3">
        {rows.map((row, rowIndex) => (
          <div
            key={`product-row-${rowIndex}`}
            onWheel={handleRowWheel}
            onTouchStart={handleRowTouchStart}
            onTouchMove={handleRowTouchMove}
            onTouchEnd={clearTouchState}
            onTouchCancel={clearTouchState}
            className="w-full overflow-x-auto overflow-y-visible touch-pan-y pb-1"
          >
            <div className="flex min-w-max gap-3 sm:gap-5">
              {row.map((entry, itemIndex) => (
                <div
                  key={entry.keyId ?? `${entry.product.id}-${rowIndex}-${itemIndex}`}
                  className="w-[200px] shrink-0 sm:w-[220px] lg:w-[236px]"
                >
                  <ProductGridCard
                    product={entry.product}
                    badgeText={entry.badgeText}
                    onOpen={entry.onOpen}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        {filteredItems.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            No products match the selected category/vendor filter.
          </div>
        ) : null}
      </div>
    </div>
  );
}
