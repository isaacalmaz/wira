import React from 'react';

const OnlineToggle = ({ isOnline, onChange }) => {
  return (
    <button 
      onClick={() => onChange(!isOnline)}
      className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none shadow-inner ${
        isOnline ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span className="sr-only">Toggle Online Status</span>
      <span
        className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
          isOnline ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  );
};

export default OnlineToggle;
