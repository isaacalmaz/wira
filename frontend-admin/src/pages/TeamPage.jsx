import StaffSection from '../components/common/StaffSection';
import { PageHeader } from '../components/ui';

// Tim Admin: staff accounts and their roles (admin_list_staff /
// admin_set_staff_role, migrations/0102). Moved out of Pengaturan.
export default function TeamPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader className="!mb-0" title="Tim Admin" subtitle="Siapa saja yang bisa masuk ke Admin dan apa perannya. Mengubah peran hanya bisa dilakukan Superadmin." />
      <StaffSection />
    </div>
  );
}
