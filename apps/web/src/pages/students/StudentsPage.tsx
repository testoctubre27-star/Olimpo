import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, UserPlus } from 'lucide-react';
import { useStudents } from '../../hooks/useApi';
import { DataTable } from '../../components/ui/DataTable';
import { SectionHeader, Badge, Button, Input, Select } from '../../components/ui';
import { NewStudentModal } from './NewStudentModal';
import { formatDate, STATUS_LABEL, STATUS_VARIANT, MODALITY_LABEL } from '../../utils/labels';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'ACTIVE',                   label: 'Activos' },
  { value: 'PENDING_PAYMENT_CONFIRMATION', label: 'Pendiente de pago' },
  { value: 'DELINQUENT',               label: 'Morosos' },
  { value: 'SUSPENDED',                label: 'Suspendidos' },
  { value: 'INACTIVE',                 label: 'Inactivos' },
];

export default function StudentsPage() {
  const navigate = useNavigate();
  const [search, setSearch]       = useState('');
  const [status, setStatus]       = useState('');
  const [page, setPage]           = useState(1);
  const [showNew, setShowNew]     = useState(false);

  const { data, isLoading, meta } = useStudents({ search, status, page });

  const columns = [
    {
      key: 'name', header: 'Alumno',
      render: (row: { name: string; phone: string }) => (
        <div>
          <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)' }}>{row.name}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.phone}</p>
        </div>
      ),
    },
    {
      key: 'modality', header: 'Modalidad', width: 220,
      render: (row: { modality: string }) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {MODALITY_LABEL[row.modality] ?? row.modality}
        </span>
      ),
    },
    {
      key: 'status', header: 'Estado', width: 160,
      render: (row: { status: string; conversationState: string }) => (
        <Badge variant={STATUS_VARIANT[row.status] ?? 'default'} dot>
          {STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'teacher', header: 'Maestro', width: 160,
      render: (row: { teacher?: { user: { name: string } } }) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.teacher?.user.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'createdAt', header: 'Registro', width: 110,
      render: (row: { createdAt: string }) => (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Alumnos"
        subtitle={`${meta?.total ?? 0} alumnos registrados`}
        actions={
          <Button size="sm" icon={<UserPlus size={14} />} onClick={() => setShowNew(true)}>
            Nuevo alumno
          </Button>
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <Input
          placeholder="Buscar por nombre o teléfono..."
          icon={<Search size={14} />}
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 320 }}
        />
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); }}
        />
      </div>

      <DataTable
        columns={columns}
        data={data ?? []}
        loading={isLoading}
        rowKey={r => r.id}
        onRowClick={row => navigate(`/students/${row.id}`)}
        pagination={meta ? { page, pages: meta.pages, total: meta.total, onPage: setPage } : undefined}
        emptyMessage="No se encontraron alumnos con los filtros actuales."
      />

      <NewStudentModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
