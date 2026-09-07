import React from 'react';

export const Card = ({ children, className = '', ...props }) => {
  return (
    <div 
      className={`bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`p-6 pb-2 ${className}`} {...props}>{children}</div>
);

export const CardTitle = ({ children, className = '', ...props }) => (
  <h3 className={`text-lg font-bold text-slate-800 dark:text-white ${className}`} {...props}>{children}</h3>
);

export const CardContent = ({ children, className = '', ...props }) => (
  <div className={`p-6 pt-2 ${className}`} {...props}>{children}</div>
);

export default Card;
