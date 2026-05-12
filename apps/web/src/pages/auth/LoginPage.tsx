import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Waves, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { toast } from '../../components/ui/Toast';
import { ToastContainer } from '../../components/ui/Toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const { login } = useAuthStore();
  const navigate = useNavigate();

  const validate = () => {
    const e: typeof errors = {};
    if (!email) e.email = 'El email es requerido';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Email inválido';
    if (!password) e.password = 'La contraseña es requerida';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Credenciales incorrectas';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        background: 'var(--bg)',
      }}>
        {/* Left — decorative panel */}
        <div style={{
          width: '45%',
          background: 'var(--sidebar-bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: -80, right: -80, width: 280, height: 280, borderRadius: '50%', background: 'rgba(0,87,255,0.12)' }} />
          <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(0,87,255,0.08)' }} />
          <div style={{ position: 'absolute', top: '40%', right: 30, width: 80, height: 80, borderRadius: '50%', background: 'rgba(0,87,255,0.06)' }} />

          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
              boxShadow: '0 8px 24px rgba(0,87,255,0.3)',
            }}>
              <Waves size={30} color="white" />
            </div>

            <h1 style={{ fontSize: 36, fontWeight: 700, color: 'white', letterSpacing: '-0.8px', marginBottom: 12 }}>
              OLIMPO
            </h1>
            <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
              Sistema de gestión integral para academias de natación
            </p>

            <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
              {[
                'Control de alumnos y horarios',
                'Recordatorios automáticos por WhatsApp',
                'Reportes financieros en tiempo real',
                'Gestión de pagos y mensualidades',
              ].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right — login form */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
        }}>
          <div style={{ width: '100%', maxWidth: 400 }} className="animate-fadeIn">
            <h2 style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.4px', marginBottom: 6 }}>
              Bienvenido
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 36 }}>
              Ingresa con tu cuenta de administrador o maestro
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Email */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Correo electrónico
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setErrors(prev => ({ ...prev, email: undefined })); }}
                    placeholder="admin@olimpo.mx"
                    autoComplete="email"
                    style={{
                      width: '100%', height: 42,
                      paddingLeft: 34, paddingRight: 12,
                      fontSize: 14,
                      border: `1px solid ${errors.email ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-sans)',
                      outline: 'none',
                      transition: 'border-color .15s, box-shadow .15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'; }}
                    onBlur={e => { e.target.style.borderColor = errors.email ? 'var(--danger)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
                {errors.email && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{errors.email}</p>}
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Contraseña
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrors(prev => ({ ...prev, password: undefined })); }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    style={{
                      width: '100%', height: 42,
                      paddingLeft: 34, paddingRight: 40,
                      fontSize: 14,
                      border: `1px solid ${errors.password ? 'var(--danger)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-sans)',
                      outline: 'none',
                      transition: 'border-color .15s, box-shadow .15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px var(--primary-light)'; }}
                    onBlur={e => { e.target.style.borderColor = errors.password ? 'var(--danger)' : 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.password && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{errors.password}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  height: 44, borderRadius: 'var(--radius-md)',
                  background: loading ? 'var(--primary-muted)' : 'var(--primary)',
                  color: 'white', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-sans)',
                  marginTop: 8,
                  transition: 'background .15s, transform .1s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
                onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = 'var(--primary-hover)'; }}
                onMouseLeave={e => { if (!loading) (e.currentTarget as HTMLElement).style.background = 'var(--primary)'; }}
              >
                {loading && (
                  <svg width="16" height="16" viewBox="0 0 24 24" style={{ animation: 'spin .7s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                {loading ? 'Ingresando...' : 'Ingresar al sistema'}
              </button>
            </form>

            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 32 }}>
              OLIMPO v1.0 · Sistema de gestión académica
            </p>
          </div>
        </div>
      </div>
      <ToastContainer />
    </>
  );
}
