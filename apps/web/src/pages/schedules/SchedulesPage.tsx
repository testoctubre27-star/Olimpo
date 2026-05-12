import { useSchedules } from '../../hooks/useApi';
import { SectionHeader, Card, Badge, PageSpinner } from '../../components/ui';
import { DAY_LABEL, MODALITY_LABEL, occupancyColor } from '../../utils/labels';

export default function SchedulesPage() {
  const { data: schedules, isLoading } = useSchedules();

  if (isLoading) return <PageSpinner />;

  const grouped: Record<number, typeof schedules> = {};
  schedules?.forEach(s => {
    if (!grouped[s.dayOfWeek]) grouped[s.dayOfWeek] = [];
    grouped[s.dayOfWeek]!.push(s);
  });

  return (
    <div className="animate-fadeIn">
      <SectionHeader title="Horarios" subtitle="Vista semanal de disponibilidad" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b)).map(([day, slots]) => (
          <div key={day}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {DAY_LABEL[Number(day)]}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {slots?.map(s => {
                const pct = Math.round((s.slots.length / s.modality.maxCapacity) * 100);
                return (
                  <Card key={s.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{s.startTime} – {s.endTime}</p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{MODALITY_LABEL[s.modality.modality] ?? s.modality.name}</p>
                      </div>
                      <Badge variant={pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success'}>{pct}%</Badge>
                    </div>
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, marginBottom: 8 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: occupancyColor(pct), borderRadius: 99 }} />
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.slots.length} / {s.modality.maxCapacity} alumnos
                      {s.waitingList.length > 0 && <span style={{ color: 'var(--warning)', marginLeft: 6 }}>· {s.waitingList.length} en espera</span>}
                    </p>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
        {(!schedules || schedules.length === 0) && (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No hay horarios configurados</p>
        )}
      </div>
    </div>
  );
}
