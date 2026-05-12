import { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './index';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  render?: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pagination?: {
    page: number;
    pages: number;
    total: number;
    onPage: (p: number) => void;
  };
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  background: 'var(--bg)',
  borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 14,
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'middle',
};

export function DataTable<T>({ columns, data, loading, emptyMessage = 'Sin resultados', rowKey, onRowClick, pagination }: TableProps<T>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={String(col.key)} style={{ ...thStyle, width: col.width, textAlign: col.align ?? 'left' }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {columns.map(col => (
                      <td key={String(col.key)} style={tdStyle}>
                        <div
                          className="skeleton"
                          style={{ height: 16, width: `${50 + Math.random() * 40}%`, borderRadius: 4 }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : data.length === 0
              ? (
                <tr>
                  <td colSpan={columns.length} style={{ ...tdStyle, textAlign: 'center', padding: '40px 24px', color: 'var(--text-muted)' }}>
                    {emptyMessage}
                  </td>
                </tr>
              )
              : data.map(row => (
                <tr
                  key={rowKey(row)}
                  onClick={() => onRowClick?.(row)}
                  style={{
                    cursor: onRowClick ? 'pointer' : 'default',
                    transition: 'background .1s',
                  }}
                  onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {columns.map(col => (
                    <td key={String(col.key)} style={{ ...tdStyle, textAlign: col.align ?? 'left' }}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key as string] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {pagination && pagination.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {pagination.total} resultado{pagination.total !== 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Button
              variant="secondary" size="sm"
              icon={<ChevronLeft size={14} />}
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPage(pagination.page - 1)}
            >
              Anterior
            </Button>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '0 4px' }}>
              {pagination.page} / {pagination.pages}
            </span>
            <Button
              variant="secondary" size="sm"
              iconRight={<ChevronRight size={14} />}
              disabled={pagination.page >= pagination.pages}
              onClick={() => pagination.onPage(pagination.page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
