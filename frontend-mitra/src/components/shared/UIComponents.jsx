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
