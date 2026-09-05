import { createContext, useContext, useReducer } from 'react';

const CartContext = createContext();

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_ITEM':
      const existingItem = state.items.find(item => item.id === action.payload.id);
      if (existingItem) {
        return {
          ...state,
          items: state.items.map(item =>
            item.id === action.payload.id ? { ...item, qty: item.qty + action.payload.qty } : item
          )
        };
      }
      return { ...state, items: [...state.items, action.payload] };
    case 'REMOVE_ITEM':
      return { ...state, items: state.items.filter(item => item.id !== action.payload) };
    case 'UPDATE_QTY':
      return {
        ...state,
        items: state.items.map(item =>
          item.id === action.payload.id ? { ...item, qty: action.payload.qty } : item
        )
      };
    case 'CLEAR_CART':
      return { items: [], restaurant: null };
    case 'SET_RESTAURANT':
      return { ...state, restaurant: action.payload };
    default:
      return state;
  }
};

export const CartProvider = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, { items: [], restaurant: null });

  const addItem = (item) => dispatch({ type: 'ADD_ITEM', payload: item });
  const removeItem = (id) => dispatch({ type: 'REMOVE_ITEM', payload: id });
  const updateQty = (id, qty) => dispatch({ type: 'UPDATE_QTY', payload: { id, qty } });
  const clearCart = () => dispatch({ type: 'CLEAR_CART' });
  const setRestaurant = (rest) => dispatch({ type: 'SET_RESTAURANT', payload: rest });

  const subtotal = state.items.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const deliveryFee = 10000;
  const serviceFee = 2000;
  const total = subtotal + deliveryFee + serviceFee;

  return (
    <CartContext.Provider value={{ cart: state, addItem, removeItem, updateQty, clearCart, setRestaurant, subtotal, deliveryFee, serviceFee, total }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => useContext(CartContext);
