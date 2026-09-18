import re

with open('frontend-user/src/pages/RestaurantPage.jsx', 'r') as f:
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
      if (data.service_type && data.service_type !== 'food') throw new Error('Promo tidak berlaku untuk restoran');
      
      setActivePromo(data);
      toast.success('Promo berhasil digunakan!');
    } catch (err) {
      setPromoError(err.message || 'Gagal memverifikasi promo');
      setActivePromo(null);
    } finally {
      setCheckingPromo(false);
    }
  };
"""
    content = content.replace("const handleConfirmOrder = async () => {", promo_logic + "\n  const handleConfirmOrder = async () => {")

# Modify grandTotal to include discount
if "const grandTotal = subtotal + deliveryFee + appFee;" in content:
    content = content.replace(
        "const grandTotal = subtotal + deliveryFee + appFee;",
        """let grandTotal = subtotal + deliveryFee + appFee;
  if (activePromo) {
    const discount = activePromo.type === 'Percentage' ? (grandTotal * activePromo.discount) / 100 : activePromo.discount;
    grandTotal = Math.max(0, grandTotal - discount);
  }"""
    )

# Insert the payload modifier for the order insert
if "total_price: grandTotal," in content:
    content = content.replace("total_price: grandTotal,", "total_price: grandTotal,\n          details: `Pesanan Makanan dari ${restaurant.name}${activePromo ? ' (Promo: ' + activePromo.code + ')' : ''}`,")

# Inject UI
ui_injection = """
          <Card className="p-4 shadow-sm border border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Kode Promo</h3>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Masukkan kode promo"
                value={promoCode}
                onChange={e => setPromoCode(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 uppercase"
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
            {activePromo && <p className="text-xs text-green-600 font-semibold mt-1">Diskon diterapkan!</p>}
          </Card>
"""
if "Kode Promo" not in content:
    content = content.replace('<Card className="p-4 shadow-sm border border-slate-100">\n            <h3 className="text-sm font-bold text-slate-800 mb-3">Metode Pembayaran</h3>', ui_injection + '\n          <Card className="p-4 shadow-sm border border-slate-100">\n            <h3 className="text-sm font-bold text-slate-800 mb-3">Metode Pembayaran</h3>')

with open('frontend-user/src/pages/RestaurantPage.jsx', 'w') as f:
    f.write(content)
