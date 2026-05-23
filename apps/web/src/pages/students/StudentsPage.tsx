import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, UserPlus } from 'lucide-react';
import { useStudents } from '../../hooks/useApi';
import type { Student } from '../../hooks/useApi';
import { DataTable } from '../../components/ui/DataTable';
import { Badge, Button, SectionHeader, Input, Select } from '../../components/ui';
import { NewStudentModal } from './NewStudentModal';
import { STATUS_LABEL, STATUS_BADGE, MODALITY_LABEL, formatDate, formatPhone, DAY_LABEL } from '../../utils/labels';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'ACTIVE',                      label: 'Activos' },
  { value: 'DELINQUENT',                  label: 'Morosos' },
  { value: 'SUSPENDED',                   label: 'Suspendidos' },
  { value: 'PENDING_PAYMENT_CONFIRMATION', label: 'Pendientes de pago' },
  { value: 'INACTIVE',                    label: 'Inactivos' },
];

export default function StudentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage]     = useState(1);
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useStudents({
    search: search || undefined,
    status: status || undefined,
    page,
    limit: 20,
  });

  const columns = [
    {
      key: 'name', header: 'Alumno',
      render: (row: Student) => (
        <div>
          <p style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 14 }}>{row.name}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{formatPhone(row.phone)}</p>
        </div>
      ),
    },
    {
      key: 'status', header: 'Estado', width: 140,
      render: (row: Student) => (
        <Badge variant={STATUS_BADGE[row.status] ?? 'default'} dot>
          {STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'modality', header: 'Modalidad', width: 190,
      render: (row: Student) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {MODALITY_LABEL[row.modality] ?? row.modality}
        </span>
      ),
    },
    {
      key: 'schedule', header: 'Horario', width: 150,
      render: (row: Student) => {
        const slot = row.scheduleSlots?.[0];
        if (!slot) return <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin asignar</span>;
        return (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {DAY_LABEL[slot.schedule.dayOfWeek]} {slot.schedule.startTime}
          </span>
        );
      },
    },
    {
      key: 'teacher', header: 'Maestro', width: 140,
      render: (row: Student) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.teacher?.user.name ?? <span style={{ color: 'var(--text-muted)' }}>Sin asignar</span>}
        </span>
      ),
    },
    {
      key: 'lastPayment', header: 'Último pago', width: 120,
      render: (row: Student) => {
        const p = row.payments?.[0];
        return (
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {p ? formatDate(p.confirmedAt) : '—'}
          </span>
        );
      },
    },
    {
      key: 'createdAt', header: 'Registro', width: 110,
      render: (row: Student) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{formatDate(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Alumnos"
        subtitle={`${data?.meta.total ?? 0} alumnos en total`}
        actions={
          <Button icon={<UserPlus size={14} />} size="sm" onClick={() => setShowNew(true)}>
            Nuevo alumno
          </Button>
        }
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 340 }}>
          <Input
            placeholder="Buscar por nombre o teléfono..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            icon={<Search size={14} />}
          />
        </div>
        <div style={{ minWidth: 200 }}>
          <Select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
            options={STATUS_OPTIONS}
          />
        </div>
        {(search || status) && (
          <Button
            variant="ghost" size="sm"
            onClick={() => { setSearch(''); setStatus(''); setPage(1); }}
            icon={<Filter size={13} />}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={r => r.id}
        onRowClick={row => navigate(`/students/${row.id}`)}
        emptyMessage={search || status ? 'No se encontraron alumnos con esos filtros' : 'No hay alumnos registrados'}
        pagination={data ? {
          page:    data.meta.page,
          pages:   data.meta.pages,
          total:   data.meta.total,
          onPage:  setPage,
        } : undefined}
      />

      <NewStudentModal open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}
