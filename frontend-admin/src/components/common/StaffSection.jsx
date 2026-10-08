import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../config/supabase';
import { useAuth } from '../../context/AuthContext';
import { Badge, Button, Field, IconTile, Input, Select, Sheet, Table, Textarea } from '../ui';
import { formatDateTime } from '../../utils/datetime';

// What each staff role may do; enforced in the database (admin_can,
// migrations/0102), not only by hiding menus.
export const STAFF_ROLES = [
  { value: 'Superadmin', label: 'Superadmin', desc: 'Semua akses, termasuk mengatur staf' },
  { value: 'Admin Ops', label: 'Admin Ops', desc: 'Semua akses kecuali mengatur staf' },
  { value: 'Admin Keuangan', label: 'Admin Keuangan', desc: 'Pencairan, top-up, koreksi saldo; melihat pesanan dan pengguna' },
  { value: 'CS', label: 'CS', desc: 'Pesanan (lihat + catatan), pengguna, tiket bantuan, WhatsApp' },
];
const ROLE_LABEL = { admin: 'Admin (lama)', superadmin: 'Superadmin' };
const isSuper = (role) => role === 'Superadmin' || role === 'superadmin';
const when = (ts) => (ts ? formatDateTime(ts) : 'Belum pernah');

/**
 * Real staff accounts (admin_list_staff / admin_set_staff_role, 0102).
 * Everyone signs up in a Wira app first; a Superadmin then gives that
 * account a staff role by email, changes it, or takes it away.
 */
export default function StaffSection() {
  const { user } = useAuth();
  const canManage = isSuper(user?.role);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState(null); // { email, role, note, existing }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_list_staff');
    if (error) { toast.error('Gagal memuat staf: ' + error.message); return; }
    setStaff(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_set_staff_role', {
      p_email: form.email.trim(), p_role: form.role, p_note: form.note.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(form.role === 'none' ? 'Akses admin dicabut' : `Peran sekarang ${data}`);
    setForm(null);
    load();
  };

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile tone="brand" size="sm"><ShieldCheck size={18} /></IconTile>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-tight text-ink">Staf &amp; hak akses</h2>
            <p className="text-xs text-ink-muted">Akun yang bisa masuk ke Wira Admin. Hanya Superadmin yang bisa mengubahnya.</p>
          </div>
        </div>
        {canManage && (
          <Button size="sm" leftIcon={<UserPlus size={15} />} onClick={() => setForm({ email: '', role: 'CS', note: '', existing: null })}>
            Tambah staf
          </Button>
        )}
      </div>

      <ul className="grid gap-2 text-[12.5px] text-ink-muted sm:grid-cols-2">
        {STAFF_ROLES.map((r) => (
          <li key={r.value}><span className="font-semibold text-ink">{r.label}</span> — {r.desc}</li>
        ))}
      </ul>

      <Table>
        <thead>
          <tr>
            <th>Nama</th>
            <th>Email</th>
            <th>Peran</th>
            <th>Terakhir masuk</th>
            {canManage && <th className="text-right">Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.id}>
              <td className="whitespace-nowrap font-semibold">
                {s.name || '—'}
                {s.id === user?.id && <span className="ml-1.5 text-[12px] font-normal text-ink-muted">(Anda)</span>}
              </td>
              <td className="font-mono text-[12.5px] text-ink-muted">{s.email}</td>
              <td>
                <Badge tone={isSuper(s.role) ? 'brand' : 'neutral'}>{ROLE_LABEL[s.role] || s.role}</Badge>
                {s.status === 'Diblokir' && <Badge tone="danger" className="ml-1.5">Ditangguhkan</Badge>}
              </td>
              <td className="whitespace-nowrap font-mono text-[12px] text-ink-muted">{when(s.last_sign_in_at)}</td>
              {canManage && (
                <td className="text-right">
                  {s.id !== user?.id && (
                    <Button size="sm" variant="secondary" onClick={() => setForm({ email: s.email, role: isSuper(s.role) ? 'Superadmin' : s.role, note: '', existing: s })}>
                      Ubah
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
          {staff.length === 0 && (
            <tr><td colSpan={canManage ? 5 : 4} className="py-8 text-center text-ink-muted">Memuat...</td></tr>
          )}
        </tbody>
      </Table>

      <Sheet
        open={!!form}
        onClose={() => { if (!busy) setForm(null); }}
        dismissible={!busy}
        size="sm"
        icon={<ShieldCheck size={22} />}
        title={form?.existing ? `Ubah akses ${form.existing.name || form.existing.email}` : 'Tambah staf'}
        description={form?.existing ? undefined : 'Orangnya harus sudah punya akun Wira (daftar di aplikasi pelanggan atau mitra) dengan email ini.'}
        footer={form && (
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={busy}>Batal</Button>
            <Button variant={form.role === 'none' ? 'danger' : 'primary'} onClick={save} isLoading={busy} disabled={!form.email.includes('@')}>
              {form.role === 'none' ? 'Cabut akses admin' : 'Simpan'}
            </Button>
          </>
        )}
      >
        {form && (
          <div className="flex flex-col gap-4">
            {!form.existing && (
              <Field label="Email akun" htmlFor="staff-email" required>
                <Input id="staff-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nama@email.com" />
              </Field>
            )}
            <Field label="Peran" htmlFor="staff-role" required hint={STAFF_ROLES.find((r) => r.value === form.role)?.desc}>
              <Select id="staff-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                {form.existing?.role === 'admin' && <option value="admin">Admin (lama)</option>}
                {form.existing && <option value="none">Cabut akses admin</option>}
              </Select>
            </Field>
            <Field label="Catatan (dicatat di log)" htmlFor="staff-note">
              <Textarea id="staff-note" rows={2} maxLength={200} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
          </div>
        )}
      </Sheet>
    </section>
  );
}
