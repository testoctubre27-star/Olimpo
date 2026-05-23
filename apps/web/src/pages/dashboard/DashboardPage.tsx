import React, { useState } from 'react';
import { Users, TrendingUp, AlertTriangle, UserX, DollarSign, Calendar, Wifi, WifiOff, QrCode } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useDashboard, useWhatsAppStatus } from '../../hooks/useApi';
import { api } from '../../services/api';
import { StatCard, Card, PageSpinner, SectionHeader, Button, Input } from '../../components/ui';
import { Modal } from '../../components/ui/Modal';
import { formatCurrency, DAY_LABEL, occupancyColor, formatDate } from '../../utils/labels';

export interface WhatsAppStatus {
  connected: boolean;
  pairingCode: string | null;
  pairingPhone: string | null;
}

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard();
  const { data: waStatus } = useWhatsAppStatus();

  const [showPairModal, setShowPairModal] = useState(false);
  const [pairPhone, setPairPhone]         = useState('');
  const [pairLoading, setPairLoading]     = useState(false);

  const handleStartPairing = async () => {
    const digits = pairPhone.replace(/\D/g, '');
    if (digits.length < 10) return;
    setPairLoading(true);
    try {
      await api.post('/whatsapp/pair', { phone: digits });
      setShowPairModal(false);
      setPairPhone('');
    } catch { /* ignore */ } finally {
      setPairLoading(false);
    }
  };

  if (isLoading) return <PageSpinner />;
  if (error) return (
    <div style={{ padding: 24, color: 'var(--danger)' }}>
      Error al cargar el dashboard. Intenta recargar la página.
    </div>
  );

  const stats = data ?? {};
  const schedules: { day: number; name: string; available: number; occupied: number; pct: number }[] =
    stats.scheduleOccupancy ?? [];

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 14px', borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)', background: 'var(--surface)',
                      color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
                    }}>
                    Ver código
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Pairing code inline display */}
          {!waStatus?.connected && waStatus?.pairingCode && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
                Código de emparejamiento — ingrésalo en WhatsApp → Dispositivos vinculados → Vincular con número
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(waStatus.pairingCode.match(/.{1,4}/g) ?? [waStatus.pairingCode]).map((part: string, i: number) => (
                  <div key={i} style={{
                    background: 'var(--primary)', color: 'white',
                    fontSize: 22, fontWeight: 800, letterSpacing: 2,
                    padding: '10px 16px', borderRadius: 10, fontFamily: 'monospace',
                  }}>
                    {part}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <StatCard label="Alumnos activos"   value={stats.activeStudents   ?? 0} icon={<Users      size={20} color="var(--primary)" />} color="var(--primary-light)" />
        <StatCard label="Ingresos del mes"  value={formatCurrency(stats.monthRevenue  ?? 0)} icon={<TrendingUp  size={20} color="var(--success)" />} color="var(--success-bg)" />
        <StatCard label="Alumnos morosos"   value={stats.delinquentStudents ?? 0} icon={<AlertTriangle size={20} color="var(--warning)" />} color="var(--warning-bg)" />
        <StatCard label="Suspendidos"       value={stats.suspendedStudents  ?? 0} icon={<UserX      size={20} color="var(--danger)"  />} color="var(--danger-bg)" />
        <StatCard label="Ingresos del año"  value={formatCurrency(stats.yearRevenue   ?? 0)} icon={<DollarSign  size={20} color="var(--info)"    />} color="var(--info-bg)" />
        <StatCard label="Horarios activos"  value={stats.activeSchedules    ?? 0} icon={<Calendar   size={20} color="var(--primary)" />} color="var(--primary-light)" />
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>

        {/* Occupancy chart */}
        {schedules.length > 0 && (
          <Card style={{ gridColumn: 'span 2' }}>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--text-primary)' }}>
              Ocupación de horarios
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={schedules} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--text-muted)' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}
                  formatter={(v: number) => [`${v} alumnos`]}
                />
                <Bar dataKey="occupied" radius={[4,4,0,0]}>
                  {schedules.map((s, i) => (
                    <Cell key={i} fill={occupancyColor(s.pct)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Recent payments */}
        {stats.recentPayments?.length > 0 && (
          <Card>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 14, color: 'var(--text-primary)' }}>
              Pagos recientes
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {stats.recentPayments.slice(0, 6).map((pay: { id: string; student: { name: string }; amount: number; type: string; createdAt: string }) => (
                <div key={pay.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{pay.student?.name}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(pay.createdAt)}</p>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)', flexShrink: 0 }}>
                    {formatCurrency(pay.amount)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ── Pairing modal ── */}
      <Modal
        open={showPairModal}
        onClose={() => { setShowPairModal(false); setPairPhone(''); }}
        title="Vincular WhatsApp"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowPairModal(false); setPairPhone(''); }}>
              Cancelar
            </Button>
            <Button loading={pairLoading} onClick={handleStartPairing} icon={<QrCode size={14} />}>
              Generar código
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Ingresa el número de WhatsApp de la academia con código de país. Se generará un código de 8 dígitos para vincularlo como dispositivo secundario.
          </p>
          <Input
            label="Número con código de país"
            placeholder="5217821234567"
            value={pairPhone}
            onChange={e => setPairPhone(e.target.value)}
          />
          <div style={{ padding: '10px 14px', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--info)' }}>
            Ejemplo: número <strong>782 123 4567</strong> de México → ingresa <strong>5217821234567</strong>
          </div>
        </div>
      </Modal>
    </div>
  );
}
