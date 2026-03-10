// frontend/app/checkout/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "../../src/context/CartContext";
import { useAuth } from "../../src/context/AuthContext";
import {
  createOrder,
  getMyProfile,
  getPublicPickupStations,
  getShippingAddresses,
  initiateMpesaPayment,
  mockConfirmMpesaPayment,
  PickupStation,
  ShippingAddress,
} from "../../src/services/api";
import Link from "next/link";

import { formatCurrency } from "@/lib/utils";

function buildDeterministicKey(prefix: string, payload: Record<string, any>): string {
  const raw = `${prefix}:${JSON.stringify(payload)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `${prefix}-${hash.toString(16)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cartItems, cartCount, clearCart } = useCart();
  const { isAuthenticated, token } = useAuth();

  // Form State - Delivery
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState(""); 
  const [fulfillmentMethod, setFulfillmentMethod] = useState<"delivery" | "pickup">("delivery");
  const [pickupStations, setPickupStations] = useState<PickupStation[]>([]);
  const [selectedPickupStationId, setSelectedPickupStationId] = useState<number | "">("");
  const [savedAddresses, setSavedAddresses] = useState<ShippingAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | "">("");
  const [isPrefilling, setIsPrefilling] = useState(true);
  
  // Form State - Payment
  const [mpesaNumber, setMpesaNumber] = useState(""); 
  const [mpesaState, setMpesaState] = useState<'idle' | 'sending' | 'awaiting_pin'>('idle');
  const [activeOrderNumber, setActiveOrderNumber] = useState("");
  const [activePaymentId, setActivePaymentId] = useState<number | null>(null);
  const [collectionAccount, setCollectionAccount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Financial Calculations
  const subtotal = cartItems.reduce((sum, item) => {
    const unitPrice = Number(item.cart_unit_price || 0);
    return sum + unitPrice * item.quantity;
  }, 0);
  const originalSubtotal = cartItems.reduce((sum, item) => {
    const unitOriginal = Number(item.cart_original_unit_price || item.cart_unit_price || 0);
    return sum + unitOriginal * item.quantity;
  }, 0);
  const deliveryFee = 0; // Set to 0 for FREE
  const discount = Math.max(originalSubtotal - subtotal, 0); 
  const totalAmount = subtotal + deliveryFee;

  useEffect(() => {
    const hydrateCheckout = async () => {
      if (!isAuthenticated || !token) {
        setIsPrefilling(false);
        return;
      }

      try {
        const [profileResult, addressesResult, pickupStationsResult] = await Promise.allSettled([
          getMyProfile(token),
          getShippingAddresses(token),
          getPublicPickupStations(),
        ]);
        let profileFallbackName = "";

        if (profileResult.status === "fulfilled") {
          const profile = profileResult.value;
          const profileName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
          profileFallbackName = profileName || profile.email.split("@")[0];
          setFullName(profileFallbackName);
          if (profile.phone_number) {
            setPhone(profile.phone_number);
          }
        }

        if (addressesResult.status === "fulfilled") {
          const addresses = addressesResult.value;
          setSavedAddresses(addresses);

          const preferred = addresses.find((entry) => entry.is_default) || addresses[0];
          if (preferred) {
            setSelectedAddressId(preferred.id);
            setFullName(preferred.full_name || profileFallbackName);
            setAddress(preferred.address_line_1);
            setCity(preferred.city);
            setPhone(preferred.phone_number);
          }
        }
        if (pickupStationsResult.status === "fulfilled") {
          const stations = pickupStationsResult.value.filter((station) => station.is_active && station.supports_pickup);
          setPickupStations(stations);
          if (stations.length > 0) {
            const firstStation = stations[0];
            setSelectedPickupStationId(firstStation.id);
            const hasSavedAddress =
              addressesResult.status === "fulfilled" && Array.isArray(addressesResult.value) && addressesResult.value.length > 0;
            if (!hasSavedAddress) {
              setAddress(firstStation.address);
              setCity(firstStation.city);
            }
          }
        }
      } finally {
        setIsPrefilling(false);
      }
    };

    hydrateCheckout();
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (fulfillmentMethod !== "pickup") return;
    if (typeof selectedPickupStationId !== "number") return;
    const station = pickupStations.find((entry) => entry.id === selectedPickupStationId);
    if (!station) return;
    setAddress(station.address);
    setCity(station.city);
  }, [fulfillmentMethod, selectedPickupStationId, pickupStations]);



  // --- Auth & Cart Checks ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-4 font-sans">
        <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Secure Checkout</h2>
          <p className="text-gray-500 mb-8 text-base">Please log in to your account to complete your purchase.</p>
          <Link href="/login" className="bg-primary hover:bg-[#152C69] transition-colors text-white px-8 py-4 rounded-xl font-bold text-lg w-full block">
            Sign In to Continue
          </Link>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-100 p-4 font-sans">
        <div className="bg-white p-10 rounded-3xl shadow-xl text-center max-w-md w-full">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Your cart is empty</h2>
          <p className="text-gray-500 mb-8 text-base">Looks like you haven't added anything yet.</p>
          <Link href="/" className="bg-primary hover:bg-[#152C69] transition-colors text-white px-8 py-4 rounded-xl font-bold text-lg w-full block">
            Return to Shop
          </Link>
        </div>
      </div>
    );
  }

  // --- Payment Handlers ---
  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate shipping / pickup details
    if (!fullName || !phone) {
      setError("Please provide your name and phone number before paying.");
      return;
    }
    if (fulfillmentMethod === "delivery" && (!address || !city)) {
      setError("Please provide all delivery details before paying.");
      return;
    }
    if (fulfillmentMethod === "pickup" && typeof selectedPickupStationId !== "number") {
      setError("Please select a pickup station.");
      return;
    }

    // Validate M-Pesa Number
    if (!mpesaNumber || mpesaNumber.replace(/[^0-9]/g, '').length < 9) {
      setError("Please enter a valid M-Pesa phone number.");
      return;
    }
    
    if (!token) {
      setError("Please sign in again to continue checkout.");
      return;
    }
    const pickupStationId = typeof selectedPickupStationId === "number" ? selectedPickupStationId : undefined;

    setMpesaState('sending');

    const orderData = {
      full_name: fullName,
      address_line_1: address,
      city,
      phone_number: phone,
      country: "Kenya",
      shipping_address_id: selectedAddressId || undefined,
      fulfillment_method: fulfillmentMethod,
      pickup_station_id: fulfillmentMethod === "pickup" ? pickupStationId : undefined,
      items: cartItems.map(item => ({
        product_id: item.id,
        quantity: item.quantity,
        sale_option_id: item.selected_sale_option_id ?? undefined,
      }))
    };

    try {
      const orderIdempotencyKey = buildDeterministicKey("order", orderData as Record<string, any>);
      const order = await createOrder(orderData, token, { idempotencyKey: orderIdempotencyKey });
      const paymentIdempotencyKey = buildDeterministicKey("payment", {
        order_id: order.id,
        phone_number: mpesaNumber.replace(/[^0-9]/g, ""),
      });
      const paymentResponse = await initiateMpesaPayment(
        {
          order_id: order.id,
          phone_number: mpesaNumber,
        },
        token,
        { idempotencyKey: paymentIdempotencyKey },
      );
      setActiveOrderNumber(order.order_number);
      setActivePaymentId(paymentResponse.payment.id);
      setCollectionAccount(paymentResponse.platform_collection_account || "");
      setMpesaState('awaiting_pin');
    } catch (err: any) {
      setMpesaState('idle');
      setError(err.message || "Failed to initiate payment. Please try again.");
    }
  };

  const handleConfirmOrder = async () => {
    if (!token || !activePaymentId) {
      setError("Payment session expired. Please start checkout again.");
      setMpesaState("idle");
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const confirmation = await mockConfirmMpesaPayment(activePaymentId, token as string);
      if (confirmation.status !== "confirmed") {
        throw new Error(confirmation.message || "Payment is not yet confirmed.");
      }
      clearCart(); 
      const orderRef = confirmation.order_number || activeOrderNumber;
      router.push(`/order-success${orderRef ? `?order=${encodeURIComponent(orderRef)}` : ""}`);
    } catch (err: any) {
      setError(err.message || "Failed to process order. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // THE FIX: Changed 'items-start' to 'items-center' to perfectly center the rectangle vertically
    <main className="bg-neutral-100 min-h-screen p-4 sm:p-6 flex justify-center items-center font-sans">
      
      {/* THE FLOATING RECTANGLE
        Added 'max-h-[95vh]' and 'overflow-y-auto' so if the screen is short, 
        the rectangle stays bounded and scrolls neatly inside itself!
      */}
      <div className="w-full max-w-150 max-h-[95vh] overflow-y-auto bg-white rounded-3xl border border-gray-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
        
        {/* Header - Made sticky so it stays at the top of the rectangle if you scroll */}
        <div className="bg-primary px-10 py-6 text-center sticky top-0 z-10 border-b border-gray-100 shadow-sm">
          <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Checkout</h1>
          <p className="text-blue-100 text-sm font-medium">Securely complete your King-Kush order</p>
        </div>

        {/* Card Body */}
        <div className="p-8 sm:p-10">
          <form onSubmit={handleInitiatePayment} className="space-y-1">
            
            {/* --- SECTION 1: SHIPPING DETAILS --- */}
            <section className="mb-8">
              <h3 className="text-xl font-bold text-gray-900 mb-5 flex items-center">
                <span className="bg-primary/10 text-primary w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm font-bold">1</span>
                Fulfillment & Contact Details
              </h3>
              
              <div className="space-y-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                {isPrefilling ? (
                  <div className="text-xs font-semibold text-primary">Loading your saved account details...</div>
                ) : null}

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Fulfillment Method</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFulfillmentMethod("delivery")}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                        fulfillmentMethod === "delivery"
                          ? "bg-primary text-white"
                          : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Delivery
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFulfillmentMethod("pickup");
                        setSelectedAddressId("");
                      }}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
                        fulfillmentMethod === "pickup"
                          ? "bg-primary text-white"
                          : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Pick-up Station
                    </button>
                  </div>
                </div>

                {fulfillmentMethod === "pickup" ? (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Pick-up Station</label>
                    <select
                      value={selectedPickupStationId}
                      onChange={(e) => {
                        const nextValue = e.target.value ? Number(e.target.value) : "";
                        setSelectedPickupStationId(nextValue);
                      }}
                      className="w-full px-5 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/30 outline-none transition-all text-base bg-white shadow-sm"
                    >
                      {pickupStations.map((station) => (
                        <option key={station.id} value={station.id}>
                          {station.name} - {station.city}
                        </option>
                      ))}
                    </select>
                    {pickupStations.length === 0 ? (
                      <p className="mt-2 text-xs text-red-700">No active pickup stations are currently available.</p>
                    ) : null}
                    {typeof selectedPickupStationId === "number" ? (
                      <p className="mt-2 text-xs text-gray-600">
                        {pickupStations.find((station) => station.id === selectedPickupStationId)?.address || ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {fulfillmentMethod === "delivery" && savedAddresses.length > 0 ? (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Use Saved Address</label>
                    <select
                      value={selectedAddressId}
                      onChange={(e) => {
                        const nextValue = e.target.value ? Number(e.target.value) : "";
                        setSelectedAddressId(nextValue);
                        const matched = savedAddresses.find((entry) => entry.id === nextValue);
                        if (matched) {
                          setFullName(matched.full_name);
                          setAddress(matched.address_line_1);
                          setCity(matched.city);
                          setPhone(matched.phone_number);
                        }
                      }}
                      className="w-full px-5 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/30 outline-none transition-all text-base bg-white shadow-sm"
                    >
                      <option value="">Use custom entry</option>
                      {savedAddresses.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.full_name} - {entry.city} {entry.is_default ? "(Default)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Full Name</label>
                  <input
                    required
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setSelectedAddressId("");
                      setFullName(e.target.value);
                    }}
                    className="w-full px-5 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/30 outline-none transition-all text-base bg-white shadow-sm"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    {fulfillmentMethod === "delivery" ? "Delivery Address" : "Station Address"}
                  </label>
                  <input 
                    required={fulfillmentMethod === "delivery"}
                    type="text"
                    value={address}
                    onChange={(e) => {
                      setSelectedAddressId("");
                      setAddress(e.target.value);
                    }}
                    className="w-full px-5 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/30 outline-none transition-all text-base bg-white shadow-sm"
                    placeholder={fulfillmentMethod === "delivery" ? "Street name, Apartment, Estate..." : "Selected station address"}
                    readOnly={fulfillmentMethod === "pickup"}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">
                      {fulfillmentMethod === "delivery" ? "City / Area" : "Station City"}
                    </label>
                    <input 
                      required={fulfillmentMethod === "delivery"}
                      type="text"
                      value={city}
                      onChange={(e) => {
                        setSelectedAddressId("");
                        setCity(e.target.value);
                      }}
                      className="w-full px-5 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/30 outline-none transition-all text-base bg-white shadow-sm"
                      placeholder="e.g. Nairobi"
                      readOnly={fulfillmentMethod === "pickup"}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Contact Phone</label>
                    <input 
                      required
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setSelectedAddressId("");
                        setPhone(e.target.value);
                      }}
                      className="w-full px-5 py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary/30 outline-none transition-all text-base bg-white shadow-sm"
                      placeholder="07XX XXX XXX"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* --- SECTION 2: ORDER SUMMARY --- */}
            <section className="mb-8">
              <h3 className="text-xl font-bold text-gray-900 mb-5 flex items-center">
                <span className="bg-primary/10 text-primary w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm font-bold">2</span>
                Order Summary ({cartCount} items)
              </h3>
              
              <div className="space-y-3 mb-6 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                {cartItems.map((item) => (
                  (() => {
                    const unitPrice = Number(item.cart_unit_price || 0);
                    const originalPrice = Number(item.cart_original_unit_price || item.cart_unit_price || 0);
                    const lineTotal = unitPrice * item.quantity;
                    const originalLineTotal = originalPrice * item.quantity;
                    const hasPromo = originalLineTotal > lineTotal;
                    return (
                  <div key={item.cart_item_key} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 last:pb-0">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-700 text-sm shrink-0">
                        {item.quantity}x
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800 text-base leading-tight">{item.title}</p>
                        <p className="text-xs text-gray-500">{item.selected_sale_option_label || item.base_unit_label || "unit"}</p>
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="font-bold text-gray-900 text-lg">{formatCurrency(lineTotal)}</p>
                      {hasPromo ? <p className="text-xs text-gray-500 line-through">{formatCurrency(originalLineTotal)}</p> : null}
                    </div>
                  </div>
                    );
                  })()
                ))}
              </div>

              {/* Cost Breakdown */}
              <div className="px-2 space-y-3 text-base font-medium text-gray-500 mb-6">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="text-gray-800 font-semibold">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  <span className="text-[#00A859] font-bold">FREE</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <span className="text-red-500 font-semibold">-{formatCurrency(discount)}</span>
                  </div>
                )}
              </div>

              {/* HUGE DOMINANT TOTAL */}
              <div className="flex justify-between items-center pt-6 border-t-[3px] border-gray-100 mb-2">
                <span className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">TOTAL</span>
                <span className="text-4xl sm:text-5xl font-black text-[#00A859] tracking-tighter">
                  {formatCurrency(totalAmount)}
                </span>
              </div>
            </section>

            {/* --- SECTION 3: M-PESA PAYMENT --- */}
            <section className="mt-8 pt-8 border-t-[3px] border-gray-100">
              
              {error && (
                <div className="mb-6 bg-red-50 border-l-4 border-red-500 text-red-700 px-5 py-4 rounded-r-xl text-base font-medium">
                  {error}
                </div>
              )}

              {mpesaState === 'idle' && (
                <div className="bg-[#00A859]/5 border border-[#00A859]/20 p-6 sm:p-8 rounded-3xl">
                  <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                    <span className="bg-[#00A859] text-white w-8 h-8 rounded-full flex items-center justify-center mr-3 text-sm font-bold shadow-md">3</span>
                    Payment Details
                  </h3>

                  {/* VISIBLE M-PESA INPUT */}
                  <div className="mb-6">
                    <label className="block text-base font-bold text-gray-800 mb-3">
                      Enter M-Pesa Number to Pay:
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-[#00A859]">
                          <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <input 
                        required
                        type="tel"
                        value={mpesaNumber}
                        onChange={(e) => setMpesaNumber(e.target.value)}
                        className="w-full pl-14 pr-5 py-5 border-2 border-gray-300 rounded-2xl focus:border-[#00A859] focus:ring-4 focus:ring-[#00A859]/20 outline-none transition-all text-xl font-bold text-gray-900 tracking-wide bg-white shadow-inner placeholder-gray-400"
                        placeholder="07XX XXX XXX"
                      />
                    </div>
                  </div>
                  
                  {/* MASSIVE PAYMENT BUTTON */}
                  <button
                    type="submit"
                    className="w-full bg-linear-to-r from-[#00A859] to-[#008A4A] hover:from-[#008A4A] hover:to-[#006636] text-white font-black py-5 px-6 rounded-2xl shadow-[0_10px_20px_rgba(0,168,89,0.3)] transition-all transform hover:-translate-y-1 flex justify-center items-center gap-3 text-xl"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-7 h-7">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                    Pay Online via M-Pesa
                  </button>
                </div>
              )}

              {/* Loading State */}
              {mpesaState === 'sending' && (
                <div className="mt-4 bg-[#00A859]/5 border-2 border-[#00A859]/30 rounded-3xl p-10 text-center flex flex-col items-center">
                  <div className="animate-spin rounded-full h-14 w-14 border-b-4 border-[#00A859] mb-5"></div>
                  <h4 className="font-bold text-[#00A859] text-2xl mb-2">Connecting to Safaricom...</h4>
                  <p className="text-gray-600 text-base font-medium">Initiating secure STK Push to your phone.</p>
                </div>
              )}

              {/* PIN Verification State */}
              {mpesaState === 'awaiting_pin' && (
                <div className="mt-4 bg-[#00A859]/5 border-2 border-[#00A859] rounded-3xl p-8 text-center animate-fade-in">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-10 h-10 text-[#00A859] animate-pulse">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                    </svg>
                  </div>
                  <h4 className="font-black text-[#00A859] text-3xl mb-3">Check Your Phone!</h4>
                  <p className="text-gray-700 text-lg mb-8 leading-relaxed font-medium">
                    We've sent a payment request to <strong className="text-gray-900 font-black text-xl bg-white px-2 py-1 rounded-md border border-gray-200 ml-1">{mpesaNumber}</strong>.<br/><br/>
                    Please enter your M-Pesa PIN on your device to finalize.
                  </p>
                  {collectionAccount ? (
                    <p className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      Payment is being collected securely to platform account <strong>{collectionAccount}</strong> before vendor allocation.
                    </p>
                  ) : null}
                  
                  <button
                    type="button"
                    onClick={handleConfirmOrder}
                    disabled={isLoading}
                    className="w-full bg-primary hover:bg-[#152C69] text-white font-bold py-5 rounded-2xl shadow-lg transition-colors text-xl disabled:bg-gray-400"
                  >
                    {isLoading ? "Verifying Payment..." : "I Have Entered My PIN"}
                  </button>
                  
                  <button 
                    type="button" 
                    onClick={() => setMpesaState('idle')}
                    className="mt-6 text-sm font-bold text-gray-400 hover:text-gray-800 underline block w-full text-center"
                  >
                    Cancel or change phone number
                  </button>
                </div>
              )}
              
            </section>
          </form>
        </div>
      </div>
    </main>
  );
}
