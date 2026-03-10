// frontend/src/components/AddToCartButton.tsx
"use client";

import { useCart } from '../context/CartContext';
import { Product } from '../types';

interface AddToCartButtonProps {
  product: Product;
}

export default function AddToCartButton({ product }: AddToCartButtonProps) {
  const { addToCart } = useCart();

  const handleAddToCart = () => {
    addToCart(product);
  };

  return (
    <button
      onClick={handleAddToCart}
      className="w-full md:w-auto px-10 py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-all duration-200 text-lg shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
    >
      Add to Cart
    </button>
  );
}
