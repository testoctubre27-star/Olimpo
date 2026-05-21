import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Users, Calendar, CheckCircle,
  XCircle, Clock, Waves, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../../services/api';
import { SectionHeader, Card, Button, Badge, Input, Empty } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { useTeachers } from '../../hooks/useApi';
import { formatCurrency, formatDate } from '../../utils/labels';

interface SummerCourse {
  id: string; name: string; description?: string; price: string;
  maxCapacity: number; startDate: string; endDate: string;
  period: string; schedule?: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'FINISHED';
  enrolledCount: number; pendingCount: number; availableSpots: number;
  teachers: { teacher: { id: string; user: { name: string } } }[];
  enrollments: Enrollment[];
}

interface Enrollment {
  id: string; studentPhone: string; studentName: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  paidAt?: string; createdAt: string;
}

function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: async () => { const { data } = await api.get('/courses'); return data.data as SummerCourse[]; },
  });
}

function useCourse(id: string) {
  return useQuery({
    queryKey: ['course', id],
    queryFn: async () => { const { data } = await api.get(`/courses/${id}`); return data.data as SummerCourse; },
    enabled: Boolean(id),
  });
}

function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: object) => { const { data } = await api.post('/courses', p); return data; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses'] }),
  });
}

function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...p }: { id: string } & Record<string, unknown>) => { const { data } = await api.patch(`/courses/${id}`, p); return data; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['courses'] }); qc.invalidateQueries({ queryKey: ['course'] }); },
  });
}

function useUpdateEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, enrollmentId, status }: { courseId: string; enrollmentId: string; status: string }) => {
      const { data } = await api.patch(`/courses/${courseId}/enrollments/${enrollmentId}`, { status });
      return data;
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ['courses'] }); qc.invalidateQueries({ queryKey: ['course', v.courseId] }); },
  });
}

const STATUS_CONFIG = {
  DRAFT:    { label: 'Borrador',  variant: 'default'  as const, next: 'ACTIVE',   nextLabel: 'Activar' },
  ACTIVE:   { label: 'Activo',    variant: 'success'  as const, next: 'INACTIVE', nextLabel: 'Pausar' },
  INACTIVE: { label: 'Pausado',   variant: 'warning'  as const, next: 'ACTIVE',   nextLabel: 'Reactivar' },
  FINISHED: { label: 'Terminado', variant: 'default'  as const, next: null,       nextLabel: '' },
};

const emptyForm = { name: '', description: '', price: '', maxCapacity: '', startDate: '', endDate: '', period: '', schedule: '', teacherIds: [] as string[] };

