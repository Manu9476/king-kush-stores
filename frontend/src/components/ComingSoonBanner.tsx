// src/components/ComingSoonBanner.tsx
import React from 'react';

interface ComingSoonBannerProps {
  country: string;
}

const ComingSoonBanner: React.FC<ComingSoonBannerProps> = ({ country }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] bg-gradient-to-br from-gray-900 to-gray-600">
      <div className="text-center p-12 md:p-20 rounded-xl shadow-2xl bg-black bg-opacity-50 backdrop-blur-sm border border-gray-700">
        <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4">
          King-Kush in {country}
        </h1>
        <p className="text-4xl md:text-5xl text-green-400 font-bold animate-pulse mb-8">
          Coming Soon!
        </p>
        <p className="text-lg md:text-xl text-gray-300">
          We are working hard to bring our premium services to {country}. Stay tuned for the grand launch!
        </p>
      </div>
    </div>
  );
};

export default ComingSoonBanner;

