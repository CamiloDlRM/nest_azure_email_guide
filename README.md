# NestJS + Azure Communication Services — Guía de envío de correos

Aplicación de ejemplo que muestra cómo integrar **Azure Communication Services (ACS)** para enviar correos electrónicos desde una API construida con **NestJS** y **TypeScript**.

---

## Tabla de contenidos

1. [Requisitos previos](#1-requisitos-previos)
2. [Estructura del proyecto](#2-estructura-del-proyecto)
3. [Configuración del entorno](#3-configuración-del-entorno)
4. [Cómo levantar el proyecto](#4-cómo-levantar-el-proyecto)
5. [Endpoint disponible](#5-endpoint-disponible)
6. [Explicación de la implementación](#6-explicación-de-la-implementación)
   - [Configuración del módulo raíz](#61-configuración-del-módulo-raíz)
   - [SendEmailDto — Validación del body](#62-sendemaildto--validación-del-body)
   - [EmailController](#63-emailcontroller)
   - [EmailService — Lógica de envío con ACS](#64-emailservice--lógica-de-envío-con-acs)
7. [Flujo completo de una petición](#7-flujo-completo-de-una-petición)
8. [Conceptos clave de Azure Communication Services](#8-conceptos-clave-de-azure-communication-services)

---

## 1. Requisitos previos

- **Node.js** >= 20
- **npm** >= 10
- Una cuenta de **Azure** con un recurso de **Azure Communication Services** creado
- Un dominio de correo verificado en ese recurso (ACS Email)

---

## 2. Estructura del proyecto

```
src/
├── main.ts                        # Punto de entrada, configura el servidor
├── app.module.ts                  # Módulo raíz
└── email/
    ├── email.module.ts            # Módulo de email
    ├── email.controller.ts        # Define la ruta POST /email/send
    ├── email.service.ts           # Lógica de envío, llama a ACS
    └── dto/
        └── send-email.dto.ts      # Contrato y validación del body
.env.example                       # Plantilla de variables de entorno
```
---
## NOTA LIBRERIAS A AÑADIR
  "@azure/communication-email": "latest"                                                                                                                                                                                                                                                                                       
  - @azure/communication-email — el SDK de Azure que provee EmailClient y EmailMessage. Sin esto no hay integración con ACS.                                             
---

## 3. Configuración del entorno

Copia el archivo de ejemplo y completa tus credenciales:

```bash
cp .env.example .env
```

```env
ACS_CONNECTION_STRING=endpoint=https://<tu-recurso>.communication.azure.com/;accesskey=<tu-clave>
ACS_SENDER_ADDRESS=DoNotReply@<tu-dominio>.azurecomm.net
```

**Dónde obtener estos valores en el portal de Azure:**

- `ACS_CONNECTION_STRING`: Recurso ACS → **Keys** → "Connection string" (Primary o Secondary).
- `ACS_SENDER_ADDRESS`: Recurso ACS → **Email** → **Domains** → dominio verificado → campo `MailFrom`. Por defecto tiene el formato `DoNotReply@<GUID>.azurecomm.net`.

---

## 4. Cómo levantar el proyecto

```bash
npm install
npm run start:dev
```

La aplicación corre en `http://localhost:3000`. Se puede cambiar definiendo la variable `PORT` en el `.env`.

---

## 5. Endpoint disponible

### `POST /email/send`

**Body (JSON):**

| Campo       | Tipo     | Requerido | Descripción                          |
|-------------|----------|-----------|--------------------------------------|
| `to`        | `string` | Sí        | Dirección de correo del destinatario |
| `subject`   | `string` | Sí        | Asunto del correo                    |
| `plainText` | `string` | Sí        | Cuerpo en texto plano                |
| `html`      | `string` | No        | Cuerpo en HTML                       |

**Ejemplo:**

```bash
curl -X POST http://localhost:3000/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "destinatario@ejemplo.com",
    "subject": "Hola desde ACS",
    "plainText": "Este es el cuerpo en texto plano.",
    "html": "<h1>Este es el cuerpo en HTML</h1>"
  }'
```

**Respuesta exitosa (HTTP 200):**

```json
{ "messageId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

---

## 6. Explicación de la implementación

### 6.1 Configuración del módulo raíz

```typescript
// app.module.ts
ConfigModule.forRoot({ isGlobal: true })
```

`isGlobal: true` hace que `ConfigService` esté disponible para inyección en cualquier módulo sin necesidad de importar `ConfigModule` en cada uno. Esto es lo que permite que `EmailService` reciba `ConfigService` directamente en su constructor.

---

### 6.2 `SendEmailDto` — Validación del body

```typescript
export class SendEmailDto {
  @IsEmail()
  to: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  plainText: string;

  @IsString()
  @IsOptional()
  html?: string;
}
```

El `ValidationPipe` global (registrado en `main.ts`) valida automáticamente el body contra este DTO antes de que el controller ejecute. Si alguna regla falla, responde `400 Bad Request` con el detalle del error sin llegar al controller.

El campo `html` lleva `@IsOptional()` para permitir envíos solo con texto plano. Sin embargo, si el campo viene en el body, `@IsString()` se sigue validando — `@IsOptional()` únicamente indica que la **ausencia** del campo es válida.

---

### 6.3 `EmailController`

```typescript
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  send(@Body() dto: SendEmailDto) {
    return this.emailService.sendEmail(dto);
  }
}
```

`@HttpCode(HttpStatus.OK)` fuerza HTTP 200 en lugar del 201 que NestJS usa por defecto en rutas `POST`. Se usa 200 porque la operación no crea un recurso persistente, sino que ejecuta una acción (envío del correo).

---

### 6.4 `EmailService` — Lógica de envío con ACS

Este es el núcleo de la integración. Vale la pena entender cada parte en detalle.

#### Inicialización del cliente

```typescript
constructor(private readonly config: ConfigService) {
  const connectionString = this.config.getOrThrow<string>('ACS_CONNECTION_STRING');
  this.senderAddress = this.config.getOrThrow<string>('ACS_SENDER_ADDRESS');
  this.client = new EmailClient(connectionString);
}
```

`getOrThrow` (a diferencia de `get`) lanza una excepción si la variable no existe en el `.env`. Esto hace que la aplicación **falle en el arranque** con un mensaje claro en lugar de fallar silenciosamente en el primer intento de envío.

`new EmailClient(connectionString)` instancia el cliente del SDK de Azure usando la connection string, que ya incluye el endpoint y la clave de acceso, por lo que no se necesita configuración adicional de autenticación.

El cliente se crea **una sola vez en el constructor**. Al ser `EmailService` un provider singleton dentro del módulo, este cliente se reutiliza en todas las peticiones durante el ciclo de vida de la aplicación.

#### Construcción del `EmailMessage`

```typescript
const message: EmailMessage = {
  senderAddress: this.senderAddress,
  recipients: {
    to: [{ address: dto.to }],
  },
  content: {
    subject: dto.subject,
    plainText: dto.plainText,
    ...(dto.html && { html: dto.html }),
  },
};
```

`EmailMessage` es el tipo que exige el SDK. Sus campos más relevantes:

| Campo               | Descripción                                                                                      |
|---------------------|--------------------------------------------------------------------------------------------------|
| `senderAddress`     | Debe pertenecer a un dominio verificado en ACS. Si no, el envío es rechazado.                   |
| `recipients.to`     | Array de destinatarios. Cada uno requiere al menos `{ address: string }`. También existen `cc` y `bcc`. |
| `content.plainText` | ACS **siempre lo requiere**, incluso si se envía HTML. Es el fallback para clientes que no renderizan HTML. |
| `content.html`      | Opcional. Si el cliente de correo lo soporta, muestra este contenido en lugar del texto plano.  |

La línea `...(dto.html && { html: dto.html })` usa spread condicional: si `dto.html` tiene valor, agrega la propiedad `html` al objeto. Si no, no agrega nada — evitando pasar `html: undefined` al SDK, lo que podría causar comportamiento inesperado.

#### El patrón Long-Running Operation (Poller)

```typescript
const poller = await this.client.beginSend(message);
const result = await poller.pollUntilDone();
return { messageId: result.id };
```

Este es el punto más importante de entender sobre la API de ACS.

El envío de correos es una **operación asíncrona desde el lado de Azure**. Cuando se llama a `beginSend()`, ACS no envía el correo en ese instante: **acepta la tarea**, responde con `202 Accepted` y le asigna un ID de operación interno.

El SDK gestiona esto con el patrón **Poller**:

1. **`beginSend(message)`** — Inicia la operación. ACS registra la tarea y devuelve el poller con el ID de operación.
2. **`pollUntilDone()`** — El SDK consulta periódicamente el endpoint de estado de ACS usando ese ID hasta que la operación termina. Cuando ACS confirma que procesó el correo, retorna el resultado con estado `Succeeded`.

El resultado final contiene `id`, que es el **messageId** asignado por ACS. Este ID sirve para rastrear el correo en los logs y diagnósticos del recurso ACS en el portal de Azure.

> **Importante:** `Succeeded` significa que ACS aceptó y procesó el correo para entrega, no que el destinatario lo recibió. La entrega final depende del servidor de correo destino.

#### Manejo de errores

```typescript
} catch (error) {
  this.logger.error('Failed to send email', error);
  throw new InternalServerErrorException('Failed to send email via Azure Communication Services');
}
```

Si ACS rechaza la operación (credenciales inválidas, dominio no verificado, límite de envíos excedido, etc.), el SDK lanza una excepción. Se captura para:

1. Loguear el error original completo (útil para debugging con los detalles que devuelve Azure).
2. Relanzar una `InternalServerErrorException` de NestJS, que el framework serializa automáticamente como respuesta `500` con el formato estándar de errores.

---

## 7. Flujo completo de una petición

```
POST /email/send  { to, subject, plainText, html? }
        │
        ▼
ValidationPipe  →  valida body contra SendEmailDto
        │  falla → 400 Bad Request (automático)
        │  pasa  ↓
        ▼
EmailController.send(dto)
        │
        ▼
EmailService.sendEmail(dto)
        │  construye EmailMessage
        │  client.beginSend()  →  ACS acepta la operación (202)
        │  poller.pollUntilDone()  →  ACS confirma el envío (Succeeded)
        │  retorna { messageId }
        ▼
200 OK  { "messageId": "..." }
```

---

## 8. Conceptos clave de Azure Communication Services

### Recurso ACS y Connection String

El recurso ACS es la unidad principal en Azure. Al crearlo se obtiene un **endpoint** único y claves de acceso. La **connection string** combina ambos:

```
endpoint=https://<nombre>.communication.azure.com/;accesskey=<clave-en-base64>
```

El SDK de `@azure/communication-email` usa esta string para autenticar todas las llamadas a la API de ACS.

### Dominio verificado y `senderAddress`

Para enviar correos, ACS exige que la dirección del remitente pertenezca a un **dominio verificado** dentro del recurso. Hay dos opciones:

- **Dominio gestionado por Azure** (`*.azurecomm.net`): disponible de forma inmediata, sin configuración DNS. Útil para pruebas y desarrollo.
- **Dominio propio**: requiere agregar registros DNS (SPF, DKIM, DMARC) para verificación. Recomendado para producción.

Si se intenta enviar con un `senderAddress` que no pertenece a un dominio verificado, ACS rechaza la operación antes de intentar el envío.

### Long-Running Operation

ACS procesa los envíos de forma asíncrona. El flujo interno es:

1. `beginSend()` → ACS registra la tarea y responde `202 Accepted` con un ID de operación.
2. El poller consulta periódicamente `GET /operations/{operationId}`.
3. Cuando ACS termina de procesar, el estado cambia a `Succeeded` y se retorna el `messageId`.

Este patrón es común en varios servicios de Azure (blobs, colas, etc.) y el SDK de Azure lo abstrae con la interfaz `PollerLike`, que es lo que devuelve `beginSend()`.
