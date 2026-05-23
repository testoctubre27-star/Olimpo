import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, CheckCircle } from 'lucide-react';
import { api } from '../../services/api';
import { Button, Input, Select } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';

// ─── Types ────────────────────────────────────
interface Schedule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  capacity: number;
  modality: { name: string; modality: string; monthlyFee: string };
  slots: { id: string }[];
}

// ─── Constants ────────────────────────────────
const DAY = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

const MODALITY_OPTIONS = [
  { value: '', label: 'Selecciona modalidad...' },
  { value: 'BABY_PHASE1',   label: 'Natación Bebés Fase 1 (4-12 meses)' },
  { value: 'BABY_PHASE2',   label: 'Natación Bebés Fase 2 (1-3 años)' },
  { value: 'BABY_PHASE3',   label: 'Natación Bebés Fase 3 (3-5 años)' },
  { value: 'GROUP_CHILD',   label: 'Natación Grupal Infantil' },
  { value: 'GROUP_ADULT',   label: 'Natación Adultos Grupal' },
  { value: 'FREE_ACCESS',   label: 'Acceso Libre' },
  { value: 'AQUA_THERAPY',  label: 'Terapia Acuática' },
  { value: 'PERSONAL_CHILD','label': 'Personalizado Infantil' },
];

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

// ─── Hooks ────────────────────────────────────
function useSchedules() {
  return useQuery({
    queryKey: ['schedules'],
    queryFn: async () => {
      const { data } = await api.get('/schedules');
      return data.data as Schedule[];
    },
  });
}

