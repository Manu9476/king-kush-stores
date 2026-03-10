import React from 'react';

const ShippingAndDeliveryPage: React.FC = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-4xl font-bold mb-6">Shipping and Delivery</h1>
        
        <div className="space-y-6 text-gray-700">
          <p>At King-Kush Stores, we are committed to delivering your products in a timely and secure manner. Here’s everything you need to know about our shipping and delivery process.</p>
          
          <div className="prose lg:prose-xl max-w-none">
            <h2 className="text-2xl font-semibold mt-8 mb-4">Delivery Timelines</h2>
            <p>Our delivery timelines vary depending on your location and the type of product you have ordered.</p>
            <ul>
              <li><strong>Standard Delivery:</strong> Typically takes 3-5 business days for orders within major cities and 5-7 business days for other locations.</li>
              <li><strong>King-Kush Express:</strong> For eligible items, we offer next-day delivery within Nairobi and 2-day delivery in other major towns.</li>
            </ul>
            
            <h2 className="text-2xl font-semibold mt-8 mb-4">Shipping Fees</h2>
            <p>Shipping fees are calculated based on the weight of your order and your delivery location. The final shipping cost will be displayed at checkout before you confirm your order.</p>
            
            <h2 className="text-2xl font-semibold mt-8 mb-4">How to Track Your Order</h2>
            <p>Once your order is shipped, you will receive an email and SMS with a tracking number. You can use this number on our "Track Your Order" page to see the real-time status of your delivery.</p>
            
            <h2 className="text-2xl font-semibold mt-8 mb-4">International Shipping</h2>
            <p>Currently, we only ship within Kenya. We are working on expanding to other countries in East Africa soon. Stay tuned for updates on our "King-Kush International" page.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShippingAndDeliveryPage;
