import React from 'react';

/**
 * QRISCard Component
 * Displays a clean, standardized Indonesian QRIS code for DANA Statis payment.
 */
export default function QRISCard({ className = '' }) {
  return (
    <div className={`bg-white text-slate-900 rounded-2xl p-4 border border-slate-200 shadow-md max-w-[280px] mx-auto text-center ${className}`}>
      {/* QRIS Header */}
      <div className="border-b border-slate-200 pb-2 mb-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 bg-red-600 rounded flex items-center justify-center font-black text-white text-[10px]">
              Q
            </div>
            <span className="font-extrabold tracking-tight text-xs text-slate-900">
              QRIS
            </span>
          </div>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
            Standar Pembayaran Nasional
          </span>
        </div>
      </div>

      {/* Merchant Details */}
      <div className="mb-2">
        <p className="font-bold text-xs text-slate-900 tracking-tight">
          WIRAPAY OFFICIAL LOMBOK
        </p>
        <p className="text-[10px] text-slate-500 font-mono">
          NMID: ID1020023456789
        </p>
      </div>

      {/* Crisp Vector QRIS Barcode */}
      <div className="bg-white p-2 rounded-xl border border-slate-100 inline-block shadow-inner">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 45 45"
          shapeRendering="crispEdges"
          className="w-44 h-44 mx-auto"
        >
          <path fill="#ffffff" d="M0 0h45v45H0z" />
          <path
            stroke="#0f172a"
            d="M2 2.5h7m1 0h1m1 0h2m2 0h1m3 0h1m1 0h1m1 0h1m4 0h1m1 0h3m2 0h7M2 3.5h1m5 0h1m1 0h2m1 0h5m1 0h1m1 0h1m1 0h3m2 0h1m3 0h2m2 0h1m5 0h1M2 4.5h1m1 0h3m1 0h1m2 0h4m1 0h3m1 0h2m1 0h3m1 0h2m1 0h1m1 0h3m1 0h1m1 0h3m1 0h1M2 5.5h1m1 0h3m1 0h1m1 0h1m1 0h3m1 0h1m3 0h1m1 0h3m5 0h1m5 0h1m1 0h3m1 0h1M2 6.5h1m1 0h3m1 0h1m6 0h1m2 0h1m1 0h1m4 0h1m1 0h1m1 0h1m1 0h2m1 0h1m1 0h1m1 0h3m1 0h1M2 7.5h1m5 0h1m3 0h5m1 0h1m1 0h2m2 0h2m3 0h1m3 0h1m2 0h1m5 0h1M2 8.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M10 9.5h1m2 0h1m3 0h2m3 0h2m1 0h2m4 0h2m1 0h1M2 10.5h1m1 0h2m1 0h3m1 0h1m1 0h1m1 0h2m1 0h1m3 0h1m6 0h1m4 0h1m1 0h1m2 0h1m1 0h2M3 11.5h4m2 0h1m1 0h1m4 0h1m1 0h2m3 0h5m4 0h3m1 0h2m3 0h1M2 12.5h2m2 0h5m3 0h2m1 0h3m4 0h2m1 0h2m1 0h1m1 0h1m1 0h2m1 0h2m1 0h1M2 13.5h1m1 0h1m1 0h2m3 0h1m1 0h5m1 0h2m7 0h2m3 0h1m2 0h2m1 0h1m1 0h1M3 14.5h1m2 0h1m1 0h1m1 0h1m2 0h3m3 0h3m1 0h1m7 0h1m2 0h2m2 0h1m2 0h1M4 15.5h2m1 0h1m1 0h2m1 0h1m1 0h1m1 0h1m1 0h3m4 0h1m2 0h1m1 0h1m2 0h2m2 0h1m2 0h3M2 16.5h1m5 0h1m2 0h1m1 0h1m2 0h5m2 0h1m2 0h1m2 0h3m3 0h2m1 0h2m1 0h2M4 17.5h2m4 0h4m2 0h3m2 0h3m2 0h3m1 0h1m1 0h1m2 0h1m2 0h1m2 0h2M2 18.5h1m1 0h1m3 0h2m1 0h2m2 0h1m5 0h1m3 0h6m2 0h1m1 0h2m1 0h1m1 0h2M2 19.5h1m1 0h1m1 0h2m3 0h1m1 0h1m2 0h6m3 0h1m2 0h3m2 0h4m5 0h1M3 20.5h2m2 0h3m3 0h3m1 0h1m1 0h1m1 0h1m1 0h1m3 0h3m3 0h3m4 0h2M4 21.5h2m3 0h6m3 0h1m2 0h2m1 0h1m1 0h3m1 0h1m3 0h2m1 0h3M2 22.5h1m2 0h4m1 0h1m5 0h1m3 0h2m2 0h1m2 0h2m1 0h1m2 0h1m2 0h1m2 0h1m2 0h1M6 23.5h2m1 0h2m5 0h1m3 0h1m2 0h2m1 0h1m5 0h1m3 0h1m2 0h1m1 0h1M2 24.5h2m1 0h4m1 0h1m1 0h1m2 0h1m2 0h2m7 0h1m1 0h2m4 0h2m1 0h1M2 25.5h1m1 0h3m2 0h1m11 0h1m2 0h1m1 0h1m1 0h1m1 0h2m1 0h1m2 0h1m4 0h2M8 26.5h4m3 0h4m1 0h1m2 0h1m1 0h3m6 0h2m2 0h1M2 27.5h1m2 0h1m1 0h1m2 0h1m1 0h2m1 0h1m8 0h3m2 0h4m1 0h3m1 0h1m1 0h1M4 28.5h2m2 0h1m1 0h1m1 0h2m2 0h1m1 0h1m5 0h1m2 0h1m5 0h1m1 0h1m4 0h2M2 29.5h3m4 0h1m2 0h1m1 0h2m2 0h5m3 0h2m2 0h1m1 0h4m1 0h2m2 0h2M2 30.5h1m3 0h1m1 0h2m4 0h1m2 0h1m2 0h2m1 0h3m1 0h3m1 0h1m1 0h1m1 0h2m1 0h1M3 31.5h3m1 0h1m2 0h1m4 0h1m3 0h1m1 0h1m2 0h1m1 0h1m1 0h1m1 0h2m4 0h4m2 0h1M2 32.5h1m1 0h2m2 0h1m1 0h1m2 0h2m1 0h1m1 0h1m1 0h1m1 0h2m1 0h5m1 0h1m3 0h1m2 0h1m2 0h1M4 33.5h3m8 0h2m1 0h1m1 0h1m1 0h1m3 0h3m2 0h1m5 0h1m2 0h1m1 0h1M3 34.5h4m1 0h1m1 0h2m1 0h3m1 0h3m1 0h1m3 0h1m1 0h1m2 0h2m1 0h6M10 35.5h4m2 0h2m3 0h2m7 0h1m2 0h2m3 0h1m1 0h2M2 36.5h7m1 0h2m2 0h2m2 0h2m2 0h4m2 0h2m1 0h1m2 0h1m1 0h1m1 0h1M2 37.5h1m5 0h1m1 0h2m6 0h1m1 0h1m1 0h4m1 0h4m1 0h3m3 0h1m3 0h1M2 38.5h1m1 0h3m1 0h1m3 0h3m1 0h2m2 0h1m1 0h5m3 0h1m1 0h1m1 0h5m1 0h2M2 39.5h1m1 0h3m1 0h1m1 0h2m1 0h2m2 0h1m1 0h2m1 0h1m7 0h1m2 0h2m1 0h2m2 0h1M2 40.5h1m1 0h3m1 0h1m1 0h3m1 0h2m1 0h1m3 0h1m1 0h1m2 0h1m7 0h3m2 0h1m2 0h1M2 41.5h1m5 0h1m2 0h2m1 0h4m1 0h1m4 0h2m1 0h1m1 0h1m1 0h1m1 0h3m2 0h1m1 0h1M2 42.5h7m1 0h3m1 0h1m2 0h3m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h2m2 0h4m2 0h1"
          />
        </svg>
      </div>

      {/* DANA & Payment Networks Footer */}
      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
        <div className="flex items-center gap-1 font-semibold text-sky-600">
          <span className="w-2 h-2 rounded-full bg-sky-500 inline-block"></span>
          <span>DANA Bisnis</span>
        </div>
        <span className="text-[9px] text-slate-400">
          PT Espay Debit Indonesia Koe
        </span>
      </div>
    </div>
  );
}
