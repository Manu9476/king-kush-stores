"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

import {
  getProductDefaultSaleOption,
  getProductSaleOptionById,
  getUnitAwareEffectivePrice,
  getUnitAwareOriginalPrice,
  getUnitLabelForOption,
} from "../lib/utils";
import { Product } from "../types";

export interface CartItem extends Product {
  quantity: number;
  cart_item_key: string;
  cart_unit_price?: string;
  cart_original_unit_price?: string;
  selected_sale_option_id: number | null;
  selected_sale_option_label: string;
  stock_units_per_purchase: number;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (product: Product, saleOptionId?: number | null) => void;
  removeFromCart: (cartItemKey: string) => void;
  updateCartQuantity: (cartItemKey: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function hydrateLegacyCart(raw: any[]): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const selectedOptionId =
      typeof item.selected_sale_option_id === "number"
        ? item.selected_sale_option_id
        : (item.default_sale_option_id ?? null);
    const fallbackKey = `${item.id}:${selectedOptionId ?? "base"}`;
    const option = getProductSaleOptionById(item, selectedOptionId) || getProductDefaultSaleOption(item);
    const unitPrice = Number(item.cart_unit_price ?? getUnitAwareEffectivePrice(item, selectedOptionId));
    const originalUnitPrice = Number(item.cart_original_unit_price ?? getUnitAwareOriginalPrice(item, selectedOptionId));
    return {
      ...item,
      quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      cart_item_key: item.cart_item_key || fallbackKey,
      cart_unit_price: Number.isFinite(unitPrice) ? unitPrice.toFixed(2) : "0.00",
      cart_original_unit_price: Number.isFinite(originalUnitPrice) ? originalUnitPrice.toFixed(2) : "0.00",
      selected_sale_option_id: selectedOptionId,
      selected_sale_option_label:
        item.selected_sale_option_label || option?.label || getUnitLabelForOption(item, selectedOptionId),
      stock_units_per_purchase: option?.stock_units_consumed || 1,
    } as CartItem;
  });
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const storedCart = localStorage.getItem("cart");
    if (!storedCart) return;
    try {
      const parsed = JSON.parse(storedCart);
      setCartItems(hydrateLegacyCart(parsed));
    } catch {
      setCartItems([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cartItems));
  }, [cartItems]);

  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cartItems.reduce((total, item) => {
    const unitPrice = Number(item.cart_unit_price || 0);
    return total + unitPrice * item.quantity;
  }, 0);

  const addToCart = (product: Product, saleOptionId?: number | null) => {
    const selectedOption =
      getProductSaleOptionById(product, saleOptionId ?? null) ||
      getProductDefaultSaleOption(product);
    const selectedOptionId = selectedOption?.id ?? null;
    const cartKey = `${product.id}:${selectedOptionId ?? "base"}`;
    const unitPrice = getUnitAwareEffectivePrice(product, selectedOptionId);
    const originalUnitPrice = getUnitAwareOriginalPrice(product, selectedOptionId);
    const unitLabel = selectedOption?.label || getUnitLabelForOption(product, selectedOptionId);

    setCartItems((prevItems) => {
      const existingItem = prevItems.find((item) => item.cart_item_key === cartKey);
      if (existingItem) {
        return prevItems.map((item) =>
          item.cart_item_key === cartKey ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      const nextItem: CartItem = {
        ...product,
        quantity: 1,
        cart_item_key: cartKey,
        cart_unit_price: unitPrice.toFixed(2),
        cart_original_unit_price: originalUnitPrice.toFixed(2),
        selected_sale_option_id: selectedOptionId,
        selected_sale_option_label: unitLabel,
        stock_units_per_purchase: selectedOption?.stock_units_consumed || 1,
      };
      return [...prevItems, nextItem];
    });
  };

  const removeFromCart = (cartItemKey: string) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.cart_item_key !== cartItemKey));
  };

  const updateCartQuantity = (cartItemKey: string, quantity: number) => {
    setCartItems((prevItems) => {
      if (quantity <= 0) {
        return prevItems.filter((item) => item.cart_item_key !== cartItemKey);
      }
      return prevItems.map((item) =>
        item.cart_item_key === cartItemKey ? { ...item, quantity } : item,
      );
    });
  };

  const clearCart = () => {
    setCartItems([]);
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        cartTotal,
        cartCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
