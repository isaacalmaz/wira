import { useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import { fetchSkills } from '../services/technicianService';

// Fallback names until service_skills loads (or before migrations/0089).
const FALLBACK = [
  { code: 'AC', name: 'Servis & Cuci AC', skill_group: 'servis' },
  { code: 'Listrik', name: 'Instalasi Listrik', skill_group: 'servis' },
  { code: 'Plumbing', name: 'Pipa & Pompa Air', skill_group: 'servis' },
  { code: 'Tukang', name: 'Tukang Bangunan (perbaikan)', skill_group: 'servis' },
  { code: 'Pool', name: 'Perawatan Kolam Renang', skill_group: 'servis' },
];

/** Skill list + code -> name lookup. */
export default function useSkills() {
  const [skills, setSkills] = useState(FALLBACK);
  useEffect(() => {
    let cancelled = false;
    fetchSkills(supabase)
      .then((rows) => { if (!cancelled && rows.length) setSkills(rows); })
      .catch((err) => console.error('fetchSkills failed:', err));
    return () => { cancelled = true; };
  }, []);
  const nameOf = (code) => skills.find((s) => s.code === code)?.name || code;
  return { skills, nameOf };
}

/** The skill a visit needs: pool jobs need 'Pool', service jobs their rate code. */
export const orderSkill = (order) => (order?.service_type === 'pool' ? 'Pool' : order?.rate_code);
