import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit2, Save, X, UserCheck, UserX, DollarSign, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { Button, Badge, Card, SectionHeader, Input, Select } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { formatCurrency, formatDate, STATUS_LABEL, STATUS_BADGE, MODALITY_LABEL, DAY_LABEL } from '../../utils/labels';

// ─── Types ────────────────────────────────────
interface Student {
  id: string;
  name: string;
  phone: string;
  modality: string;
  status: string;
  conversationState: string;
  tutorName?: string;
  notes?: string;
  paymentDay?: number;
  enrolledAt?: string;
  createdAt: string;
  teacher?: { id: string; user: { name: string } };
  payments: { id: string; type: string; amount: string; period: string; notes?: string; confirmedAt: string; createdAt: string }[];
  scheduleSlots: { id: string; schedule: { dayOfWeek: number; startTime: string; endTime: string; modality: { name: string } } }[];
}

interface Teacher { id: string; displayName: string; user: { name: string } }

// ─── Hooks ────────────────────────────────────
function useStudent(id: string) {
  return useQuery({
    queryKey: ['student', id],
    queryFn: async () => {
      const { data } = await api.get(`/students/${id}`);
      return data.data as Student;
    },
  });
}

function useTeachers() {
  return useQuery({
    queryKey: ['teachers'],
    queryFn: async () => {
      const { data } = await api.get('/teachers');
      return data.data as Teacher[];
    },
  });
}

