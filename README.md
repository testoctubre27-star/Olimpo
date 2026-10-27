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

El bot funciona con un menú interactivo gestionado por sesiones en `bot_sessions`:

1. **Menú principal** — Al escribir `hola`, `menú` o `inicio` se muestra el menú con opciones:
   1. 👶🏼 Clase bebés 5 meses - 5 años (Clase muestra)
   2. 🌞 Cursos de verano (inscripción directa)
   3. 👦🏻 Clase grupal: 5 años en adelante (información)
   4. 🙋🏻 Clase grupal: Adultos (información)
   5. 💳 Realizar un pago (datos bancarios)
   6. ❌ Cancelar / Cambiar cita (gestión con administración)

2. **Cursos de verano** — Al seleccionar la opción 2, el bot lista los cursos activos (`SummerCourse` con estado `ACTIVE`). El usuario selecciona un curso, ingresa el nombre del alumno(a), confirma con `SI`/`NO` y se crea una solicitud de inscripción (`SummerCourseEnrollment`) en estado `PENDING`. El administrador confirma o cancela desde el panel, con notificación por WhatsApp.

3. **Pre-inscripción regular** — Para inscribirse a clases regulares, el bot guía paso a paso: nombre completo → selección de modalidad (`ModalityConfig`) → selección de horario disponible (con cupo) → aceptación de reglamento (`ACEPTO`/`NO ACEPTO`). Al aceptar se registra la firma en `RegulationSignature` y se crea/actualiza el alumno con estado `PENDING_PAYMENT`, asignando un `ScheduleSlot` activo. La confirmación final y asignación definitiva la realiza un administrador.

4. **Información y pagos** — Las opciones de información y datos de pago se responden con mensajes informativos; para cambios/cancelaciones se indica contactar a administración.

El estado de la conversación se mantiene en `bot_sessions` (`data.step`).
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
