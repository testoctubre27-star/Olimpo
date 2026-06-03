import { useState } from 'react';
import { GraduationCap, Plus, Edit2, Power, KeyRound } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { SectionHeader, Badge, Button, Input } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { DataTable } from '../../components/ui/DataTable';
import { toast } from '../../components/ui/Toast';
import { formatPhone, DAY_LABEL } from '../../utils/labels';

// ─── Types ────────────────────────────────────
interface ScheduleModality {
  id: string;
  modality: { name: string; modality: string };
}

interface TeacherSchedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  isActive: boolean;
  modalities?: ScheduleModality[];
  // legacy
  modality?: { name: string };
  slots: { id: string }[];
}

interface Teacher {
  id: string;
  displayName: string;
  phone: string;
  commissionPct: number;
  user: { name: string; email: string; isActive: boolean };
  students: { id: string }[];
  schedules: TeacherSchedule[];
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
    mutationFn: async (p: object) => (await api.post('/teachers', p)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teachers'] }),
  });
}

function useUpdateTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...p }: { id: string } & Record<string, unknown>) =>
      (await api.patch(`/teachers/${id}`, p)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teachers'] }),
  });
}

function useResetPassword() {
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) =>
      (await api.post(`/teachers/${id}/reset-password`, { password })).data,
  });
}

