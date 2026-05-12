# OLIMPO — Guía de configuración inicial

Esta guía te lleva desde cero hasta el sistema funcionando, paso a paso.

---

## Requisitos previos

| Herramienta | Versión mínima | Verificar con |
|-------------|---------------|---------------|
| Node.js     | 20.x          | `node -v`     |
| npm         | 9.x           | `npm -v`      |
| Git         | cualquiera    | `git -v`      |

> **Redis** es necesario para los cron jobs y la caché. En desarrollo puedes usar
> [Redis Cloud free tier](https://redis.io/try-free/) si no quieres instalarlo localmente.

---

## Paso 1 — Descomprime y entra al proyecto

```bash
unzip olimpo-bloque-2.zip
cd olimpo
```

---

## Paso 2 — Obtén las URLs de conexión de Supabase

1. Ve a [supabase.com](https://supabase.com) → tu proyecto
2. Haz clic en el botón **"Connect"** (arriba a la derecha)
3. Selecciona la pestaña **"ORMs"** → **"Prisma"**
4. Copia las dos URLs que aparecen:
   - `DATABASE_URL` (contiene puerto 6543 + `pgbouncer=true`)
   - `DIRECT_URL` (contiene puerto 5432)

Tu `PROJECT_REF` ya conocido es `dvqqzwupbeqfixmmpczs`.
Las URLs se verán así:

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

Edita `apps/api/.env` y completa:

### 3.1 — Base de datos (las URLs del Paso 2)
```env
DATABASE_URL="postgresql://postgres.dvqqzwupbeqfixmmpczs:[TU-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.dvqqzwupbeqfixmmpczs:[TU-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

### 3.2 — JWT Secret (genera uno seguro)
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copia el resultado y pégalo en:
```env
JWT_SECRET=el_resultado_del_comando_anterior
```

### 3.3 — Setup token (para crear el primer admin)
```bash
node -e "console.log(require('crypto').randomBytes(20).toString('hex'))"
```
```env
SETUP_TOKEN=el_resultado_del_comando_anterior
```
**Guárdalo** — lo necesitarás en el Paso 6.

### 3.4 — Redis
Si tienes Redis local:
```env
REDIS_URL=redis://localhost:6379
```
Si usas Redis Cloud, pega la URL que te dieron.

### 3.5 — Twilio (puedes dejarlo vacío por ahora)
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```
> El sistema arranca sin Twilio. El bot no enviará mensajes hasta que configures credenciales reales.

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
cd ../..
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

Con el servidor **parado**, llama al endpoint de setup:

```bash
# Primero levanta el servidor en una terminal separada:
npm run dev

# En otra terminal, llama al endpoint de setup:
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
  "message": "✅ Administrador creado correctamente...",
  "data": {
    "id": "...",
    "name": "Administrador OLIMPO",
    "email": "admin@olimpo.mx",
    "role": "ADMIN"
  }
}
```

> A partir de este momento, el endpoint `/api/setup` devuelve **409** automáticamente.
> No necesitas deshabilitarlo manualmente.

---

## Paso 7 — Levanta el sistema completo

```bash
# Desde la raíz del proyecto
npm run dev
```

Esto levanta en paralelo:
- **API**: http://localhost:4000
- **Web**: http://localhost:5173

Abre http://localhost:5173 e ingresa con las credenciales que creaste en el Paso 6.

---

## Paso 8 — Verifica que todo funciona

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

## Configuración de Twilio (WhatsApp)

### Modo Sandbox (desarrollo, gratis)

1. Ve a [console.twilio.com](https://console.twilio.com)
2. Crea una cuenta gratuita
3. Ve a **Messaging → Try it out → Send a WhatsApp message**
4. Sigue las instrucciones para unirte al sandbox (envías un mensaje desde tu WhatsApp)
5. En **Sandbox settings**, configura el webhook:
   ```
   When a message comes in: https://TU-API.onrender.com/api/webhook/whatsapp
   ```
6. Copia `Account SID` y `Auth Token` de la página principal
7. Actualiza tu `.env`:
   ```env
   TWILIO_ACCOUNT_SID=ACxxxxxxxx...
   TWILIO_AUTH_TOKEN=xxxxxxxx...
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
   ```

### Para pruebas locales (Twilio necesita una URL pública)

Usa [ngrok](https://ngrok.com) para exponer tu API local:
```bash
ngrok http 4000
# Copia la URL https://xxxx.ngrok.io
# Ponla en Twilio: https://xxxx.ngrok.io/api/webhook/whatsapp
```

---

## Configurar modalidades y precios

Antes de registrar alumnos, debes configurar las modalidades en la base de datos.
Puedes hacerlo desde Supabase Dashboard → Table Editor → `modality_configs`, o usando
el siguiente script SQL en Supabase → SQL Editor:

```sql
INSERT INTO modality_configs (id, modality, name, description, "maxCapacity", "monthlyFee", "isActive", "updatedAt")
VALUES
  (gen_random_uuid(), 'PERSONAL_CHILD', 'Personalizado Infantil', 'Clase individual para niños', 1,   800.00, true, now()),
  (gen_random_uuid(), 'GROUP_CHILD',    'Grupal Infantil',        'Grupos de hasta 8 niños',    8,   500.00, true, now()),
  (gen_random_uuid(), 'GROUP_ADULT',    'Grupal Adultos',         'Grupos de adultos',           12,  600.00, true, now()),
  (gen_random_uuid(), 'FREE_ACCESS',    'Acceso Libre',           'Acceso libre a la alberca',   20,  400.00, true, now()),
  (gen_random_uuid(), 'AQUA_THERAPY',   'Terapia Acuática',       'Terapia en agua',             4,   900.00, true, now());
```

> **Nota:** Los precios son de ejemplo. Modifícalos según las tarifas reales de la academia.

---

## Problemas comunes

### `Error: P1001 Can't reach database server`
- Verifica que la URL de Supabase sea correcta (copia exactamente del dashboard)
- Verifica que tu contraseña no tenga caracteres especiales sin encodear
- Si el password tiene `@`, `#`, `%` o `!`, encódalos: `@` → `%40`, `#` → `%23`

### `Error: Redis connection refused`
- Verifica que Redis esté corriendo: `redis-cli ping` → debe responder `PONG`
- O usa Redis Cloud y actualiza `REDIS_URL`

### El frontend muestra pantalla en blanco
- Verifica que `VITE_API_URL` apunte al puerto correcto
- Revisa la consola del navegador para errores de CORS
- Verifica que `FRONTEND_URL` en el `.env` del API coincida con la URL del frontend

### El bot no responde mensajes
- Verifica que el webhook de Twilio apunte a la URL correcta
- En desarrollo, verifica que ngrok esté corriendo
- Revisa los logs del API: `tail -f apps/api/logs/combined.log`

---

## Estructura de archivos que necesitas crear/editar

```
olimpo/
├── apps/api/.env          ← Crear desde .env.example (NUNCA subir a git)
└── apps/web/.env          ← Crear desde .env.example (NUNCA subir a git)
```

El `.gitignore` ya excluye los `.env` automáticamente.
