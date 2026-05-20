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
  BABY_PHASE1:  'Natación Bebés Fase 1 (4-12 meses)',
  BABY_PHASE2:  'Natación Bebés Fase 2 (1-3 años)',
  BABY_PHASE3:  'Natación Bebés Fase 3 (3-5 años)',
  GROUP_CHILD:  'Natación Grupal',
  GROUP_ADULT:  'Natación Adultos Grupal',
  FREE_ACCESS:  'Acceso Libre',
  AQUA_THERAPY: 'Terapia Acuática',
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