// ─── Page ─────────────────────────────────────
export default function TeachersPage() {
  const { data: teachers, isLoading } = useTeachers();
  const createMutation = useCreateTeacher();
  const updateMutation = useUpdateTeacher();
  const resetMutation  = useResetPassword();

  const [showCreate,   setShowCreate]   = useState(false);
  const [editTarget,   setEditTarget]   = useState<Teacher | null>(null);
  const [resetTarget,  setResetTarget]  = useState<Teacher | null>(null);
  const [newPassword,  setNewPassword]  = useState('');

  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', commissionPct: '40',
  });
  const [editForm, setEditForm] = useState({
    name: '', phone: '', commissionPct: '',
  });

  const errMsg = (err: unknown) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

  const fi  = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const efi = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setEditForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password || !form.phone) {
      toast.error('Todos los campos son requeridos'); return;
    }
    try {
      await createMutation.mutateAsync({ ...form, commissionPct: Number(form.commissionPct) });
      toast.success('Maestro creado correctamente');
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', phone: '', commissionPct: '40' });
    } catch (err) { toast.error(errMsg(err) ?? 'Error al crear maestro'); }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    try {
      await updateMutation.mutateAsync({
        id: editTarget.id,
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        commissionPct: Number(editForm.commissionPct),
      });
      toast.success('Maestro actualizado');
      setEditTarget(null);
    } catch (err) { toast.error(errMsg(err) ?? 'Error al actualizar'); }
  };

  const handleToggle = async (t: Teacher) => {
    try {
      await updateMutation.mutateAsync({ id: t.id, isActive: !t.user.isActive });
      toast.success(t.user.isActive ? 'Maestro desactivado' : 'Maestro activado');
    } catch { toast.error('Error al cambiar estado'); }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    if (newPassword.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    try {
      await resetMutation.mutateAsync({ id: resetTarget.id, password: newPassword });
      toast.success(`Contraseña actualizada para ${resetTarget.user.email}`);
      setResetTarget(null);
      setNewPassword('');
    } catch { toast.error('Error al actualizar contraseña'); }
  };

  // Helper: get schedule modality name safely
  const getModalityName = (s: TeacherSchedule) => {
    if (s.modalities && s.modalities.length > 0) {
      return s.modalities.map(m => m.modality.name).join(', ');
    }
    if (s.modality) return s.modality.name;
    return '—';
  };

  const columns = [
    {
      key: 'name', header: 'Maestro',
      render: (row: Teacher) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <GraduationCap size={15} color="var(--primary)" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{row.user.name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'phone', header: 'Teléfono', width: 140,
      render: (row: Teacher) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatPhone(row.phone)}</span>
      ),
    },
    {
      key: 'schedules', header: 'Horarios', width: 180,
      render: (row: Teacher) => {
        const active = row.schedules?.filter(s => s.isActive) ?? [];
        if (active.length === 0) return <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin horarios</span>;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {active.slice(0, 3).map(s => (
              <span key={s.id} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {DAY_LABEL[s.dayOfWeek]} {s.startTime} · {getModalityName(s)}
              </span>
            ))}
            {active.length > 3 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{active.length - 3} más</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'students', header: 'Alumnos', width: 90, align: 'center' as const,
      render: (row: Teacher) => <Badge variant="info">{row.students?.length ?? 0}</Badge>,
    },
    {
      key: 'commission', header: 'Comisión', width: 100, align: 'right' as const,
      render: (row: Teacher) => (
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{row.commissionPct}%</span>
      ),
    },
    {
      key: 'status', header: 'Estado', width: 100,
      render: (row: Teacher) => (
        <Badge variant={row.user.isActive ? 'success' : 'default'} dot>
          {row.user.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      key: 'actions', header: '', width: 80,
      render: (row: Teacher) => (
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={e => { e.stopPropagation(); setEditTarget(row); setEditForm({ name: row.user.name, phone: row.phone, commissionPct: String(row.commissionPct) }); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 5, borderRadius: 6, display: 'flex' }}
            title="Editar">
            <Edit2 size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setResetTarget(row); setNewPassword(''); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 5, borderRadius: 6, display: 'flex' }}
            title="Cambiar contraseña">
            <KeyRound size={14} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); handleToggle(row); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: row.user.isActive ? 'var(--warning)' : 'var(--success)', padding: 5, borderRadius: 6, display: 'flex' }}
            title={row.user.isActive ? 'Desactivar' : 'Activar'}>
            <Power size={14} />
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
        emptyMessage="No hay maestros registrados"
      />

      {/* ── Create modal ── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo maestro" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
          <Button loading={createMutation.isPending} onClick={handleCreate} icon={<Plus size={14} />}>
            Crear maestro
          </Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Nombre completo *" value={form.name} onChange={fi('name')} placeholder="Juan García" />
            <Input label="Teléfono *" value={form.phone} onChange={fi('phone')} placeholder="7821234567" />
          </div>
          <Input label="Email *" type="email" value={form.email} onChange={fi('email')} placeholder="maestro@olimpo.mx" />
          <Input label="Contraseña *" type="password" value={form.password} onChange={fi('password')} placeholder="Mínimo 6 caracteres" />
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              Porcentaje de comisión
            </label>
            <input type="number" min={0} max={100} value={form.commissionPct} onChange={fi('commissionPct')}
              style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              Porcentaje del pago de los alumnos que corresponde al maestro
            </p>
          </div>
          <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info)' }}>
            El maestro recibirá acceso al portal con este email y contraseña. Compártelos de forma segura.
          </div>
        </div>
      </Modal>

      {/* ── Edit modal ── */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Editar — ${editTarget?.user.name}`} size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setEditTarget(null)}>Cancelar</Button>
          <Button loading={updateMutation.isPending} onClick={handleEdit}>Guardar cambios</Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Nombre completo" value={editForm.name} onChange={efi('name')} />
          <Input label="Teléfono" value={editForm.phone} onChange={efi('phone')} />
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              Porcentaje de comisión
            </label>
            <input type="number" min={0} max={100} value={editForm.commissionPct} onChange={efi('commissionPct')}
              style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
          </div>
        </div>
      </Modal>
      {/* ── Reset password modal ── */}
      <Modal open={!!resetTarget} onClose={() => { setResetTarget(null); setNewPassword(''); }} title="Cambiar contraseña" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => { setResetTarget(null); setNewPassword(''); }}>Cancelar</Button>
          <Button loading={resetMutation.isPending} onClick={handleResetPassword} icon={<KeyRound size={14} />}>
            Guardar contraseña
          </Button>
        </>}>
        {resetTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info)' }}>
              Cambiando contraseña de <strong>{resetTarget.user.name}</strong><br />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{resetTarget.user.email}</span>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                Nueva contraseña
              </label>
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
