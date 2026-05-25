import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Users, Clock, CheckCircle } from 'lucide-react';
import { api } from '../../services/api';
import { SectionHeader, Card, Button, Badge, Select, Empty } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { MODALITY_LABEL, DAY_LABEL, occupancyColor } from '../../utils/labels';

// ─── Types ────────────────────────────────────
interface TeacherSchedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  isActive: boolean;
  modality: { name: string; modality: string; maxCapacity: number };
  slots: { student: { id: string; name: string; status: string } }[];
}

// ─── Hooks ────────────────────────────────────
function useMySchedules() {
  return useQuery({
    queryKey: ['my-schedules'],
    queryFn: async () => {
      const { data } = await api.get('/teachers/my-schedules');
      return data.data as TeacherSchedule[];
    },
  });
}

function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: object) => {
      const { data } = await api.post('/teachers/my-schedules', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-schedules'] }),
  });
}

function useUpdateCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, capacity }: { id: string; capacity: number }) => {
      const { data } = await api.patch(`/teachers/my-schedules/${id}`, { capacity });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-schedules'] }),
  });
}

function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Use DELETE HTTP method explicitly
      const { data } = await api.delete(`/teachers/my-schedules/${id}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-schedules'] });
      qc.invalidateQueries({ queryKey: ['schedules'] });
    },
  });
}

// ─── Constants ────────────────────────────────
const MODALITY_OPTIONS = [
  { value: '', label: 'Selecciona una modalidad...' },
  { value: 'BABY_PHASE1',    label: 'Natación Bebés Fase 1 (4-12 meses)' },
  { value: 'BABY_PHASE2',    label: 'Natación Bebés Fase 2 (1-3 años)' },
  { value: 'BABY_PHASE3',    label: 'Natación Bebés Fase 3 (3-5 años)' },
  { value: 'GROUP_CHILD',    label: 'Natación Grupal Infantil' },
  { value: 'GROUP_ADULT',    label: 'Natación Adultos Grupal' },
  { value: 'FREE_ACCESS',    label: 'Acceso Libre' },
  { value: 'AQUA_THERAPY',   label: 'Terapia Acuática' },
];

const DAY_OPTIONS = DAY_LABEL.map((d, i) => ({ value: String(i), label: d }));

const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6;
  const min  = i % 2 === 0 ? '00' : '30';
  const label = `${String(hour).padStart(2, '0')}:${min}`;
  return { value: label, label };
});

// ─── Page ─────────────────────────────────────
export default function MySchedulesPage() {
  const { data: schedules, isLoading } = useMySchedules();
  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateCapacity();
  const deleteMutation = useDeleteSchedule();

  const [showCreate,    setShowCreate]    = useState(false);
  const [editSchedule,  setEditSchedule]  = useState<TeacherSchedule | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<TeacherSchedule | null>(null);
  const [editCapacity,  setEditCapacity]  = useState('');

  const [form, setForm] = useState({
    dayOfWeek: '1', startTime: '09:00', endTime: '10:00', modality: '', capacity: '8',
  });

  const errMsg = (err: unknown) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

  const handleCreate = async () => {
    if (!form.modality) { toast.error('Selecciona una modalidad'); return; }
    if (form.startTime >= form.endTime) { toast.error('La hora de inicio debe ser antes de la hora fin'); return; }
    try {
      await createMutation.mutateAsync({
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime:   form.endTime,
        modality:  form.modality,
        capacity:  Number(form.capacity),
      });
      toast.success('Horario creado correctamente');
      setShowCreate(false);
      setForm({ dayOfWeek: '1', startTime: '09:00', endTime: '10:00', modality: '', capacity: '8' });
    } catch (err) {
      toast.error(errMsg(err) ?? 'Error al crear horario');
    }
  };

  const handleUpdateCapacity = async () => {
    if (!editSchedule) return;
    const cap = Number(editCapacity);
    if (!cap || cap < 1) { toast.error('Ingresa un cupo válido'); return; }
    try {
      await updateMutation.mutateAsync({ id: editSchedule.id, capacity: cap });
      toast.success('Cupo actualizado');
      setEditSchedule(null);
    } catch (err) {
      toast.error(errMsg(err) ?? 'Error al actualizar');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Horario eliminado');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(errMsg(err) ?? 'Error al eliminar horario');
    }
  };

  // Group schedules by day
  const byDay: Record<number, TeacherSchedule[]> = {};
  schedules?.forEach(s => {
    if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = [];
    byDay[s.dayOfWeek].push(s);
  });

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Mis horarios"
        subtitle="Gestiona tus horarios disponibles y cupos"
        actions={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Nuevo horario
          </Button>
        }
      />

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12 }} />)}
        </div>
      )}

      {!isLoading && (!schedules || schedules.length === 0) && (
        <Empty
          icon={<Clock size={40} color="var(--text-muted)" />}
          title="Sin horarios registrados"
          description="Agrega tus horarios disponibles para que los alumnos puedan inscribirse."
          action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Agregar primer horario</Button>}
        />
      )}

      {Object.entries(byDay).sort(([a], [b]) => Number(a) - Number(b)).map(([day, slots]) => (
        <div key={day} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {DAY_LABEL[Number(day)]}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {slots.map(s => {
              const enrolled = s.slots.length;
              const pct = Math.round((enrolled / s.capacity) * 100);
              const full = enrolled >= s.capacity;
              return (
                <Card key={s.id} style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
                        {s.startTime} – {s.endTime}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {MODALITY_LABEL[s.modality.modality] ?? s.modality.name}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => { setEditSchedule(s); setEditCapacity(String(s.capacity)); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex' }}
                        title="Editar cupo"
                      >
                        <Edit2 size={14} />
                      </button>
                      {/* Delete button — only enabled when no students */}
                      <button
                        onClick={() => {
                          if (enrolled > 0) {
                            toast.error(`No puedes eliminar este horario — tiene ${enrolled} alumno(s) activo(s)`);
                            return;
                          }
                          setDeleteTarget(s);
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: enrolled > 0 ? 'not-allowed' : 'pointer',
                          color: enrolled > 0 ? 'var(--border-strong)' : 'var(--danger)',
                          padding: 6, borderRadius: 6, display: 'flex', opacity: enrolled > 0 ? 0.4 : 1,
                        }}
                        title={enrolled > 0 ? 'No se puede eliminar con alumnos activos' : 'Eliminar horario'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: occupancyColor(pct), borderRadius: 99, transition: 'width .3s' }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Users size={13} color="var(--text-muted)" />
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {enrolled} / {s.capacity} alumnos
                      </span>
                    </div>
                    {full
                      ? <Badge variant="danger">Cupo lleno</Badge>
                      : <Badge variant="success"><CheckCircle size={10} /> Disponible</Badge>}
                  </div>

                  {enrolled > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      {s.slots.map(slot => (
                        <div key={slot.student.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: slot.student.status === 'ACTIVE' ? 'var(--success)' : 'var(--warning)', flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{slot.student.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── Modal: Create ── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo horario" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
          <Button loading={createMutation.isPending} onClick={handleCreate} icon={<Plus size={14} />}>
            Crear horario
          </Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Select label="Modalidad *" options={MODALITY_OPTIONS} value={form.modality}
            onChange={e => setForm(f => ({ ...f, modality: e.target.value }))} />
          <Select label="Día de la semana *" options={DAY_OPTIONS} value={form.dayOfWeek}
            onChange={e => setForm(f => ({ ...f, dayOfWeek: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Hora inicio *" options={TIME_OPTIONS} value={form.startTime}
              onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            <Select label="Hora fin *" options={TIME_OPTIONS} value={form.endTime}
              onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Cupo máximo *</label>
            <input type="number" min={1} max={50} value={form.capacity}
              onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
              style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
          </div>
        </div>
      </Modal>

      {/* ── Modal: Edit capacity ── */}
      <Modal open={!!editSchedule} onClose={() => setEditSchedule(null)} title="Editar cupo" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setEditSchedule(null)}>Cancelar</Button>
          <Button loading={updateMutation.isPending} onClick={handleUpdateCapacity}>Guardar</Button>
        </>}>
        {editSchedule && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {DAY_LABEL[editSchedule.dayOfWeek]} {editSchedule.startTime}–{editSchedule.endTime} · {editSchedule.slots.length} alumno(s) inscritos
            </p>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Nuevo cupo máximo</label>
              <input type="number" min={editSchedule.slots.length || 1} max={editSchedule.modality.maxCapacity}
                value={editCapacity} onChange={e => setEditCapacity(e.target.value)}
                style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Mínimo: {editSchedule.slots.length} · Máximo: {editSchedule.modality.maxCapacity}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: Confirm delete ── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar horario" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="danger" loading={deleteMutation.isPending} onClick={handleDelete} icon={<Trash2 size={14} />}>
            Eliminar
          </Button>
        </>}>
        {deleteTarget && (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            ¿Confirmas que deseas eliminar el horario del <strong>{DAY_LABEL[deleteTarget.dayOfWeek]}</strong> de <strong>{deleteTarget.startTime}</strong> a <strong>{deleteTarget.endTime}</strong>?
            Esta acción no se puede deshacer.
          </p>
        )}
      </Modal>
    </div>
  );
}
