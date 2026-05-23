import { Users, TrendingUp, AlertTriangle, UserX, DollarSign, Calendar, Wifi, WifiOff, QrCode } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useDashboard, useWhatsAppStatus } from '../../hooks/useApi';
import { api } from '../../services/api';
import { StatCard, Card, PageSpinner, SectionHeader } from '../../components/ui';
import { formatCurrency, DAY_LABEL, occupancyColor, formatDate, formatCurrency as fc } from '../../utils/labels';

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const { data: waStatus } = useWhatsAppStatus();
  const [showPairModal, setShowPairModal] = React.useState(false);
  const [pairPhone, setPairPhone] = React.useState('');
  const [pairLoading, setPairLoading] = React.useState(false);

  const handleStartPairing = async () => {
    if (!pairPhone || pairPhone.replace(/\D/g,'').length < 10) return;
    setPairLoading(true);
    try {
      await api.post('/whatsapp/pair', { phone: pairPhone.replace(/\D/g,'') });
      setShowPairModal(false);
      setPairPhone('');
    } catch { /* ignore */ } finally { setPairLoading(false); }
  };

  if (isLoading) return <PageSpinner />;
  if (error || !data) return (
    <div style={{ color: 'var(--danger)', fontSize: 14 }}>Error al cargar el dashboard. Intenta de nuevo.</div>
  );

  const scheduleChartData = data.schedules.map(s => ({
    name: `${DAY_LABEL[s.dayOfWeek]} ${s.startTime}`,
    ocupados: s.occupied,
    capacidad: s.capacity,
    pct: s.occupancyPct,
  }));

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Dashboard"
        subtitle={`Actualizado ${formatDate(data.generatedAt)}`}
      />

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard
          label="Alumnos activos"
          value={data.students.active}
          icon={<Users size={20} color="var(--primary)" />}
          color="var(--primary-light)"
        />
        <StatCard
          label="Ingresos del mes"
          value={formatCurrency(data.revenue.monthly)}
          icon={<DollarSign size={20} color="var(--success)" />}
          color="var(--success-bg)"
        />
        <StatCard
          label="Morosos"
          value={data.students.delinquent}
          icon={<AlertTriangle size={20} color="var(--warning)" />}
          color="var(--warning-bg)"
        />
        <StatCard
          label="Suspendidos"
          value={data.students.suspended}
          icon={<UserX size={20} color="var(--danger)" />}
          color="var(--danger-bg)"
        />
        <StatCard
          label="Total alumnos"
          value={data.students.total}
          icon={<TrendingUp size={20} color="var(--info)" />}
          color="var(--info-bg)"
        />
        <StatCard
          label="Ingresos del año"
          value={formatCurrency(data.revenue.yearly)}
          icon={<DollarSign size={20} color="var(--primary)" />}
          color="var(--primary-light)"
        />
      </div>

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
                    : waStatus?.pairingCode
                    ? `Código listo para +${waStatus.pairingPhone}`
                    : waStatus?.pairingPhone
                    ? 'Generando código de emparejamiento...'
                    : 'Sin conexión — usa "Vincular" para conectar'}
                </p>
              </div>
            </div>
            {!waStatus?.connected && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button size="sm" onClick={() => setShowPairModal(true)} icon={<QrCode size={14} />}>
                  Vincular WhatsApp
                </Button>
                {waStatus?.pairingPhone && (
                  <a
                    href={`${import.meta.env.VITE_API_URL?.replace('/api', '') ?? 'http://localhost:4000'}/api/whatsapp/pair-status?token=${localStorage.getItem('olimpo_token') ?? ''}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                      borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                      background: 'var(--surface)', color: 'var(--text-primary)',
                      fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>
                    Ver código
                  </a>
                )}
              </div>
            )}
          </div>
          {/* Pairing code display when available */}
          {!waStatus?.connected && waStatus?.pairingCode && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                Código de emparejamiento — ingrésalo en WhatsApp → Dispositivos vinculados → Vincular con número
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                {(waStatus.pairingCode.match(/.{1,4}/g) ?? [waStatus.pairingCode]).map((part: string, i: number) => (
                  <div key={i} style={{
                    background: 'var(--primary)', color: 'white',
                    fontSize: 22, fontWeight: 800, letterSpacing: 2,
                    padding: '10px 16px', borderRadius: 10,
                    fontFamily: 'monospace',
                  }}>{part}</div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>

        {/* Schedule occupancy chart */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Calendar size={16} color="var(--primary)" />
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Ocupación de horarios</h2>
          </div>
          {scheduleChartData.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: '24px 0' }}>
              No hay horarios configurados
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={scheduleChartData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, name: string) => [value, name === 'ocupados' ? 'Alumnos' : 'Capacidad']}
                />
                <Bar dataKey="capacidad" fill="var(--border)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="ocupados" radius={[4, 4, 0, 0]} maxBarSize={32}>
                  {scheduleChartData.map((entry, i) => (
                    <Cell key={i} fill={occupancyColor(entry.pct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            {[
              { color: 'var(--success)', label: 'Disponible (<70%)' },
              { color: 'var(--warning)', label: 'Casi lleno (70-89%)' },
              { color: 'var(--danger)',  label: 'Lleno (≥90%)' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent payments */}
        <Card style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
            <DollarSign size={16} color="var(--primary)" />
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Pagos recientes</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            {data.recentPayments.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin pagos este mes</p>
            )}
            {data.recentPayments.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.student?.name ?? '—'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatDate(p.confirmedAt)}
                  </p>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>
                  {fc(p.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Schedule occupancy table ── */}
      <Card style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
          Detalle de horarios
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {data.schedules.map(s => (
            <div key={s.id} style={{
              padding: '12px 14px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {DAY_LABEL[s.dayOfWeek]} {s.startTime}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {s.modality}
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: occupancyColor(s.occupancyPct), flexShrink: 0 }}>
                  {s.occupancyPct}%
                </span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
                <div style={{ height: '100%', width: `${s.occupancyPct}%`, background: occupancyColor(s.occupancyPct), borderRadius: 99, transition: 'width .3s' }} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {s.occupied} / {s.capacity} alumnos
                {s.waitingCount > 0 && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>· {s.waitingCount} en espera</span>}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>

      {/* Pairing modal */}
      <Modal open={showPairModal} onClose={() => setShowPairModal(false)}
        title="Vincular WhatsApp" size="sm"
        footer={<>
          <Button variant="secondary" onClick={() => setShowPairModal(false)}>Cancelar</Button>
          <Button loading={pairLoading} onClick={handleStartPairing} icon={<QrCode size={14} />}>
            Generar código
          </Button>
        </>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Ingresa el número de WhatsApp de la academia con código de país. Se generará un código de 8 dígitos para vincularlo como dispositivo secundario.
          </p>
          <Input
            label="Número de WhatsApp (con código de país)"
            placeholder="5212345678901"
            value={pairPhone}
            onChange={e => setPairPhone(e.target.value)}
          />
          <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info)' }}>
            Ejemplo: si el número es 782 123 4567 de México, ingresa <strong>5217821234567</strong>
          </div>
        </div>
      </Modal>
    </div>
  );
}
