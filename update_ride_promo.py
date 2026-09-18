import re

with open('frontend-user/src/pages/RidePage.jsx', 'r') as f:
    content = f.read()

# Add states for promo
if "const [promoCode" not in content:
    state_injection = """  const [promoCode, setPromoCode] = useState('');
  const [activePromo, setActivePromo] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [checkingPromo, setCheckingPromo] = useState(false);"""
    content = content.replace("const [paymentMethod, setPaymentMethod] = useState('cash');", "const [paymentMethod, setPaymentMethod] = useState('cash');\n" + state_injection)

# Add promo validation logic
if "const handleCheckPromo =" not in content:
    promo_logic = """
  const handleCheckPromo = async () => {
    if (!promoCode.trim()) return;
    setCheckingPromo(true);
    setPromoError('');
    try {
      const { data, error } = await supabase
        .from('promos')
        .select('*')
        .eq('code', promoCode.toUpperCase().trim())
        .single();
      
      if (error || !data) throw new Error('Kode promo tidak ditemukan');
      if (data.status !== 'Active') throw new Error('Promo sudah tidak aktif');
      if (data.validUntil && new Date(data.validUntil) < new Date()) throw new Error('Promo sudah kadaluarsa');
      if (data.service_type && data.service_type !== 'ride') throw new Error('Promo tidak berlaku untuk layanan ini');
      
      setActivePromo(data);
      toast.success('Promo berhasil digunakan!');
    } catch (err) {
      setPromoError(err.message || 'Gagal memverifikasi promo');
      setActivePromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };
  
  const calculateFinalPrice = () => {
    const basePrice = selectedVehicle?.price || 15000;
    if (!activePromo) return basePrice;
    
    if (activePromo.type === 'Percentage') {
      const discount = (basePrice * activePromo.discount) / 100;
      return Math.max(0, basePrice - discount);
    } else {
      return Math.max(0, basePrice - activePromo.discount);
    }
  };
"""
    content = content.replace("const handleStartBooking = async () => {", promo_logic + "\n  const handleStartBooking = async () => {")

# Update booking payload to save final discounted price
if "total_price: selectedVehicle.price," in content:
    content = content.replace("total_price: selectedVehicle.price,", "total_price: calculateFinalPrice(),\n        details: `Jarak: ${distance}km${activePromo ? ' (Promo: ' + activePromo.code + ')' : ''}`,")

# Update UI
ui_injection = """
            <div className="mb-4 bg-slate-50 dark:bg-slate-900 p-3 rounded-2xl">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">Punya Kode Promo?</label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Masukkan kode"
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 uppercase"
                  disabled={activePromo}
                />
                {!activePromo ? (
                  <Button variant="outline" className="text-xs" onClick={handleCheckPromo} disabled={checkingPromo || !promoCode}>
                    {checkingPromo ? 'Cek...' : 'Pakai'}
                  </Button>
                ) : (
                  <Button variant="outline" className="text-xs text-rose-500 border-rose-200 hover:bg-rose-50" onClick={() => { setActivePromo(null); setPromoCode(''); }}>
                    Batal
                  </Button>
                )}
              </div>
              {promoError && <p className="text-xs text-rose-500 mt-1">{promoError}</p>}
              {activePromo && <p className="text-xs text-green-600 font-semibold mt-1">Diskon {activePromo.type === 'Percentage' ? activePromo.discount + '%' : 'Rp ' + activePromo.discount.toLocaleString('id-ID')} berhasil diterapkan!</p>}
            </div>
"""
if "Punya Kode Promo" not in content:
    content = content.replace('<div className="mb-4">', ui_injection + '\n            <div className="mb-4">')

# Replace the formatRupiah(...) button text
content = re.sub(
    r'Pesan Sekarang • \{formatRupiah\(selectedVehicle\?\.price \|\| 15000\)\}',
    r'Pesan Sekarang • {formatRupiah(calculateFinalPrice())}',
    content
)

with open('frontend-user/src/pages/RidePage.jsx', 'w') as f:
    f.write(content)
