export const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT:   'Pendiente de pago',
  ACTIVE:            'Activo',
  DELINQUENT:        'Moroso',
  SUSPENDED:         'Suspendido',
  INACTIVE:          'Inactivo',
};

export const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  PENDING_PAYMENT:   'default',
  ACTIVE:            'success',
  DELINQUENT:        'warning',
  SUSPENDED:         'danger',
  INACTIVE:          'default',
};

export const MODALITY_LABEL: Record<string, string> = {
  PERSONAL_CHILD: 'Personalizado infantil',
  GROUP_CHILD:    'Grupal infantil',
  GROUP_ADULT:    'Grupal adultos',
  FREE_ACCESS:    'Acceso libre',
  AQUA_THERAPY:   'Terapia acuática',
};

export const PAYMENT_TYPE_LABEL: Record<string, string> = {
  ENROLLMENT:   'Inscripción anual',
  MONTHLY:      'Mensualidad',
  PROPORTIONAL: 'Proporcional',
};

export const DAY_LABEL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function formatCurrency(amount: string | number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(amount));
}

export function formatDate(date?: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) return `(${clean.slice(0,3)}) ${clean.slice(3,6)}-${clean.slice(6)}`;
  return phone;
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function occupancyColor(pct: number): string {
  if (pct >= 90) return 'var(--danger)';
  if (pct >= 70) return 'var(--warning)';
  return 'var(--success)';
}