function useUpdateStudent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: object) => {
      const { data } = await api.patch(`/students/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student', id] });
      qc.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

function useRegisterPayment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: object) => {
      const { data } = await api.post('/payments/monthly', { studentId: id, ...payload });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', id] }),
  });
}

// ─── Constants ────────────────────────────────
const MODALITY_OPTIONS = [
  { value: 'BABY_PHASE1',   label: 'Natación Bebés Fase 1 (4-12 meses)' },
  { value: 'BABY_PHASE2',   label: 'Natación Bebés Fase 2 (1-3 años)'   },
  { value: 'BABY_PHASE3',   label: 'Natación Bebés Fase 3 (3-5 años)'   },
  { value: 'GROUP_CHILD',   label: 'Natación Grupal Infantil'            },
  { value: 'GROUP_ADULT',   label: 'Natación Adultos Grupal'             },
  { value: 'FREE_ACCESS',   label: 'Acceso Libre'                        },
  { value: 'AQUA_THERAPY',  label: 'Terapia Acuática'                    },
  { value: 'PERSONAL_CHILD','label': 'Personalizado Infantil'            },
];

const STATUS_OPTIONS = [
  { value: 'ACTIVE',      label: 'Activo'      },
  { value: 'DELINQUENT',  label: 'Moroso'      },
  { value: 'SUSPENDED',   label: 'Suspendido'  },
  { value: 'INACTIVE',    label: 'Inactivo'    },
];

const PAYMENT_TYPE_OPTIONS = [
  { value: 'MONTHLY',    label: 'Mensualidad'   },
  { value: 'ENROLLMENT', label: 'Inscripción'   },
];

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// ─── Page ─────────────────────────────────────
export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: student, isLoading } = useStudent(id!);
  const { data: teachers } = useTeachers();
  const updateMutation = useUpdateStudent(id!);
  const paymentMutation = useRegisterPayment(id!);

  const [editing, setEditing]       = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  // Edit form state
  const [form, setForm] = useState({
    name: '', phone: '', modality: '', teacherId: '',
    tutorName: '', notes: '', status: '', paymentDay: '',
  });

  const [payForm, setPayForm] = useState({
    type: 'MONTHLY', period: CURRENT_MONTH, amount: '', notes: '',
  });

  const errMsg = (err: unknown) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

  const startEdit = () => {
    if (!student) return;
    setForm({
      name:      student.name,
      phone:     student.phone,
      modality:  student.modality,
      teacherId: student.teacher?.id ?? '',
      tutorName: student.tutorName ?? '',
      notes:     student.notes ?? '',
      status:    student.status,
      paymentDay: student.paymentDay ? String(student.paymentDay) : '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return; }
    try {
      await updateMutation.mutateAsync({
        name:      form.name.trim(),
        phone:     form.phone.trim(),
        modality:  form.modality,
        teacherId: form.teacherId || null,
        tutorName: form.tutorName.trim() || null,
        notes:     form.notes.trim() || null,
        paymentDay: form.paymentDay ? Number(form.paymentDay) : null,
        status:    form.status,
      });
      toast.success('Alumno actualizado');
      setEditing(false);
    } catch (err) { toast.error(errMsg(err) ?? 'Error al actualizar'); }
  };

  const handlePayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) { toast.error('Ingresa un monto válido'); return; }
    try {
      await paymentMutation.mutateAsync({
        type:   payForm.type,
        period: payForm.period,
        amount: Number(payForm.amount),
        notes:  payForm.notes || undefined,
      });
      toast.success('Pago registrado');
      setShowPayment(false);
      setPayForm({ type: 'MONTHLY', period: CURRENT_MONTH, amount: '', notes: '' });
    } catch (err) { toast.error(errMsg(err) ?? 'Error al registrar pago'); }
  };

  const fi = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }));

  if (isLoading) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Cargando...</div>;
  if (!student)  return <div style={{ padding: 24, color: 'var(--danger)' }}>Alumno no encontrado</div>;

  const schedule = student.scheduleSlots?.[0]?.schedule;

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate('/students')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4, borderRadius: 6 }}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>{student.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Badge variant={STATUS_BADGE[student.status] ?? 'default'} dot>
              {STATUS_LABEL[student.status] ?? student.status}
            </Badge>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {MODALITY_LABEL[student.modality] ?? student.modality}
            </span>
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

        {/* ── Left: info ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Personal data */}
          <Card>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Datos personales</h2>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Input label="Nombre completo *" value={form.name} onChange={fi('name')} />
                  <Input label="Teléfono" value={form.phone} onChange={fi('phone')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Select label="Modalidad" value={form.modality} options={MODALITY_OPTIONS} onChange={fi('modality')} />
                  <Select label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={fi('status')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Input label="Nombre del tutor/padre" value={form.tutorName} onChange={fi('tutorName')} placeholder="Para menores de edad" />
                  <Select
                    label="Maestro asignado"
                    value={form.teacherId}
                    options={[{ value: '', label: 'Sin asignar' }, ...(teachers ?? []).map(t => ({ value: t.id, label: t.user.name }))]}
                    onChange={fi('teacherId')}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Notas internas</label>
                  <textarea
                    rows={3} value={form.notes} onChange={fi('notes')}
                    placeholder="Observaciones del alumno, horario, detalles especiales..."
                    style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none', resize: 'vertical', lineHeight: 1.5 }}
                  />
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
                  ['Inscrito el', student.enrolledAt ? formatDate(student.enrolledAt) : formatDate(student.createdAt)],
                  ['Horario', schedule ? `${DAY_LABEL[schedule.dayOfWeek]} ${schedule.startTime}–${schedule.endTime}` : '—'],
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

          {/* Payments history */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Historial de pagos</h2>
              <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setShowPayment(true)}>Registrar</Button>
            </div>
            {student.payments.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sin pagos registrados</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '100px 80px 90px 1fr', gap: 12, padding: '6px 10px', background: 'var(--bg)', borderRadius: 'var(--radius-md)' }}>
                  {['Período','Tipo','Monto','Notas'].map(h => (
                    <p key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</p>
                  ))}
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

        {/* ── Right: quick stats ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 16 }}>Resumen</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Total pagado', value: formatCurrency(student.payments.reduce((s, p) => s + Number(p.amount), 0)), color: 'var(--success)' },
                { label: 'Pagos registrados', value: String(student.payments.length), color: 'var(--text-primary)' },
                { label: 'Último pago', value: student.payments[0] ? formatDate(student.payments[0].createdAt) : 'Sin pagos', color: 'var(--text-secondary)' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{s.label}</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick status change */}
          <Card>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Acciones rápidas</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {student.status !== 'ACTIVE' && (
                <Button variant="secondary" size="sm" icon={<UserCheck size={14} />}
                  loading={updateMutation.isPending}
                  onClick={() => updateMutation.mutateAsync({ status: 'ACTIVE' }).then(() => toast.success('Alumno activado')).catch(() => toast.error('Error'))}>
                  Marcar como activo
                </Button>
              )}
              {student.status !== 'SUSPENDED' && (
                <Button variant="secondary" size="sm" icon={<UserX size={14} />}
                  loading={updateMutation.isPending}
                  onClick={() => updateMutation.mutateAsync({ status: 'SUSPENDED' }).then(() => toast.success('Alumno suspendido')).catch(() => toast.error('Error'))}>
                  Suspender
                </Button>
              )}
              {student.status !== 'DELINQUENT' && (
                <Button variant="secondary" size="sm"
                  loading={updateMutation.isPending}
                  onClick={() => updateMutation.mutateAsync({ status: 'DELINQUENT' }).then(() => toast.success('Marcado como moroso')).catch(() => toast.error('Error'))}>
                  Marcar como moroso
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Payment modal ── */}
      <Modal open={showPayment} onClose={() => setShowPayment(false)} title="Registrar pago" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setShowPayment(false)}>Cancelar</Button>
          <Button loading={paymentMutation.isPending} onClick={handlePayment} icon={<DollarSign size={14} />}>Registrar</Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Select label="Tipo de pago" value={payForm.type} options={PAYMENT_TYPE_OPTIONS}
            onChange={e => setPayForm(f => ({ ...f, type: e.target.value }))} />
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
            <input type="text" value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Ej: Pagó en efectivo el día 5"
              style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
