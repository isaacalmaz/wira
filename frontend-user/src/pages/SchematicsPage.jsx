import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Network, 
  Workflow, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  ArrowRight, 
  Layers, 
  Database, 
  Server, 
  Smartphone, 
  ShieldCheck, 
  Wallet, 
  MapPin, 
  Car, 
  Store, 
  Wrench, 
  Zap,
  Info,
  Clock,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { 
  getStoredOrders, 
  createEcosystemOrder, 
  updateOrderStatusEcosystem, 
  subscribeEcosystemEvent 
} from '../services/ecosystemService';

export default function SchematicsPage() {
  const [activeTab, setActiveTab] = useState('diagram');
  const [selectedService, setSelectedService] = useState('ride');
  const [simStep, setSimStep] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simLogs, setSimLogs] = useState([]);
  const [currentOrder, setCurrentOrder] = useState(null);

  const addLog = (stage, message, type = 'info', metadata = null) => {
    setSimLogs((prev) => [
      {
        id: Date.now() + Math.random(),
        time: new Date().toLocaleTimeString('id-ID', { hour12: false }),
        stage,
        message,
        type,
        metadata
      },
      ...prev.slice(0, 15)
    ]);
  };

  const simulationSteps = [
    {
      step: 1,
      name: 'Order Placement (Pelanggan)',
      actor: 'User App (PWA)',
      status: 'pending',
      desc: 'Pelanggan memilih titik jemput (Mataram Mall) & tujuan (Senggigi), kalkulasi tarif Rp 28.000.',
      action: 'Validasi saldo / metode tunai, cek coverage region Lombok, insert ke tabel orders.',
    },
    {
      step: 2,
      name: 'Geo-Matching & Radar Dispatch',
      actor: 'Matching Engine & Supabase Realtime',
      status: 'pending',
      desc: 'Sistem memindai driver aktif terdekat dengan algoritma Haversine radius 5 km.',
      action: 'Broadcast via channel "driver-orders". Driver terdekat (Made Suardana, 1.2 km) menerima notifikasi.',
    },
    {
      step: 3,
      name: 'Mitra Order Acceptance',
      actor: 'Portal Mitra (Driver)',
      status: 'accepted',
      desc: 'Driver menekan "Ambil Pesanan". Status order terkunci untuk driver tersebut.',
      action: 'Update status "accepted", driver_id disematkan. User tracking beralih ke Live Map.',
    },
    {
      step: 4,
      name: 'In-Transit / Execution',
      actor: 'Mitra & Customer',
      status: 'in_progress',
      desc: 'Driver menjemput pelanggan dan melakukan perjalanan menuju tujuan.',
      action: 'Status berubah "in_progress", koordinat GPS dikirim berkala ke channel realtime.',
    },
    {
      step: 5,
      name: 'Completion & Double-Entry Ledger',
      actor: 'System Settlement Engine',
      status: 'completed',
      desc: 'Perjalanan selesai. Sistem mengeksekusi split komisi otomatis: 80% Mitra, 20% Platform.',
      action: 'Mitra menerima Rp 22.400, Platform Wira menerima Rp 5.600. Riwayat tercatat di Admin Finance.',
    },
  ];

  const handleStartSimulation = async () => {
    setIsSimulating(true);
    setSimStep(1);
    setSimLogs([]);

    // Step 1: Create
    const orderData = {
      serviceType: selectedService,
      title: selectedService === 'ride' 
        ? 'Simulasi Ride: Mataram Mall ➔ Pantai Senggigi'
        : selectedService === 'food'
        ? 'Simulasi Food: Ayam Taliwang Bu Siti'
        : 'Simulasi Service: Service AC Mataram',
      details: 'Order tes skematik end-to-end Wira Lombok',
      price: selectedService === 'ride' ? 28000 : selectedService === 'food' ? 55000 : 120000,
      paymentMethod: 'WiraPay',
      customerName: 'Lalu Wisatawan (Demo)',
    };

    const created = createEcosystemOrder(orderData);
    setCurrentOrder(created);
    addLog('Order Inisiasi', `Order ${created.id} dibuat oleh Pelanggan. Total: Rp ${created.total_price.toLocaleString('id-ID')}`, 'success');

    // Step 2: Matching
    setTimeout(() => {
      setSimStep(2);
      addLog('Geo-Matching', 'Algoritma Haversine menemukan Driver terdekat: Made Suardana (1.2 km dari titik jemput)', 'info');
      
      // Step 3: Accept
      setTimeout(() => {
        setSimStep(3);
        const accepted = updateOrderStatusEcosystem(created.id, 'accepted', {
          driver_id: 'drv-made-01',
          driver_name: 'Made Suardana',
        });
        setCurrentOrder(accepted);
        addLog('Mitra Accepted', 'Driver Made Suardana mengambil order. Status beralih ke "accepted"', 'success');

        // Step 4: In Progress
        setTimeout(() => {
          setSimStep(4);
          const inProgress = updateOrderStatusEcosystem(created.id, 'in_progress');
          setCurrentOrder(inProgress);
          addLog('In-Transit', 'Driver telah menjemput penumpang. Perjalanan menuju Senggigi sedang berlangsung', 'info');

          // Step 5: Complete & Ledger
          setTimeout(() => {
            setSimStep(5);
            const completed = updateOrderStatusEcosystem(created.id, 'completed');
            setCurrentOrder(completed);
            setIsSimulating(false);
            addLog(
              'Ledger Settlement', 
              `Order Selesai! Split 80/20: Mitra Rp ${(completed?.settlement?.mitraShare || 22400).toLocaleString('id-ID')} | Wira Platform Rp ${(completed?.settlement?.platformShare || 5600).toLocaleString('id-ID')}`, 
              'success'
            );
          }, 2400);
        }, 2200);
      }, 2000);
    }, 1800);
  };

  const handleResetSim = () => {
    setSimStep(0);
    setIsSimulating(false);
    setCurrentOrder(null);
    setSimLogs([]);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans pb-24">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 border-b border-cyan-800/40 px-4 sm:px-8 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-semibold mb-3">
                <Network size={14} className="animate-spin-slow" /> WIRA SUPER-APP ECOSYSTEM SCHEMATICS
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                Skematik Arsitektur & Alur Logika Sistem
              </h1>
              <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-3xl">
                Visualisasi interkoneksi menyeluruh antara <strong className="text-cyan-400">Portal Pelanggan</strong>, <strong className="text-amber-400">Portal Mitra</strong>, <strong className="text-emerald-400">Admin Command Center</strong>, Realtime Engine, dan Database Ledger.
              </p>
            </div>

            {/* Direct Jump Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                to="/"
                className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Smartphone size={14} /> Buka App User
              </Link>
              <Link
                to="/mitra/driver"
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Car size={14} /> Buka Mitra Driver
              </Link>
              <Link
                to="/admin/dashboard"
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <ShieldCheck size={14} /> Buka Admin
              </Link>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 border-b border-slate-800 mt-8 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'diagram', label: 'Arsitektur End-to-End', icon: Layers },
              { id: 'simulator', label: 'Simulator Alur Order Interaktif', icon: Workflow },
              { id: 'statemachine', label: 'State Machine & Lifecycle', icon: RotateCcw },
              { id: 'database', label: 'Skema Database (ERD)', icon: Database },
              { id: 'pricing', label: 'Matriks Tarif & Feature Flags', icon: Zap },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg font-semibold text-sm transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-800 text-cyan-400 border-b-2 border-cyan-400'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-8">
        {/* TAB 1: ARSITEKTUR END-TO-END */}
        {activeTab === 'diagram' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* 4 TIER ARCHITECTURE CARDS */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              
              {/* TIER 1: CLIENT APPS */}
              <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-cyan-500/50 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
                      Tier 1: Client Frontends
                    </span>
                    <Smartphone size={18} className="text-cyan-400" />
                  </div>
                  <h3 className="font-bold text-lg text-white mb-2">Aplikasi Pengguna & Mitra</h3>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Tiga portal frontend responsif yang beroperasi di perangkat pengguna dan mitra.
                  </p>

                  <div className="space-y-2">
                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                        <span className="font-medium text-slate-200">Customer PWA (User App)</span>
                      </div>
                      <Link to="/" className="text-cyan-400 hover:underline flex items-center gap-0.5">Buka <ExternalLink size={10} /></Link>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                        <span className="font-medium text-slate-200">Mitra Driver (WiraRide/Send)</span>
                      </div>
                      <Link to="/mitra/driver" className="text-amber-400 hover:underline flex items-center gap-0.5">Buka <ExternalLink size={10} /></Link>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                        <span className="font-medium text-slate-200">Mitra Merchant (WiraFood)</span>
                      </div>
                      <Link to="/mitra/merchant" className="text-orange-400 hover:underline flex items-center gap-0.5">Buka <ExternalLink size={10} /></Link>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                        <span className="font-medium text-slate-200">Mitra Teknisi (AC & Pool)</span>
                      </div>
                      <Link to="/mitra/technician" className="text-blue-400 hover:underline flex items-center gap-0.5">Buka <ExternalLink size={10} /></Link>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span className="font-medium text-slate-200">Admin Command Center</span>
                      </div>
                      <Link to="/admin/dashboard" className="text-emerald-400 hover:underline flex items-center gap-0.5">Buka <ExternalLink size={10} /></Link>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700/50 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Leaflet GPS Map</span>
                  <span className="text-cyan-400">React 18 + Tailwind</span>
                </div>
              </div>

              {/* TIER 2: REALTIME & GATEWAY */}
              <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-amber-500/50 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
                      Tier 2: Realtime & Gateway
                    </span>
                    <Zap size={18} className="text-amber-400" />
                  </div>
                  <h3 className="font-bold text-lg text-white mb-2">Supabase Realtime & API</h3>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Menghubungkan event antar-portal secara instan tanpa delay dengan arsitektur Pub/Sub.
                  </p>

                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60">
                      <div className="font-bold text-slate-200 flex items-center gap-1.5">
                        <span className="text-amber-400">⚡</span> Channel `driver-orders`
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Memancarkan event INSERT pesanan baru berstatus 'pending' langsung ke radar driver terdekat.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60">
                      <div className="font-bold text-slate-200 flex items-center gap-1.5">
                        <span className="text-cyan-400">🔄</span> Channel `order_{`id`}`
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Kanal privat user untuk mendengarkan perubahan status driver (accepted ➔ tracking ➔ completed).
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60">
                      <div className="font-bold text-slate-200 flex items-center gap-1.5">
                        <span className="text-emerald-400">🛡️</span> Channel `realtime-admin-notifs`
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Pemberitahuan pendaftaran mitra baru dan audit pesanan secara langsung ke Admin Ops.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700/50 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>WebSocket Protocol</span>
                  <span className="text-amber-400">Postgres CDC & Broadcast</span>
                </div>
              </div>

              {/* TIER 3: BUSINESS LOGIC ENGINES */}
              <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-purple-500/50 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800">
                      Tier 3: Core Logic Engines
                    </span>
                    <Server size={18} className="text-purple-400" />
                  </div>
                  <h3 className="font-bold text-lg text-white mb-2">Engine Bisnis & Aturan</h3>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Aturan komputasi tarif, pencocokan GPS, alokasi bagi hasil, dan validasi status order.
                  </p>

                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60">
                      <div className="font-bold text-purple-300">1. Geo-Matching Engine</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Formula Haversine menghitung jarak GPS, menyaring driver online dalam radius &lt; 5 km.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60">
                      <div className="font-bold text-purple-300">2. Dynamic Tariff & Surge</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Tarif dasar Rp 8.000 + Rp 2.500/km (WiraRide), diskon promo, dan biaya platform Rp 2.000.
                      </p>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-700/60">
                      <div className="font-bold text-purple-300">3. 80/20 Commission Split</div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Saat order completed, 80% masuk ke dompet Mitra dan 20% masuk ke kas pendapatan Wira.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700/50 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>State Machine Validator</span>
                  <span className="text-purple-400">Strict Lock Prevention</span>
                </div>
              </div>

              {/* TIER 4: PERSISTENCE & DATABASE */}
              <div className="bg-slate-800/70 border border-slate-700/80 rounded-2xl p-5 flex flex-col justify-between hover:border-emerald-500/50 transition-all">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] uppercase tracking-wider font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                      Tier 4: Persistence Layer
                    </span>
                    <Database size={18} className="text-emerald-400" />
                  </div>
                  <h3 className="font-bold text-lg text-white mb-2">Supabase PostgreSQL</h3>
                  <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                    Database relasional dengan Row Level Security (RLS) dan integritas transaksi ACID.
                  </p>

                  <div className="space-y-1.5 text-xs">
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-700/50 flex justify-between">
                      <span className="font-mono text-emerald-300">orders</span>
                      <span className="text-slate-400 text-[10px]">Realtime CDC</span>
                    </div>
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-700/50 flex justify-between">
                      <span className="font-mono text-emerald-300">users & drivers</span>
                      <span className="text-slate-400 text-[10px]">Auth & Roles</span>
                    </div>
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-700/50 flex justify-between">
                      <span className="font-mono text-emerald-300">transactions & wallets</span>
                      <span className="text-slate-400 text-[10px]">Double-Entry Ledger</span>
                    </div>
                    <div className="p-2 rounded bg-slate-900/80 border border-slate-700/50 flex justify-between">
                      <span className="font-mono text-emerald-300">feature_flags</span>
                      <span className="text-slate-400 text-[10px]">Regional Switch</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-700/50 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>PostgreSQL 15</span>
                  <span className="text-emerald-400">Row Level Security</span>
                </div>
              </div>

            </div>

            {/* FULL VISUAL FLOWCHART GRAPH */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Workflow className="text-cyan-400" size={22} /> Alur Interaksi Lintas Portal & Siklus Hidup Pesanan
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Bagaimana data mengalir dari klik pertama pelanggan di Mataram hingga pelaporan keuangan di Admin
                  </p>
                </div>
              </div>

              {/* FLOWCHART STEPS VISUAL */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
                {simulationSteps.map((s, idx) => (
                  <div 
                    key={s.step} 
                    className={`p-4 rounded-xl border transition-all ${
                      idx === 0 
                        ? 'bg-cyan-950/30 border-cyan-700/60'
                        : idx === 1
                        ? 'bg-amber-950/30 border-amber-700/60'
                        : idx === 2
                        ? 'bg-orange-950/30 border-orange-700/60'
                        : idx === 3
                        ? 'bg-blue-950/30 border-blue-700/60'
                        : 'bg-emerald-950/30 border-emerald-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-6 h-6 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center border border-slate-600">
                        {s.step}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-900/90 text-slate-300">
                        {s.status}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm text-white mb-1">{s.name}</h4>
                    <p className="text-[11px] text-cyan-300 font-medium mb-2">{s.actor}</p>
                    <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">{s.desc}</p>
                    <div className="p-2 rounded bg-slate-900/80 text-[10px] text-slate-300 font-mono border border-slate-800">
                      ⚡ {s.action}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SIMULATOR ALUR ORDER INTERAKTIF */}
        {activeTab === 'simulator' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Play className="text-emerald-400" size={22} /> Simulator Ekosistem Real-Time
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Jalankan pesanan simulasi langsung untuk menguji verifikasi logika, broadcast channel, dan alokasi bagi hasil.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700 text-xs">
                    <button
                      onClick={() => setSelectedService('ride')}
                      className={`px-3 py-1.5 rounded-md font-semibold ${selectedService === 'ride' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}
                    >
                      WiraRide
                    </button>
                    <button
                      onClick={() => setSelectedService('food')}
                      className={`px-3 py-1.5 rounded-md font-semibold ${selectedService === 'food' ? 'bg-orange-600 text-white' : 'text-slate-400'}`}
                    >
                      WiraFood
                    </button>
                    <button
                      onClick={() => setSelectedService('service')}
                      className={`px-3 py-1.5 rounded-md font-semibold ${selectedService === 'service' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}
                    >
                      WiraService
                    </button>
                  </div>

                  <button
                    onClick={handleStartSimulation}
                    disabled={isSimulating}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-900/30 transition-all"
                  >
                    <Play size={16} /> {isSimulating ? 'Simulasi Berjalan...' : 'Jalankan Simulasi'}
                  </button>

                  <button
                    onClick={handleResetSim}
                    className="p-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 transition-all"
                    title="Reset Simulator"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
              </div>

              {/* SIMULATION STEPPER PROGRESS */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
                {simulationSteps.map((s) => {
                  const isPast = simStep > s.step;
                  const isCurrent = simStep === s.step;
                  return (
                    <div
                      key={s.step}
                      className={`p-4 rounded-xl border transition-all ${
                        isCurrent
                          ? 'bg-cyan-950/60 border-cyan-400 shadow-md shadow-cyan-950'
                          : isPast
                          ? 'bg-slate-800/90 border-emerald-500/60'
                          : 'bg-slate-900/60 border-slate-800 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`w-6 h-6 rounded-full font-bold text-xs flex items-center justify-center ${
                            isPast
                              ? 'bg-emerald-500 text-slate-950'
                              : isCurrent
                              ? 'bg-cyan-500 text-slate-950 animate-pulse'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isPast ? '✓' : s.step}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{s.status}</span>
                      </div>
                      <h4 className="font-bold text-xs text-white mb-1">{s.name}</h4>
                      <p className="text-[10px] text-slate-400 leading-tight">{s.actor}</p>
                    </div>
                  );
                })}
              </div>

              {/* LIVE CONSOLE & ORDER INSPECTOR */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* ACTIVE ORDER PAYLOAD INSPECTOR */}
                <div className="lg:col-span-5 bg-slate-900 rounded-xl p-4 border border-slate-700/80">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Database size={14} className="text-cyan-400" /> Active Order Entity
                    </span>
                    {currentOrder && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                        {currentOrder.status.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {currentOrder ? (
                    <div className="space-y-3 text-xs">
                      <div className="p-2.5 rounded bg-slate-800/80 border border-slate-700/60 space-y-1">
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Order ID:</span>
                          <span className="font-mono text-white">{currentOrder.id}</span>
                        </div>
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Layanan:</span>
                          <span className="font-semibold text-cyan-400 capitalize">{currentOrder.service_type}</span>
                        </div>
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Pelanggan:</span>
                          <span className="text-white">{currentOrder.customer_name}</span>
                        </div>
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Driver / Mitra:</span>
                          <span className="text-amber-400">{currentOrder.driver_name || 'Menunggu Pencarian...'}</span>
                        </div>
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Total Tarif:</span>
                          <span className="font-bold text-emerald-400">Rp {Number(currentOrder.total_price || 0).toLocaleString('id-ID')}</span>
                        </div>
                      </div>

                      {/* FINANCIAL SETTLEMENT BREAKDOWN */}
                      {currentOrder.settlement && (
                        <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-700/60 space-y-1.5 animate-in fade-in">
                          <div className="font-bold text-emerald-400 text-xs flex items-center gap-1">
                            <Wallet size={14} /> Settlement 80/20 Berhasil
                          </div>
                          <div className="flex justify-between text-slate-300 text-[11px]">
                            <span>Pendapatan Mitra (80%):</span>
                            <span className="font-bold text-amber-400">Rp {currentOrder.settlement.mitraShare.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex justify-between text-slate-300 text-[11px]">
                            <span>Komisi Platform Wira (20%):</span>
                            <span className="font-bold text-cyan-400">Rp {currentOrder.settlement.platformShare.toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-slate-500 text-xs">
                      Klik "Jalankan Simulasi" untuk mengamati payload pesanan secara langsung.
                    </div>
                  )}
                </div>

                {/* REALTIME EVENT LOGS */}
                <div className="lg:col-span-7 bg-slate-950 rounded-xl p-4 border border-slate-800 flex flex-col h-80">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs text-slate-400">
                    <span className="font-mono text-cyan-400"># Realtime Event Stream & Audit Log</span>
                    <span>{simLogs.length} Events Logged</span>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-2 pt-3 font-mono text-xs pr-1">
                    {simLogs.length > 0 ? (
                      simLogs.map((log) => (
                        <div key={log.id} className="p-2 rounded bg-slate-900/90 border border-slate-800 flex items-start gap-2.5">
                          <span className="text-slate-500 text-[10px] shrink-0 pt-0.5">{log.time}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 ${
                              log.type === 'success'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                            }`}
                          >
                            {log.stage}
                          </span>
                          <p className="text-slate-300 text-[11px] leading-snug">{log.message}</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-16 text-slate-600 text-xs">
                        Tidak ada log aktif. Mulai simulasi untuk memicu event stream.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* TAB 3: STATE MACHINE & LIFECYCLE */}
        {activeTab === 'statemachine' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <RotateCcw className="text-purple-400" size={22} /> Order Lifecycle & Validasi State Machine
              </h3>
              <p className="text-xs text-slate-400 mb-6">
                Setiap perubahan status pesanan mengikuti aturan transisi deterministik untuk mencegah race conditions dan double-dispatching.
              </p>

              <div className="space-y-4">
                {[
                  {
                    state: 'PENDING',
                    color: 'text-amber-400 border-amber-500/50 bg-amber-950/20',
                    trigger: 'Pelanggan menekan "Pesan Sekarang"',
                    validations: [
                      'Koordinat penjemputan berada dalam batas wilayah Lombok aktif.',
                      'Saldo dompet mencukupi (jika WiraPay) atau konfirmasi bayar tunai.',
                      'Layanan aktif di Feature Flags kecamatan tersebut.',
                    ],
                    dbUpdate: 'INSERT INTO orders(status: "pending", total_price, user_id)',
                  },
                  {
                    state: 'ACCEPTED',
                    color: 'text-cyan-400 border-cyan-500/50 bg-cyan-950/20',
                    trigger: 'Mitra menekan "Ambil Pesanan"',
                    validations: [
                      'Mitra terverifikasi aktif (status: "Aktif" di tabel users).',
                      'Mitra belum memiliki pesanan aktif lain yang sedang berjalan.',
                      'Lock optimistic: hanya 1 driver pertama yang berhasil mengklaim order.',
                    ],
                    dbUpdate: 'UPDATE orders SET status="accepted", driver_id=user.id WHERE status="pending"',
                  },
                  {
                    state: 'IN_PROGRESS',
                    color: 'text-blue-400 border-blue-500/50 bg-blue-950/20',
                    trigger: 'Mitra tiba di lokasi jemput & mulai perjalanan / Merchant mulai memasak',
                    validations: [
                      'Driver telah tiba di titik jemput (konfirmasi manual atau geofence radius < 50m).',
                    ],
                    dbUpdate: 'UPDATE orders SET status="in_progress"',
                  },
                  {
                    state: 'COMPLETED',
                    color: 'text-emerald-400 border-emerald-500/50 bg-emerald-950/20',
                    trigger: 'Mitra tiba di tujuan & menekan "Selesai"',
                    validations: [
                      'Kalkulasi bagi hasil 80/20 dieksekusi secara atomik.',
                      'Saldo dompet mitra dikreditkan secara real-time.',
                      'Notifikasi invoice dikirimkan ke pelanggan via in-app & WhatsApp.',
                    ],
                    dbUpdate: 'UPDATE orders SET status="completed", INSERT INTO transactions(mitra_share, platform_fee)',
                  },
                  {
                    state: 'CANCELLED',
                    color: 'text-rose-400 border-rose-500/50 bg-rose-950/20',
                    trigger: 'Pelanggan atau Admin membatalkan sebelum driver tiba',
                    validations: [
                      'Pembatalan sebelum 2 menit bebas penalti.',
                      'Jika pembayaran menggunakan WiraPay, saldo otomatis di-refund 100%.',
                    ],
                    dbUpdate: 'UPDATE orders SET status="cancelled", refund to wallets(amount)',
                  },
                ].map((item, idx) => (
                  <div key={item.state} className={`p-5 rounded-xl border ${item.color}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-black text-sm px-2.5 py-1 rounded bg-slate-900 border border-slate-700">
                          {idx + 1}. {item.state}
                        </span>
                        <span className="text-xs text-slate-300 font-semibold">{item.trigger}</span>
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-900/60 px-2 py-0.5 rounded">
                        {item.dbUpdate}
                      </span>
                    </div>

                    <div className="bg-slate-900/90 rounded-lg p-3 border border-slate-800">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Kriteria Validasi:
                      </span>
                      <ul className="space-y-1">
                        {item.validations.map((val, vIdx) => (
                          <li key={vIdx} className="text-xs text-slate-300 flex items-center gap-2">
                            <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                            <span>{val}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DATABASE ERD */}
        {activeTab === 'database' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Database className="text-cyan-400" size={22} /> Skema Entitas Database (PostgreSQL / Supabase)
              </h3>
              <p className="text-xs text-slate-400 mb-6">
                Relasi antar-tabel utama yang mengelola otentikasi, order, armada mitra, restoran, dompet, dan feature flags.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  {
                    table: 'orders',
                    desc: 'Sentral semua transaksi pesanan (Ride, Food, Send, Villa, Service, Pool)',
                    cols: [
                      { name: 'id', type: 'UUID (PK)' },
                      { name: 'user_id', type: 'UUID -> users.id' },
                      { name: 'driver_id', type: 'UUID -> users.id (Nullable)' },
                      { name: 'merchant_id', type: 'UUID (Nullable)' },
                      { name: 'service_type', type: 'VARCHAR(20)' },
                      { name: 'status', type: 'VARCHAR(20)' },
                      { name: 'total_price', type: 'DECIMAL(12,2)' },
                      { name: 'payment_method', type: 'VARCHAR(20)' },
                      { name: 'created_at', type: 'TIMESTAMPTZ' },
                    ]
                  },
                  {
                    table: 'users',
                    desc: 'Data akun pelanggan, mitra driver, pemilik resto, dan admin',
                    cols: [
                      { name: 'id', type: 'UUID (PK) -> auth.users' },
                      { name: 'name', type: 'VARCHAR(100)' },
                      { name: 'email', type: 'VARCHAR(150)' },
                      { name: 'phone', type: 'VARCHAR(20)' },
                      { name: 'role', type: 'VARCHAR(30) (Superadmin, user, mitra)' },
                      { name: 'mitra_access', type: 'TEXT[] ([driver, merchant, technician])' },
                      { name: 'status', type: 'VARCHAR(20) (Aktif, Pending)' },
                    ]
                  },
                  {
                    table: 'wallets & transactions',
                    desc: 'Double-entry ledger saldo pelanggan, driver, dan komisi platform',
                    cols: [
                      { name: 'id', type: 'UUID (PK)' },
                      { name: 'user_id', type: 'UUID -> users.id' },
                      { name: 'type', type: 'VARCHAR(20) (topup, expense, earning)' },
                      { name: 'amount', type: 'DECIMAL(12,2)' },
                      { name: 'order_id', type: 'UUID -> orders.id' },
                      { name: 'description', type: 'TEXT' },
                    ]
                  },
                  {
                    table: 'merchants & restaurants',
                    desc: 'Data gerai kuliner Lombok, jam buka, dan menu makanan',
                    cols: [
                      { name: 'id', type: 'UUID (PK)' },
                      { name: 'user_id', type: 'UUID -> users.id (Owner)' },
                      { name: 'name', type: 'VARCHAR(120)' },
                      { name: 'category', type: 'VARCHAR(50)' },
                      { name: 'address', type: 'TEXT' },
                      { name: 'is_open', type: 'BOOLEAN' },
                    ]
                  },
                  {
                    table: 'feature_flags',
                    desc: 'Sakelar kontrol layanan real-time per wilayah di Lombok',
                    cols: [
                      { name: 'id', type: 'BIGINT (PK)' },
                      { name: 'region', type: 'VARCHAR(50) (mataram, senggigi, kuta)' },
                      { name: 'features', type: 'JSONB ({ ride: true, food: true })' },
                      { name: 'updated_at', type: 'TIMESTAMPTZ' },
                    ]
                  },
                  {
                    table: 'villas & services',
                    desc: 'Listing villa wisata & katalog perbaikan teknisi (AC, Pompa, Kolam)',
                    cols: [
                      { name: 'id', type: 'UUID (PK)' },
                      { name: 'title', type: 'VARCHAR(150)' },
                      { name: 'location', type: 'VARCHAR(100)' },
                      { name: 'price_per_night', type: 'DECIMAL(12,2)' },
                      { name: 'is_available', type: 'BOOLEAN' },
                    ]
                  },
                ].map((t) => (
                  <div key={t.table} className="p-4 rounded-xl bg-slate-900 border border-slate-750 border-slate-700/70">
                    <div className="font-mono font-bold text-sm text-cyan-400 mb-1 flex items-center justify-between">
                      <span>{t.table}</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-3">{t.desc}</p>
                    <div className="divide-y divide-slate-800 border-t border-slate-800 pt-1">
                      {t.cols.map((col) => (
                        <div key={col.name} className="py-1 flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-300">{col.name}</span>
                          <span className="text-slate-500 text-[10px]">{col.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: PRICING & REGIONAL FLAGS */}
        {activeTab === 'pricing' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                <Zap className="text-amber-400" size={22} /> Formula Tarif Layanan & Cakupan Regional Lombok
              </h3>
              <p className="text-xs text-slate-400 mb-6">
                Formula matematis perhitungan ongkos kirim dan status operasional fitur per zona di Nusa Tenggara Barat.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* TARIF FORMULA */}
                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-cyan-400 uppercase tracking-wider">Formula Tarif Layanan</h4>
                  
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2">
                    <div className="font-bold text-white text-xs">🛵 WiraRide (Ojek Motor)</div>
                    <p className="text-xs text-slate-300 font-mono">
                      Tarif = Rp 8.000 (0-2 km) + (Jarak &gt; 2km × Rp 2.500) + Biaya Jasa Rp 2.000
                    </p>
                    <p className="text-[11px] text-slate-400">Contoh 6 km: 8.000 + (4 × 2.500) + 2.000 = Rp 20.000</p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2">
                    <div className="font-bold text-white text-xs">📦 WiraSend (Kurir Kilat)</div>
                    <p className="text-xs text-slate-300 font-mono">
                      Tarif = Rp 10.000 (0-3 km) + (Jarak &gt; 3km × Rp 3.000)
                    </p>
                    <p className="text-[11px] text-slate-400">Asuransi dokumen bawaan hingga Rp 1.000.000</p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2">
                    <div className="font-bold text-white text-xs">🍲 WiraFood (Pesan Makanan)</div>
                    <p className="text-xs text-slate-300 font-mono">
                      Total = Harga Menu Restoran + Ongkir Driver + Biaya Aplikasi Rp 2.000
                    </p>
                    <p className="text-[11px] text-slate-400">Restoran menerima 85% dari subtotal makanan</p>
                  </div>
                </div>

                {/* REGIONAL COVERAGE MATRIX */}
                <div className="space-y-3">
                  <h4 className="font-bold text-sm text-emerald-400 uppercase tracking-wider">Matriks Wilayah Operasional Lombok</h4>
                  
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-700/80 space-y-3">
                    {[
                      { region: 'Kota Mataram & Ampenan', ride: true, food: true, send: true, service: true, status: 'Zona Inti (100% Aktif)' },
                      { region: 'Senggigi & Lombok Barat', ride: true, food: true, send: true, villa: true, status: 'Zona Wisata Utama' },
                      { region: 'Kuta Mandalika & Praya', ride: true, food: true, send: false, villa: true, status: 'Sirkuit & Resort' },
                      { region: 'Gili Trawangan / Air / Meno', ride: false, food: true, send: false, villa: true, status: 'Bebas Kendaraan Bermotor' },
                      { region: 'Senaru & Sembalun (Rinjani)', ride: true, food: false, send: true, service: false, status: 'Jalur Ekspedisi' },
                    ].map((reg) => (
                      <div key={reg.region} className="p-2.5 rounded bg-slate-800/80 border border-slate-700/50 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-xs text-slate-200">{reg.region}</div>
                          <div className="text-[10px] text-cyan-400">{reg.status}</div>
                        </div>
                        <div className="flex gap-1">
                          {reg.ride && <span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-950 text-cyan-400 font-bold">Ride</span>}
                          {reg.food && <span className="px-1.5 py-0.5 rounded text-[9px] bg-amber-950 text-amber-400 font-bold">Food</span>}
                          {reg.villa && <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-950 text-emerald-400 font-bold">Villa</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
