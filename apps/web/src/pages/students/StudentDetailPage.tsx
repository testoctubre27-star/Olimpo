import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, Calendar, CreditCard, CheckCircle,
  UserX, AlertTriangle, Clock, FileText, User,
} from 'lucide-react';
import {
  useStudent, useStudentPayments, useActivateStudent,
  useSuspendStudent, useRegisterEnrollment, useRegisterMonthly,
  useSchedules, useTeachers,
} from '../../hooks/useApi';
import {
  Button, Badge, Card, PageSpinner, SectionHeader, Select
} from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import {
  STATUS_LABEL, STATUS_BADGE, MODALITY_LABEL, PAYMENT_TYPE_LABEL,
  formatCurrency, formatDate, formatPhone, DAY_LABEL, currentPeriod,
} from '../../utils/labels';

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: student, isLoading } = useStudent(id!);
  const { data: payments } = useStudentPayments(id!);
  const { data: schedules } = useSchedules();
  const { data: teachers } = useTeachers();

  const activateMutation    = useActivateStudent();
  const suspendMutation     = useSuspendStudent();
  const enrollmentMutation  = useRegisterEnrollment();
  const monthlyMutation     = useRegisterMonthly();

  // Modal states
  const [showActivate, setShowActivate]  = useState(false);
  const [showSuspend, setShowSuspend]    = useState(false);
  const [showPayment, setShowPayment]    = useState(false);

  // Activate form state
  const [selectedSchedule, setSelectedSchedule] = useState('');
  const [selectedTeacher, setSelectedTeacher]   = useState('');

  // Payment form state
  const [paymentPeriod, setPaymentPeriod] = useState(currentPeriod());
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes]   = useState('');

  if (isLoading) return <PageSpinner />;
  if (!student) return <div style={{ color: 'var(--danger)' }}>Alumno no encontrado</div>;

  const hasEnrollment = payments?.some(p => p.type === 'ENROLLMENT' && p.status === 'CONFIRMED');
  const isActive = student.status === 'ACTIVE';
  const canActivate = ['PENDING_PAYMENT', 'DELINQUENT', 'SUSPENDED'].includes(student.status);

  const scheduleOptions = [
    { value: '', label: 'Seleccionar horario...' },
    ...(schedules?.map(s => ({
      value: s.id,
      label: `${DAY_LABEL[s.dayOfWeek]} ${s.startTime} — ${s.modality.name} (${s.slots.length}/${s.modality.maxCapacity})`,
    })) ?? []),
  ];

  const teacherOptions = [
    { value: '', label: 'Sin maestro asignado' },
    ...(teachers?.map(t => ({ value: t.id, label: t.user.name })) ?? []),
  ];

  const handleActivate = async () => {
    if (!selectedSchedule) { toast.error('Selecciona un horario'); return; }
    try {
      await activateMutation.mutateAsync({ id: id!, scheduleId: selectedSchedule, teacherId: selectedTeacher || undefined });
      toast.success('Alumno activado correctamente');
      setShowActivate(false);
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al activar');
    }
  };

  const handleSuspend = async () => {
    try {
      await suspendMutation.mutateAsync(id!);
      toast.success('Alumno suspendido. Se liberó su lugar.');
      setShowSuspend(false);
    } catch {
      toast.error('Error al suspender al alumno');
    }
  };

  const handleRegisterEnrollment = async () => {
    try {
      await enrollmentMutation.mutateAsync(id!);
      toast.success('Inscripción anual registrada');
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error');
    }
  };

  const handlePayment = async () => {
    try {
      await monthlyMutation.mutateAsync({
        studentId: id!,
        period: paymentPeriod,
        amount: paymentAmount ? Number(paymentAmount) : undefined,
        notes: paymentNotes || undefined,
      });
      toast.success('Mensualidad registrada');
      setShowPayment(false);
      setPaymentAmount('');
      setPaymentNotes('');
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar pago');
    }
  };

  const slot = student.scheduleSlots?.[0];

  return (
    <div className="animate-fadeIn">
      {/* Back */}
      <button
        onClick={() => navigate('/students')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 20, fontFamily: 'var(--font-sans)' }}
      >
        <ArrowLeft size={14} />
        Volver a alumnos
      </button>

      <SectionHeader
        title={student.name}
        subtitle={`Registrado ${formatDate(student.createdAt)}`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {canActivate && (
              <Button size="sm" icon={<CheckCircle size={14} />} onClick={() => setShowActivate(true)}>
                Activar alumno
              </Button>
            )}
            {isActive && (
              <Button size="sm" variant="danger" icon={<UserX size={14} />} onClick={() => setShowSuspend(true)}>
                Suspender
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<CreditCard size={14} />} onClick={() => setShowPayment(true)}>
              Registrar pago
            </Button>
          </div>
        }
      />

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* Profile card */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={22} color="var(--primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{student.name}</h2>
              <Badge variant={STATUS_BADGE[student.status] ?? 'default'} dot>
                {STATUS_LABEL[student.status] ?? student.status}
              </Badge>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <InfoRow icon={<Phone size={14} />} label="Teléfono" value={formatPhone(student.phone)} />
            <InfoRow icon={<Calendar size={14} />} label="Modalidad" value={MODALITY_LABEL[student.modality] ?? student.modality} />
            {slot && (
              <InfoRow
                icon={<Clock size={14} />}
                label="Horario"
                value={`${DAY_LABEL[slot.schedule.dayOfWeek]} ${slot.schedule.startTime}`}
              />
            )}
            {student.teacher && (
              <InfoRow icon={<User size={14} />} label="Maestro" value={student.teacher.user.name} />
            )}
          </div>
        </Card>

        {/* Registration status card */}
        <Card>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>Estado de inscripción</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Annual enrollment */}
            <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: hasEnrollment ? 'var(--success-bg)' : 'var(--warning-bg)', border: `1px solid ${hasEnrollment ? 'var(--success)' : 'var(--warning)'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: hasEnrollment ? 'var(--success)' : 'var(--warning)' }}>
                    {hasEnrollment ? '✓ Inscripción anual pagada' : '⚠ Sin inscripción anual'}
                  </p>
                  {hasEnrollment && student.enrollmentExpiresAt && (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                      Vence: {formatDate(student.enrollmentExpiresAt)}
                    </p>
                  )}
                </div>
                {!hasEnrollment && (
                  <Button size="sm" variant="secondary" loading={enrollmentMutation.isPending} onClick={handleRegisterEnrollment}>
                    Registrar ($200)
                  </Button>
                )}
              </div>
            </div>

            {/* Regulation */}
            <InfoRow
              icon={<FileText size={14} />}
              label="Reglamento aceptado"
              value={student.regulationAcceptedAt ? formatDate(student.regulationAcceptedAt) : 'No aceptado'}
              valueColor={student.regulationAcceptedAt ? 'var(--success)' : 'var(--danger)'}
            />

            {/* Notes */}
            {student.notes && (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Notas</p>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{student.notes}</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Payments history */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Historial de pagos</h3>
          <Badge variant="default">{payments?.length ?? 0} registros</Badge>
        </div>

        {!payments || payments.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Sin pagos registrados</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 120px 1fr', gap: 12, padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)', marginBottom: 4 }}>
              {['Tipo', 'Período', 'Monto', 'Fecha', 'Notas'].map(h => (
                <p key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</p>
              ))}
            </div>

            {payments.map(p => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 120px 1fr', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: p.type === 'ENROLLMENT' ? 'var(--info)' : 'var(--success)', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{PAYMENT_TYPE_LABEL[p.type] ?? p.type}</span>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.period ?? '—'}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(p.amount)}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{formatDate(p.confirmedAt)}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.notes ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Modal: Activate ── */}
      <Modal
        open={showActivate}
        onClose={() => setShowActivate(false)}
        title="Activar alumno"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowActivate(false)}>Cancelar</Button>
            <Button loading={activateMutation.isPending} onClick={handleActivate}>Activar</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Asigna un horario y opcionalmente un maestro para activar a <strong>{student.name}</strong>.
          </p>
          <Select label="Horario *" options={scheduleOptions} value={selectedSchedule} onChange={e => setSelectedSchedule(e.target.value)} />
          <Select label="Maestro (opcional)" options={teacherOptions} value={selectedTeacher} onChange={e => setSelectedTeacher(e.target.value)} />
          <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info)' }}>
            Al activar, el alumno recibirá un mensaje de bienvenida por WhatsApp automáticamente.
          </div>
        </div>
      </Modal>

      {/* ── Modal: Suspend ── */}
      <Modal
        open={showSuspend}
        onClose={() => setShowSuspend(false)}
        title="Suspender alumno"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowSuspend(false)}>Cancelar</Button>
            <Button variant="danger" loading={suspendMutation.isPending} onClick={handleSuspend}
              icon={<AlertTriangle size={14} />}>
              Confirmar suspensión
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            ¿Confirmas la suspensión de <strong>{student.name}</strong>?
          </p>
          <div style={{ padding: '12px 14px', background: 'var(--danger-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--danger)' }}>
            Esta acción liberará su horario y le enviará una notificación por WhatsApp. El lugar quedará disponible para otros alumnos.
          </div>
        </div>
      </Modal>

      {/* ── Modal: Register payment ── */}
      <Modal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        title="Registrar mensualidad"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPayment(false)}>Cancelar</Button>
            <Button loading={monthlyMutation.isPending} onClick={handlePayment} icon={<CreditCard size={14} />}>
              Registrar pago
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              Período (YYYY-MM) *
            </label>
            <input
              type="month"
              value={paymentPeriod}
              onChange={e => setPaymentPeriod(e.target.value)}
              style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              Monto (dejar vacío para calcular automáticamente)
            </label>
            <input
              type="number"
              value={paymentAmount}
              onChange={e => setPaymentAmount(e.target.value)}
              placeholder="Calculado automáticamente según modalidad"
              style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
              Notas (opcional)
            </label>
            <textarea
              value={paymentNotes}
              onChange={e => setPaymentNotes(e.target.value)}
              placeholder="Ej: Pagó en efectivo, cheque #123..."
              rows={2}
              style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none', resize: 'vertical' }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Helper component ─────────────────────────

function InfoRow({ icon, label, value, valueColor }: { icon: React.ReactNode; label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ color: 'var(--text-muted)', marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 13, fontWeight: 500, color: valueColor ?? 'var(--text-primary)' }}>{value}</p>
      </div>
    </div>
  );
}
