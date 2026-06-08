import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit2, Save, X, UserCheck, UserX, DollarSign, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { Button, Badge, Card, SectionHeader, Input, Select } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { formatCurrency, formatDate, STATUS_LABEL, STATUS_BADGE, MODALITY_LABEL, DAY_LABEL } from '../../utils/labels';

interface Student {
  id: string; name: string; phone: string; modality: string; status: string;
  conversationState: string; tutorName?: string; notes?: string; paymentDay?: number;
  enrolledAt?: string; createdAt: string;
  teacher?: { id: string; user: { name: string } };
  payments: { id: string; type: string; amount: string; period: string; notes?: string; confirmedAt?: string; createdAt?: string }[];
  scheduleSlots: { id: string; schedule: { dayOfWeek: number; startTime: string; endTime: string; modality?: { name: string } } }[];
}
interface Teacher { id: string; user: { name: string } }
interface Schedule { id: string; dayOfWeek: number; startTime: string; endTime: string; capacity: number; slots: { id: string }[]; modalities?: { modality: { name: string } }[]; modality?: { name: string } }
interface Modality { id: string; name: string; modality: string; isActive: boolean }

function useStudent(id: string) {
  return useQuery({ queryKey: ['student', id], queryFn: async () => (await api.get(`/students/${id}`)).data.data as Student, enabled: Boolean(id) });
}
function useTeachers() {
  return useQuery({ queryKey: ['teachers'], queryFn: async () => (await api.get('/teachers')).data.data as Teacher[] });
}
function useSchedules() {
  return useQuery({ queryKey: ['schedules'], queryFn: async () => (await api.get('/schedules')).data.data as Schedule[] });
}
function useModalities() {
  return useQuery({
    queryKey: ['modalities-all'],
    queryFn: async () => {
      const res = await api.get('/modalities?all=true');
      const d = res.data.data;
      // API may return array directly or { modalities: [], services: [] }
      if (Array.isArray(d)) return d as Modality[];
      // Flatten modalities + services into one list
      // Services don't have a 'modality' enum field — use their name as the key
      const mods = Array.isArray(d?.modalities) ? d.modalities : [];
      const svcs = Array.isArray(d?.services)
        ? d.services.map((s: { id: string; name: string; isActive: boolean }) => ({
            id: s.id, name: s.name, modality: `SVC_${s.id}`, isActive: s.isActive,
          }))
        : [];
      return [...mods, ...svcs] as Modality[];
    },
  });
}
function useUpdateStudent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: object) => (await api.patch(`/students/${id}`, p)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['student', id] }); qc.invalidateQueries({ queryKey: ['students'] }); },
  });
}
function useAssignSchedule(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ scheduleId }: { scheduleId: string | null }) => (await api.post(`/students/${id}/assign-schedule`, { scheduleId })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['student', id] }); qc.invalidateQueries({ queryKey: ['schedules'] }); },
  });
}
function useRegisterPayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: object) => (await api.post('/payments/monthly', { studentId: id, ...p })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', id] }),
  });
}

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Activo' }, { value: 'DELINQUENT', label: 'Moroso' },
  { value: 'SUSPENDED', label: 'Suspendido' }, { value: 'INACTIVE', label: 'Inactivo' },
];
const PAYMENT_TYPE_OPTIONS = [{ value: 'MONTHLY', label: 'Mensualidad' }, { value: 'ENROLLMENT', label: 'Inscripción' }];
const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: student, isLoading } = useStudent(id!);
  const { data: teachers } = useTeachers();
  const { data: schedules } = useSchedules();
  const { data: modalities } = useModalities();
  const updateMutation  = useUpdateStudent(id!);
  const assignMutation  = useAssignSchedule(id!);
  const paymentMutation = useRegisterPayment(id!);

  const [editing, setEditing]         = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', modality: '', teacherId: '', tutorName: '', notes: '', status: '', paymentDay: '', scheduleId: '' });
  const [payForm, setPayForm] = useState({ type: 'MONTHLY', period: CURRENT_MONTH, amount: '', notes: '' });

  const errMsg = (err: unknown) => (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  const fi = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const startEdit = () => {
    if (!student) return;
    setForm({
      name:       student.name,
      phone:      student.phone,
      modality:   student.modality,
      teacherId:  student.teacher?.id ?? '',
      tutorName:  student.tutorName ?? '',
      notes:      student.notes ?? '',
      status:     student.status,
      paymentDay: student.paymentDay ? String(student.paymentDay) : '',
      scheduleId: student.scheduleSlots?.[0] ? 'assigned' : '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return; }
    try {
      // Don't send modality if it's a custom service (SVC_xxx) — backend enum doesn't support it
      const modalityPayload = form.modality.startsWith('SVC_') ? {} : { modality: form.modality };
      await updateMutation.mutateAsync({
        name: form.name.trim(), phone: form.phone.trim(), ...modalityPayload,
        teacherId: form.teacherId || null, tutorName: form.tutorName.trim() || null,
        notes: form.notes.trim() || null, status: form.status,
        paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
      });
      toast.success('Alumno actualizado');
      setEditing(false);
    } catch (err) { toast.error(errMsg(err) ?? 'Error al actualizar'); }
  };

  const handlePayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast.error('Ingresa un monto válido'); return; }
    try {
      await paymentMutation.mutateAsync({ type: payForm.type, period: payForm.period, amount: Number(payForm.amount), notes: payForm.notes || undefined });
      toast.success('Pago registrado');
      setShowPayment(false);
      setPayForm({ type: 'MONTHLY', period: CURRENT_MONTH, amount: '', notes: '' });
    } catch (err) { toast.error(errMsg(err) ?? 'Error al registrar pago'); }
  };

  if (isLoading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Cargando...</div>;
  if (!student)  return <div style={{ padding: 24, color: 'var(--danger)' }}>Alumno no encontrado</div>;

  const currentSlot = student.scheduleSlots?.[0];

  // All schedules with available capacity
  const availableSchedules = (schedules ?? []).filter(s => s.slots.length < s.capacity);

  return (
    <div className="animate-fadeIn">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/students')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 6 }}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>{student.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Badge variant={STATUS_BADGE[student.status] ?? 'default'} dot>{STATUS_LABEL[student.status] ?? student.status}</Badge>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{MODALITY_LABEL[student.modality] ?? student.modality}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? (
            <>
              <Button variant="secondary" size="sm" icon={<X size={14} />} onClick={() => setEditing(false)}>Cancelar</Button>
              <Button size="sm" icon={<Save size={14} />} loading={updateMutation.isPending} onClick={handleSave}>Guardar</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" icon={<DollarSign size={14} />} onClick={() => setShowPayment(true)}>Registrar pago</Button>
              <Button size="sm" icon={<Edit2 size={14} />} onClick={startEdit}>Editar</Button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Datos personales</h2>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Input label="Nombre completo *" value={form.name} onChange={fi('name')} />
                  <Input label="Teléfono" value={form.phone} onChange={fi('phone')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {/* Dynamic modality selector — reads ALL modalities from API */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Modalidad</label>
                    <select value={form.modality} onChange={fi('modality')}
                      style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}>
                      {(modalities ?? []).map(m => (
                        <option key={m.modality} value={m.modality}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <Select label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={fi('status')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Input label="Nombre del tutor/padre" value={form.tutorName} onChange={fi('tutorName')} placeholder="Para menores de edad" />
                  <Select label="Maestro asignado" value={form.teacherId}
                    options={[{ value: '', label: 'Sin asignar' }, ...(teachers ?? []).map(t => ({ value: t.id, label: t.user.name }))]}
                    onChange={fi('teacherId')} />
                </div>
                {/* Schedule selector */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Horario asignado</label>
                  <select value={form.scheduleId} onChange={async e => {
                      const val = e.target.value;
                      setForm(f => ({ ...f, scheduleId: val }));
                      if (val === 'assigned') return;
                      try {
                        await assignMutation.mutateAsync({ scheduleId: val || null });
                        toast.success(val ? 'Horario asignado' : 'Horario removido');
                      } catch (err) { toast.error(errMsg(err) ?? 'Error al asignar horario'); }
                    }}
                    style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}>
                    {currentSlot && <option value="assigned">{DAY_LABEL[currentSlot.schedule.dayOfWeek]} {currentSlot.schedule.startTime}–{currentSlot.schedule.endTime} (actual)</option>}
                    <option value="">Sin horario asignado</option>
                    {availableSchedules.map(s => {
                      const mod = s.modalities?.[0]?.modality?.name ?? s.modality?.name ?? '';
                      return <option key={s.id} value={s.id}>{DAY_LABEL[s.dayOfWeek]} {s.startTime}–{s.endTime}{mod ? ` · ${mod}` : ''} ({s.slots.length}/{s.capacity})</option>;
                    })}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Día de pago <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(1-28)</span></label>
                    <input type="number" min={1} max={28} placeholder="Ej: 15" value={form.paymentDay} onChange={e => setForm(f => ({ ...f, paymentDay: e.target.value }))}
                      style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Día del mes en que realiza su pago</p>
                  </div>
                  {form.paymentDay && (
                    <div style={{ display: 'flex', alignItems: 'center', paddingTop: 22 }}>
                      <div style={{ padding: '8px 12px', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--success)' }}>
                        ✓ Recordatorio ±5 días del día {form.paymentDay}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Notas internas</label>
                  <textarea rows={3} value={form.notes} onChange={fi('notes')} placeholder="Observaciones del alumno, horario, detalles especiales..."
                    style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none', resize: 'vertical', lineHeight: 1.5 }} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  ['Nombre', student.name],
                  ['Teléfono', student.phone],
                  ['Modalidad', MODALITY_LABEL[student.modality] ?? student.modality],
                  ['Estado', STATUS_LABEL[student.status] ?? student.status],
                  ['Tutor / Padre', student.tutorName || '—'],
                  ['Maestro', student.teacher?.user.name || '—'],
                  ['Día de pago', student.paymentDay ? `Día ${student.paymentDay} de cada mes` : 'No definido'],
                  ['Horario', currentSlot ? `${DAY_LABEL[currentSlot.schedule.dayOfWeek]} ${currentSlot.schedule.startTime}–${currentSlot.schedule.endTime}` : '—'],
                  ['Inscrito el', student.enrolledAt ? formatDate(student.enrolledAt) : formatDate(student.createdAt)],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</p>
                    <p style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{value}</p>
                  </div>
                ))}
                {student.notes && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Notas</p>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{student.notes}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Historial de pagos</h2>
              <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setShowPayment(true)}>Registrar</Button>
            </div>
            {student.payments.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sin pagos registrados</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 90px 1fr', gap: 12, padding: '6px 10px', background: 'var(--bg)', borderRadius: 'var(--radius-md)' }}>
                  {['Período','Tipo','Monto','Notas'].map(h => <p key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</p>)}
                </div>
                {student.payments.map(p => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '100px 80px 90px 1fr', gap: 12, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 13, color: 'var(--text-primary)' }}>{p.period}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.type === 'MONTHLY' ? 'Mensual' : 'Inscripción'}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>{formatCurrency(p.amount)}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes || '—'}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Resumen</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Total pagado', value: formatCurrency(student.payments.reduce((s, p) => s + Number(p.amount), 0)), color: 'var(--success)' },
                { label: 'Pagos registrados', value: String(student.payments.length), color: 'var(--text-primary)' },
                { label: 'Último pago', value: student.payments[0] ? formatDate(student.payments[0].confirmedAt ?? student.payments[0].createdAt ?? '') : 'Sin pagos', color: 'var(--text-secondary)' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.label}</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Acciones rápidas</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {student.status !== 'ACTIVE' && (
                <Button variant="secondary" size="sm" icon={<UserCheck size={14} />} loading={updateMutation.isPending}
                  onClick={() => updateMutation.mutateAsync({ status: 'ACTIVE' }).then(() => toast.success('Alumno activado')).catch(() => toast.error('Error'))}>
                  Marcar como activo
                </Button>
              )}
              {student.status !== 'SUSPENDED' && (
                <Button variant="secondary" size="sm" icon={<UserX size={14} />} loading={updateMutation.isPending}
                  onClick={() => updateMutation.mutateAsync({ status: 'SUSPENDED' }).then(() => toast.success('Alumno suspendido')).catch(() => toast.error('Error'))}>
                  Suspender
                </Button>
              )}
              {student.status !== 'DELINQUENT' && (
                <Button variant="secondary" size="sm" loading={updateMutation.isPending}
                  onClick={() => updateMutation.mutateAsync({ status: 'DELINQUENT' }).then(() => toast.success('Marcado como moroso')).catch(() => toast.error('Error'))}>
                  Marcar como moroso
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="Registrar pago" size="sm"
        footer={<><Button variant="secondary" onClick={() => setShowPayment(false)}>Cancelar</Button>
          <Button loading={paymentMutation.isPending} onClick={handlePayment} icon={<DollarSign size={14} />}>Registrar</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="Tipo de pago" value={payForm.type} options={PAYMENT_TYPE_OPTIONS} onChange={e => setPayForm(f => ({ ...f, type: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Período</label>
              <input type="month" value={payForm.period} onChange={e => setPayForm(f => ({ ...f, period: e.target.value }))}
                style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
            </div>
            <Input label="Monto (MXN)" type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="800" />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Notas</label>
            <input type="text" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} placeholder="Ej: Pagó en efectivo el día 5"
              style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
