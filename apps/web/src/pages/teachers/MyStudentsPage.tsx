import { useMyStudents } from '../../hooks/useApi';
import { SectionHeader, Badge, PageSpinner } from '../../components/ui';
import { STATUS_LABEL, STATUS_BADGE, MODALITY_LABEL, DAY_LABEL, formatDate, formatCurrency } from '../../utils/labels';

export default function MyStudentsPage() {
  const { data: students, isLoading } = useMyStudents();

  if (isLoading) return <PageSpinner />;

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Mis alumnos"
        subtitle={`${students?.length ?? 0} alumnos asignados a tu cargo`}
      />

      {!students?.length && (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          No tienes alumnos asignados actualmente.
        </p>
      )}

      {(students?.length ?? 0) > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1.5fr 1fr', gap: 12, padding: '10px 18px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
            {['Alumno', 'Estado', 'Modalidad', 'Horario', 'Último pago'].map(h => (
              <p key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</p>
            ))}
          </div>

          {/* Rows */}
          {students!.map((s, i) => {
            const slot    = (s as { scheduleSlots?: { schedule: { dayOfWeek: number; startTime: string; endTime: string; modality?: { name: string } } }[] }).scheduleSlots?.[0];
            const lastPay = s.payments?.[0];

            const scheduleLabel = slot
              ? `${DAY_LABEL[slot.schedule.dayOfWeek]} ${slot.schedule.startTime}–${slot.schedule.endTime}`
              : '—';

            const modalityLabel = MODALITY_LABEL[s.modality] ?? s.modality;

            return (
              <div key={s.id} style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr 1.5fr 1fr',
                gap: 12, padding: '13px 18px',
                borderBottom: i < students!.length - 1 ? '1px solid var(--border)' : 'none',
                alignItems: 'center',
              }}>
                {/* Name + phone */}
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{s.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{s.phone}</p>
                </div>

                {/* Status */}
                <Badge variant={STATUS_BADGE[s.status] ?? 'default'} dot>
                  {STATUS_LABEL[s.status] ?? s.status}
                </Badge>

                {/* Modality */}
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{modalityLabel}</p>

                {/* Schedule */}
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{scheduleLabel}</p>

                {/* Last payment */}
                <div>
                  {lastPay ? (
                    <>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--success)' }}>
                        {formatCurrency(lastPay.amount)}
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                        {formatDate(lastPay.confirmedAt ?? (lastPay as { createdAt?: string }).createdAt ?? '')}
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
