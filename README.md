# OLIMPO — Sistema de Gestión Integral

Plataforma de gestión a medida para la **Academia de Natación OLIMPO** (Poza Rica de Hidalgo, Veracruz). Centraliza la operación administrativa, automatiza la comunicación con alumnos vía WhatsApp y ofrece paneles para administradores y maestros.

- **Web:** https://olimpo-web-nzvp.onrender.com
- **API:** https://olimpo-api-uptz.onrender.com
- **Especificación:** `Documentacion/Requerimientos_OLIMPO_AlecsStudio.docx`

## Funcionalidades principales

- **Gestión de alumnos:** registro vía bot de WhatsApp, estados (`PENDING_PAYMENT`, `ACTIVE`, `DELINQUENT`, `SUSPENDED`, `INACTIVE`), activación/suspensión manual, inscripción anual ($200 MXN), historial de pagos, búsqueda y paginación.
- **Gestión de maestros:** cuentas con email y contraseña, porcentaje de comisión, portal independiente con horarios y alumnos propios, detección de conflictos de horario.
- **Horarios y cupos:** horarios recurrentes vinculados a modalidad y maestro, cupo por slot, verificación en tiempo real, vista de ocupación con código de color.
- **Pagos:** inscripción anual, mensualidades por período (YYYY-MM), cálculo proporcional a mitad de mes, validación de duplicados, reactivación automática de morosos.
- **Bot de WhatsApp (Baileys):** responder automático que muestra los servicios de la academia y, ante cualquier selección, confirma que un asesor contactará al usuario en un máximo de 24 horas. No genera alumnos ni guarda datos.
- **Dashboard y reportes:** métricas de alumnos e ingresos, ocupación por horario, estado de WhatsApp en vivo, reporte financiero por período con exportación a Excel (dos hojas).
- **Cursos de verano:** estados `DRAFT → ACTIVE → INACTIVE → FINISHED`, instructores múltiples, inscripciones gestionadas por admin con confirmación/cancelación y notificación WhatsApp.
- **Servicios:** edición de modalidades (enum) y creación de servicios personalizados libres.

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma v5 |
| Base de datos | PostgreSQL (Supabase, connection pooling puerto 6543) |
| Cache / Colas | Redis (Upstash) + Bull (definido) |
| WhatsApp | Baileys (`@whiskeysockets/baileys`) con sesión persistida en DB |
| Frontend | React 18 + Vite + Zustand + React Query + TailwindCSS |
| Autenticación | JWT (8h) + refresh tokens rotativos (7 días), roles ADMIN / TEACHER |
| Automatizaciones | node-cron (cron jobs idempotentes con `automation_logs`) |
| Reportes | xlsx (Excel) |
| Validación | Zod |
| Deploy | Render (Web Service + Static Site) |
| Logs | Winston a stdout |

## Estructura del proyecto

```
olimpo/
├── apps/
│   ├── api/                  # Backend Node.js + Express
│   │   ├── prisma/
│   │   │   └── schema.prisma # 20 modelos + enums
│   │   └── src/
│   │       ├── adapters/     # WhatsApp (Baileys) + bot + plantillas
│   │       ├── config/       # env, database, redis, logger
│   │       ├── controllers/  # auth, webhook
│   │       ├── middleware/   # auth (roles), audit, error handler
│   │       ├── routes/       # auth, students, teachers, schedules,
│   │       │                 # payments, courses, modalities, reports, whatsapp
│   │       ├── scripts/      # seed de producción, SQL de migración
│   │       └── services/     # lógica de negocio
│   └── web/                  # Frontend React (Vite)
│       └── src/
│           ├── components/   # UI (DataTable, Modal, Toast) + layout
│           ├── hooks/        # useApi (React Query)
│           ├── pages/        # dashboard, students, teachers, schedules,
│           │                 # payments, courses, modalities, reports, auth
│           ├── services/     # cliente axios
│           ├── store/        # Zustand (auth)
│           └── utils/        # labels, colores de ocupación
├── scripts/                  # utilidades (trigger de recordatorios)
├── render.yaml               # config de deploy en Render
├── SETUP.md                  # guía de configuración paso a paso
└── package.json              # npm workspaces (apps/*)
```

## Setup local

