import { useState } from 'react';
import { Users, TrendingUp, AlertTriangle, UserX, DollarSign, Calendar, Wifi, WifiOff, QrCode } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useDashboard, useWhatsAppStatus } from '../../hooks/useApi';
import { StatCard, Card, PageSpinner, SectionHeader, Button } from '../../components/ui';
import { api } from '../../services/api';
import { formatCurrency, DAY_LABEL, occupancyColor, formatDate, formatCurrency as fc } from '../../utils/labels';

interface WAStatus { connected: boolean; hasQR: boolean; }
interface DashboardData {
  generatedAt: string;
  students: { active: number; delinquent: number; suspended: number; total: number };
  revenue:   { monthly: number; yearly: number };
  schedules: { id: string; dayOfWeek: number; startTime: string; modality: string; occupied: number; capacity: number; occupancyPct: number; waitingCount: number }[];
  recentPayments: { id: string; amount: number; confirmedAt: string; student?: { name: string } }[];
}

export default function DashboardPage() {
  const { data: rawData, isLoading, error } = useDashboard();
  const { data: rawWA } = useWhatsAppStatus();

  const data     = rawData as DashboardData | undefined;
  const waStatus = rawWA  as WAStatus  | undefined;

  const [clearing, setClearing] = useState(false);

  const handleClearSession = async () => {
    setClearing(true);
    try {
      await api.delete('/whatsapp/session');
      // Reload QR page after short delay
      setTimeout(() => window.open(qrUrl, '_blank'), 1500);
    } catch { /* ignore */ } finally {
      setClearing(false);
    }
  };

  const qrUrl = `${import.meta.env.VITE_API_URL?.replace('/api', '') ?? 'http://localhost:4000'}/api/whatsapp/qr?token=${localStorage.getItem('olimpo_token') ?? ''}`;

  if (isLoading) return <PageSpinner />;
  if (error || !data) return (
    <div style={{ color: 'var(--danger)', fontSize: 14 }}>Error al cargar el dashboard. Intenta de nuevo.</div>
  );

  const schedules = data.schedules ?? [];

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Dashboard"
        subtitle={`Actualizado ${formatDate(data.generatedAt)}`}
      />

      {/* ── WhatsApp status ── */}
      <div style={{ marginBottom: 20 }}>
        <Card style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {waStatus?.connected
                ? <Wifi size={18} color="var(--success)" />
                : <WifiOff size={18} color="var(--danger)" />}
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                  WhatsApp {waStatus?.connected ? 'conectado' : 'desconectado'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {waStatus?.connected
                    ? 'El bot está activo y recibiendo mensajes'
                    : waStatus?.hasQR
                    ? 'QR listo para escanear'
                    : 'Sin conexión — iniciando...'}
                </p>
              </div>
            </div>
            {!waStatus?.connected && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href={qrUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <Button size="sm" icon={<QrCode size={14} />}>
                    {waStatus?.hasQR ? 'Ver QR' : 'Escanear QR'}
                  </Button>
                </a>
                {!waStatus?.hasQR && (
                  <Button size="sm" variant="secondary" loading={clearing} onClick={handleClearSession}>
                    Regenerar QR
                  </Button>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard label="Alumnos activos"  value={data.students.active}                icon={<Users        size={20} color="var(--primary)" />} color="var(--primary-light)" />
        <StatCard label="Ingresos del mes" value={formatCurrency(data.revenue.monthly)} icon={<DollarSign   size={20} color="var(--success)" />} color="var(--success-bg)" />
        <StatCard label="Morosos"          value={data.students.delinquent}             icon={<AlertTriangle size={20} color="var(--warning)" />} color="var(--warning-bg)" />
        <StatCard label="Suspendidos"      value={data.students.suspended}              icon={<UserX        size={20} color="var(--danger)"  />} color="var(--danger-bg)" />
        <StatCard label="Total alumnos"    value={data.students.total}                  icon={<TrendingUp   size={20} color="var(--info)"    />} color="var(--info-bg)" />
        <StatCard label="Ingresos del año" value={formatCurrency(data.revenue.yearly)}  icon={<DollarSign   size={20} color="var(--primary)" />} color="var(--primary-light)" />
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>

        {/* Occupancy chart */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Calendar size={16} color="var(--primary)" />
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Ocupación de horarios</h2>
          </div>
          {schedules.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>No hay horarios configurados</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={schedules.map(s => ({ name: `${DAY_LABEL[s.dayOfWeek]} ${s.startTime}`, ocupados: s.occupied, capacidad: s.capacity, pct: s.occupancyPct }))} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => [value, name === 'ocupados' ? 'Alumnos' : 'Capacidad']} />
                  <Bar dataKey="capacidad" fill="var(--border)" radius={[4,4,0,0]} maxBarSize={32} />
                  <Bar dataKey="ocupados" radius={[4,4,0,0]} maxBarSize={32}>
                    {schedules.map((s, i) => <Cell key={i} fill={occupancyColor(s.occupancyPct)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                {[{ color: 'var(--success)', label: 'Disponible (<70%)' }, { color: 'var(--warning)', label: 'Casi lleno (70-89%)' }, { color: 'var(--danger)', label: 'Lleno (≥90%)' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Recent payments */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <DollarSign size={16} color="var(--primary)" />
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Pagos recientes</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            {data.recentPayments.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin pagos este mes</p>}
            {data.recentPayments.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.student?.name ?? '—'}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{formatDate(p.confirmedAt)}</p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>{fc(p.amount)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Schedule detail grid ── */}
      <Card style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>Detalle de horarios</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {schedules.map(s => (
            <div key={s.id} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{DAY_LABEL[s.dayOfWeek]} {s.startTime}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.modality}</p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: occupancyColor(s.occupancyPct), flexShrink: 0 }}>{s.occupancyPct}%</span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${s.occupancyPct}%`, background: occupancyColor(s.occupancyPct), borderRadius: 99 }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {s.occupied} / {s.capacity} alumnos
                {s.waitingCount > 0 && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>· {s.waitingCount} en espera</span>}
              </p>
            </div>
          ))}
          {schedules.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin horarios configurados</p>}
        </div>
      </Card>
    </div>
  );
}
