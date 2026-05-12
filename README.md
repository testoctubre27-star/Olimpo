# OLIMPO — Sistema de Gestión Integral

Academia de natación digital: WhatsApp bot + panel administrativo + control de pagos.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + TailwindCSS + Zustand |
| Backend | Node.js + Express + TypeScript |
| ORM | Prisma v5 |
| Base de datos | PostgreSQL (Supabase) |
| Cache / Queues | Redis + Bull |
| WhatsApp | Twilio |
| Deploy | Render (frontend + API) |

## Estructura del proyecto

```
olimpo/
├── apps/
│   ├── api/            # Backend Node.js
│   │   └── src/
│   │       ├── adapters/   # WhatsApp bot + templates
│   │       ├── config/     # DB, Redis, logger, env
│   │       ├── controllers/
│   │       ├── middleware/  # Auth, error handler, audit
│   │       ├── prisma/     # Schema
│   │       ├── routes/
│   │       ├── services/   # Business logic
│   │       └── utils/
│   └── web/            # Frontend React
│       └── src/
│           ├── components/
│           ├── pages/
│           ├── services/   # API client
│           └── store/      # Zustand
├── packages/
│   └── shared/         # Types compartidos
└── render.yaml         # Deploy config
```

## Setup local

### Requisitos
- Node.js 20+
- PostgreSQL (o cuenta Supabase)
- Redis local (`redis-server`) o URL remota

### 1. Clonar y instalar

```bash
git clone <repo>
cd olimpo
npm install
```

### 2. Configurar variables de entorno

```bash
cp apps/api/.env.example apps/api/.env
# Editar apps/api/.env con tus credenciales
```

### 3. Inicializar base de datos

```bash
cd apps/api
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Crear primer usuario admin

```bash
# Ejecutar script de seed
npx ts-node src/scripts/seed.ts
```

### 5. Levantar desarrollo

```bash
# Desde la raíz del proyecto
npm run dev
```

- API: http://localhost:4000
- Web: http://localhost:5173
- API Health: http://localhost:4000/api/health

## Endpoints principales

```
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/auth/me

GET    /api/students
GET    /api/students/:id
POST   /api/students/:id/activate
POST   /api/students/:id/suspend

POST   /api/payments/enrollment
POST   /api/payments/monthly
GET    /api/payments/student/:studentId

GET    /api/schedules
POST   /api/schedules

GET    /api/reports/dashboard
GET    /api/reports/financial
GET    /api/reports/financial/export

POST   /api/webhook/whatsapp
```

## Deploy en Render

1. Crear cuenta en [render.com](https://render.com)
2. Importar repositorio
3. Render detecta `render.yaml` automáticamente
4. Configurar variables de entorno sensibles en el dashboard de Render
5. Conectar Supabase como base de datos

## Twilio (WhatsApp)

1. Crear cuenta en [twilio.com](https://twilio.com)
2. Activar WhatsApp Sandbox
3. Configurar webhook URL: `https://olimpo-api.onrender.com/api/webhook/whatsapp`
4. Agregar credenciales al `.env`

## Bloques de desarrollo

| # | Bloque | Estado |
|---|--------|--------|
| 1 | Base del proyecto + estructura | ✅ |
| 2 | Autenticación (JWT + roles) | ✅ |
| 3 | Prisma schema + modelos | ✅ |
| 4 | WhatsApp bot (Twilio + state machine) | ✅ |
| 5 | Gestión de alumnos (backend) | ✅ |
| 6 | Control de pagos | ✅ |
| 7 | Automatizaciones (cron jobs) | ✅ |
| 8 | Reportes + exportación Excel | ✅ |
| 9 | Frontend React (estructura + router) | ✅ |
| 10 | UI Dashboard + páginas | 🟡 En progreso |
| 11 | Deploy Render | ⬜ Pendiente |
