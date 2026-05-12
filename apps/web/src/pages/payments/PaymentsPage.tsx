// PaymentsPage.tsx
import { SectionHeader } from '../../components/ui';

export default function PaymentsPage() {
  return (
    <div className="animate-fadeIn">
      <SectionHeader title="Pagos" subtitle="Registro y seguimiento de mensualidades" />
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Usa la vista de detalle de cada alumno para registrar pagos individuales. El reporte financiero global está disponible en la sección Reportes.
      </p>
    </div>
  );
}
