/**
 * OLIMPO — Seed de datos reales de producción
 *
 * Crea las modalidades reales y 2 maestros de prueba.
 * Ejecutar: npm run seed:production
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const MODALITIES = [
  {
    modality: 'BABY_PHASE1' as const,
    name: 'Natación Bebés Fase 1',
    description: '4 a 12 meses. Motricidad gruesa. 30 min, 2 veces/semana. Maestra dedicada al bebé.',
    maxCapacity: 1,
    monthlyFee: 1100.00,
  },
  {
    modality: 'BABY_PHASE2' as const,
    name: 'Natación Bebés Fase 2',
    description: '1 a 3 años. Marcha. 30 min, 2 veces/semana. Maestra dedicada al bebé.',
    maxCapacity: 1,
    monthlyFee: 1100.00,
  },
  {
    modality: 'BABY_PHASE3' as const,
    name: 'Natación Bebés Fase 3',
    description: '3 a 5 años. Refinamiento de movimientos finos y gruesos. 30 min, 2 veces/semana. Maestra dedicada.',
    maxCapacity: 1,
    monthlyFee: 1100.00,
  },
  {
    modality: 'GROUP_CHILD' as const,
    name: 'Natación Grupal',
    description: '60 min, 2 veces/semana. Un maestro por grupo. Máximo 8 alumnos.',
    maxCapacity: 8,
    monthlyFee: 800.00,
  },
  {
    modality: 'GROUP_ADULT' as const,
    name: 'Natación Adultos Grupal',
    description: '60 min, 2 veces/semana. Un maestro por grupo. Máximo 10 alumnos.',
    maxCapacity: 10,
    monthlyFee: 800.00,
  },
  {
    modality: 'FREE_ACCESS' as const,
    name: 'Acceso Libre',
    description: 'Disponible lunes a viernes. No es clase dirigida. Máximo 20 personas.',
    maxCapacity: 20,
    monthlyFee: 1000.00,
  },
  {
    modality: 'AQUA_THERAPY' as const,
    name: 'Terapia Acuática',
    description: 'Rehabilitación y movilidad. Ideal para lesiones, adultos mayores o movilidad reducida. $350 por sesión individual.',
    maxCapacity: 4,
    monthlyFee: 1200.00,
  },
];

const TEACHERS = [
  {
    name: 'Maestra Prueba 1',
    email: 'maestra1@olimpo.mx',
    password: 'Olimpo2026$',
    phone: '5500000001',
    commissionPct: 40,
  },
  {
    name: 'Maestro Prueba 2',
    email: 'maestro2@olimpo.mx',
    password: 'Olimpo2026$',
    phone: '5500000002',
    commissionPct: 40,
  },
];

async function main() {
  console.log('\n🌊 OLIMPO — Seed de datos reales\n');

  console.log('📋 Creando modalidades...');
  for (const m of MODALITIES) {
    await prisma.modalityConfig.upsert({
      where: { modality: m.modality },
      update: { name: m.name, description: m.description, maxCapacity: m.maxCapacity, monthlyFee: m.monthlyFee },
      create: m,
    });
    console.log(`  ✅  ${m.name} — $${m.monthlyFee}/mes`);
  }

  console.log('\n👨‍🏫 Creando maestros de prueba...');
  for (const t of TEACHERS) {
    const existing = await prisma.user.findUnique({ where: { email: t.email } });
    if (existing) {
      console.log(`  ⏭  ${t.name} — ya existe`);
      continue;
    }
    const hashed = await bcrypt.hash(t.password, 12);
    const user = await prisma.user.create({
      data: { name: t.name, email: t.email, password: hashed, role: 'TEACHER', phone: t.phone },
    });
    await prisma.teacher.create({
      data: { userId: user.id, displayName: t.name, phone: t.phone, commissionPct: t.commissionPct },
    });
    console.log(`  ✅  ${t.name} — ${t.email}`);
  }

  console.log('\n✅ Seed completado.\n');
  console.log('Accesos de maestros de prueba:');
  TEACHERS.forEach(t => console.log(`  📧 ${t.email}  🔑 ${t.password}`));
  console.log('');
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
