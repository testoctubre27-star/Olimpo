import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Plus, Edit2, Users, Calendar, ToggleLeft, ToggleRight } from 'lucide-react';
import { api } from '../../services/api';
import { DataTable } from '../../components/ui/DataTable';
import { SectionHeader, Badge, Button, Card, Input } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { formatPhone, DAY_LABEL, MODALITY_LABEL } from '../../utils/labels';

// ─── Types ────────────────────────────────────
interface Teacher {
  id: string;
  displayName: string;
  phone: string;
  commissionPct: string;
  user: { name: string; email: string; isActive: boolean };
  students: { id: string }[];
  schedules: {
    id: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    capacity: number;
    modality: { name: string; modality: string };
    slots: { id: string }[];
  }[];
}

// ─── Hooks ────────────────────────────────────
function useTeachers() {
  return useQuery({
    queryKey: ['teachers'],
    queryFn: async () => {
      const { data } = await api.get('/teachers');
      return data.data as Teacher[];
    },
  });
}

function useCreateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string; email: string; password: string;
      phone: string; commissionPct: number;
    }) => {
      const { data } = await api.post('/teachers', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teachers'] }),
  });
}

function useUpdateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: {
      id: string; name?: string; phone?: string;
      commissionPct?: number; isActive?: boolean;
    }) => {
      const { data } = await api.patch(`/teachers/${id}`, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teachers'] }),
  });
}

// ─── Empty form state ─────────────────────────
const emptyForm = { name: '', email: '', password: '', phone: '', commissionPct: '40' };

