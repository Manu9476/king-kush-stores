// frontend/src/components/Navbar.tsx
"use client";

import Link from "next/link";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getProducts } from "../services/api";

type SearchSuggestion = {
  id: string;
  kind: "product" | "category" | "vendor";
  label: string;
  query: string;
  score: number;
};

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

export default function Navbar() {
  const { cartCount } = useCart();
  const { isAuthenticated, logout, userEmail, displayName, userRole } = useAuth();
  const [query, setQuery] = useState("");
  const [searchProducts, setSearchProducts] = useState<Array<{ title: string; categoryName: string; vendorName: string }>>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadProducts = async () => {
      const products = await getProducts();
      if (cancelled) return;
      setSearchProducts(
        products.map((product) => ({
          title: String(product.title || ""),
          categoryName: String(product.category?.name || ""),
          vendorName: String(product.vendor_name || ""),
        })),
      );
    };
    loadProducts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery || searchProducts.length === 0) return [];

    const productSuggestions: SearchSuggestion[] = [];
    for (let index = 0; index < searchProducts.length; index += 1) {
      const entry = searchProducts[index];
      const title = normalizeSearch(entry.title);
      if (!title) continue;

      let score = 0;
      if (title === normalizedQuery) score = 130;
      else if (title.startsWith(normalizedQuery)) score = 115;
      else if (title.includes(normalizedQuery)) score = 95;
      if (score === 0) continue;

      productSuggestions.push({
        id: `product-${index}-${entry.title}`,
        kind: "product",
        label: entry.title,
        query: entry.title,
        score,
      });
      if (productSuggestions.length >= 6) break;
    }

    const categoryScoreMap = new Map<string, number>();
    const vendorScoreMap = new Map<string, number>();
    for (const entry of searchProducts) {
      const category = entry.categoryName.trim();
      const vendor = entry.vendorName.trim();
      if (category) {
        const normalized = normalizeSearch(category);
        if (normalized.includes(normalizedQuery)) {
          const existing = categoryScoreMap.get(category) || 0;
          categoryScoreMap.set(category, existing + (normalized.startsWith(normalizedQuery) ? 20 : 12));
        }
      }
      if (vendor) {
        const normalized = normalizeSearch(vendor);
        if (normalized.includes(normalizedQuery)) {
          const existing = vendorScoreMap.get(vendor) || 0;
          vendorScoreMap.set(vendor, existing + (normalized.startsWith(normalizedQuery) ? 20 : 12));
        }
      }
    }

    const categorySuggestions: SearchSuggestion[] = Array.from(categoryScoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, score], index) => ({
        id: `category-${index}-${label}`,
        kind: "category",
        label,
        query: label,
        score: 70 + score,
      }));

    const vendorSuggestions: SearchSuggestion[] = Array.from(vendorScoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, score], index) => ({
        id: `vendor-${index}-${label}`,
        kind: "vendor",
        label,
        query: label,
        score: 65 + score,
      }));

    const merged = [...productSuggestions, ...categorySuggestions, ...vendorSuggestions]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const seen = new Set<string>();
    return merged.filter((entry) => {
      const key = `${entry.kind}:${normalizeSearch(entry.label)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [query, searchProducts]);

  useEffect(() => {
    setActiveSuggestionIndex(suggestions.length > 0 ? 0 : -1);
  }, [suggestions]);

  const runSearch = (term: string) => {
    const cleaned = term.trim();
    if (!cleaned) return;
    router.push(`/search?q=${encodeURIComponent(cleaned)}`);
    setIsSearchFocused(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (suggestions.length > 0 && activeSuggestionIndex >= 0) {
      const selected = suggestions[activeSuggestionIndex];
      runSearch(selected.query);
      return;
    }
    runSearch(query);
  };

  const handleLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname === "/") {
      e.preventDefault();
      window.location.reload();
      return;
    }
    e.preventDefault();
    router.push("/");
  };

  const accountHref = !isAuthenticated
    ? "/login"
    : userRole === "admin"
      ? "/admin"
      : userRole === "vendor"
        ? "/vendor"
        : "/account";

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-8 h-20 flex items-center justify-between">
        
        {/* Brand Logo */}
        <Link
          href="/"
          onClick={handleLogoClick}
          className="font-heading font-bold text-h3 text-primary tracking-tight"
        >
          King-Kush<span className="text-accent">.</span>
        </Link>

        {/* Search Bar */}
        <div ref={searchRef} className="hidden md:flex grow max-w-xl mx-8">
          <form onSubmit={handleSearch} className="relative w-full">
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onKeyDown={(e) => {
                if (!isSearchFocused || suggestions.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveSuggestionIndex((prev) => (prev + 1) % suggestions.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                } else if (e.key === "Escape") {
                  setIsSearchFocused(false);
                }
              }}
              placeholder="Search for products, brands, and categories..." 
              className="w-full bg-neutral-bg border border-gray-200 rounded-full py-2.5 pl-5 pr-12 focus:outline-none focus:ring-2 focus:ring-primary/20 font-body text-body transition-all"
            />
            <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-primary hover:text-accent transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </button>

            {isSearchFocused && query.trim() && suggestions.length > 0 ? (
              <div className="absolute left-0 right-0 top-[110%] z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                {suggestions.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => runSearch(entry.query)}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                      index === activeSuggestionIndex
                        ? "bg-primary/10 text-primary"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span className="truncate">{entry.label}</span>
                    <span className="ml-3 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                      {entry.kind}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </form>
        </div>

        {/* Account, Cart, & Logout Area */}
        <div className="flex items-center space-x-6">
          
          {/* 1. USER ICON (Dynamic Name vs 'Login') */}
          <Link 
            href={accountHref} 
            className="text-neutral-text hover:text-primary transition-colors flex flex-col items-center rounded-modern px-2 py-1 hover:bg-gray-50"
            title={userEmail || "Login"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            {/* FIXED: Changed max-w-[70px] to max-w-20 to clear the linter warning */}
            <span className="text-micro font-body mt-1 font-medium max-w-20 truncate text-center">
              {isAuthenticated ? displayName : "Login"}
            </span>
          </Link>
          
          {/* 2. CART ICON */}
          <Link href="/cart" className="text-neutral-text hover:text-primary transition-colors flex flex-col items-center relative rounded-modern px-2 py-1 hover:bg-gray-50">
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-accent text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center animate-fade-in">
                  {cartCount}
                </span>
              )}
            </div>
            <span className="text-micro font-body mt-1 font-medium">Cart</span>
          </Link>

          {/* 3. SEPARATED LOGOUT BUTTON (Only visible when logged in) */}
          {isAuthenticated && (
            <div className="pl-6 ml-2 border-l border-gray-200">
              <button 
                onClick={logout} 
                className="text-gray-400 hover:text-error transition-colors flex flex-col items-center group rounded-modern px-2 py-1 hover:bg-gray-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 group-hover:scale-110 transition-transform">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                <span className="text-micro font-body mt-1 font-medium">Logout</span>
              </button>
            </div>
          )}

        </div>
      </div>
    </header>
  );
}
