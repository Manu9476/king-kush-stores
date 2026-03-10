import React from 'react';

const ExpressPage: React.FC = () => {
  return (
    <div>
      <div className="bg-blue-600 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-extrabold">King-Kush Express</h1>
          <p className="text-xl mt-4">Faster, more reliable delivery right to your doorstep.</p>
        </div>
      </div>

      <div className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <img src="/file.svg" alt="Delivery Van" className="rounded-lg shadow-md" />
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-4">What is King-Kush Express?</h2>
              <p className="text-lg text-gray-700 mb-6">King-Kush Express is our premium delivery service, designed to get your orders to you faster than ever. By managing our own logistics network, we can ensure quicker dispatch times, better handling of your packages, and more accurate delivery estimates.</p>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="bg-blue-100 text-blue-600 p-2 rounded-full">✓</span>
                  <p><strong>Next-Day Delivery:</strong> On eligible items in major cities.</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="bg-blue-100 text-blue-600 p-2 rounded-full">✓</span>
                  <p><strong>Real-Time Tracking:</strong> Watch your package's journey from our warehouse to your door.</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="bg-blue-100 text-blue-600 p-2 rounded-full">✓</span>
                  <p><strong>Professional Handling:</strong> Our trained delivery agents handle your items with care.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExpressPage;
