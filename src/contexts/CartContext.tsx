import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product } from '../types';

/**
 * CartItem Interface
 * Defines the structure of a single item within the shopping cart.
 * Includes the product details, chosen quantity, and price unit.
 */
interface CartItem {
  product: Product;
  quantity: number;
  unit: 'tray' | 'small' | 'medium' | 'large' | 'xlarge' | 'jumbo';
}

/**
 * CartContextType Interface
 * Defines the public API provided by the CartContext for managing the cart state.
 */
interface CartContextType {
  cart: CartItem[]; // List of items currently in the cart
  addToCart: (product: Product, unit?: CartItem['unit']) => boolean; // Logic to add a new product or increment existing, returns false if one product limit exceeded
  removeFromCart: (productId: number, unit: CartItem['unit']) => void; // Removes a specific variant from the cart
  updateQuantity: (productId: number, unit: CartItem['unit'], delta: number) => void; // Adjusts quantity for a variant
  clearCart: () => void; // Resets the cart to empty
  totalAmount: number; // Sum total of all items in checkout
  getItemPrice: (item: { product: Product, unit: CartItem['unit'] }) => number; // Helper to get correct price based on unit
  isCartOpen: boolean; // UI state for the cart drawer
  setIsCartOpen: (isOpen: boolean) => void; // Sets the UI state for the cart drawer
}

const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * CartProvider Component
 * Manages the global shopping cart state, handles storage persistence, and provides context to children.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  // Initialize cart state from localStorage or default to empty array
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('eggmarket_cart');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to parse cart from localStorage:', e);
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState(false);

  /**
   * Persistence Hook: Updates localStorage whenever the cart content changes.
   * Includes data-minimization logic to prevent localStorage quota errors.
   */
  useEffect(() => {
    try {
      // Minimize data footprint before saving to prevent quota issues
      const cartToSave = cart.map(item => ({
        ...item,
        product: {
          ...item.product,
          // Strip large base64 strings if present
          image_url: item.product.image_url?.startsWith('data:') ? '' : item.product.image_url,
          description: '' // Omit description to save space as it's not needed for cart summary
        }
      }));
      localStorage.setItem('eggmarket_cart', JSON.stringify(cartToSave));
    } catch (e) {
      console.error('Failed to save cart to localStorage (Quota likely exceeded):', e);
      // Fallback: Save an extremely minimal version if the object is still too large
      try {
        const minimalCart = cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          unit: item.unit,
          name: item.product.name,
          price: item.product.price_per_tray
        }));
        localStorage.setItem('eggmarket_cart', JSON.stringify(minimalCart));
      } catch (innerError) {
        console.error('Even minimal cart failed to save:', innerError);
      }
    }
  }, [cart]);

  /**
   * Retrieves the dynamic price per unit based on product settings
   */
  const getItemPrice = (item: { product: Product, unit: CartItem['unit'] }) => {
    switch (item.unit) {
      case 'small': return item.product.price_small || 0;
      case 'medium': return item.product.price_medium || 0;
      case 'large': return item.product.price_large || 0;
      case 'xlarge': return item.product.price_xlarge || 0;
      case 'jumbo': return item.product.price_jumbo || 0;
      case 'tray': return item.product.price_per_tray;
      default: return item.product.price_per_tray;
    }
  };

  /**
   * Adds a product to the cart or increments its quantity if variant (Product ID + Unit) already exists.
   * Business Rule: Only one unique product allowed in the cart at a time.
   */
  const addToCart = (product: Product, unit: CartItem['unit'] = 'tray'): boolean => {
    // Check if cart already has a DIFFERENT product
    const differentProductInCart = cart.some(item => item.product.id !== product.id);
    
    if (differentProductInCart) {
      return false; // Indicate failure to caller
    }

    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id && item.unit === unit);
      if (existing) {
        return prev.map(item => {
          if (item.product.id === product.id && item.unit === unit) {
            let maxQty = 0;
            switch (unit) {
              case 'small': maxQty = product.stock_small || 0; break;
              case 'medium': maxQty = product.stock_medium || 0; break;
              case 'large': maxQty = product.stock_large || 0; break;
              case 'xlarge': maxQty = product.stock_xlarge || 0; break;
              case 'jumbo': maxQty = product.stock_jumbo || 0; break;
              case 'tray': maxQty = product.stock_tray || 0; break;
            }
            // Cap at available stock
            return { ...item, quantity: Math.min(item.quantity + 1, maxQty) };
          }
          return item;
        });
      }
      return [...prev, { product, quantity: 1, unit }];
    });
    return true; // Indicate success
  };

  /**
   * Removes a specific variant from the cart
   */
  const removeFromCart = (productId: number, unit: CartItem['unit']) => {
    setCart(prev => prev.filter(item => !(item.product.id === productId && item.unit === unit)));
  };

  /**
   * Increments or decrements item quantity while respecting stock boundaries
   */
  const updateQuantity = (productId: number, unit: CartItem['unit'], delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.product.id === productId && item.unit === unit) {
        let maxQty = 0;
        switch (unit) {
          case 'small': maxQty = item.product.stock_small || 0; break;
          case 'medium': maxQty = item.product.stock_medium || 0; break;
          case 'large': maxQty = item.product.stock_large || 0; break;
          case 'xlarge': maxQty = item.product.stock_xlarge || 0; break;
          case 'jumbo': maxQty = item.product.stock_jumbo || 0; break;
          case 'tray': maxQty = item.product.stock_tray || 0; break;
        }
        // Clamp between 1 and max stock
        const newQty = Math.max(1, Math.min(item.quantity + delta, maxQty));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  /**
   * Completely resets the cart to empty
   */
  const clearCart = () => setCart([]);

  /**
   * Derived state: Total checkout price
   */
  const totalAmount = cart.reduce((sum, item) => sum + (getItemPrice(item) * item.quantity), 0);

  return (
    <CartContext.Provider value={{ 
      cart, 
      addToCart, 
      removeFromCart, 
      updateQuantity, 
      clearCart, 
      totalAmount, 
      getItemPrice,
      isCartOpen,
      setIsCartOpen
    }}>
      {children}
    </CartContext.Provider>
  );
}

/**
 * useCart Hook
 * Provides a standardized way to access and modify the shopping cart from any component.
 */
export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
