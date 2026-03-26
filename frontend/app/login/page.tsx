"use client";

import { useState } from "react";
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
    <main className="py-20 px-4 bg-gray-50 flex justify-center items-center min-h-[80vh]">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden w-full"
        style={{ maxWidth: "400px" }}
      >
        <div className="bg-primary px-8 py-8 text-center">
          <h2 className="font-heading font-bold text-h2 text-white mb-2">
            Welcome Back
          </h2>
          <p className="font-body text-gray-200 text-small">
            Sign in to King-Kush Stores
          </p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-error px-4 py-3 rounded-lg text-small font-body text-center">
              {error}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-small font-heading font-semibold text-gray-700 mb-2">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary font-body text-body transition-all"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-small font-heading font-semibold text-gray-700">
                  Password
                </label>
                <Link href="#" className="text-micro font-medium text-primary hover:text-accent transition-colors">
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary font-body text-body transition-all"
                placeholder="........"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-lg shadow-md text-body-lg font-heading font-semibold text-white transition-all transform hover:-translate-y-0.5 mt-4 ${
                isLoading ? "bg-primary/70 cursor-not-allowed" : "bg-primary hover:bg-blue-900"
              }`}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-8 text-center border-t border-gray-100 pt-6">
            <p className="text-small font-body text-gray-600">
              Don't have an account?{" "}
              <Link href="/register" className="font-heading font-semibold text-primary hover:text-accent transition-colors">
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
