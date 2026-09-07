# OLIMPO — Guía de configuración inicial

Esta guía te lleva desde cero hasta el sistema funcionando, paso a paso.

---

## Requisitos previos

| Herramienta | Versión mínima | Verificar con |
|-------------|---------------|---------------|
| Node.js     | 20.x          | `node -v`     |
| npm         | 9.x           | `npm -v`      |
| Git         | cualquiera    | `git -v`      |

> **Redis** se usa para la caché y los cron jobs. En desarrollo puedes usar
> [Redis Cloud free tier](https://redis.io/try-free/) si no quieres instalarlo localmente.

---

## Paso 1 — Clona el proyecto

```bash
git clone git@github.com:ErickBorgesGalindo/Olimpo.git
cd Olimpo
```

---

## Paso 2 — Obtén las URLs de conexión de Supabase

1. Ve a [supabase.com](https://supabase.com) → tu proyecto
2. Haz clic en el botón **"Connect"** (arriba a la derecha)
3. Selecciona la pestaña **"ORMs"** → **"Prisma"**
4. Copia las dos URLs que aparecen:
   - `DATABASE_URL` (connection pooling — puerto 6543)
   - `DIRECT_URL` (conexión directa — puerto 5432)

Se verán así:

```
DATABASE_URL="postgresql://postgres.dvqqzwupbeqfixmmpczs:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.dvqqzwupbeqfixmmpczs:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

---

## Paso 3 — Configura el `.env` del API

```bash
cd apps/api
cp .env.example .env
```

### 3.1 — Base de datos (las URLs del Paso 2)
```env
DATABASE_URL="postgresql://postgres.dvqqzwupbeqfixmmpczs:[TU-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.dvqqzwupbeqfixmmpczs:[TU-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

### 3.2 — JWT Secret y Setup Token (genera ambos)

El repo incluye un generador de tokens seguros:

```bash
node apps/api/src/scripts/generate-tokens.js
```

Copia los dos valores que imprime y pégalos en tu `.env`:

```env
JWT_SECRET=el_resultado_del_comando_anterior
SETUP_TOKEN=el_otro_resultado_del_comando_anterior
```

**Guarda el `SETUP_TOKEN`** — lo necesitarás en el Paso 6.

### 3.3 — Redis
```env
REDIS_URL=redis://localhost:6379
```
Si usas Redis Cloud / Upstash, pega la URL `rediss://...` que te dieron.

### 3.4 — CORS (frontend)
```env
FRONTEND_URL=http://localhost:5173
```

### 3.5 — API_URL
```env
API_URL=http://localhost:4000
```

---

## Paso 4 — Configura el `.env` del frontend

```bash
cd apps/web
cp .env.example .env
```

El archivo ya tiene el valor correcto para desarrollo local:
```env
VITE_API_URL=http://localhost:4000/api
```

---

## Paso 5 — Instala dependencias y aplica el schema

```bash
# Desde la raíz del proyecto
npm install

# Aplica el schema a Supabase (crea todas las tablas)
cd apps/api
npx prisma db push

# Genera el cliente de Prisma
npx prisma generate
```

Si ves `✓ Your database is now in sync with your Prisma schema`, todo está bien.

---

## Paso 6 — Crea el primer administrador

Levanta el servidor:

```bash
cd ../..
npm run dev
```

En otra terminal, llama al endpoint de setup (solo disponible en el primer uso):

```bash
curl -X POST http://localhost:4000/api/setup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Administrador OLIMPO",
    "email": "admin@olimpo.mx",
    "password": "TuPasswordSegura123",
    "setupToken": "EL_SETUP_TOKEN_QUE_GENERASTE"
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "Administrador creado. Este endpoint ya no está disponible.",
  "data": {
    "id": "...",
    "name": "Administrador OLIMPO",
    "email": "admin@olimpo.mx",
    "role": "ADMIN"
  }
}
```

> A partir de este momento, el endpoint `/api/setup` devuelve **409** automáticamente.
> En producción, además, desactiva `ALLOW_SETUP` una vez creado el primer admin.

---

## Paso 7 — Seed de producción (opcional)

Crea las modalidades reales y dos maestros de prueba:

```bash
npm run seed:production --workspace=apps/api
```

> Imprime las credenciales de los maestros de prueba en consola. Cambia sus contraseñas antes de usar en producción.

---

## Paso 8 — Levanta el sistema completo

```bash
npm run dev
```

Esto levanta en paralelo:
- **API**: http://localhost:4000
- **Web**: http://localhost:5173

Abre http://localhost:5173 e ingresa con las credenciales que creaste en el Paso 6.

---

## Paso 9 — Verifica que todo funciona

```bash
# Health check del API
curl http://localhost:4000/api/health
# → {"status":"ok","ts":"..."}

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@olimpo.mx","password":"TuPasswordSegura123"}'
# → {"success":true,"data":{"accessToken":"...","user":{...}}}
```

---

## Configuración de WhatsApp (Baileys)

El bot usa **Baileys** (WhatsApp Web). No requiere Twilio ni servicios externos; solo escanear un QR una vez. La sesión se guarda en la tabla `whatsapp_sessions` y se restaura automáticamente al reiniciar.

1. Inicia sesión en el panel como administrador.
2. Abre la página para vincular WhatsApp:
   ```
   http://localhost:4000/api/whatsapp/qr?token=<TU_JWT_DE_ADMIN>
   ```
   Puedes obtener el JWT desde el login (`accessToken`) o desde el almacenamiento del navegador.
3. En tu teléfono: **WhatsApp → Configuración → Dispositivos vinculados → Vincular un dispositivo**.
4. Escanea el QR mostrado.

Cuando la página muestre **"WhatsApp conectado"**, el bot está activo y responderá en el número vinculado.

### Flujo de conversación del bot

El bot tiene un único flujo de **2 pasos** y no guarda datos del usuario:

1. **Inicio** — Cuando un usuario inicia la conversación o saluda, el bot responde con la lista de servicios:
   Natación bebés (5-12 meses, 1-3 años, 3 a 5 años), Natación grupal, Natación personalizada, Natación Acceso libre, Terapia acuática y Calistenia.
2. **Selección** — Ante cualquier respuesta del usuario, el bot confirma que un asesor lo contactará en un **máximo de 24 horas**.

El flujo se reinicia con el siguiente mensaje. La tabla `bot_sessions` solo guarda el paso actual de la conversación
(para saber si ya se mostró el menú); no se almacena información personal ni de contacto.

> **Nota histórica:** el flujo anterior del bot (clase muestra, horarios, apartado de lugar, cursos de verano,
> pagos, cancelación y alta de alumnos) fue reemplazado por este responder simple. Las funcionalidades retiradas
> ya no están conectadas al bot.

### Verificación y mantenimiento

| Acción | Endpoint |
|--------|----------|
| Estado de conexión | `GET /api/whatsapp/status` |
| Ver/re-generar QR | `GET /api/whatsapp/qr?token=<JWT>` |
| Limpiar sesión (nuevo QR) | `DELETE /api/whatsapp/session` |

---

## Configurar modalidades y precios

Antes de registrar alumnos, debes tener las modalidades en la base de datos. Puedes:

- Ejecutar el seed de producción (Paso 7), o
- Insertarlas desde Supabase Dashboard → Table Editor → `modality_configs`, o
- Usar Supabase → SQL Editor:

```sql
INSERT INTO modality_configs (id, modality, name, description, "maxCapacity", "monthlyFee", "isActive", "updatedAt")
VALUES
  (gen_random_uuid(), 'BABY_PHASE1', 'Natación Bebés Fase 1', '4 a 12 meses. Maestra dedicada.',        1,  1100.00, true, now()),
  (gen_random_uuid(), 'BABY_PHASE2', 'Natación Bebés Fase 2', '1 a 3 años. Maestra dedicada.',          1,  1100.00, true, now()),
  (gen_random_uuid(), 'BABY_PHASE3', 'Natación Bebés Fase 3', '3 a 5 años. Maestra dedicada.',          1,  1100.00, true, now()),
  (gen_random_uuid(), 'GROUP_CHILD', 'Natación Grupal',       'Grupos de hasta 8 niños.',               8,  800.00,  true, now()),
  (gen_random_uuid(), 'GROUP_ADULT', 'Natación Adultos Grupal','Grupos de hasta 10 adultos.',           10, 800.00,  true, now()),
  (gen_random_uuid(), 'FREE_ACCESS', 'Acceso Libre',          'Acceso libre lunes a viernes.',          20, 1000.00, true, now()),
  (gen_random_uuid(), 'AQUA_THERAPY','Terapia Acuática',      'Rehabilitación y movilidad.',            4,  1200.00, true, now());
```

> Los precios son de ejemplo. Ajusta los montos reales de la academia.

---

## Automatizaciones (cron jobs)

- **Recordatorios de pago:** cron diario a las 9:00 AM (zona `America/Mexico_City`). Envía recordatorio por WhatsApp cuando la fecha de pago del alumno (`paymentDay`) está dentro de ±5 días. Idempotente vía `automation_logs`.
- Los cron jobs se registran solo si `REDIS_URL` está configurada y Redis responde; si no, el sistema arranca en modo degradado (sin caché ni automatizaciones).

---

## Problemas comunes

### `Error: P1001 Can't reach database server`
- Verifica que la URL de Supabase sea correcta (cópiala exactamente del dashboard).
- Si el password tiene caracteres especiales (`@`, `#`, `%`, `!`), encódalos: `@` → `%40`, `#` → `%23`.

### `Error: Redis connection refused`
- Verifica que Redis esté corriendo: `redis-cli ping` → debe responder `PONG`.
- O usa Redis Cloud y actualiza `REDIS_URL`.

### El frontend muestra pantalla en blanco
- Verifica que `VITE_API_URL` apunte al puerto correcto.
- Revisa la consola del navegador para errores de CORS.
- Verifica que `FRONTEND_URL` en el `.env` del API coincida con la URL del frontend.

### El bot no responde mensajes
- Verifica el estado en `GET /api/whatsapp/status` (debe estar `connected: true`).
- Si no está conectado, abre `/api/whatsapp/qr?token=<JWT>` y escanea el QR.
- Revisa los logs del API: `npm run dev --workspace=apps/api` (Winston escribe a stdout).

---

## Estructura de archivos que necesitas crear/editar

```
olimpo/
├── apps/api/.env          ← Crear desde .env.example (NUNCA subir a git)
└── apps/web/.env          ← Crear desde .env.example (NUNCA subir a git)
```

El `.gitignore` ya excluye los `.env` automáticamente.
