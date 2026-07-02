/**
 * Script para consola del navegador
 *
 * 1. Inicia sesión en el panel de administración
 * 2. Setea paymentDay=1 a todos los alumnos (excepto teléfonos 0000)
 * 3. Dispara los recordatorios de pago por WhatsApp
 *
 * USO:
 *   Abre la consola del navegador (F12) en el panel de OLIMPO,
 *   pega TODO este código y presiona Enter.
 *   Luego escribe:   start()
 *
 *   Si ya tienes sesión iniciada en el panel, usa:   startAuto()
 */

const API = window.location.origin + '/api';

let TOKEN = '';

// ─── Login manual ─────────────────────────────────────
async function login(email, password) {
  const res = await fetch(API + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || 'Login falló');
  TOKEN = body.data.accessToken;
  console.log('✅ Sesión iniciada como:', body.data.user.name, `(rol: ${body.data.user.role})`);
  return body.data;
}

// ─── Login automático (si ya hay sesión en el panel) ──
async function loginAuto() {
  // Intenta obtener el token de sessionStorage / localStorage
  const key = Object.keys(sessionStorage).find(k => k.includes('auth')) ||
              Object.keys(localStorage).find(k => k.includes('auth'));
  if (!key) throw new Error('No se encontró sesión activa. Usa login(email, password) primero.');
  const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
  try {
    const parsed = JSON.parse(raw);
    TOKEN = parsed?.accessToken || parsed?.state?.accessToken || parsed;
    if (!TOKEN.startsWith('eyJ')) throw new Error('Token inválido');
    console.log('✅ Token recuperado de sesión existente');
  } catch {
    throw new Error('No se pudo leer el token de sesión. Usa login(email, password).');
  }
}

// ─── Headers de autenticación ─────────────────────────
function auth() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + TOKEN,
  };
}

// ─── Obtener TODOS los alumnos (con paginación) ──────
async function fetchAllStudents() {
  let page = 1, all = [];
  while (true) {
    const res = await fetch(`${API}/students?page=${page}&limit=100`, { headers: auth() });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'Error al listar alumnos');
    all.push(...body.data);
    console.log(`  Página ${page}/${body.meta.pages}: ${body.data.length} alumnos`);
    if (page >= body.meta.pages) break;
    page++;
  }
  console.log(`📊 Total alumnos: ${all.length}`);
  return all;
}

// ─── Setear paymentDay=1 (excepto 0000) ──────────────
async function setPaymentDay(students) {
  const filtered = students.filter(s => !s.phone.startsWith('0000'));
  console.log(`📱 Alumnos con teléfono válido: ${filtered.length} (${students.length - filtered.length} omitidos por 0000)`);

  let updated = 0;
  for (let i = 0; i < filtered.length; i++) {
    const s = filtered[i];
    if (s.paymentDay === 1) {
      console.log(`  [${i + 1}/${filtered.length}] ⏭️ ${s.name} — ya tiene paymentDay=1`);
      continue;
    }
    const res = await fetch(`${API}/students/${s.id}`, {
      method: 'PATCH',
      headers: auth(),
      body: JSON.stringify({ paymentDay: 1 }),
    });
    const body = await res.json();
    if (!res.ok) {
      console.error(`  [${i + 1}/${filtered.length}] ❌ ${s.name} — ${body.message}`);
    } else {
      updated++;
      console.log(`  [${i + 1}/${filtered.length}] ✅ ${s.name} → paymentDay=1`);
    }
    // Pequeña pausa para no saturar
    await new Promise(r => setTimeout(r, 100));
  }
  console.log(`✅ paymentDay actualizado a 1 en ${updated} alumnos`);
  return updated;
}

// ─── Disparar recordatorios ───────────────────────────
async function triggerReminders() {
  console.log('⏳ Enviando recordatorios de pago...');
  const res = await fetch(API + '/students/trigger-reminders', {
    method: 'POST',
    headers: auth(),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || 'Error al enviar recordatorios');
  console.log('✅', body.message);
  return body;
}

// ─── START (login manual) ─────────────────────────────
async function start(email, password) {
  console.clear();
  console.log('🚀 INICIANDO PROCESO DE RECORDATORIOS\n');
  try {
    await login(email, password);
    console.log('\n📋 Obteniendo lista de alumnos...');
    const students = await fetchAllStudents();
    console.log('\n📝 Configurando fecha de pago...');
    await setPaymentDay(students);
    console.log('\n📤 Disparando recordatorios WhatsApp...');
    await triggerReminders();
    console.log('\n🎉 PROCESO COMPLETADO');
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
  }
}

// ─── START AUTO (usa sesión existente) ────────────────
async function startAuto() {
  console.clear();
  console.log('🚀 INICIANDO PROCESO DE RECORDATORIOS (auto)\n');
  try {
    await loginAuto();
    console.log('\n📋 Obteniendo lista de alumnos...');
    const students = await fetchAllStudents();
    console.log('\n📝 Configurando fecha de pago...');
    await setPaymentDay(students);
    console.log('\n📤 Disparando recordatorios WhatsApp...');
    await triggerReminders();
    console.log('\n🎉 PROCESO COMPLETADO');
  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
  }
}
