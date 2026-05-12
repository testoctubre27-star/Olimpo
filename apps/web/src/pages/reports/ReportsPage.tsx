import { useState } from 'react';
import { Download } from 'lucide-react';
import { useFinancialReport } from '../../hooks/useApi';
import { Button, SectionHeader, Card, PageSpinner } from '../../components/ui';
import { DataTable } from '../../components/ui/DataTable';
import { formatCurrency, formatDate, PAYMENT_TYPE_LABEL } from '../../utils/labels';
import { api } from '../../services/api';
import { toast } from '../../components/ui/Toast';
import type { Payment } from '../../hooks/useApi';

export default function ReportsPage() {
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [to, setTo]     = useState(now.toISOString().slice(0, 10));
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useFinancialReport(from, to);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/reports/financial/export?from=${from}&to=${to}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a');
      a.href = url;
      a.download = `olimpo-reporte-${from.slice(0, 7)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Reporte exportado correctamente');
    } catch {
      toast.error('Error al exportar');
    } finally {
      setExporting(false);
    }
  };

  const columns = [
    { key: 'student',  header: 'Alumno',   render: (r: Payment) => <span style={{ fontSize: 13, fontWeight: 500 }}>{r.student?.name ?? '—'}</span> },
    { key: 'type',     header: 'Tipo',     width: 150, render: (r: Payment) => <span style={{ fontSize: 13 }}>{PAYMENT_TYPE_LABEL[r.type] ?? r.type}</span> },
    { key: 'period',   header: 'Período',  width: 100, render: (r: Payment) => <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{r.period ?? '—'}</span> },
    { key: 'amount',   header: 'Monto',    width: 120, align: 'right' as const, render: (r: Payment) => <span style={{ fontSize: 13, fontWeight: 600 }}>{formatCurrency(r.amount)}</span> },
    { key: 'date',     header: 'Fecha',    width: 120, render: (r: Payment) => <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{formatDate(r.confirmedAt)}</span> },
    { key: 'notes',    header: 'Notas',    render: (r: Payment) => <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.notes ?? '—'}</span> },
  ];

  return (
    <div className="animate-fadeIn">
      <SectionHeader
        title="Reportes financieros"
        subtitle="Ingresos y movimientos del período seleccionado"
        actions={
          <Button size="sm" variant="secondary" icon={<Download size={14} />} loading={exporting} onClick={handleExport}>
            Exportar Excel
          </Button>
        }
      />

      {/* Date range */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Desde</p>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
        </div>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>Hasta</p>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ height: 38, padding: '0 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)', color: 'var(--text-primary)', background: 'var(--surface)', outline: 'none' }} />
        </div>
      </div>

      {/* Summary */}
      {data && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 32 }}>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL DEL PERÍODO</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>{formatCurrency(data.total)}</p>
            </div>
            <div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>PAGOS REGISTRADOS</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>{data.payments.length}</p>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? <PageSpinner /> : (
        <DataTable
          columns={columns}
          data={data?.payments ?? []}
          loading={isLoading}
          rowKey={r => r.id}
          emptyMessage="Sin pagos en el período seleccionado"
        />
      )}
    </div>
  );
}