Requisitos: **Node.js 20+**, cuenta de **Supabase** (PostgreSQL), **Redis** (local o Upstash).

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Completa en `apps/api/.env`:
- `DATABASE_URL` y `DIRECT_URL` (Supabase — Prisma pooler puerto 6543 y directo 5432)
- `JWT_SECRET` y `SETUP_TOKEN` (genera con `npm run generate:tokens --workspace=apps/api`)
- `REDIS_URL` (Upstash o local)
- `FRONTEND_URL` (http://localhost:5173)

El detalle completo está en [SETUP.md](SETUP.md).

### 3. Inicializar base de datos

```bash
cd apps/api
npx prisma db push
npx prisma generate
```

### 4. Crear el primer administrador

Levanta la API y llama al endpoint de setup (solo disponible en el primer uso):

```bash
npm run dev
```

```bash
curl -X POST http://localhost:4000/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Administrador OLIMPO",
    "email": "admin@olimpo.mx",
    "password": "TuPasswordSegura123",
    "setupToken": "EL_SETUP_TOKEN"
  }'
```

El endpoint se auto-desactiva tras crear el primer admin.

### 5. Levantar el sistema

```bash
npm run dev
```

- API: http://localhost:4000 (`/api/health`)
- Web: http://localhost:5173

### 6. Seed de producción (opcional)

Crea las modalidades reales y dos maestros de prueba:

```bash
npm run seed:production --workspace=apps/api
```

## WhatsApp (Baileys)

El bot usa **Baileys** (WhatsApp Web), no Twilio. La sesión se persiste en la tabla `whatsapp_sessions` para reconectarse sin re-escanear.

- **Estado:** `GET /api/whatsapp/status` (admin)
- **Vincular:** `GET /api/whatsapp/qr?token=<JWT>` — página con QR para escanear desde WhatsApp
- **Limpiar sesión:** `DELETE /api/whatsapp/session` (genera QR nuevo)

### Flujo de conversación del bot

El bot tiene un único flujo simple de 2 pasos. No crea alumnos, no aparta lugares y no registra datos:

1. **Inicio** — Cuando un usuario inicia la conversación o saluda (por ejemplo "Hola", "Buenas"),
   el bot responde con la lista de servicios de la academia:

   ```
   Gracias por comunicarte con nosotros, estos son nuestros servicios:

   • Natación bebés de 5 - 12 meses
   • Natación bebés de 1 - 3 años
   • Natación bebés de 3 a 5 años
   • Natación grupal
   • Natación personalizada
   • Natación Acceso libre
   • Terapia acuatica
   • Calistenia
   ```

2. **Selección de servicio** — Ante cualquier respuesta del usuario, el bot confirma el seguimiento:

   ```
   Gracias por tu interés.

   En un máximo de 24 horas recibirás respuesta de parte de nuestro equipo.

   ¡Gracias por comunicarte con OLIMPO!
   ```

Tras el segundo mensaje, el bot **deja de responder**: el encargado toma la conversación manualmente
sin que el bot interfiera. El bot solo mantiene el paso de la conversación en la tabla `bot_sessions`
(no almacena información del usuario); para reactivarlo en un número, borra su registro (paso `DONE`).

### Nota histórica

El funcionamiento anterior del bot (clase muestra, selección de horarios, apartado de lugar, cursos de
verano, datos de pago, cancelación/cambio de cita y alta automática de alumnos) fue **reemplazado** por
el flujo descrito arriba. Esas funcionalidades fueron retiradas: se eliminaron los endpoints
`GET /api/courses/active` y `POST /api/courses/:id/enroll` (exclusivos del bot), y los templates
no utilizados de `adapters/templates.ts`.

## Endpoints principales

```
# Auth
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me

# Setup (primer uso)
POST   /api/setup

# Alumnos
GET    /api/students                  # paginado + filtros (status, search)
POST   /api/students                  # alta manual
GET    /api/students/:id
PATCH  /api/students/:id
POST   /api/students/:id/activate     # asignar horario + maestro
POST   /api/students/:id/suspend      # libera horario y notifica
POST   /api/students/:id/assign-schedule
POST   /api/students/trigger-reminders

# Pagos
GET    /api/payments/student/:studentId
POST   /api/payments/enrollment       # inscripción anual ($200)
POST   /api/payments/monthly          # mensualidad (YYYY-MM, proporcional)

# Horarios
GET    /api/schedules
POST   /api/schedules

# Maestros
GET    /api/teachers
POST   /api/teachers
PATCH  /api/teachers/:id
POST   /api/teachers/:id/reset-password
GET    /api/teachers/my-students
GET    /api/teachers/my-schedules
POST   /api/teachers/my-schedules
PATCH  /api/teachers/my-schedules/:id
DELETE /api/teachers/my-schedules/:id
PATCH  /api/teachers/my-schedules/:id/pair

# Reportes
GET    /api/reports/dashboard
GET    /api/reports/financial?from=YYYY-MM-DD&to=YYYY-MM-DD
GET    /api/reports/financial/export  # Excel (2 hojas)

# Cursos de verano
GET    /api/courses
GET    /api/courses/:id
POST   /api/courses
PATCH  /api/courses/:id
PATCH  /api/courses/:id/enrollments/:enrollmentId   # confirmar/cancelar
GET    /api/courses/my-courses

# Modalidades y servicios
GET    /api/modalities
PATCH  /api/modalities/:id
POST   /api/modalities/services
PATCH  /api/modalities/services/:id
DELETE /api/modalities/services/:id

# WhatsApp
GET    /api/whatsapp/status
GET    /api/whatsapp/qr
DELETE /api/whatsapp/session

# Otros
GET    /api/health
```

## Automatizaciones

- **Recordatorios de pago:** cron diario a las 9:00 AM (zona `America/Mexico_City`) que envía recordatorio cuando la fecha de pago (`paymentDay`) del alumno está dentro de ±5 días. Idempotente mediante la tabla `automation_logs`.
- Las automatizaciones se registran solo si Redis está disponible (degradación controlada si no).

## Modelos de base de datos

19 modelos documentados en la especificación (más `ScheduleModality`): `User`, `UserSession`, `Teacher`, `Student`, `ModalityConfig`, `Service`, `Schedule`, `ScheduleSlot`, `Payment`, `WaitingList`, `BotSession`, `RegulationSignature`, `WhatsAppSession`, `NotificationLog`, `AutomationLog`, `AuditLog`, `SummerCourse`, `SummerCourseTeacher`, `SummerCourseEnrollment`.

## Deploy en Render

El archivo `render.yaml` define dos servicios:

- **API** (`olimpo-api`): Web Service Node, health check `/api/health`, build con `prisma generate && prisma db push`.
- **Web** (`olimpo-web`): Static Site con rewrite a `/index.html` (SPA).

Al primer deploy configura `SETUP_TOKEN` y `ALLOW_SETUP=true` para crear el admin; luego retíralos.