// ─── Page ─────────────────────────────────────
export default function TeachersPage() {
  const { data: teachers, isLoading } = useTeachers();
  const createMutation = useCreateTeacher();
  const updateMutation = useUpdateTeacher();

  const [showCreate, setShowCreate]     = useState(false);
  const [selected, setSelected]         = useState<Teacher | null>(null);
  const [form, setForm]                 = useState(emptyForm);
  const [editForm, setEditForm]         = useState({ name: '', phone: '', commissionPct: '' });
  const [errors, setErrors]             = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim())              e.name     = 'El nombre es requerido';
    if (!form.email.trim())             e.email    = 'El email es requerido';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email inválido';
    if (form.password.length < 6)       e.password = 'Mínimo 6 caracteres';
    if (form.phone.replace(/\D/g,'').length < 10) e.phone = 'Teléfono de 10 dígitos';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;
    try {
      await createMutation.mutateAsync({
        name:          form.name.trim(),
        email:         form.email.trim().toLowerCase(),
        password:      form.password,
        phone:         form.phone.replace(/\D/g, ''),
        commissionPct: Number(form.commissionPct) || 40,
      });
      toast.success(`Maestro ${form.name} creado correctamente`);
      setShowCreate(false);
      setForm(emptyForm);
      setErrors({});
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Error al crear maestro');
    }
  };

  const handleUpdate = async () => {
    if (!selected) return;
    try {
      await updateMutation.mutateAsync({
        id:            selected.id,
        name:          editForm.name || undefined,
        phone:         editForm.phone || undefined,
        commissionPct: editForm.commissionPct ? Number(editForm.commissionPct) : undefined,
      });
      toast.success('Maestro actualizado');
      setSelected(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Error al actualizar');
    }
  };

  const handleToggleActive = async (teacher: Teacher) => {
    const action = teacher.user.isActive ? 'desactivar' : 'activar';
    try {
      await updateMutation.mutateAsync({ id: teacher.id, isActive: !teacher.user.isActive });
      toast.success(`Maestro ${action === 'activar' ? 'activado' : 'desactivado'}`);
    } catch {
      toast.error(`Error al ${action} maestro`);
    }
  };

  const columns = [
    {
      key: 'name', header: 'Maestro',
      render: (row: Teacher) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: row.user.isActive ? 'var(--primary-light)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <GraduationCap size={16} color={row.user.isActive ? 'var(--primary)' : 'var(--text-muted)'} />
          </div>
          <div>
            <p style={{ fontWeight: 500, fontSize: 14, color: 'var(--text-primary)' }}>{row.user.name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone', header: 'Teléfono', width: 140,
      render: (row: Teacher) => <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatPhone(row.phone)}</span>,
    },
    {
      key: 'students', header: 'Alumnos', width: 90, align: 'center' as const,
      render: (row: Teacher) => (
        <Badge variant="info">{row.students.length}</Badge>
      ),
    },
    {
      key: 'schedules', header: 'Horarios', width: 90, align: 'center' as const,
      render: (row: Teacher) => (
        <Badge variant="default">{row.schedules.length}</Badge>
      ),
    },
    {
      key: 'commission', header: 'Comisión', width: 100, align: 'right' as const,
      render: (row: Teacher) => (
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{row.commissionPct}%</span>
      ),
    },
    {
      key: 'status', header: 'Estado', width: 110,
      render: (row: Teacher) => (
        <Badge variant={row.user.isActive ? 'success' : 'default'} dot>
          {row.user.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: '', width: 100,
      render: (row: Teacher) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={e => { e.stopPropagation(); setSelected(row); setEditForm({ name: row.user.name, phone: row.phone, commissionPct: String(row.commissionPct) }); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex' }}
            title="Editar"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); handleToggleActive(row); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: row.user.isActive ? 'var(--warning)' : 'var(--success)', padding: 6, borderRadius: 6, display: 'flex' }}
            title={row.user.isActive ? 'Desactivar' : 'Activar'}
          >
            {row.user.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Maestros"
        subtitle={`${teachers?.length ?? 0} maestros registrados`}
        actions={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Nuevo maestro
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={teachers ?? []}
        loading={isLoading}
        rowKey={r => r.id}
        emptyMessage="No hay maestros registrados. Crea el primero."
      />

      {/* ── Modal: Create teacher ── */}
      <Modal
        open={showCreate}
        onClose={() => { setShowCreate(false); setForm(emptyForm); setErrors({}); }}
        title="Nuevo maestro"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowCreate(false); setForm(emptyForm); setErrors({}); }}>
              Cancelar
            </Button>
            <Button loading={createMutation.isPending} onClick={handleCreate} icon={<Plus size={14} />}>
              Crear maestro
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Input
            label="Nombre completo *"
            placeholder="Ej: María García López"
            value={form.name}
            error={errors.name}
            onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(er => ({ ...er, name: '' })); }}
          />
          <Input
            label="Email *"
            type="email"
            placeholder="maestro@olimpo.mx"
            value={form.email}
            error={errors.email}
            onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setErrors(er => ({ ...er, email: '' })); }}
          />
          <Input
            label="Contraseña *"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={form.password}
            error={errors.password}
            onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setErrors(er => ({ ...er, password: '' })); }}
          />
          <Input
            label="Teléfono *"
            placeholder="5512345678"
            value={form.phone}
            error={errors.phone}
            onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); setErrors(er => ({ ...er, phone: '' })); }}
          />
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              Porcentaje de comisión
            </label>
            <input
              type="number" min={0} max={100}
              value={form.commissionPct}
              onChange={e => setForm(f => ({ ...f, commissionPct: e.target.value }))}
              style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Porcentaje del pago de los alumnos que corresponde al maestro
            </p>
          </div>

          <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info)' }}>
            El maestro recibirá acceso al portal con este email y contraseña. Compártelos de forma segura.
          </div>
        </div>
      </Modal>

      {/* ── Modal: Edit teacher ── */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Editar maestro"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button loading={updateMutation.isPending} onClick={handleUpdate}>
              Guardar cambios
            </Button>
          </>
        }
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Edit fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Input
                label="Nombre"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              />
              <Input
                label="Teléfono"
                value={editForm.phone}
                onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
              />
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  Comisión (%)
                </label>
                <input
                  type="number" min={0} max={100}
                  value={editForm.commissionPct}
                  onChange={e => setEditForm(f => ({ ...f, commissionPct: e.target.value }))}
                  style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
                />
              </div>
            </div>

            {/* Schedules summary */}
            {selected.schedules.length > 0 && (
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} /> Horarios activos
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {selected.schedules.map(s => (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {DAY_LABEL[s.dayOfWeek]} {s.startTime}–{s.endTime}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {MODALITY_LABEL[s.modality.modality] ?? s.modality.name}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={12} color="var(--text-muted)" />
                        <span style={{ color: 'var(--text-muted)' }}>{s.slots.length}/{s.capacity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
