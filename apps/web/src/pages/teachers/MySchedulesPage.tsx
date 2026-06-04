import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Users, Clock, CheckCircle, Link, Link2Off, UserPlus, X } from 'lucide-react';
import { api } from '../../services/api';
import { SectionHeader, Card, Button, Badge, Select, Empty } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { DAY_LABEL, occupancyColor } from '../../utils/labels';

// ─── Types ────────────────────────────────────
interface ScheduleModalityEntry {
  id: string;
  modalityId: string;
  capacity: number;
  modality: { name: string; modality: string; maxCapacity: number };
}

interface TeacherSchedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  isActive: boolean;
  pairedWithId: string | null;
  modalities: ScheduleModalityEntry[];
  slots: { student: { id: string; name: string; status: string } }[];
}

// ─── Constants ────────────────────────────────
const ALL_MODALITIES = [
  { value: 'BABY_PHASE1',   label: 'Natación Bebés Fase 1 (4-12 meses)', personal: true  },
  { value: 'BABY_PHASE2',   label: 'Natación Bebés Fase 2 (1-3 años)',   personal: true  },
  { value: 'BABY_PHASE3',   label: 'Natación Bebés Fase 3 (3-5 años)',   personal: true  },
  { value: 'GROUP_CHILD',   label: 'Natación Grupal Infantil',           personal: false },
  { value: 'GROUP_ADULT',   label: 'Natación Adultos Grupal',            personal: false },
  { value: 'FREE_ACCESS',   label: 'Acceso Libre',                       personal: false },
  { value: 'AQUA_THERAPY',  label: 'Terapia Acuática',                   personal: true  },
  { value: 'PERSONAL_CHILD','label': 'Personalizado Infantil',           personal: true  },
];

const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6;
  const min  = i % 2 === 0 ? '00' : '30';
  const label = `${String(hour).padStart(2, '0')}:${min}`;
  return { value: label, label };
});

const DAY_OPTIONS = DAY_LABEL.map((d, i) => ({ value: String(i), label: d }));

// ─── Types (extra) ───────────────────────────
interface MyStudent {
  id: string;
  name: string;
  phone: string;
  modality: string;
  scheduleSlots: { scheduleId: string; isActive: boolean }[];
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

const mutOpts = (qc: ReturnType<typeof useQueryClient>) => ({
  onSuccess: () => qc.invalidateQueries({ queryKey: ['my-schedules'] }),
});

function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (p: object) => (await api.post('/teachers/my-schedules', p)).data, ...mutOpts(qc) });
}
function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ id, ...p }: { id: string } & Record<string, unknown>) => (await api.patch(`/teachers/my-schedules/${id}`, p)).data, ...mutOpts(qc) });
}
function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async (id: string) => { await api.delete(`/teachers/my-schedules/${id}`); }, ...mutOpts(qc) });
}
function usePairSchedule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ id, pairedWithId }: { id: string; pairedWithId: string | null }) => (await api.patch(`/teachers/my-schedules/${id}/pair`, { pairedWithId })).data, ...mutOpts(qc) });
}

function useAllStudents() {
  return useQuery({
    queryKey: ['all-students-list'],
    queryFn: async () => {
      // Fetch all students across all pages for assignment purposes
      const { data } = await api.get('/students?limit=300');
      return (data.data ?? []) as MyStudent[];
    },
  });
}

function useAssignStudentToSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ studentId, scheduleId }: { studentId: string; scheduleId: string }) => {
      const { data } = await api.post(`/students/${studentId}/assign-schedule`, { scheduleId });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-schedules'] });
      qc.invalidateQueries({ queryKey: ['all-students-list'] });
    },
  });
}

function useRemoveStudentFromSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ studentId }: { studentId: string }) => {
      const { data } = await api.post(`/students/${studentId}/assign-schedule`, { scheduleId: null });
      return data;
    },
    onSuccess: () => {
      // Invalidate everything related to students and schedules
      qc.invalidateQueries({ queryKey: ['my-schedules'] });
      qc.invalidateQueries({ queryKey: ['all-students-list'] });
      qc.invalidateQueries({ queryKey: ['my-students'] });
      qc.removeQueries({ queryKey: ['my-students'] });
    },
  });
}

// ─── Modality Picker ──────────────────────────
function ModalityPicker({
  selected, onChange,
}: {
  selected: { modality: string; capacity: number }[];
  onChange: (v: { modality: string; capacity: number }[]) => void;
}) {
  const toggle = (value: string) => {
    const isPersonal = ALL_MODALITIES.find(m => m.value === value)?.personal ?? false;
    if (selected.find(s => s.modality === value)) {
      onChange(selected.filter(s => s.modality !== value));
    } else {
      onChange([...selected, { modality: value, capacity: isPersonal ? 1 : 8 }]);
    }
  };

  const updateCap = (modality: string, capacity: number) => {
    onChange(selected.map(s => s.modality === modality ? { ...s, capacity } : s));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 2, display: 'block' }}>
        Modalidades disponibles en este horario *
      </label>
      {ALL_MODALITIES.map(m => {
        const sel = selected.find(s => s.modality === m.value);
        return (
          <div key={m.value}>
            <button
              type="button"
              onClick={() => toggle(m.value)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 'var(--radius-md)',
                border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                background: sel ? 'var(--primary-light)' : 'var(--bg)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', textAlign: 'left',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                background: sel ? 'var(--primary)' : 'transparent',
                border: sel ? 'none' : '2px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {sel && <CheckCircle size={12} color="white" />}
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{m.label}</span>
              {m.personal && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cupo: 1</span>}
            </button>

            {/* Capacity input for group modalities */}
            {sel && !m.personal && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingLeft: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cupo para esta modalidad:</span>
                <input
                  type="number" min={1} max={50}
                  value={sel.capacity}
                  onChange={e => updateCap(m.value, Number(e.target.value))}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 60, height: 30, padding: '0 8px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty form ───────────────────────────────
const emptyForm = () => ({ dayOfWeek: '1', startTime: '09:00', endTime: '10:00', modalities: [] as { modality: string; capacity: number }[] });

// ─── Page ─────────────────────────────────────
export default function MySchedulesPage() {
  const { data: schedules, isLoading } = useMySchedules();
  const createMutation  = useCreateSchedule();
  const updateMutation  = useUpdateSchedule();
  const deleteMutation  = useDeleteSchedule();
  const pairMutation    = usePairSchedule();
  const assignMutation  = useAssignStudentToSchedule();
  const removeMutation  = useRemoveStudentFromSchedule();
  const { data: myStudents } = useAllStudents();

  const [showCreate,     setShowCreate]     = useState(false);
  const [editTarget,     setEditTarget]     = useState<TeacherSchedule | null>(null);
  const [deleteTarget,   setDeleteTarget]   = useState<TeacherSchedule | null>(null);
  const [pairTarget,     setPairTarget]     = useState<TeacherSchedule | null>(null);
  const [assignTarget,   setAssignTarget]   = useState<TeacherSchedule | null>(null);
  const [assignSearch,   setAssignSearch]   = useState('');
  const [selectedPairId, setSelectedPairId] = useState('');

  const [form,     setForm]     = useState(emptyForm());
  const [editForm, setEditForm] = useState(emptyForm());

  const errMsg = (err: unknown) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

  const handleCreate = async () => {
    if (form.modalities.length === 0) { toast.error('Selecciona al menos una modalidad'); return; }
    if (form.startTime >= form.endTime) { toast.error('La hora de inicio debe ser antes de la hora fin'); return; }
    try {
      await createMutation.mutateAsync({ ...form, dayOfWeek: Number(form.dayOfWeek) });
      toast.success('Horario creado');
      setShowCreate(false);
      setForm(emptyForm());
    } catch (err) { toast.error(errMsg(err) ?? 'Error al crear'); }
  };

  const handleEdit = async () => {
    if (!editTarget) return;
    if (editForm.modalities.length === 0) { toast.error('Selecciona al menos una modalidad'); return; }
    if (editForm.startTime >= editForm.endTime) { toast.error('La hora de inicio debe ser antes de la hora fin'); return; }
    try {
      await updateMutation.mutateAsync({ id: editTarget.id, startTime: editForm.startTime, endTime: editForm.endTime, modalities: editForm.modalities });
      toast.success('Horario actualizado');
      setEditTarget(null);
    } catch (err) { toast.error(errMsg(err) ?? 'Error al actualizar'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success('Horario eliminado');
      setDeleteTarget(null);
    } catch (err) { toast.error(errMsg(err) ?? 'Error al eliminar'); }
  };

  const handleSavePair = async () => {
    if (!pairTarget) return;
    try {
      await pairMutation.mutateAsync({ id: pairTarget.id, pairedWithId: selectedPairId || null });
      toast.success(selectedPairId ? 'Horarios vinculados' : 'Vínculo eliminado');
      setPairTarget(null);
    } catch (err) { toast.error(errMsg(err) ?? 'Error al vincular'); }
  };

  const scheduleLabel = (s: TeacherSchedule) => `${DAY_LABEL[s.dayOfWeek]} ${s.startTime}–${s.endTime}`;
  const getPaired     = (id: string) => schedules?.find(s => s.id === id);

  const pairOptions = (target: TeacherSchedule) => schedules?.filter(s =>
    s.id !== target.id &&
    s.startTime === target.startTime &&
    s.endTime === target.endTime &&
    (!s.pairedWithId || s.pairedWithId === target.id)
  ) ?? [];

  const byDay: Record<number, TeacherSchedule[]> = {};
  schedules?.forEach(s => { if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = []; byDay[s.dayOfWeek].push(s); });

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Mis horarios"
        subtitle="Cada horario puede ofrecer múltiples modalidades"
        actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => { setForm(emptyForm()); setShowCreate(true); }}>Nuevo horario</Button>}
      />

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 160, borderRadius: 12 }} />)}
        </div>
      )}

      {!isLoading && !schedules?.length && (
        <Empty icon={<Clock size={40} color="var(--text-muted)" />} title="Sin horarios registrados"
          description="Agrega horarios y elige qué modalidades puedes impartir en cada uno."
          action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Agregar primer horario</Button>} />
      )}

      {Object.entries(byDay).sort(([a],[b]) => Number(a)-Number(b)).map(([day, slots]) => (
        <div key={day} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {DAY_LABEL[Number(day)]}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {slots.map(s => {
              const enrolled = s.slots.length;
              const pct      = Math.round((enrolled / s.capacity) * 100);
              const paired   = s.pairedWithId ? getPaired(s.pairedWithId) : null;

              return (
                <Card key={s.id}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>{s.startTime} – {s.endTime}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {s.modalities.length} modalidad{s.modalities.length !== 1 ? 'es' : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => setAssignTarget(s)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', padding: 6, borderRadius: 6, display: 'flex' }} title="Agregar alumno">
                        <UserPlus size={14} />
                      </button>
                      <button onClick={() => { setEditTarget(s); setEditForm({ dayOfWeek: String(s.dayOfWeek), startTime: s.startTime, endTime: s.endTime, modalities: s.modalities.map(m => ({ modality: m.modality.modality, capacity: m.capacity })) }); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex' }} title="Editar">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => { setPairTarget(s); setSelectedPairId(s.pairedWithId ?? ''); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.pairedWithId ? 'var(--primary)' : 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex' }} title="Vincular par">
                        <Link size={14} />
                      </button>
                      <button onClick={() => { if (enrolled > 0) { toast.error(`Tiene ${enrolled} alumno(s) activo(s)`); return; } setDeleteTarget(s); }}
                        style={{ background: 'none', border: 'none', cursor: enrolled > 0 ? 'not-allowed' : 'pointer', color: enrolled > 0 ? 'var(--border-strong)' : 'var(--danger)', padding: 6, borderRadius: 6, display: 'flex', opacity: enrolled > 0 ? 0.4 : 1 }} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Paired indicator */}
                  {paired && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '5px 10px', background: 'var(--primary-light)', borderRadius: 'var(--radius-md)' }}>
                      <Link size={12} color="var(--primary)" />
                      <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, flex: 1 }}>Par: {scheduleLabel(paired)}</span>
                      <button onClick={() => pairMutation.mutate({ id: s.id, pairedWithId: null })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', padding: 2 }} title="Quitar vínculo">
                        <Link2Off size={11} />
                      </button>
                    </div>
                  )}

                  {/* Modality tags */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                    {s.modalities.map(m => (
                      <span key={m.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--border)', color: 'var(--text-secondary)' }}>
                        {m.modality.name} · {m.capacity === 1 ? '1 alumno' : `${m.capacity} cupo`}
                      </span>
                    ))}
                  </div>

                  {/* Occupancy bar */}
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, marginBottom: 8 }}>
                    <div style={{ height: '100%', width: `${Math.min(pct,100)}%`, background: occupancyColor(pct), borderRadius: 99 }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Users size={13} color="var(--text-muted)" />
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{enrolled} / {s.capacity} alumnos</span>
                    </div>
                    {enrolled >= s.capacity
                      ? <Badge variant="danger">Lleno</Badge>
                      : <Badge variant="success"><CheckCircle size={10} /> Disponible</Badge>}
                  </div>

                  {/* Student list */}
                  {enrolled > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      {s.slots.map(slot => (
                        <div key={slot.student.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: slot.student.status === 'ACTIVE' ? 'var(--success)' : 'var(--warning)', flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{slot.student.name}</span>
                          <button
                            onClick={() => removeMutation.mutate({ studentId: slot.student.id })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 2, borderRadius: 4, display: 'flex', opacity: 0.6 }}
                            title="Quitar del horario"
                          >
                            <X size={11} />
                          </button>
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

      {/* ── Create modal ── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo horario" size="md"
        footer={<><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
          <Button loading={createMutation.isPending} onClick={handleCreate} icon={<Plus size={14} />}>Crear horario</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Select label="Día de la semana *" options={DAY_OPTIONS} value={form.dayOfWeek}
            onChange={e => setForm(f => ({ ...f, dayOfWeek: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Hora inicio *" options={TIME_OPTIONS} value={form.startTime}
              onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
            <Select label="Hora fin *" options={TIME_OPTIONS} value={form.endTime}
              onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
          </div>
          <ModalityPicker selected={form.modalities} onChange={mods => setForm(f => ({ ...f, modalities: mods }))} />
        </div>
      </Modal>

      {/* ── Edit modal ── */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Editar horario" size="md"
        footer={<><Button variant="secondary" onClick={() => setEditTarget(null)}>Cancelar</Button>
          <Button loading={updateMutation.isPending} onClick={handleEdit}>Guardar cambios</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Hora inicio" options={TIME_OPTIONS} value={editForm.startTime}
              onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))} />
            <Select label="Hora fin" options={TIME_OPTIONS} value={editForm.endTime}
              onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))} />
          </div>
          <ModalityPicker selected={editForm.modalities} onChange={mods => setEditForm(f => ({ ...f, modalities: mods }))} />
        </div>
      </Modal>

      {/* ── Pair modal ── */}
      <Modal open={!!pairTarget} onClose={() => setPairTarget(null)} title="Vincular horario par" size="sm"
        footer={<><Button variant="secondary" onClick={() => setPairTarget(null)}>Cancelar</Button>
          <Button loading={pairMutation.isPending} onClick={handleSavePair} icon={<Link size={14} />}>
            {selectedPairId ? 'Vincular' : 'Quitar vínculo'}
          </Button></>}>
        {pairTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '10px 14px', background: 'var(--primary-light)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>Horario base</p>
              <p style={{ fontSize: 14, color: 'var(--text-primary)' }}>{scheduleLabel(pairTarget)}</p>
            </div>
            {pairOptions(pairTarget).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--warning)', padding: '10px 14px', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)' }}>
                No hay horarios compatibles (mismo tiempo, diferente día) para vincular.
              </p>
            ) : (
              <select value={selectedPairId} onChange={e => setSelectedPairId(e.target.value)}
                style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}>
                <option value="">Sin par</option>
                {pairOptions(pairTarget).map(s => <option key={s.id} value={s.id}>{scheduleLabel(s)}</option>)}
              </select>
            )}
          </div>
        )}
      </Modal>

      {/* ── Delete modal ── */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar horario" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button variant="danger" loading={deleteMutation.isPending} onClick={handleDelete} icon={<Trash2 size={14} />}>Eliminar</Button></>}>
        {deleteTarget && (
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            ¿Confirmas eliminar el horario del <strong>{DAY_LABEL[deleteTarget.dayOfWeek]}</strong>{' '}
            <strong>{deleteTarget.startTime}–{deleteTarget.endTime}</strong>? Esta acción no se puede deshacer.
          </p>
        )}
      </Modal>

      {/* ── Assign students modal ── */}
      <Modal
        open={!!assignTarget}
        onClose={() => { setAssignTarget(null); setAssignSearch(''); }}
        title={assignTarget ? `Alumnos — ${DAY_LABEL[assignTarget.dayOfWeek]} ${assignTarget.startTime}–${assignTarget.endTime}` : ''}
        size="md"
        footer={<Button variant="secondary" onClick={() => setAssignTarget(null)}>Cerrar</Button>}
      >
        {assignTarget && (() => {
          const enrolled     = assignTarget.slots.map(s => s.student.id);
          const available    = assignTarget.slots.length < assignTarget.capacity;
          const canAdd = (myStudents ?? []).filter(s =>
            !enrolled.includes(s.id) &&
            !s.scheduleSlots?.some(ss => ss.isActive)
          );

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Enrolled students */}
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  Inscritos en este horario ({enrolled.length}/{assignTarget.capacity})
                </p>
                {enrolled.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ningún alumno asignado aún</p>
                )}
                {assignTarget.slots.map(slot => (
                  <div key={slot.student.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', marginBottom: 6 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, fontWeight: 500 }}>{slot.student.name}</span>
                    <button
                      onClick={async () => {
                        await removeMutation.mutateAsync({ studentId: slot.student.id });
                        toast.success(`${slot.student.name} removido del horario`);
                      }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 4, borderRadius: 4, display: 'flex', fontSize: 12 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add students */}
              {available && canAdd.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Alumnos sin horario asignado ({canAdd.length})
                  </p>
                  <input
                    type="text"
                    placeholder="Buscar alumno..."
                    value={assignSearch}
                    onChange={e => setAssignSearch(e.target.value)}
                    style={{ width: '100%', height: 36, padding: '0 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none', marginBottom: 8 }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                    {canAdd.filter(s => !assignSearch || s.name.toLowerCase().includes(assignSearch.toLowerCase())).map(s => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{s.name}</span>
                        <Button
                          size="sm"
                          loading={assignMutation.isPending}
                          onClick={async () => {
                            await assignMutation.mutateAsync({ studentId: s.id, scheduleId: assignTarget.id });
                            toast.success(`${s.name} asignado al horario`);
                          }}
                          icon={<Plus size={12} />}
                        >
                          Agregar
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!available && (
                <div style={{ padding: '10px 14px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--danger)' }}>
                  ⚠️ Este horario está lleno ({assignTarget.slots.length}/{assignTarget.capacity} alumnos)
                </div>
              )}

              {available && canAdd.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Todos tus alumnos ya tienen horario asignado.
                </p>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
