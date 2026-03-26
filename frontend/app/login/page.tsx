"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginUser } from "../../src/services/api";
import { useAuth } from "../../src/context/AuthContext";

function decodeTokenPayload(token: string): Record<string, any> | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const data = await loginUser(email, password);
      login(data.access, data.refresh, email);
      const payload = decodeTokenPayload(data.access);
      const role = payload?.role;
      if (role === "admin") {
        router.push("/admin");
      } else if (role === "vendor") {
        router.push("/vendor");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setError(err?.message || "Invalid email or password. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-[80vh] bg-gray-50 px-4 py-10 md:px-6 lg:px-8">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-[#f7f4ee] lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(30,58,138,0.14),_transparent_38%)]" />
          <div className="relative flex h-full flex-col justify-between p-10">
            <div className="max-w-md">
              <p className="mb-3 inline-flex rounded-full border border-amber-300 bg-white/80 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700">
                Kenya focused commerce
              </p>
              <h1 className="font-heading text-4xl font-bold leading-tight text-slate-900">
                Sign back in to your marketplace built for Kenyan shoppers and vendors.
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-slate-600">
                Manage orders, discover trusted stores, and keep your business moving with a platform shaped for the local market.
              </p>
            </div>

            <div className="relative mx-auto mt-10 w-full max-w-2xl">
              <Image
                src="/kenya-market-login.svg"
                alt="Illustration of a Kenyan-inspired marketplace with colorful stalls and a flag motif"
                width={1200}
                height={900}
                priority
                className="h-auto w-full"
              />
            </div>
          </div>
        </section>

        <section className="w-full">
          <div className="bg-primary px-8 py-8 text-center">
            <h2 className="mb-2 font-heading text-h2 font-bold text-white">
              Welcome Back
            </h2>
            <p className="font-body text-small text-gray-200">
              Sign in to King-Kush Stores
            </p>
          </div>

          <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-white to-green-50 px-8 py-4 lg:hidden">
            <div className="flex items-center gap-4">
              <div className="relative h-20 w-24 overflow-hidden rounded-2xl border border-white bg-white shadow-sm">
                <Image
                  src="/kenya-market-login.svg"
                  alt="Kenyan marketplace illustration"
                  fill
                  sizes="96px"
                  className="object-cover"
                  priority
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Kenya focused commerce</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Trusted shopping and seller tools designed for your market.
                </p>
              </div>
            </div>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center font-body text-small text-red-700">
                {error}
              </div>
            )}

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="mb-2 block text-small font-heading font-semibold text-gray-700">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 font-body text-body shadow-sm transition-all placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="admin@example.com"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="password" className="block text-small font-heading font-semibold text-gray-700">
                    Password
                  </label>
                  <Link href="#" className="text-micro font-medium text-primary transition-colors hover:text-accent">
                    Forgot password?
                  </Link>
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 font-body text-body shadow-sm transition-all placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="........"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className={`mt-4 w-full rounded-lg py-3.5 text-body-lg font-heading font-semibold text-white shadow-md transition-all transform hover:-translate-y-0.5 ${
                  isLoading ? "cursor-not-allowed bg-primary/70" : "bg-primary hover:bg-blue-900"
                }`}
              >
                {isLoading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="mt-8 border-t border-gray-100 pt-6 text-center">
              <p className="text-small font-body text-gray-600">
                Don't have an account?{" "}
                <Link href="/register" className="font-heading font-semibold text-primary transition-colors hover:text-accent">
                  Create one
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
