// TeachersPage.tsx
import { GraduationCap } from 'lucide-react';
import { useTeachers } from '../../hooks/useApi';
import { DataTable } from '../../components/ui/DataTable';
import { SectionHeader, Badge } from '../../components/ui';
import { formatPhone } from '../../utils/labels';
import type { Teacher } from '../../hooks/useApi';

export default function TeachersPage() {
  const { data: teachers, isLoading } = useTeachers();

  const columns = [
    {
      key: 'name',
      header: 'Nombre',
      render: (row: Teacher) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <GraduationCap size={14} color="var(--primary)" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{row.user.name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone', header: 'Teléfono', width: 150,
      render: (row: Teacher) => <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatPhone(row.phone)}</span>,
    },
    {
      key: 'students', header: 'Alumnos', width: 100, align: 'center' as const,
      render: (row: Teacher) => <Badge variant="info">{row.students.length}</Badge>,
    },
    {
      key: 'commission', header: 'Comisión', width: 100, align: 'right' as const,
      render: (row: Teacher) => <span style={{ fontSize: 13, fontWeight: 500 }}>{row.commissionPct}%</span>,
    },
  ];

  return (
    <div className="animate-fadeIn">
      <SectionHeader title="Maestros" subtitle="Personal docente de la academia" />
      <DataTable columns={columns} data={teachers ?? []} loading={isLoading} rowKey={r => r.id} emptyMessage="No hay maestros registrados" />
    </div>
  );
}
