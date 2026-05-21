import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Plus, Trash2, Power } from 'lucide-react';
import { api } from '../../services/api';
import { SectionHeader, Button, Badge, Input } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { toast } from '../../components/ui/Toast';
import { formatCurrency } from '../../utils/labels';

// ─── Types ────────────────────────────────────
interface ModalityConfig {
  id: string;
  modality: string;
  name: string;
  description?: string;
  monthlyFee: string;
  maxCapacity: number;
  isActive: boolean;
  _count?: { schedules: number };
}

interface Service {
  id: string;
  name: string;
  description?: string;
  monthlyFee: string;
  maxCapacity: number;
  isActive: boolean;
  icon?: string;
}

// ─── Hooks ────────────────────────────────────
function useServices() {
  return useQuery({
    queryKey: ['modalities'],
    queryFn: async () => {
      const { data } = await api.get('/modalities');
      return data.data as { modalities: ModalityConfig[]; services: Service[] };
    },
  });
}

function useUpdateModality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...p }: { id: string } & Record<string, unknown>) => {
      const { data } = await api.patch(`/modalities/${id}`, p);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modalities'] }),
  });
}

function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Record<string, unknown>) => {
      const { data } = await api.post('/modalities/services', p);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modalities'] }),
  });
}

function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...p }: { id: string } & Record<string, unknown>) => {
      const { data } = await api.patch(`/modalities/services/${id}`, p);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modalities'] }),
  });
}

