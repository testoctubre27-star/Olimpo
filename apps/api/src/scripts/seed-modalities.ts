/**
 * OLIMPO — Seed de modalidades
 *
 * Crea las 5 modalidades con precios de ejemplo.
 * Ejecución: npx ts-node src/scripts/seed-modalities.ts
 *
 * ⚠️  Modifica los precios antes de ejecutar en producción.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MODALITIES = [
  {
    modality: 'PERSONAL_CHILD' as const,
    name: 'Personalizado Infantil',
    description: 'Clase individual para niños. Un maestro dedicado por alumno.',
    maxCapacity: 1,
    monthlyFee: 800.00,
  },
  {
    modality: 'GROUP_CHILD' as const,
    name: 'Grupal Infantil',
    description: 'Grupos de hasta 8 niños por maestro.',
    maxCapacity: 8,
    monthlyFee: 500.00,
  },
  {
    modality: 'GROUP_ADULT' as const,
    name: 'Grupal Adultos',
    description: 'Clases grupales para adultos.',
    maxCapacity: 12,
    monthlyFee: 600.00,
  },
  {
    modality: 'FREE_ACCESS' as const,
    name: 'Acceso Libre',
    description: 'Acceso libre a la alberca en horarios disponibles.',
    maxCapacity: 20,
    monthlyFee: 400.00,
  },
  {
    modality: 'AQUA_THERAPY' as const,
    name: 'Terapia Acuática',
    description: 'Sesiones terapéuticas en el agua. Grupos reducidos.',
    maxCapacity: 4,
    monthlyFee: 900.00,
  },
];

async function main() {
  console.log('🌊 Iniciando seed de modalidades OLIMPO...\n');

  for (const m of MODALITIES) {
    const existing = await prisma.modalityConfig.findUnique({ where: { modality: m.modality } });

    if (existing) {
      console.log(`  ⏭  ${m.name} — ya existe, omitiendo`);
      continue;
    }

    await prisma.modalityConfig.create({ data: m });
    console.log(`  ✅  ${m.name} — creada ($${m.monthlyFee}/mes, max ${m.maxCapacity} alumnos)`);
  }

  console.log('\n✅ Seed completado. Modalidades disponibles en el sistema.');
  console.log('   Puedes modificar precios y capacidades desde Supabase Dashboard.\n');
}

main()
  .catch(e => { console.error('❌ Error en seed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
