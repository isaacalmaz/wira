const fs = require('fs');

const path = 'frontend-mitra/src/pages/driver/DriverHomePage.jsx';
let content = fs.readFileSync(path, 'utf8');

// Match precisely the final return statement
const returnIndex = content.lastIndexOf('  return (');
if (returnIndex !== -1) {
  const beforeReturn = content.substring(0, returnIndex);
  const newReturn = `  return (
    <div className="relative h-[calc(100vh-4rem)] w-full overflow-hidden max-w-md mx-auto bg-slate-50 dark:bg-slate-900 border-t border-slate-200 shadow-xl">
      
      {/* MAP AREA - FULL SCREEN */}
      <div className="absolute inset-0 z-0">
        {isOnline || activeOrder ? (
          <WiraMap 
            center={mapCenter} 
            zoom={orderDetails ? 14 : 14} 
            markers={mapMarkers}
            route={orderDetails?.route}
          />
        ) : (
          <div className="h-full w-full bg-slate-200 dark:bg-slate-700 flex flex-col items-center justify-center text-slate-400">
            <MapPin size={40} className="mb-2" />
            <p>Peta tidak aktif saat Offline</p>
          </div>
        )}
      </div>

      {/* Header Panel */}
      <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
        <div className="flex justify-between items-center bg-white/95 dark:bg-slate-800/95 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 pointer-events-auto">
          <div>
            <h1 className="text-xl font-bold">Halo, {user?.name || 'Driver'}!</h1>
            <p className="text-sm text-slate-500">
              {activeOrder ? 'Sedang Mengantar...' : (isOnline ? 'Mencari pesanan...' : 'Anda offline')}
            </p>
          </div>
          {!activeOrder && (
            <div className="flex flex-col items-end">
              <OnlineToggle isOnline={isOnline} onChange={setIsOnline} />
              <span className={\`text-xs mt-1 font-medium \${isOnline ? 'text-green-500' : 'text-slate-400'}\`}>
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel */}
      <div className="absolute bottom-0 w-full z-10 bg-gradient-to-t from-slate-100 via-slate-100/80 to-transparent dark:from-slate-900 p-4 pb-6 pointer-events-none">
        <div className="pointer-events-auto mt-10">
          {!activeOrder ? (
            <div className="space-y-4">
              <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl p-1 shadow-lg">
                <EarningsCard today={todayEarnings} week={weekEarnings} progress={completedTrips > 0 ? 100 : 0} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 flex flex-col items-center justify-center text-center shadow-lg bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-slate-100 dark:border-slate-700">
                  <Target className="text-primary mb-2" size={28} />
                  <span className="text-2xl font-bold">{completedTrips}</span>
                  <span className="text-xs text-slate-500">Trip Selesai</span>
                </Card>
                <Card className="p-4 flex flex-col items-center justify-center text-center shadow-lg bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm border-slate-100 dark:border-slate-700">
                  <Activity className="text-green-500 mb-2" size={28} />
                  <span className="text-2xl font-bold">{completedTrips > 0 ? '100%' : '0%'}</span>
                  <span className="text-xs text-slate-500">Tingkat Penerimaan</span>
                </Card>
              </div>
            </div>
          ) : (
            <Card className="p-5 border-2 border-primary space-y-4 shadow-xl animate-in slide-in-from-bottom-5 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md">
              <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 pb-4">
                <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary">
                  <MapPin size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Pesanan Sedang Berjalan</h3>
                  <p className="text-sm text-slate-500">Order ID: {activeOrder.id.slice(0,8)}</p>
                </div>
              </div>
              <div className="flex justify-between items-center text-xl font-bold pt-2">
                <span>Total Tagihan:</span>
                <span className="text-primary">Rp {activeOrder.total_price.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex gap-2">
                {orderDetails?.dropoff && (
                  <Button 
                    variant="outline" 
                    className="w-full font-bold border-primary text-primary" 
                    onClick={() => window.open(\`https://www.google.com/maps/dir/?api=1&origin=\${orderDetails.pickup.lat},\${orderDetails.pickup.lng}&destination=\${orderDetails.dropoff.lat},\${orderDetails.dropoff.lng}\`, '_blank')}
                  >
                    Navigasi
                  </Button>
                )}
                <Button variant="outline" className="w-full font-bold border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-300" onClick={() => setIsChatOpen(true)}>
                  Chat
                </Button>
                <Button variant="primary" className="w-full font-bold" onClick={handleCompleteOrder}>
                  Selesai
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Incoming Order Popup */}
      {isOnline && incomingOrder && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300 pointer-events-auto">
          <Card className="w-full max-w-sm p-6 bg-white dark:bg-slate-800 border-2 border-primary shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse"></div>
            <div className="flex flex-col items-center text-center mb-6">
              <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mb-3">
                <BellRing size={32} className="animate-bounce" />
              </div>
              <Badge variant="primary" className="mb-2 capitalize">{incomingOrder.service_type}</Badge>
              <h2 className="text-2xl font-bold">Rp {incomingOrder.total_price.toLocaleString('id-ID')}</h2>
              {incomingOrder.details && (
                <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                  <p className="font-semibold text-primary">{JSON.parse(incomingOrder.details).pickup?.name || 'Lokasi Jemput'}</p>
                  <p className="text-xs">menuju</p>
                  <p className="font-semibold text-red-500">{JSON.parse(incomingOrder.details).dropoff?.name || 'Tujuan'}</p>
                </div>
              )}
              <p className="text-slate-500 text-xs mt-3">Ketuk 'Terima' untuk melihat peta lengkap</p>
            </div>
            
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setIncomingOrder(null)}>Tolak</Button>
              <Button variant="primary" className="flex-1" onClick={handleAcceptOrder}>Terima</Button>
            </div>
          </Card>
        </div>
      )}

      {isChatOpen && activeOrder && (
        <ChatModal
          orderId={activeOrder.id}
          onClose={() => setIsChatOpen(false)}
          receiverName="Penumpang"
        />
      )}
    </div>
  );
};

export default DriverHomePage;`;

  fs.writeFileSync(path, beforeReturn + newReturn, 'utf8');
  console.log("Updated DriverHomePage layout");
}
