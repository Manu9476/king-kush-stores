// frontend/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AuthProvider } from "../src/context/AuthContext";
import { CartProvider } from "../src/context/CartContext";
import { ChatbotProvider } from "../src/context/ChatbotContext"; // Import ChatbotProvider
import Navbar from "../src/components/Navbar";
import Footer from "../src/components/Footer";
import ChatbotWidget from "../src/components/ChatbotWidget"; // Import ChatbotWidget
import ActivityTracker from "../src/components/ActivityTracker";
import AdSlot from "../src/components/ads/AdSlot";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "King-Kush Stores",
  description: "Your Premium E-Commerce Destination",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 flex flex-col min-h-screen`}>
        {/* Wrap everything inside your State Providers */}
        <ChatbotProvider>
          <AuthProvider>
            <CartProvider>
              
              {/* The Navigation Bar (Includes Logo, Cart Icon, User Login) */}
              <Navbar />

              {/* Tracks route activity so account assistant can personalize support */}
              <Suspense fallback={null}>
                <ActivityTracker />
              </Suspense>
              
              {/* The main content of your pages */}
              <main className="grow">
                {children}
              </main>

              <div className="mx-auto w-full max-w-7xl px-4 pb-4">
                <AdSlot placementKey="footer_banner" pagePath="global-footer" />
              </div>
              
              {/* The Mega-Footer */}
              <Footer />

              {/* The Chatbot Widget */}
              <ChatbotWidget />
              
            </CartProvider>
          </AuthProvider>
        </ChatbotProvider>
      </body>
    </html>
  );
}
