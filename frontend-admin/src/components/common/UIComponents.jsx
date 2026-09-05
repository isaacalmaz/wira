import React from 'react';

// FormField Komponen
export const FormField = ({ label, type = 'text', value, onChange, placeholder, options = [], className = '' }) => {
  return (
    <div className={`mb-4 ${className}`}>
      {label && <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{label}</label>}
      {type === 'select' ? (
        <select
          value={value}
          onChange={onChange}
          className="input-field px-3 py-2 border rounded-md"
        >
          {options.map((opt, i) => (
            <option key={i} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="input-field px-3 py-2 border rounded-md min-h-[100px]"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="input-field px-3 py-2 border rounded-md"
        />
      )}
    </div>
  );
};

// Pagination Komponen
export const Pagination = ({ currentPage = 1, totalPages = 1, onPageChange }) => {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 px-4 py-3 sm:px-6">
      <div className="flex flex-1 justify-between sm:hidden">
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="relative inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Previous</button>
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="relative ml-3 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Next</button>
      </div>
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Halaman <span className="font-medium">{currentPage}</span> dari <span className="font-medium">{totalPages}</span>
          </p>
        </div>
        <div>
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
            >
              <span className="sr-only">Previous</span>
              &larr;
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50"
            >
              <span className="sr-only">Next</span>
              &rarr;
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
};

// ConfirmModal Komponen
export const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div className="fixed inset-0 bg-slate-900/75 transition-opacity" onClick={onCancel}></div>
        <div className="relative transform overflow-hidden rounded-lg bg-white dark:bg-slate-800 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          <div className="bg-white dark:bg-slate-800 px-4 pb-4 pt-5 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                <h3 className="text-lg font-semibold leading-6 text-slate-900 dark:text-white">{title}</h3>
                <div className="mt-2">
                  <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-700/50 px-4 py-3 sm:flex sm:flex-row-reverse sm:px-6">
            <button type="button" onClick={onConfirm} className="inline-flex w-full justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-cyan-600 sm:ml-3 sm:w-auto">Konfirmasi</button>
            <button type="button" onClick={onCancel} className="mt-3 inline-flex w-full justify-center rounded-md bg-white dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 sm:mt-0 sm:w-auto">Batal</button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Status Badge
export const StatusBadge = ({ status }) => {
  let colors = 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300';
  const s = status.toLowerCase();
  
  if (s === 'active' || s === 'delivered' || s === 'read') {
    colors = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  } else if (s === 'pending') {
    colors = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  } else if (s === 'inactive' || s === 'cancelled' || s === 'failed') {
    colors = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${colors}`}>
      {status}
    </span>
  );
};
