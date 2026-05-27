import { useSchedules } from '../../hooks/useApi';
import { SectionHeader, Card, Badge, PageSpinner } from '../../components/ui';
import { DAY_LABEL, MODALITY_LABEL, occupancyColor } from '../../utils/labels';

export default function SchedulesPage() {
  const { data: schedules, isLoading } = useSchedules();

  if (isLoading) return <PageSpinner />;

  // Group by day
  const grouped: Record<number, NonNullable<typeof schedules>> = {};
  (schedules ?? []).forEach(s => {
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
              {slots.map(s => {
                const enrolled = s.slots?.length ?? 0;

                // Capacity: prefer explicit capacity field, fallback to modality maxCapacity
                const totalCap = (s as { capacity?: number }).capacity
                  ?? (s as { modality?: { maxCapacity: number } }).modality?.maxCapacity
                  ?? 1;

                const pct = Math.round((enrolled / totalCap) * 100);

                // Modality label: support multi-modality (new) and single (legacy)
                const multiMods = (s as { modalities?: { modality: { name: string; modality: string } }[] }).modalities;
                const singleMod = (s as { modality?: { name: string; modality: string } }).modality;

                const modalityLabel = multiMods && multiMods.length > 0
                  ? multiMods.map(m => MODALITY_LABEL[m.modality.modality] ?? m.modality.name).join(', ')
                  : singleMod
                  ? (MODALITY_LABEL[singleMod.modality] ?? singleMod.name)
                  : '—';

                const waitingCount = (s as { waitingList?: unknown[] }).waitingList?.length ?? 0;

                return (
                  <Card key={s.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
                          {s.startTime} – {s.endTime}
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {modalityLabel}
                        </p>
                      </div>
                      <Badge variant={pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success'}>
                        {pct}%
                      </Badge>
                    </div>
                    <div style={{ height: 4, background: 'var(--border)', borderRadius: 99, marginBottom: 8 }}>
                      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: occupancyColor(pct), borderRadius: 99 }} />
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {enrolled} / {totalCap} alumnos
                      {waitingCount > 0 && (
                        <span style={{ color: 'var(--warning)', marginLeft: 6 }}>· {waitingCount} en espera</span>
                      )}
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
