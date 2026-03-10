// src/components/ComingSoon.tsx
import React from 'react';

const ComingSoon: React.FC<{ country: string }> = ({ country }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center p-8 bg-white rounded-lg shadow-xl">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">Coming Soon to {country}!</h1>
        <p className="text-lg text-gray-600">We are working hard to bring King-Kush Stores to {country}. Stay tuned!</p>
      </div>
    </div>
  );
};

export default ComingSoon;
