import React from 'react';
import { Star } from 'lucide-react';

export const Card = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden ${className}`}>
    {children}
  </div>
);

export const Badge = ({ children, variant = 'primary' }) => {
  const variants = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    warning: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    gray: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
  };
  return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${variants[variant] || variants.primary}`}>{children}</span>;
};

export const Button = ({ children, variant = 'primary', className = '', ...props }) => {
  const base = "px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-primary text-white hover:bg-primary/90 focus:ring-primary",
    secondary: "bg-secondary text-white hover:bg-secondary/90 focus:ring-secondary",
    outline: "border-2 border-primary text-primary hover:bg-primary hover:text-white focus:ring-primary",
    danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
};

export const StarRating = ({ rating = 5 }) => (
  <div className="flex text-yellow-400">
    {[...Array(5)].map((_, i) => (
      <Star key={i} size={16} fill={i < rating ? "currentColor" : "none"} className={i >= rating ? "text-slate-300" : ""} />
    ))}
  </div>
);

export const EmptyState = ({ icon: Icon, title, description }) => (
  <div className="flex flex-col items-center justify-center p-8 text-center">
    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-4 text-slate-400">
      <Icon size={32} />
    </div>
    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-2">{title}</h3>
    <p className="text-slate-500 dark:text-slate-400">{description}</p>
  </div>
);

/**
 * Shared modal shell - was reimplemented 5 separate times (ChatModal,
 * PayoutPanel, the driver/merchant incoming-order prompts, MerchantMenuPage's
 * add/edit form) each with its own z-index (z-50 / z-[100] / z-[200]), a
 * latent stacking bug if two ever ended up open at once. One managed
 * z-modal token now, from tailwind.config.js.
 */
export const Modal = ({ isOpen, onClose, children, className = '', closeOnBackdrop = true }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 z-modal flex items-center justify-center p-4"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`bg-white dark:bg-slate-800 rounded-modal shadow-2xl w-full ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * Shared "icon + big number + label" tile - was copy-pasted inline in
 * DriverHomePage.jsx and MerchantHomePage.jsx with only color/content
 * differing.
 */
export const StatTile = ({ icon: Icon, value, label, iconClassName = 'text-primary' }) => (
  <Card className="p-4 flex flex-col items-center justify-center text-center shadow-lg bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-slate-100 dark:border-slate-700">
    <Icon className={`${iconClassName} mb-2`} size={28} />
    <span className="text-2xl font-bold">{value}</span>
    <span className="text-xs text-slate-500">{label}</span>
  </Card>
);