function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => { await api.delete(`/modalities/services/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modalities'] }),
  });
}

// ─── Constants ────────────────────────────────
const MODALITY_EMOJI: Record<string, string> = {
  BABY_PHASE1:    '👶', BABY_PHASE2: '🧒', BABY_PHASE3: '🏃',
  GROUP_CHILD:    '👧', GROUP_ADULT: '🧑', FREE_ACCESS: '🏊',
  AQUA_THERAPY:   '💆', PERSONAL_CHILD: '⭐',
};

const emptyForm = { name: '', description: '', monthlyFee: '', maxCapacity: '', icon: '🏊' };

// ─── Service Card ─────────────────────────────
function ServiceCard({
  name, description, monthlyFee, maxCapacity, isActive,
  emoji, scheduleCount, isFixed,
  onEdit, onToggle, onDelete,
}: {
  name: string; description?: string; monthlyFee: string;
  maxCapacity: number; isActive: boolean; emoji: string;
  scheduleCount?: number; isFixed?: boolean;
  onEdit: () => void; onToggle: () => void; onDelete?: () => void;
}) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${isActive ? 'var(--border)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      opacity: isActive ? 1 : 0.55,
      transition: 'opacity .2s, box-shadow .2s',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex',
      flexDirection: 'column',
    }}
    onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'}
    onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'}
    >
      {/* Color band top */}
      <div style={{ height: 4, background: isActive ? 'var(--primary)' : 'var(--border-strong)' }} />

      <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              background: isActive ? 'var(--primary-light)' : 'var(--grayL, #f2f2f2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20,
            }}>
              {emoji}
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, marginBottom: 4 }}>
                {name}
              </p>
              <Badge variant={isActive ? 'success' : 'default'} dot>
                {isActive ? 'Activo' : 'Inactivo'}
              </Badge>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            <button onClick={onEdit} title="Editar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', borderRadius: 6, display: 'flex', transition: 'color .15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--primary)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
              <Edit2 size={14} />
            </button>
            <button onClick={onToggle} title={isActive ? 'Desactivar' : 'Activar'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: isActive ? 'var(--warning)' : 'var(--success)', padding: '6px', borderRadius: 6, display: 'flex' }}>
              <Power size={14} />
            </button>
            {!isFixed && onDelete && (
              <button onClick={onDelete} title="Eliminar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '6px', borderRadius: 6, display: 'flex', transition: 'color .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--danger)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        {description ? (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
            {description}
          </p>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin descripción</p>
        )}
      </div>

      {/* Footer with stats */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
            Cupo máx.
          </p>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            {maxCapacity} {maxCapacity === 1 ? 'alumno' : 'alumnos'}
          </p>
        </div>

        {scheduleCount !== undefined && scheduleCount > 0 && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
              Horarios
            </p>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>{scheduleCount}</p>
          </div>
        )}

        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
            Precio mensual
          </p>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--primary)', letterSpacing: '-0.3px' }}>
            {formatCurrency(monthlyFee)}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Edit form ────────────────────────────────
function EditForm({ form, setForm, showIcon = false }: {
  form: typeof emptyForm;
  setForm: React.Dispatch<React.SetStateAction<typeof emptyForm>>;
  showIcon?: boolean;
}) {
  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {showIcon && (
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
            Ícono (emoji)
          </label>
          <input value={form.icon} onChange={f('icon')}
            placeholder="🏊" maxLength={4}
            style={{ width: 60, height: 38, padding: '0 12px', fontSize: 20, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', textAlign: 'center', outline: 'none', background: 'var(--surface)', color: 'var(--text-primary)' }} />
        </div>
      )}
      <Input label="Nombre del servicio *" value={form.name} onChange={f('name')} placeholder="Ej: Natación Avanzada" />
      <div>
        <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Descripción</label>
        <textarea rows={3} value={form.description} onChange={f('description')}
          placeholder="Describe brevemente este servicio..."
          style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none', resize: 'vertical', lineHeight: 1.5 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Precio mensual (MXN) *</label>
          <input type="number" min={1} value={form.monthlyFee} onChange={f('monthlyFee')}
            placeholder="800" style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Cupo máximo *</label>
          <input type="number" min={1} value={form.maxCapacity} onChange={f('maxCapacity')}
            placeholder="10" style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
        </div>
      </div>
      <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info)' }}>
        El cambio de precio aplica para nuevas inscripciones. Los alumnos activos no se ven afectados automáticamente.
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────
export default function ModalitiesPage() {
  const { data, isLoading } = useServices();
  const updateModality = useUpdateModality();
  const createService  = useCreateService();
  const updateService  = useUpdateService();
  const deleteService  = useDeleteService();

  const [editingModality, setEditingModality] = useState<ModalityConfig | null>(null);
  const [editingService, setEditingService]   = useState<Service | null>(null);
  const [showCreate, setShowCreate]           = useState(false);
  const [deleteTarget, setDeleteTarget]       = useState<Service | null>(null);
  const [form, setForm]                       = useState(emptyForm);

  const errMsg = (err: unknown) =>
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

  const openEditModality = (m: ModalityConfig) => {
    setEditingModality(m);
    setForm({ name: m.name, description: m.description ?? '', monthlyFee: String(m.monthlyFee), maxCapacity: String(m.maxCapacity), icon: MODALITY_EMOJI[m.modality] ?? '🏊' });
  };

  const openEditService = (s: Service) => {
    setEditingService(s);
    setForm({ name: s.name, description: s.description ?? '', monthlyFee: String(s.monthlyFee), maxCapacity: String(s.maxCapacity), icon: s.icon ?? '🏊' });
  };

  const validate = () => {
    if (!form.name.trim())     { toast.error('El nombre es requerido'); return false; }
    if (!form.monthlyFee || Number(form.monthlyFee) <= 0) { toast.error('Ingresa un precio válido'); return false; }
    if (!form.maxCapacity || Number(form.maxCapacity) < 1) { toast.error('Ingresa un cupo válido'); return false; }
    return true;
  };

  const handleSaveModality = async () => {
    if (!editingModality || !validate()) return;
    try {
      await updateModality.mutateAsync({ id: editingModality.id, name: form.name.trim(), description: form.description.trim() || undefined, monthlyFee: Number(form.monthlyFee), maxCapacity: Number(form.maxCapacity) });
      toast.success('Servicio actualizado'); setEditingModality(null);
    } catch (err) { toast.error(errMsg(err) ?? 'Error'); }
  };

  const handleSaveService = async () => {
    if (!editingService || !validate()) return;
    try {
      await updateService.mutateAsync({ id: editingService.id, name: form.name.trim(), description: form.description.trim() || undefined, monthlyFee: Number(form.monthlyFee), maxCapacity: Number(form.maxCapacity), icon: form.icon });
      toast.success('Servicio actualizado'); setEditingService(null);
    } catch (err) { toast.error(errMsg(err) ?? 'Error'); }
  };

  const handleCreate = async () => {
    if (!validate()) return;
    try {
      await createService.mutateAsync({ name: form.name.trim(), description: form.description.trim() || undefined, monthlyFee: Number(form.monthlyFee), maxCapacity: Number(form.maxCapacity), icon: form.icon });
      toast.success('Servicio creado'); setShowCreate(false); setForm(emptyForm);
    } catch (err) { toast.error(errMsg(err) ?? 'Error'); }
  };

  const handleToggleModality = async (m: ModalityConfig) => {
    try {
      await updateModality.mutateAsync({ id: m.id, isActive: !m.isActive });
      toast.success(m.isActive ? 'Servicio desactivado' : 'Servicio activado');
    } catch { toast.error('Error al cambiar estado'); }
  };

  const handleToggleService = async (s: Service) => {
    try {
      await updateService.mutateAsync({ id: s.id, isActive: !s.isActive });
      toast.success(s.isActive ? 'Servicio desactivado' : 'Servicio activado');
    } catch { toast.error('Error al cambiar estado'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteService.mutateAsync(deleteTarget.id);
      toast.success('Servicio eliminado'); setDeleteTarget(null);
    } catch { toast.error('Error al eliminar'); }
  };

  const allItems = [
    ...(data?.modalities ?? []).map(m => ({ type: 'modality' as const, data: m })),
    ...(data?.services   ?? []).map(s => ({ type: 'service'  as const, data: s })),
  ];
  const active   = allItems.filter(i => i.data.isActive);
  const inactive = allItems.filter(i => !i.data.isActive);

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: 16,
  };

  const renderCard = (item: typeof allItems[0]) => {
    const isModality = item.type === 'modality';
    const m = item.data as ModalityConfig;
    const s = item.data as Service;

    return (
      <ServiceCard
        key={item.data.id}
        name={item.data.name}
        description={item.data.description}
        monthlyFee={item.data.monthlyFee}
        maxCapacity={item.data.maxCapacity}
        isActive={item.data.isActive}
        emoji={isModality ? (MODALITY_EMOJI[m.modality] ?? '🏊') : (s.icon ?? '🏊')}
        scheduleCount={isModality ? m._count?.schedules : undefined}
        isFixed={isModality}
        onEdit={() => isModality ? openEditModality(m) : openEditService(s)}
        onToggle={() => isModality ? handleToggleModality(m) : handleToggleService(s)}
        onDelete={!isModality ? () => setDeleteTarget(s) : undefined}
      />
    );
  };

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Servicios"
        subtitle="Gestiona las modalidades y precios que ofrece la academia"
        actions={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => { setForm(emptyForm); setShowCreate(true); }}>
            Nuevo servicio
          </Button>
        }
      />

      {isLoading && (
        <div style={gridStyle}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ height: 200, borderRadius: 14 }} />)}
        </div>
      )}

      {!isLoading && active.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Activos · {active.length}
          </p>
          <div style={gridStyle}>{active.map(renderCard)}</div>
        </section>
      )}

      {!isLoading && inactive.length > 0 && (
        <section>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Inactivos · {inactive.length}
          </p>
          <div style={gridStyle}>{inactive.map(renderCard)}</div>
        </section>
      )}

      {/* Edit modality modal */}
      <Modal open={!!editingModality} onClose={() => setEditingModality(null)} title={`Editar — ${editingModality?.name}`} size="md"
        footer={<><Button variant="secondary" onClick={() => setEditingModality(null)}>Cancelar</Button><Button loading={updateModality.isPending} onClick={handleSaveModality}>Guardar cambios</Button></>}>
        <EditForm form={form} setForm={setForm} />
      </Modal>

      {/* Edit service modal */}
      <Modal open={!!editingService} onClose={() => setEditingService(null)} title={`Editar — ${editingService?.name}`} size="md"
        footer={<><Button variant="secondary" onClick={() => setEditingService(null)}>Cancelar</Button><Button loading={updateService.isPending} onClick={handleSaveService}>Guardar cambios</Button></>}>
        <EditForm form={form} setForm={setForm} showIcon />
      </Modal>

      {/* Create service modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setForm(emptyForm); }} title="Nuevo servicio" size="md"
        footer={<><Button variant="secondary" onClick={() => { setShowCreate(false); setForm(emptyForm); }}>Cancelar</Button><Button loading={createService.isPending} onClick={handleCreate} icon={<Plus size={14} />}>Crear servicio</Button></>}>
        <EditForm form={form} setForm={setForm} showIcon />
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Eliminar servicio" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancelar</Button><Button variant="danger" loading={deleteService.isPending} onClick={handleDelete} icon={<Trash2 size={14} />}>Eliminar</Button></>}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          ¿Confirmas que deseas eliminar <strong>{deleteTarget?.name}</strong>? Esta acción no se puede deshacer.
        </p>
      </Modal>
    </div>
  );
}
