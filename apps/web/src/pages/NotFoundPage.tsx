import { useNavigate } from 'react-router-dom';
import { Waves } from 'lucide-react';
import { Button } from '../components/ui';

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: 'var(--bg)' }}>
      <Waves size={40} color="var(--primary)" />
      <h1 style={{ fontSize: 64, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-2px', lineHeight: 1 }}>404</h1>
      <p style={{ fontSize: 16, color: 'var(--text-muted)' }}>Esta página no existe</p>
      <Button onClick={() => navigate('/dashboard')}>Ir al dashboard</Button>
    </div>
  );
}
