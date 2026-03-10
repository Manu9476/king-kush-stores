// frontend/app/register/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerUser } from "../../src/services/api";

export default function RegisterPage() {
  const router = useRouter();

  // Form states
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Check if passwords match before sending to Django
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      // 2. Call our Django API to create the user
      await registerUser({ 
        username, 
        email, 
        password 
      });
      
      // 3. Success! Send them to the login page to sign in
      router.push("/login");
      
    } catch {
      // If Django rejects it (e.g., email already exists), show the error
      setError("Failed to create account. That email or username might already be in use.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="py-20 px-4 bg-gray-50 flex justify-center items-center min-h-[80vh]">
      
      {/* SQUARE REGISTRATION CARD (Matching the Login UI) */}
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden w-full" 
        style={{ maxWidth: "400px" }}
      >
        {/* Brand Header Area */}
        <div className="bg-primary px-8 py-8 text-center">
          <h2 className="font-heading font-bold text-h2 text-white mb-2">
            Join Us
          </h2>
          <p className="font-body text-gray-200 text-small">
            Create your King-Kush account
          </p>
        </div>

        {/* Form Area */}
        <div className="p-8">
          
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-error px-4 py-3 rounded-lg text-small font-body text-center">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            
            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-small font-heading font-semibold text-gray-700 mb-1">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary font-body text-body transition-all"
                placeholder="johndoe123"
              />
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-small font-heading font-semibold text-gray-700 mb-1">
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
                placeholder="john@example.com"
              />
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-small font-heading font-semibold text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary font-body text-body transition-all"
                placeholder="••••••••"
              />
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-small font-heading font-semibold text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary font-body text-body transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3.5 rounded-lg shadow-md text-body-lg font-heading font-semibold text-white transition-all transform hover:-translate-y-0.5 mt-6 ${
                isLoading ? "bg-primary/70 cursor-not-allowed" : "bg-primary hover:bg-blue-900"
              }`}
            >
              {isLoading ? "Creating account..." : "Sign Up"}
            </button>
          </form>
          
          <div className="mt-6 text-center border-t border-gray-100 pt-6">
            <p className="text-small font-body text-gray-600">
              Already have an account?{" "}
              <Link href="/login" className="font-heading font-semibold text-primary hover:text-accent transition-colors">
                Sign in
              </Link>
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}