function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: object) => {
      const { data } = await api.post('/students', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['students'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ─── Props ────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
}

// ─── Initial form ─────────────────────────────
const empty = {
  name: '', phone: '', modality: '', scheduleId: '',
  tutorName: '',
  registerPayment: false,
  paymentType: 'MONTHLY' as 'MONTHLY' | 'ENROLLMENT',
  paymentPeriod: CURRENT_MONTH,
  paymentAmount: '',
  paymentNotes: '',
};

// ─── Component ────────────────────────────────
export function NewStudentModal({ open, onClose }: Props) {
  const { data: schedules } = useSchedules();
  const createMutation      = useCreateStudent();

  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  // Filter schedules by selected modality with available capacity
  const availableSchedules = schedules?.filter(s => {
    if (!form.modality) return false;
    const sameModality = s.modality.modality === form.modality;
    const hasCapacity  = s.slots.length < s.capacity;
    return sameModality && hasCapacity;
  }) ?? [];

  const selectedSchedule = schedules?.find(s => s.id === form.scheduleId);
  const suggestedAmount  = selectedSchedule
    ? (form.paymentType === 'ENROLLMENT' ? 200 : Number(selectedSchedule.modality.monthlyFee))
    : undefined;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim())     e.name     = 'El nombre es requerido';
    if (!form.phone.trim())    e.phone    = 'El teléfono es requerido';
    if (!form.modality)        e.modality  = 'Selecciona una modalidad';
    if (!form.scheduleId)      e.scheduleId = 'Selecciona un horario';
    if (form.registerPayment) {
      if (!form.paymentPeriod) e.paymentPeriod = 'El período es requerido';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleClose = () => {
    setForm(empty);
    setErrors({});
    onClose();
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await createMutation.mutateAsync({
        name:           form.name.trim(),
        phone:          form.phone.replace(/\D/g, ''),
        modality:       form.modality,
        scheduleId:     form.scheduleId,
        tutorName:      form.tutorName.trim() || undefined,
        registerPayment: form.registerPayment,
        paymentType:    form.registerPayment ? form.paymentType : undefined,
        paymentPeriod:  form.registerPayment ? form.paymentPeriod : undefined,
        paymentAmount:  form.registerPayment && form.paymentAmount
          ? Number(form.paymentAmount)
          : suggestedAmount,
        paymentNotes:   form.paymentNotes.trim() || undefined,
      });
      toast.success(`Alumno ${form.name.trim()} creado y activado`);
      handleClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Error al crear el alumno');
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Nuevo alumno"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>Cancelar</Button>
          <Button
            loading={createMutation.isPending}
            onClick={handleSubmit}
            icon={<UserPlus size={14} />}
          >
            Crear y activar alumno
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Datos personales ── */}
        <section>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Datos personales
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Input
                label="Nombre completo *"
                placeholder="Ej: Amber Vannesa Arenas Vázquez"
                value={form.name}
                error={errors.name}
                onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setErrors(er => ({ ...er, name: '' })); }}
              />
            </div>
            <Input
              label="Teléfono *"
              placeholder="7821234567"
              value={form.phone}
              error={errors.phone}
              onChange={e => { setForm(p => ({ ...p, phone: e.target.value })); setErrors(er => ({ ...er, phone: '' })); }}
            />
            <Input
              label="Nombre del padre / tutor"
              placeholder="Ej: Perla Edith Vázquez Glez."
              value={form.tutorName}
              onChange={f('tutorName')}
            />
          </div>
        </section>

        {/* ── Modalidad y horario ── */}
        <section>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Modalidad y horario
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Select
              label="Modalidad *"
              options={MODALITY_OPTIONS}
              value={form.modality}
              onChange={e => {
                setForm(p => ({ ...p, modality: e.target.value, scheduleId: '' }));
                setErrors(er => ({ ...er, modality: '', scheduleId: '' }));
              }}
            />
            {errors.modality && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: -8 }}>{errors.modality}</p>}

            {form.modality && (
              availableSchedules.length === 0 ? (
                <div style={{ padding: '12px 14px', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--warning)' }}>
                  ⚠️ No hay horarios disponibles con cupo para esta modalidad. Pide a un maestro que cree uno.
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
                    Horario disponible *
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {availableSchedules.map(s => {
                      const isSelected = form.scheduleId === s.id;
                      const pct = Math.round((s.slots.length / s.capacity) * 100);
                      return (
                        <button
                          key={s.id}
                          onClick={() => { setForm(p => ({ ...p, scheduleId: s.id })); setErrors(er => ({ ...er, scheduleId: '' })); }}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '12px 14px', borderRadius: 'var(--radius-md)',
                            border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                            background: isSelected ? 'var(--primary-light)' : 'var(--bg)',
                            cursor: 'pointer', fontFamily: 'var(--font-sans)', textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <div>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {DAY[s.dayOfWeek]} · {s.startTime} – {s.endTime}
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                              {s.slots.length} / {s.capacity} alumnos ocupados
                            </p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 99 }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)', borderRadius: 99 }} />
                            </div>
                            {isSelected && <CheckCircle size={16} color="var(--primary)" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {errors.scheduleId && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{errors.scheduleId}</p>}
                </div>
              )
            )}
          </div>
        </section>

        {/* ── Pago ── */}
        <section>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Pago
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Toggle registrar pago */}
            <button
              onClick={() => setForm(p => ({ ...p, registerPayment: !p.registerPayment }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 'var(--radius-md)',
                border: `2px solid ${form.registerPayment ? 'var(--primary)' : 'var(--border)'}`,
                background: form.registerPayment ? 'var(--primary-light)' : 'var(--bg)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)', textAlign: 'left', width: '100%',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                background: form.registerPayment ? 'var(--primary)' : 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {form.registerPayment && <CheckCircle size={12} color="white" />}
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  Registrar pago al crear el alumno
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Marca si el alumno ya realizó su pago
                </p>
              </div>
            </button>

            {form.registerPayment && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingLeft: 4 }}>
                <Select
                  label="Tipo de pago"
                  options={[
                    { value: 'MONTHLY',    label: 'Mensualidad' },
                    { value: 'ENROLLMENT', label: 'Inscripción anual ($200)' },
                  ]}
                  value={form.paymentType}
                  onChange={f('paymentType')}
                />
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                    Período (YYYY-MM)
                  </label>
                  <input
                    type="month"
                    value={form.paymentPeriod}
                    onChange={f('paymentPeriod')}
                    style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: `1px solid ${errors.paymentPeriod ? 'var(--danger)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                    Monto (MXN)
                  </label>
                  <input
                    type="number" min={1}
                    placeholder={suggestedAmount ? String(suggestedAmount) : 'Auto'}
                    value={form.paymentAmount}
                    onChange={f('paymentAmount')}
                    style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
                  />
                  {suggestedAmount && (
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                      Sugerido: ${suggestedAmount.toLocaleString('es-MX')} MXN
                    </p>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                    Notas del pago
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Pagó el 15 de mayo en efectivo"
                    value={form.paymentNotes}
                    onChange={f('paymentNotes')}
                    style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
                  />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Summary callout */}
        <div style={{ padding: '12px 16px', background: 'var(--success-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--success)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            El alumno se creará directamente como <strong>Activo</strong> con el horario asignado.
            Si tiene teléfono, el bot lo reconocerá si escribe por WhatsApp.
          </span>
        </div>
      </div>
    </Modal>
  );
}
