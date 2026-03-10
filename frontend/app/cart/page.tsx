// frontend/app/cart/page.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "../../src/context/CartContext";

export default function CartPage() {
  const { cartItems, removeFromCart, updateCartQuantity, cartTotal } = useCart();
  const originalTotal = cartItems.reduce((sum, item) => {
    const originalUnit = Number(item.cart_original_unit_price || item.cart_unit_price || 0);
    return sum + originalUnit * item.quantity;
  }, 0);
  const totalSavings = Math.max(originalTotal - cartTotal, 0);

  const formattedTotal = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(cartTotal);

  if (cartItems.length === 0) {
    return (
      <main className="min-h-screen bg-neutral-bg py-20 px-8 flex items-center justify-center">
        <div className="max-w-2xl w-full text-center bg-white p-16 rounded-modern shadow-modern">
          <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-12 h-12 text-gray-400"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
              />
            </svg>
          </div>
          <h1 className="font-heading text-h2 text-primary mb-4">
            Your Cart is Empty
          </h1>
          <p className="font-body text-body-lg text-gray-500 mb-8">
            Looks like you haven&apos;t added anything to your cart yet.
            Let&apos;s find some amazing products!
          </p>
          <Link
            href="/"
            className="inline-block bg-accent hover:bg-accent-hover text-white font-heading font-semibold py-4 px-10 rounded-modern transition-all shadow-md transform hover:-translate-y-0.5"
          >
            Start Shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-bg py-12 px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="font-heading font-bold text-h1 text-primary mb-8">
          Shopping Cart
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-6">
            {cartItems.map((item) => (
              (() => {
                const unitPrice = Number(item.cart_unit_price || 0);
                const originalPrice = Number(item.cart_original_unit_price || item.cart_unit_price || 0);
                const hasDiscount = originalPrice > unitPrice;
                return (
              <div
                key={item.cart_item_key}
                className="bg-white p-6 rounded-modern shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center sm:items-start gap-6 transition-all hover:shadow-md"
              >
                <div className="relative w-32 h-32 bg-gray-50 rounded-lg overflow-hidden shrink-0 border border-gray-100 flex items-center justify-center">
                  {item.images && item.images.length > 0 ? (
                    <Image
                      src={item.images[0].image}
                      alt={item.title}
                      fill
                      sizes="128px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="text-gray-400 text-micro">No Image</div>
                  )}
                </div>

                <div className="grow text-center sm:text-left">
                  <Link
                    href={`/product/${item.slug}`}
                    className="hover:text-accent transition-colors"
                  >
                    <h3 className="font-heading font-semibold text-body-lg text-neutral-text mb-1">
                      {item.title}
                    </h3>
                  </Link>
                  <p className="font-body text-micro text-gray-500 mb-3 uppercase tracking-wider">
                    Vendor:{" "}
                    <span className="font-semibold text-neutral-text">
                      {item.vendor_name}
                    </span>
                  </p>
                  <p className="font-body text-xs text-gray-500 mb-3">
                    Unit: <span className="font-semibold text-neutral-text">{item.selected_sale_option_label || item.base_unit_label || "unit"}</span>
                  </p>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 justify-center sm:justify-start">
                    <div>
                    <p className="font-heading font-bold text-body-lg text-success">
                      {new Intl.NumberFormat("en-KE", {
                        style: "currency",
                        currency: "KES",
                        currencyDisplay: "code",
                        maximumFractionDigits: 0,
                      }).format(Number(item.cart_unit_price || 0))}
                    </p>
                    {hasDiscount ? (
                      <p className="text-xs text-gray-500 line-through">
                        {new Intl.NumberFormat("en-KE", {
                          style: "currency",
                          currency: "KES",
                          currencyDisplay: "code",
                          maximumFractionDigits: 0,
                        }).format(Number(item.cart_original_unit_price || 0))}
                      </p>
                    ) : null}
                    </div>
                  <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        onClick={() =>
                          updateCartQuantity(item.cart_item_key, item.quantity - 1)
                        }
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 font-semibold text-gray-700"
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) =>
                          updateCartQuantity(item.cart_item_key, parseInt(e.target.value))
                        }
                        className="w-14 text-center bg-white font-semibold text-gray-800"
                      />
                      <button
                        onClick={() =>
                          updateCartQuantity(item.cart_item_key, item.quantity + 1)
                        }
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 font-semibold text-gray-700"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                <div className="shrink-0 mt-4 sm:mt-0">
                  <button
                    onClick={() => removeFromCart(item.cart_item_key)}
                    className="text-error hover:text-red-700 bg-red-50 hover:bg-red-100 px-4 py-2 rounded-lg text-small font-medium font-body transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                      />
                    </svg>
                    Remove
                  </button>
                </div>
              </div>
                );
              })()
            ))}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white p-8 rounded-modern shadow-modern sticky top-28">
              <h2 className="font-heading font-bold text-h3 text-neutral-text mb-6 border-b border-gray-100 pb-4">
                Order Summary
              </h2>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="font-body text-gray-600">Subtotal</span>
                  <span className="font-heading font-medium">
                    {formattedTotal}
                  </span>
                </div>
                {totalSavings > 0 ? (
                  <div className="flex justify-between items-center">
                    <span className="font-body text-gray-600">Savings</span>
                    <span className="font-heading font-semibold text-red-700">-{new Intl.NumberFormat("en-KE", {
                      style: "currency",
                      currency: "KES",
                      currencyDisplay: "code",
                      maximumFractionDigits: 0,
                    }).format(totalSavings)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between items-center">
                  <span className="font-body text-gray-600">Shipping</span>
                  <span className="font-body text-gray-500 text-small">
                    Calculated at checkout
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center mb-8 border-t border-gray-100 pt-6">
                <span className="font-heading font-bold text-h3 text-primary">
                  Total
                </span>
                <span className="font-heading font-bold text-h2 text-success">
                  {formattedTotal}
                </span>
              </div>

              <Link
                href="/checkout"
                className="w-full block text-center bg-primary hover:bg-blue-900 text-white font-heading font-semibold py-4 rounded-modern transition-all shadow-md"
              >
                Proceed to Checkout
              </Link>

              <Link
                href="/"
                className="block text-center mt-4 text-primary font-body text-small hover:underline"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
