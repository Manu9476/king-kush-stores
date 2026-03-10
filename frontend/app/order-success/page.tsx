// frontend/app/order-success/page.tsx
import Link from "next/link";

export default function OrderSuccess() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-h2 font-heading font-bold text-primary mb-2">Order Placed Successfully!</h1>
      <p className="text-body text-gray-600 mb-8 max-w-md">
        Your order has been received and is being processed. Thank you for shopping with King-Kush!
      </p>
      <Link href="/" className="bg-primary text-white px-10 py-4 rounded-full font-heading font-bold hover:bg-blue-900 transition-colors shadow-lg">
        Back to Marketplace
      </Link>
    </div>
  );
}