export default function CoursesPage() {
  const { data: courses, isLoading } = useCourses();
  const { data: teachers } = useTeachers();
  const createMutation = useCreateCourse();
  const updateMutation = useUpdateCourse();
  const enrollMutation = useUpdateEnrollment();

  const [showCreate, setShowCreate] = useState(false);
  const [editCourse, setEditCourse] = useState<SummerCourse | null>(null);
  const [detailId, setDetailId]     = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm]             = useState(emptyForm);

  const { data: detail } = useCourse(detailId ?? '');

  const errMsg = (err: unknown) => (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

  const handleCreate = async () => {
    if (!form.name || !form.price || !form.maxCapacity || !form.startDate || !form.endDate || !form.period) {
      toast.error('Completa todos los campos obligatorios'); return;
    }
    try {
      await createMutation.mutateAsync({ ...form, price: Number(form.price), maxCapacity: Number(form.maxCapacity), startDate: new Date(form.startDate).toISOString(), endDate: new Date(form.endDate).toISOString() });
      toast.success('Curso creado'); setShowCreate(false); setForm(emptyForm);
    } catch (err) { toast.error(errMsg(err) ?? 'Error al crear'); }
  };

  const handleSaveEdit = async () => {
    if (!editCourse) return;
    try {
      const payload: Record<string, unknown> = { id: editCourse.id, teacherIds: form.teacherIds.length ? form.teacherIds : editCourse.teachers.map(t => t.teacher.id) };
      if (form.name)        payload.name        = form.name;
      if (form.description) payload.description = form.description;
      if (form.price)       payload.price       = Number(form.price);
      if (form.maxCapacity) payload.maxCapacity = Number(form.maxCapacity);
      if (form.startDate)   payload.startDate   = new Date(form.startDate).toISOString();
      if (form.endDate)     payload.endDate     = new Date(form.endDate).toISOString();
      if (form.period)      payload.period      = form.period;
      if (form.schedule)    payload.schedule    = form.schedule;
      await updateMutation.mutateAsync(payload);
      toast.success('Curso actualizado'); setEditCourse(null); setForm(emptyForm);
    } catch (err) { toast.error(errMsg(err) ?? 'Error al actualizar'); }
  };

  return (
    <div className="animate-fadeIn">
      <SectionHeader title="Cursos de Verano" subtitle={`${courses?.length ?? 0} cursos`}
        actions={<Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Nuevo curso</Button>} />

      {isLoading && [1,2].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12, marginBottom: 12 }} />)}

      {!isLoading && !courses?.length && (
        <Empty icon={<Waves size={40} color="var(--text-muted)" />} title="Sin cursos registrados"
          description="Crea un curso para que aparezca en el bot de WhatsApp."
          action={<Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCreate(true)}>Crear primer curso</Button>} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {courses?.map(course => {
          const cfg = STATUS_CONFIG[course.status];
          const expanded = expandedId === course.id;
          const pct = Math.round((course.enrolledCount / course.maxCapacity) * 100);

          return (
            <Card key={course.id} noPad>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{course.name}</h3>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      {course.pendingCount > 0 && <Badge variant="warning" dot>{course.pendingCount} pendiente{course.pendingCount > 1 ? 's' : ''}</Badge>}
                    </div>
                    {course.description && <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{course.description}</p>}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><Calendar size={12} />{formatDate(course.startDate)} → {formatDate(course.endDate)}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} />{course.period}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}><Users size={12} />{course.enrolledCount}/{course.maxCapacity}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(course.price)}</span>
                    </div>
                    <div style={{ marginTop: 8, height: 3, background: 'var(--border)', borderRadius: 99, maxWidth: 240 }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct >= 90 ? 'var(--danger)' : pct >= 70 ? 'var(--warning)' : 'var(--success)', borderRadius: 99 }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {cfg.next && <Button size="sm" variant="secondary" loading={updateMutation.isPending} onClick={async () => { try { await updateMutation.mutateAsync({ id: course.id, status: cfg.next! }); toast.success('Estado actualizado'); } catch { toast.error('Error'); } }}>{cfg.nextLabel}</Button>}
                    <Button size="sm" variant="ghost" icon={<Edit2 size={13} />} onClick={() => { setEditCourse(course); setForm({ ...emptyForm, teacherIds: course.teachers.map(t => t.teacher.id) }); }}>Editar</Button>
                    <Button size="sm" variant="ghost" icon={expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      onClick={() => { if (!expanded) setDetailId(course.id); setExpandedId(expanded ? null : course.id); }}>
                      Inscripciones
                    </Button>
                  </div>
                </div>
              </div>

              {expanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '14px 20px' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Inscripciones ({detail?.enrollments.length ?? 0})</p>
                  {!detail?.enrollments.length && <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sin inscripciones</p>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detail?.enrollments.map(e => (
                      <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-md)', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <p style={{ fontSize: 14, fontWeight: 500 }}>{e.studentName}</p>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{e.studentPhone} · {formatDate(e.createdAt)}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <Badge variant={e.status === 'CONFIRMED' ? 'success' : e.status === 'PENDING' ? 'warning' : 'danger'} dot>
                            {e.status === 'CONFIRMED' ? 'Confirmado' : e.status === 'PENDING' ? 'Pendiente' : 'Cancelado'}
                          </Badge>
                          {e.status === 'PENDING' && (
                            <>
                              <button onClick={() => enrollMutation.mutateAsync({ courseId: course.id, enrollmentId: e.id, status: 'CONFIRMED' }).then(() => toast.success('Inscripción confirmada')).catch(err => toast.error(errMsg(err) ?? 'Error'))}
                                style={{ background: 'var(--success-bg)', border: 'none', cursor: 'pointer', color: 'var(--success)', padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}>
                                <CheckCircle size={13} /> Confirmar
                              </button>
                              <button onClick={() => enrollMutation.mutateAsync({ courseId: course.id, enrollmentId: e.id, status: 'CANCELLED' }).then(() => toast.success('Cancelada')).catch(err => toast.error(errMsg(err) ?? 'Error'))}
                                style={{ background: 'var(--danger-bg)', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '6px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)' }}>
                                <XCircle size={13} /> Cancelar
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Create / Edit Modal */}
      <Modal open={showCreate || !!editCourse} onClose={() => { setShowCreate(false); setEditCourse(null); setForm(emptyForm); }}
        title={editCourse ? 'Editar curso' : 'Nuevo curso de verano'} size="lg"
        footer={<>
          <Button variant="secondary" onClick={() => { setShowCreate(false); setEditCourse(null); setForm(emptyForm); }}>Cancelar</Button>
          <Button loading={createMutation.isPending || updateMutation.isPending} onClick={editCourse ? handleSaveEdit : handleCreate}>
            {editCourse ? 'Guardar' : 'Crear curso'}
          </Button>
        </>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1/-1' }}>
            <Input label="Nombre *" placeholder="Curso de Verano 2026" value={form.name || (editCourse?.name ?? '')} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Descripción</label>
            <textarea rows={2} placeholder="Describe el curso..." value={form.description || (editCourse?.description ?? '')} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none', resize: 'vertical' }} />
          </div>
          {[
            { label: 'Precio total (MXN) *', key: 'price', type: 'number', placeholder: '1500', fallback: editCourse?.price ?? '' },
            { label: 'Cupo máximo *', key: 'maxCapacity', type: 'number', placeholder: '20', fallback: editCourse?.maxCapacity ?? '' },
            { label: 'Fecha inicio *', key: 'startDate', type: 'date', placeholder: '', fallback: editCourse?.startDate.slice(0,10) ?? '' },
            { label: 'Fecha fin *', key: 'endDate', type: 'date', placeholder: '', fallback: editCourse?.endDate.slice(0,10) ?? '' },
            { label: 'Periodo *', key: 'period', type: 'text', placeholder: '1 clase diaria de 1 hora', fallback: editCourse?.period ?? '' },
            { label: 'Horario (opcional)', key: 'schedule', type: 'text', placeholder: 'Lunes a viernes 9:00-10:00am', fallback: editCourse?.schedule ?? '' },
          ].map(({ label, key, type, placeholder, fallback }) => (
            <div key={key}>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>{label}</label>
              <input type={type} placeholder={placeholder} value={(form as Record<string, unknown>)[key] as string || String(fallback)}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
            </div>
          ))}
          <div style={{ gridColumn: '1/-1' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8 }}>Instructores</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {teachers?.map(t => {
                const ids = form.teacherIds.length ? form.teacherIds : (editCourse?.teachers.map(ct => ct.teacher.id) ?? []);
                const sel = ids.includes(t.id);
                return (
                  <button key={t.id} onClick={() => setForm(f => ({ ...f, teacherIds: sel ? (form.teacherIds.length ? form.teacherIds : ids).filter(i => i !== t.id) : [...(form.teacherIds.length ? form.teacherIds : ids), t.id] }))}
                    style={{ padding: '6px 12px', borderRadius: 99, border: `2px solid ${sel ? 'var(--primary)' : 'var(--border)'}`, background: sel ? 'var(--primary-light)' : 'var(--bg)', color: sel ? 'var(--primary)' : 'var(--text-muted)', fontSize: 13, fontWeight: sel ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                    {t.user.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
