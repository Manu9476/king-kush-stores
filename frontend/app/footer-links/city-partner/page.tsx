// app/footer-links/city-partner/page.tsx
import React from 'react';
import Link from 'next/link';

const CityPartnerPage = () => {
  return (
    <div className="container mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-6">City Partner Program</h1>
      <div className="space-y-4 text-lg">
        <p>
          The King-Kush City Partner Program is an opportunity for entrepreneurs to partner with us to bring our services to new cities.
          As a City Partner, you will be responsible for managing King-Kush operations in your city, from logistics to customer service.
        </p>
        <p>
          This is a unique opportunity to build a large-scale business with the support and backing of a major e-commerce brand.
          We are looking for motivated and experienced individuals with a deep understanding of their local market.
        </p>
        <h2 className="text-2xl font-bold mt-8 mb-4">What We Offer</h2>
        <ul className="list-disc list-inside space-y-2">
          <li>Exclusive rights to operate in your city</li>
          <li>Comprehensive training and support</li>
          <li>Access to our technology and logistics network</li>
          <li>A proven business model</li>
          <li>Attractive revenue sharing</li>
        </ul>
        <h2 className="text-2xl font-bold mt-8 mb-4">Interested?</h2>
        <p>
          If you are interested in becoming a City Partner, please visit our{' '}
          <Link href="/footer-links/careers" className="text-green-500 hover:underline">
            King-Kush Careers page
          </Link>
          {' '}and look for the City Partner role.
        </p>
      </div>
    </div>
  );
};

export default CityPartnerPage;
