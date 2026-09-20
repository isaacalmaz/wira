const fs = require('fs');
const file = 'frontend-mitra/src/pages/shared/ActiveOrderPage.jsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('getDistanceFromLatLonInKm')) {
    const helperFunctions = `
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distance in km
  return d;
}
function deg2rad(deg) {
  return deg * (Math.PI/180)
}
`;
    content = content.replace('export default function ActiveOrderPage() {', helperFunctions + '\nexport default function ActiveOrderPage() {');
}

if (!content.includes('const [showPinModal')) {
    content = content.replace('const [inputText, setInputText] = useState(\'\');', 
      'const [inputText, setInputText] = useState(\'\');\n  const [showPinModal, setShowPinModal] = useState(false);\n  const [pinInput, setPinInput] = useState(\'\');\n  const [isVerifying, setIsVerifying] = useState(false);');
}

const advanceStageCode = `
  const advanceStage = async () => {
    const info = getNextStageInfo();
    if (!info) return;

    // PIN Verification to start trip
    if (info.next === 'in_trip' && ['ride', 'send', 'food', 'service'].includes(order.service_type)) {
       setShowPinModal(true);
       return;
    }

    // Sanity Checks to complete trip
    if (info.next === 'completed' && ['ride', 'send', 'food'].includes(order.service_type)) {
       try {
           toast.loading('Memverifikasi lokasi GPS...', { id: 'gps_check' });
           const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
           if (pos && pos.coords && order.dropoff_lat && order.dropoff_lng) {
              const dist = getDistanceFromLatLonInKm(pos.coords.latitude, pos.coords.longitude, order.dropoff_lat, order.dropoff_lng);
              if (dist > 0.15) { // 150 meters
                 toast.error('Gagal: Anda harus berada di radius 150m dari lokasi tujuan untuk menyelesaikan pesanan.', { id: 'gps_check' });
                 return;
              }
           }
           
           // Minimum time check (Speed max ~60km/h => 1 min per km)
           const elapsedMinutes = (Date.now() - new Date(order.updated_at).getTime()) / 60000;
           // Fallback to 0 if distance_km is not available
           const routeDist = order.distance_km || 0; 
           const minTime = routeDist; // 1 min per km
           if (elapsedMinutes < minTime) {
               toast.error(\`Gagal: Perjalanan terlalu singkat. Mohon tunggu \${Math.ceil(minTime - elapsedMinutes)} menit lagi.\`, { id: 'gps_check' });
               return;
           }
           toast.success('Lokasi terverifikasi.', { id: 'gps_check' });
       } catch (err) {
           console.log("GPS check failed", err);
           toast.error('Gagal membaca GPS. Pastikan izin lokasi aktif.', { id: 'gps_check' });
           // return; // Uncomment to strictly block without GPS
       }
    }

    try {
      const updated = await updateOrderStatus(order.id, info.next);
      if (updated) setOrder(updated);
      toast.success(\`Status diubah ke \${info.next}\`);
    } catch (e) {
      console.error(e);
      toast.error('Gagal update status');
    }
  };
`;

const oldAdvanceStageRegex = /const advanceStage = async \(\) => \{[\s\S]*?toast\.error\('Gagal update status'\);\n\s*\}\n\s*\};/;
content = content.replace(oldAdvanceStageRegex, advanceStageCode);

const pinSubmitCode = `
  const handlePinSubmit = async (e) => {
    e.preventDefault();
    if (pinInput.length !== 4) { toast.error("PIN harus 4 angka"); return; }
    setIsVerifying(true);
    try {
       const { data, error } = await supabase.rpc('start_order_with_pin', {
          p_order_id: order.id,
          p_pin_input: pinInput
       });
       if (error) throw error;
       if (!data.success) {
          toast.error(data.error || 'PIN Salah!');
       } else {
          toast.success('PIN Benar! Pekerjaan dimulai.');
          setOrder(prev => ({...prev, status: 'in_trip'}));
          setShowPinModal(false);
          setPinInput('');
       }
    } catch(err) {
       toast.error(err.message);
    }
    setIsVerifying(false);
  };
`;
if (!content.includes('handlePinSubmit')) {
  content = content.replace('if (loading || !order)', pinSubmitCode + '\n  if (loading || !order)');
}

const pinModalRender = `
      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl w-full max-w-sm">
            <h3 className="font-bold text-lg mb-2 dark:text-white">Verifikasi Penjemputan</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {order.service_type === 'food' ? 'Minta 4-Digit PIN ke pihak restoran.' : 'Minta 4-Digit PIN ke penumpang/pengirim.'}
            </p>
            <form onSubmit={handlePinSubmit}>
              <input 
                type="text" 
                maxLength={4}
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\\D/g, ''))}
                className="w-full text-center text-3xl font-bold tracking-[0.3em] bg-gray-100 dark:bg-slate-900 border-2 border-primary rounded-xl py-4 mb-4 dark:text-white focus:outline-none"
                placeholder="----"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 p-3 bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-white rounded-xl font-bold">Batal</button>
                <button type="submit" disabled={isVerifying || pinInput.length !== 4} className="flex-1 p-3 bg-primary text-white rounded-xl font-bold disabled:opacity-50">
                  {isVerifying ? 'Cek...' : 'Mulai'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
`;

if (!content.includes('showPinModal && (')) {
  content = content.replace('<div className="flex-1 bg-white dark:bg-slate-800 shadow-sm rounded-xl p-4 flex flex-col min-h-[300px]">', pinModalRender + '\n        <div className="flex-1 bg-white dark:bg-slate-800 shadow-sm rounded-xl p-4 flex flex-col min-h-[300px]">');
}

const merchantPinRender = `
        {order.merchant?.owner_id === user.id && ['ready', 'picking_up'].includes(order.status) && (
          <div className="bg-white dark:bg-slate-800 p-4 shadow-sm rounded-xl mb-2 text-center border-b dark:border-slate-700">
             <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Berikan PIN ini kepada Driver saat penyerahan makanan:</p>
             <div className="text-3xl font-bold tracking-[0.3em] text-primary">{order.security_pin || '----'}</div>
          </div>
        )}
`;

if (!content.includes('order.merchant?.owner_id === user.id && [')) {
  content = content.replace('<div className="bg-white dark:bg-slate-800 p-4 shadow-sm rounded-xl flex items-center justify-between">', merchantPinRender + '\n        <div className="bg-white dark:bg-slate-800 p-4 shadow-sm rounded-xl flex items-center justify-between">');
}

fs.writeFileSync(file, content);
console.log('Patched Mitra App (PIN & GPS Fraud Prevention)');
