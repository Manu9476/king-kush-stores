import React from 'react';

const StoreCreditPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-4xl font-bold mb-6">King-Kush Store Credit Terms</h1>
        
        <div className="prose lg:prose-lg max-w-none text-gray-700">
          <p>King-Kush Store Credit is a convenient way to make purchases on our platform. Here’s how it works and the terms that apply.</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">What is Store Credit?</h2>
          <p>Store Credit is a balance in your King-Kush account that can be used to pay for products and services. It can be acquired through refunds, promotional offers, or by purchasing a gift card.</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">How to Use Store Credit</h2>
          <p>At checkout, if you have a Store Credit balance, it will be available as a payment option. You can choose to use your credit to pay for all or part of your order. If your order total is more than your credit balance, you can pay the remaining amount using another payment method.</p>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Terms and Conditions</h2>
          <ul>
            <li>Store Credit is non-transferable and can only be used on the King-Kush Stores platform.</li>
            <li>Store Credit cannot be exchanged for cash.</li>
            <li>Promotional Store Credit may have an expiration date. Any unused promotional credit will be forfeited after the expiration date.</li>
            <li>Refund-related Store Credit does not expire.</li>
            <li>We reserve the right to modify these terms at any time.</li>
          </ul>

          <h2 className="text-2xl font-semibold mt-8 mb-4">Checking Your Balance</h2>
          <p>You can view your current Store Credit balance at any time by visiting the 'My Account' section and navigating to the 'Store Credit' tab.</p>
        </div>
      </div>
    </div>
  );
};

export default StoreCreditPage;
