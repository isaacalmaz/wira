const fs = require('fs');
let content = fs.readFileSync('/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/frontend-user/src/pages/RestaurantPage.jsx', 'utf8');

// Extract activeOrderId state and useEffects
const hooksStr = `
  const [activeOrderId, setActiveOrderId] = useState(null);

  useEffect(() => {
    if (!activeOrderId) return;

    const channel = supabase
      .channel(\`order_\${activeOrderId}\`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: \`id=eq.\${activeOrderId}\` },
        (payload) => {
          const newStatus = payload.new.status;
          
          if (newStatus === 'accepted') {
            setTrackingStage(1);
            toast.success(\`Pesanan Anda diterima oleh restoran!\`, { icon: '🍲' });
          } 
          else if (newStatus === 'completed') {
            handleCompleteFood();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeOrderId]);

  // Simulasi Masak & Antar HANYA JIKA SUDAH ACCEPTED (stage 1+)
  useEffect(() => {
    if (step === 'tracking' && trackingStage >= 1) {
      if (trackingStage === 1) {
        const t = setTimeout(() => setTrackingStage(2), 5000);
        return () => clearTimeout(t);
      } else if (trackingStage === 2) {
        const t = setTimeout(() => setTrackingStage(3), 5000);
        return () => clearTimeout(t);
      }
    }
  }, [step, trackingStage]);
`;

// Remove them from current locations
content = content.replace(/const \[activeOrderId, setActiveOrderId\] = useState\(null\);\n/g, '');
content = content.replace(/useEffect\(\(\) => \{\n    if \(\!activeOrderId\) return;[\s\S]*?\}, \[activeOrderId\]\);\n/g, '');
content = content.replace(/\/\/ Simulasi Masak & Antar HANYA JIKA SUDAH ACCEPTED \(stage 1\+\)\n  useEffect\(\(\) => \{\n    if \(step === 'tracking' && trackingStage >= 1\) \{[\s\S]*?\}, \[step, trackingStage\]\);\n/g, '');

// Insert them right before `if (!rest) {`
content = content.replace('  if (!rest) {', hooksStr + '\n  if (!rest) {');

fs.writeFileSync('/Users/ishakalmaazi/.gemini/antigravity/scratch/wira/frontend-user/src/pages/RestaurantPage.jsx', content);
