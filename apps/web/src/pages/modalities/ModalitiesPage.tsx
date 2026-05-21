import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Edit2, Users, DollarSign, ToggleLeft, ToggleRight, Waves } from 'lucide-react';
import { api } from '../../services/api';
import { SectionHeader, Card, Badge, Button, Input } from '../../components/ui';
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

// ─── Hooks ────────────────────────────────────
function useModalities() {
  return useQuery({
    queryKey: ['modalities'],
    queryFn: async () => {
      const { data } = await api.get('/modalities');
      return data.data as ModalityConfig[];
    },
  });
}

function useUpdateModality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name?: string; description?: string; monthlyFee?: number; maxCapacity?: number; isActive?: boolean }) => {
      const { data } = await api.patch(`/modalities/${id}`, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modalities'] }),
  });
}

// ─── Modality icons ───────────────────────────
const MODALITY_EMOJI: Record<string, string> = {
  BABY_PHASE1:   '👶',
  BABY_PHASE2:   '🧒',
  BABY_PHASE3:   '🏃',
  GROUP_CHILD:   '👧',
  GROUP_ADULT:   '🧑',
  FREE_ACCESS:   '🏊',
  AQUA_THERAPY:  '💆',
  PERSONAL_CHILD:'⭐',
};

// ─── Edit form type ───────────────────────────
interface EditForm {
  name: string;
  description: string;
  monthlyFee: string;
  maxCapacity: string;
}

// ─── Page ─────────────────────────────────────
export default function ModalitiesPage() {
  const { data: modalities, isLoading } = useModalities();
  const updateMutation = useUpdateModality();

  const [editing, setEditing] = useState<ModalityConfig | null>(null);
  const [form, setForm]       = useState<EditForm>({ name: '', description: '', monthlyFee: '', maxCapacity: '' });

  const openEdit = (m: ModalityConfig) => {
    setEditing(m);
    setForm({
      name:        m.name,
      description: m.description ?? '',
      monthlyFee:  String(m.monthlyFee),
      maxCapacity: String(m.maxCapacity),
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return; }
    if (!form.monthlyFee || Number(form.monthlyFee) <= 0) { toast.error('El precio debe ser mayor a 0'); return; }
    if (!form.maxCapacity || Number(form.maxCapacity) < 1) { toast.error('El cupo debe ser al menos 1'); return; }

    try {
      await updateMutation.mutateAsync({
        id:          editing.id,
        name:        form.name.trim(),
        description: form.description.trim() || undefined,
        monthlyFee:  Number(form.monthlyFee),
        maxCapacity: Number(form.maxCapacity),
      });
      toast.success('Servicio actualizado correctamente');
      setEditing(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? 'Error al actualizar');
    }
  };

  const handleToggle = async (m: ModalityConfig) => {
    try {
      await updateMutation.mutateAsync({ id: m.id, isActive: !m.isActive });
      toast.success(m.isActive ? 'Servicio desactivado' : 'Servicio activado');
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  const active   = modalities?.filter(m => m.isActive)  ?? [];
  const inactive = modalities?.filter(m => !m.isActive) ?? [];

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Servicios"
        subtitle="Gestiona las modalidades y precios que ofrece la academia"
      />

      {isLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 12 }} />)}
        </div>
      )}

      {/* Active modalities */}
      {active.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Activos ({active.length})
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
            {active.map(m => <ModalityCard key={m.id} m={m} onEdit={openEdit} onToggle={handleToggle} />)}
          </div>
        </>
      )}

      {/* Inactive modalities */}
      {inactive.length > 0 && (
        <>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Inactivos ({inactive.length})
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {inactive.map(m => <ModalityCard key={m.id} m={m} onEdit={openEdit} onToggle={handleToggle} />)}
          </div>
        </>
      )}

      {/* Edit modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Editar — ${editing?.name}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button loading={updateMutation.isPending} onClick={handleSave}>
              Guardar cambios
            </Button>
          </>
        }
      >
        {editing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Read-only identifier */}
            <div style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 22 }}>{MODALITY_EMOJI[editing.modality] ?? '🏊'}</span>
              <div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo de modalidad</p>
                <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>{editing.modality}</p>
              </div>
            </div>

            <Input
              label="Nombre del servicio *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Natación Bebés Fase 1"
            />

            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                Descripción
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe brevemente este servicio..."
                style={{ width: '100%', padding: '8px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  Precio mensual (MXN) *
                </label>
                <input
                  type="number" min={1}
                  value={form.monthlyFee}
                  onChange={e => setForm(f => ({ ...f, monthlyFee: e.target.value }))}
                  style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  Cupo máximo *
                </label>
                <input
                  type="number" min={1}
                  value={form.maxCapacity}
                  onChange={e => setForm(f => ({ ...f, maxCapacity: e.target.value }))}
                  style={{ width: '100%', height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info)' }}>
              El cambio de precio aplica para nuevas mensualidades. Los alumnos activos no se ven afectados automáticamente.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Modality card component ──────────────────
function ModalityCard({
  m,
  onEdit,
  onToggle,
}: {
  m: ModalityConfig;
  onEdit: (m: ModalityConfig) => void;
  onToggle: (m: ModalityConfig) => void;
}) {
  const emoji = MODALITY_EMOJI[m.modality] ?? '🏊';

  return (
    <Card style={{ opacity: m.isActive ? 1 : 0.6 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: m.isActive ? 'var(--primary-light)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
            {emoji}
          </div>
          <div>
            <p style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.3 }}>{m.name}</p>
            <Badge variant={m.isActive ? 'success' : 'default'} dot>
              {m.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            onClick={() => onEdit(m)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 6, display: 'flex' }}
            title="Editar"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => onToggle(m)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: m.isActive ? 'var(--warning)' : 'var(--success)', padding: 6, borderRadius: 6, display: 'flex' }}
            title={m.isActive ? 'Desactivar' : 'Activar'}
          >
            {m.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          </button>
        </div>
      </div>

      {m.description && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>{m.description}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Users size={13} color="var(--text-muted)" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Máx. {m.maxCapacity} alumnos</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <DollarSign size={13} color="var(--primary)" />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(m.monthlyFee)}/mes</span>
        </div>
      </div>

      {(m._count?.schedules ?? 0) > 0 && (
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Waves size={12} color="var(--text-muted)" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m._count?.schedules} horario{(m._count?.schedules ?? 0) > 1 ? 's' : ''} activo{(m._count?.schedules ?? 0) > 1 ? 's' : ''}</span>
        </div>
      )}
    </Card>
  );
}
