// MyStudentsPage.tsx
import { useMyStudents } from '../../hooks/useApi';
import { DataTable } from '../../components/ui/DataTable';
import { SectionHeader, Badge } from '../../components/ui';
import { STATUS_BADGE, STATUS_LABEL, MODALITY_LABEL, formatPhone } from '../../utils/labels';
import type { Student } from '../../hooks/useApi';

export default function MyStudentsPage() {
  const { data: students, isLoading } = useMyStudents();

  const columns = [
    {
      key: 'name', header: 'Alumno',
      render: (row: Student) => (
        <div>
          <p style={{ fontWeight: 500, fontSize: 14 }}>{row.name}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatPhone(row.phone)}</p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Estado', width: 150,
      render: (row: Student) => <Badge variant={STATUS_BADGE[row.status] ?? 'default'} dot>{STATUS_LABEL[row.status] ?? row.status}</Badge>,
    },
    {
      key: 'modality', header: 'Modalidad', width: 200,
      render: (row: Student) => <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{MODALITY_LABEL[row.modality] ?? row.modality}</span>,
    },
    {
      key: 'payment', header: 'Último pago', width: 140,
      render: (row: Student) => {
        const p = row.payments?.[0];
        if (!p) return <span style={{ fontSize: 13, color: 'var(--danger)' }}>Sin pago</span>;
        return <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.confirmedAt ? new Date(p.confirmedAt).toLocaleDateString('es-MX') : '—'}</span>;
      },
    },
  ];

  return (
    <div className="animate-fadeIn">
      <SectionHeader title="Mis alumnos" subtitle="Alumnos asignados a tu cargo" />
      <DataTable columns={columns} data={students ?? []} loading={isLoading} rowKey={r => r.id} emptyMessage="No tienes alumnos asignados" />
    </div>
  );
}
