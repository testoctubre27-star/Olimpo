import { create } from 'zustand';
import { useEffect, ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  add: (type: ToastType, message: string) => void;
  remove: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  add: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    set(s => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000);
  },
  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

// Convenience helpers
export const toast = {
  success: (msg: string) => useToastStore.getState().add('success', msg),
  error:   (msg: string) => useToastStore.getState().add('error', msg),
  info:    (msg: string) => useToastStore.getState().add('info', msg),
};

const icons: Record<ToastType, ReactNode> = {
  success: <CheckCircle size={16} color="var(--success)" />,
  error:   <AlertCircle size={16} color="var(--danger)" />,
  info:    <Info        size={16} color="var(--info)" />,
};

const toastBg: Record<ToastType, string> = {
  success: 'var(--success-bg)',
  error:   'var(--danger-bg)',
  info:    'var(--info-bg)',
};

export function ToastContainer() {
  const { toasts, remove } = useToastStore();

  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className="animate-slideIn"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${t.type === 'success' ? 'var(--success)' : t.type === 'error' ? 'var(--danger)' : 'var(--info)'}`,
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            maxWidth: 360,
            pointerEvents: 'all',
            background: toastBg[t.type],
          }}
        >
          {icons[t.type]}
          <p style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{t.message}</p>
          <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
