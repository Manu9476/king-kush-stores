import Link from "next/link";

type SearchParamRecord = { [key: string]: string | string[] | undefined };

function asSingle(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || "";
  return value || "";
}

export default async function OrderSuccessPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamRecord> | SearchParamRecord;
}) {
  const resolvedParams: SearchParamRecord = searchParams ? await searchParams : {};
  const orderNumber = asSingle(resolvedParams.order).trim();
  const paymentState = asSingle(resolvedParams.payment).trim().toLowerCase();
  const notice = asSingle(resolvedParams.notice).trim();

  const paymentMessage =
    paymentState === "initiated"
      ? "M-Pesa request was initiated. Your order is already recorded and being processed."
      : "Payment is currently pending. Your order was still placed successfully.";

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-20 h-20 bg-accent/10 rounded-full flex items-center justify-center mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-10 w-10 text-accent"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-h2 font-heading font-bold text-primary mb-2">Order Placed Successfully!</h1>
      {orderNumber ? (
        <p className="mb-2 text-base font-semibold text-gray-800">
          Order Number: <span className="text-primary">{orderNumber}</span>
        </p>
      ) : null}
      <p className="text-body text-gray-600 mb-2 max-w-md">{notice || paymentMessage}</p>
      <p className="text-sm text-gray-500 mb-8 max-w-md">
        You can track this order from your account. Vendors and admins can also see it in their order views.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/account"
          className="bg-primary text-white px-8 py-3 rounded-full font-heading font-bold hover:bg-blue-900 transition-colors shadow-lg"
        >
          Go to My Account
        </Link>
        <Link
          href="/"
          className="border border-primary text-primary px-8 py-3 rounded-full font-heading font-bold hover:bg-primary/5 transition-colors"
        >
          Back to Marketplace
        </Link>
      </div>
    </div>
  );
}
