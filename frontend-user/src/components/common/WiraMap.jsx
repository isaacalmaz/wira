import React, { useState, useEffect } from 'react';
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { MapPin, AlertCircle } from 'lucide-react';

const libraries = ['places'];
const mapContainerStyle = { width: '100%', height: '100%' };

export default function WiraMap({ center, zoom = 14, markers = [], route = null }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    libraries,
  });

  if (!apiKey) {
    return (
      <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center text-slate-500 p-4 text-center border border-dashed border-slate-300 dark:border-slate-700">
        <MapPin size={40} className="text-slate-400 mb-2" />
        <p className="font-semibold text-slate-700 dark:text-slate-300">Menunggu Integrasi Google Maps</p>
        <p className="text-xs mt-1">Tambahkan <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> di file .env</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full bg-red-50 flex flex-col items-center justify-center text-red-500 p-4 text-center">
        <AlertCircle size={40} className="mb-2" />
        <p className="font-semibold">Gagal memuat Google Maps</p>
        <p className="text-xs mt-1">Pastikan API Key valid dan domain diizinkan.</p>
      </div>
    );
  }

  if (!isLoaded) return <div className="w-full h-full bg-slate-200 animate-pulse"></div>;

  return (
    <GoogleMap
      mapContainerStyle={mapContainerStyle}
      center={center}
      zoom={zoom}
      options={{ disableDefaultUI: true, zoomControl: false }}
    >
      {/* Jika tidak ada rute, tampilkan marker individual */}
      {!route && markers.map((m, idx) => (
        <Marker key={idx} position={m} />
      ))}
      
      {/* Jika ada DirectionsResult, tampilkan rutenya */}
      {route && (
        <DirectionsRenderer directions={route} options={{ suppressMarkers: false }} />
      )}
    </GoogleMap>
  );
}
