import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Users, Clock, CheckCircle, Link, Link2Off } from 'lucide-react';
import { api } from '../../services/api';
import { SectionHeader, Card, Button, Badge, Select, Empty } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { MODALITY_LABEL, DAY_LABEL, occupancyColor } from '../../utils/labels';

interface TeacherSchedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  isActive: boolean;
  pairedWithId: string | null;
  modality: { name: string; modality: string; maxCapacity: number };
  slots: { student: { id: string; name: string; status: string } }[];
}

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
    mutationFn: async (payload: object) => { const { data } = await api.post('/teachers/my-schedules', payload); return data; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-schedules'] }),
  });
}

function useUpdateCapacity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, capacity }: { id: string; capacity: number }) => { const { data } = await api.patch(`/teachers/my-schedules/${id}`, { capacity }); return data; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-schedules'] }),
  });
}

function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await api.delete(`/teachers/my-schedules/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-schedules'] }),
  });
}

function usePairSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pairedWithId }: { id: string; pairedWithId: string | null }) => {
      const { data } = await api.patch(`/teachers/my-schedules/${id}/pair`, { pairedWithId });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-schedules'] }),
  });
}

const MODALITY_OPTIONS = [
  { value: '', label: 'Selecciona una modalidad...' },
  { value: 'BABY_PHASE1',   label: 'Natación Bebés Fase 1 (4-12 meses)' },
  { value: 'BABY_PHASE2',   label: 'Natación Bebés Fase 2 (1-3 años)' },
  { value: 'BABY_PHASE3',   label: 'Natación Bebés Fase 3 (3-5 años)' },
  { value: 'GROUP_CHILD',   label: 'Natación Grupal Infantil' },
  { value: 'GROUP_ADULT',   label: 'Natación Adultos Grupal' },
  { value: 'FREE_ACCESS',   label: 'Acceso Libre' },
  { value: 'AQUA_THERAPY',  label: 'Terapia Acuática' },
];

const DAY_OPTIONS = DAY_LABEL.map((d, i) => ({ value: String(i), label: d }));

const TIME_OPTIONS = Array.from({ length: 36 }, (_, i) => {
  const hour = Math.floor(i / 2) + 6;
  const min  = i % 2 === 0 ? '00' : '30';
  const label = `${String(hour).padStart(2, '0')}:${min}`;
  return { value: label, label };
});

export default function MySchedulesPage() {
  const { data: schedules, isLoading } = useMySchedules();
  const createMutation   = useCreateSchedule();
  const updateMutation   = useUpdateCapacity();
  const deleteMutation   = useDeleteSchedule();
  const pairMutation     = usePairSchedule();

  const [showCreate,   setShowCreate]   = useState(false);
  const [editSchedule, setEditSchedule] = useState<TeacherSchedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeacherSchedule | null>(null);
  const [pairTarget,   setPairTarget]   = useState<TeacherSchedule | null>(null);
  const [editCapacity, setEditCapacity] = useState('');
  const [selectedPairId, setSelectedPairId] = useState('');

  const [form, setForm] = useState({
    dayOfWeek: '1', startTime: '09:00', endTime: '10:00', modality: '', capacity: '8',
    pairedWithId: '',  // optional pair selected at creation
  });

  const errMsg = (err: unknown) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

  const handleCreate = async () => {
    if (!form.modality) { toast.error('Selecciona una modalidad'); return; }
    if (form.startTime >= form.endTime) { toast.error('La hora de inicio debe ser antes de la hora fin'); return; }
    try {
      const res = await createMutation.mutateAsync({
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime:   form.endTime,
        modality:  form.modality,
        capacity:  Number(form.capacity),
      });

      // If a pair was selected, set it after creation
      if (form.pairedWithId && res.data?.id) {
        await pairMutation.mutateAsync({ id: res.data.id, pairedWithId: form.pairedWithId });
      }

      toast.success('Horario creado correctamente');
      setShowCreate(false);
      setForm({ dayOfWeek: '1', startTime: '09:00', endTime: '10:00', modality: '', capacity: '8', pairedWithId: '' });
    } catch (err) { toast.error(errMsg(err) ?? 'Error al crear horario'); }
  };

  const handleUpdateCapacity = async () => {
    if (!editSchedule) return;
    const cap = Number(editCapacity);
    if (!cap || cap < 1) { toast.error('Ingresa un cupo válido'); return; }
    try {
      await updateMutation.mutateAsync({ id: editSchedule.id, capacity: cap });
      toast.success('Cupo actualizado');
      setEditSchedule(null);
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

  const handleUnpair = async (s: TeacherSchedule) => {
    try {
      await pairMutation.mutateAsync({ id: s.id, pairedWithId: null });
      toast.success('Vínculo eliminado');
    } catch (err) { toast.error(errMsg(err) ?? 'Error'); }
  };

  const scheduleLabel = (s: TeacherSchedule) => `${DAY_LABEL[s.dayOfWeek]} ${s.startTime}–${s.endTime}`;
  const getPaired = (id: string) => schedules?.find(s => s.id === id);

  // Schedules available to pair with (same time, different day, same modality, not already paired)
  const pairOptions = (target: TeacherSchedule) => schedules?.filter(s =>
    s.id !== target.id &&
    s.startTime === target.startTime &&
    s.endTime === target.endTime &&
    s.modality.modality === target.modality.modality &&
    (!s.pairedWithId || s.pairedWithId === target.id)
  ) ?? [];

  // Schedules available to pair at creation (same time)
  const pairOptionsForCreate = () => schedules?.filter(s =>
    s.startTime === form.startTime &&
    s.endTime === form.endTime &&
    !s.pairedWithId
  ) ?? [];

  const byDay: Record<number, TeacherSchedule[]> = {};
  schedules?.forEach(s => { if (!byDay[s.dayOfWeek]) byDay[s.dayOfWeek] = []; byDay[s.dayOfWeek].push(s); });

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Mis horarios"
        subtitle="Gestiona tus horarios y vínculos de par (ej: Lunes↔Miércoles)"
        actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Nuevo horario</Button>}
      />

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 12 }} />)}
        </div>
      )}

      {!isLoading && (!schedules || schedules.length === 0) && (
        <Empty icon={<Clock size={40} color="var(--text-muted)" />} title="Sin horarios registrados"
          description="Agrega tus horarios disponibles para que los alumnos puedan inscribirse."
          action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Agregar primer horario</Button>} />
      )}

      {Object.entries(byDay).sort(([a],[b]) => Number(a)-Number(b)).map(([day, slots]) => (
        <div key={day} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            {DAY_LABEL[Number(day)]}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {slots.map(s => {
              const enrolled = s.slots.length;
              const pct      = Math.round((enrolled / s.capacity) * 100);
              const paired   = s.pairedWithId ? getPaired(s.pairedWithId) : null;

              return (
                <Card key={s.id} style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                        {s.startTime} – {s.endTime}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {MODALITY_LABEL[s.modality.modality] ?? s.modality.name}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => { setEditSchedule(s); setEditCapacity(String(s.capacity)); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex' }} title="Editar cupo">
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => { setPairTarget(s); setSelectedPairId(s.pairedWithId ?? ''); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.pairedWithId ? 'var(--primary)' : 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex' }}
                        title={s.pairedWithId ? 'Editar par' : 'Vincular par'}
                      >
                        <Link size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (enrolled > 0) { toast.error(`No puedes eliminar este horario — tiene ${enrolled} alumno(s)`); return; }
                          setDeleteTarget(s);
                        }}
                        style={{ background: 'none', border: 'none', cursor: enrolled > 0 ? 'not-allowed' : 'pointer',
                          color: enrolled > 0 ? 'var(--border-strong)' : 'var(--danger)',
                          padding: 6, borderRadius: 6, display: 'flex', opacity: enrolled > 0 ? 0.4 : 1 }}
                        title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Paired schedule indicator */}
                  {paired && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                      padding: '5px 10px', background: 'var(--primary-light)', borderRadius: 'var(--radius-md)' }}>
                      <Link size={12} color="var(--primary)" />
                      <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500 }}>
                        Par: {scheduleLabel(paired)}
                      </span>
                      <button onClick={() => handleUnpair(s)}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', padding: 2 }}
                        title="Quitar vínculo">
                        <Link2Off size={11} />
                      </button>
                    </div>
                  )}

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

                  {enrolled > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                      {s.slots.map(slot => (
                        <div key={slot.student.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
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

      {/* ── Create modal ── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nuevo horario" size="md"
        footer={<><Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
          <Button loading={createMutation.isPending} onClick={handleCreate} icon={<Plus size={14} />}>Crear horario</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="Modalidad *" options={MODALITY_OPTIONS} value={form.modality}
            onChange={e => setForm(f => ({ ...f, modality: e.target.value, pairedWithId: '' }))} />
          <Select label="Día de la semana *" options={DAY_OPTIONS} value={form.dayOfWeek}
            onChange={e => setForm(f => ({ ...f, dayOfWeek: e.target.value, pairedWithId: '' }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Hora inicio *" options={TIME_OPTIONS} value={form.startTime}
              onChange={e => setForm(f => ({ ...f, startTime: e.target.value, pairedWithId: '' }))} />
            <Select label="Hora fin *" options={TIME_OPTIONS} value={form.endTime}
              onChange={e => setForm(f => ({ ...f, endTime: e.target.value, pairedWithId: '' }))} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Cupo máximo *</label>
            <input type="number" min={1} max={50} value={form.capacity}
              onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
              style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
          </div>

          {/* Pair selector — only shows if compatible schedules exist */}
          {pairOptionsForCreate().length > 0 && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                Vincular como par con <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>
              </label>
              <select value={form.pairedWithId} onChange={e => setForm(f => ({ ...f, pairedWithId: e.target.value }))}
                style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}>
                <option value="">Sin par (clase individual por día)</option>
                {pairOptionsForCreate().map(s => (
                  <option key={s.id} value={s.id}>{scheduleLabel(s)}</option>
                ))}
              </select>
              {form.pairedWithId && (
                <p style={{ fontSize: 12, color: 'var(--primary)', marginTop: 4 }}>
                  ✓ El alumno que elija este horario quedará inscrito en ambos días automáticamente.
                </p>
              )}
            </div>
          )}

          <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info)' }}>
            💡 Puedes vincular pares de horarios después desde cada card usando el ícono <strong>🔗</strong>.
          </div>
        </div>
      </Modal>

      {/* ── Edit capacity modal ── */}
      <Modal open={!!editSchedule} onClose={() => setEditSchedule(null)} title="Editar cupo" size="sm"
        footer={<><Button variant="secondary" onClick={() => setEditSchedule(null)}>Cancelar</Button>
          <Button loading={updateMutation.isPending} onClick={handleUpdateCapacity}>Guardar</Button></>}>
        {editSchedule && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {scheduleLabel(editSchedule)} · {editSchedule.slots.length} inscritos
            </p>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Nuevo cupo máximo</label>
              <input type="number" min={editSchedule.slots.length || 1} max={editSchedule.modality.maxCapacity}
                value={editCapacity} onChange={e => setEditCapacity(e.target.value)}
                style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
            </div>
          </div>
        )}
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
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                Vincular con
              </label>
              {pairOptions(pairTarget).length === 0 ? (
                <div style={{ padding: '10px 14px', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--warning)' }}>
                  No hay horarios compatibles (mismo horario, misma modalidad, diferente día) para vincular.
                </div>
              ) : (
                <select value={selectedPairId} onChange={e => setSelectedPairId(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}>
                  <option value="">Sin par (sin vínculo)</option>
                  {pairOptions(pairTarget).map(s => (
                    <option key={s.id} value={s.id}>{scheduleLabel(s)}</option>
                  ))}
                </select>
              )}
            </div>
            {selectedPairId && (
              <div style={{ padding: '10px 14px', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--success)' }}>
                ✓ Cuando un alumno elija <strong>{scheduleLabel(pairTarget)}</strong>, también quedará inscrito automáticamente en <strong>{scheduleLabel(getPaired(selectedPairId)!)}</strong>.
              </div>
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
    </div>
  );
}
