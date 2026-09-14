# Handoff: solicitud a Edwin cuando el abogado no puede agregar radicado

Documento para pasar a otro chat / frontend. **Estado backend MVP: implementado.**

---

## Estado de implementación (backend)

Implementado:

- Tabla `manual_registration_requests` + modelo/enums.
- Al fallar alta app_user (`not_found` / `private` / `all_private`) → solicitud `pending` + Discord (`manual_registration`) + HTTP **202**.
- Cuenta `unassigned_process_actions` en la solicitud y lo muestra en Discord.
- Idempotencia Discord: mismo org+radicado `pending` no reenvía.
- Jobs async (`SyncJudicialBranchJob` / `SyncSamaiJob`) también crean solicitud en fallo definitivo privado/not found.
- Env: `DISCORD_ALERT_WEBHOOK_MANUAL_REGISTRATION` (canal Discord `#crear-procesos-privados`).

Pendiente (fuera de este MVP):

- UI admin de cola / marcar `registered|rejected`.
- Heurística edicto-only.
- Estado “En revisión” persistente en listado del abogado (frontend puede usar el 202 inmediato).

Asociación de histórico: al crear el `Process` (p. ej. `private-import`), `Process::created` → `AttachUnassignedProcessActionsService` ya asocia `unassigned_process_actions`.

---

## Contrato API para frontend (`POST /api/app-user/processes`)

### Éxito (sin cambios)

- **201** — proceso registrado, o
- **201** — `{ "message": "…en segundo plano…" }` si fue a cola.

### Nuevo: revisión con asesor

- **202 Accepted**

```json
{
  "message": "Este radicado no está disponible en consulta automática. Lo dejamos en revisión con tu asesor; te confirmaremos cuando quede registrado.",
  "status": "manual_review",
  "reason": "not_found",
  "request_id": "uuid",
  "unassigned_actions_count": 0
}
```

| Campo | Valores / uso |
|-------|----------------|
| `status` | Siempre `"manual_review"` en este path |
| `reason` | `not_found` \| `private` \| `all_private` |
| `request_id` | UUID de la solicitud ops |
| `unassigned_actions_count` | Actuaciones ya cargadas en histórico pendiente (info; opcional mostrar) |
| `message` | Texto listo para toast/modal |

### Qué ya no debe asumir el frontend

- Antes: **404** con `messages[]` tipo “contacte a su asesor” / **422** privado.
- Ahora esos casos de alta imposible por consulta → **202** con el shape de arriba (no es error de validación).

Siguen igual:

- **401** no auth
- **422** validación (`process_number`, `lawyer_role`) o `already_registered` / sin organización

### UX sugerida

1. Toast/modal informativo (no error rojo) con `message`.
2. No navegar al detalle del proceso (no hay `process` en el body).
3. Opcional: badge “En revisión” local o mensaje bajo el formulario.
4. No reintentar en loop el mismo radicado (backend es idempotente para Discord, pero el usuario no gana nada spameando).

---

## 1. Problema de negocio (voz de Edwin)

Cuando un cliente/abogado intenta **Agregar radicado** y el proceso:

- no está disponible para consulta en línea (Rama Judicial),
- es **privado**, o
- solo existe vía **publicaciones procesales** (municipios: Bolívar, Cauca, Quindío, etc.),

el sistema hoy **falla** y el mensaje dice contactar al asesor. Eso genera WhatsApp a Edwin.

Edwin necesita:

1. **Enterarse solo** (sin depender del cliente).
2. Saber **juzgado/despacho** para su listado de digitación.
3. Poder dar de alta después con las herramientas admin que ya tiene (Excel privado / actuaciones).

Urgencia operativa mencionada: con **términos suspendidos** y reactivación el lunes, muchos clientes van a querer agregar demandas nuevas que aún no están en consulta en línea → traumatismo si no hay esta funcionalidad.

Caso ejemplo citado: radicado `76892400300120260066300` (Yumbo) — Edwin aclaró: **no es SAMAI**, es **publicaciones procesales / privado**.

---

## 2. Qué NO es este flujo

- No es el sync diario ni consolidados.
- No es el Discord de `log_sync_daily` / `late_sync` (ya existen para sync).
- No es el “edicto emplazatorio only” (fase 2): Rama encuentra el radicado pero solo hay edicto; actuaciones reales van por publicaciones. Ese caso **sigue entrando por path judicial normal** si no se define heurística aparte.
- No reemplaza el Excel de privados de admin; lo **alimenta con leads**.

---

## 3. Comportamiento actual (código)

### Entrada app_user

- `POST /api/app-user/processes`
- Controller: `src/Application/AppUser/Process/Controllers/ProcessController.php` → `store()`
- Resuelve con `SmartProcessRegistrationResolverService`
- Luego inline `RegisterProcessService` / `RegisterSamaiProcessService` o dispatch a cola `process-import`.

### Orden del resolver

1. ¿Ya registrado en la org? → `422 already_registered`
2. ¿Existe en BD? → fast-path (attach)
3. Si sync JB activo → defer cola (sin sondear Portal); SAMAI-eligible puede intentar SAMAI
4. Intentar Rama Judicial (público)
5. Si miss / todos privados → SAMAI solo si `ProcessConsultationScopeHelper::shouldConsultSamai`
6. Si no → **`abort(404, process.not_found_in_any_source)`**

### Fallos relevantes (lang ES)

En `resources/lang/es/process.php`:

| Key | Mensaje actual |
|-----|----------------|
| `not_found_in_any_source` | no se encuentra habilitado; contacte a su asesor |
| `not_found_in_judicial_branch` | no disponible para consulta en línea |
| `is_private` | proceso privado; no es posible registrarlo |
| `all_instances_are_private` | todas las instancias privadas |

En esos aborts **hoy**:

- no se crea ticket/solicitud,
- no hay Discord,
- no hay fila “pending manual” visible para Edwin,
- `ProcessRegistrationLog` solo existe en path **async** (`pending|success|failed`), no en el 404/422 síncrono.

### Cómo Edwin da de alta hoy (sí existe)

Admin Excel (sin Discord de solicitud):

| Endpoint | Uso |
|----------|-----|
| `POST /api/admin/processes/import` | Alta desde Portal/SAMAI |
| `POST /api/admin/processes/private-import` | Privados / publicaciones (crea manual + actuaciones) |
| `POST /api/admin/processes/actuaciones-import` | Actualizar actuaciones de procesos existentes |

Rutas: `routes/api/admin/processes.php`.

---

## 4. Flujo propuesto (acordado en chat)

```mermaid
flowchart TD
  client[Cliente_AgregarRadicado] --> resolver[SmartResolver_o_Register]
  resolver -->|OK_publico_o_SAMAI| normal[Alta_normal_inline_o_cola]
  resolver -->|not_found_o_private| request[Crear_solicitud_pending]
  request --> discord[Avisar_Discord_Edwin]
  request --> clientMsg[HTTP_202_mensaje_revision]
  discord --> edwin[Edwin_ve_radicado_org_motivo]
  edwin --> privateExcel[Admin_private_import_o_actuaciones]
  privateExcel --> done[Marcar_solicitud_registered]
```

### Cliente

- Dejar de devolver solo 404 seco.
- Respuesta tipo **202**: “Este radicado no está disponible en consulta automática. Lo dejamos en revisión con tu asesor.”
- Opcional UI: estado “En revisión” (no inventar proceso activo sin datos).

### Solicitud / cola interna

Crear registro (tabla nueva recomendada, o extender logs), campos mínimos:

- `process_number` (radicado)
- `organization_id`, `app_user_id`
- `reason`: `not_found` | `private` | `all_private` (y más adelante `edict_only`)
- `status`: `pending` → `registered` | `rejected`
- timestamps
- opcional: `court_hint`, notas, quién resolvió

Admin: listado “Pendientes de digitación / publicaciones procesales”.

### Discord a Edwin

Al crear la solicitud, enviar embed/mensaje con:

- radicado
- usuario (nombre, cédula, email)
- organización
- motivo (`not_found` / `private` / …)
- timestamp

Reutilizar patrón existente:

- `src/Application/Shared/Services/Notification/Channels/DiscordNotificationChannelService.php`
- Config: `config/discord-alerts.php` — keys `default`, `log_sync_daily`, `late_sync`, **`manual_registration`**
- Env: `DISCORD_ALERT_WEBHOOK_MANUAL_REGISTRATION`
- Canal Discord: `#crear-procesos-privados`

Referencia de estilo embeds: `JudicialSyncDiscordNotificationService`.

Email admin (alternativa/complemento): ya existe patrón `ProcessBecamePrivateMailable` / `process-import.admin_report_email` — se puede reutilizar destinatario, pero el pedido explícito reciente es **Discord**.

---

## 5. Puntos de enganche técnicos sugeridos

1. **Resolver / store** cuando hoy hace `abort(404 not_found_in_any_source)` — capturar y convertir a “crear solicitud + Discord + 202”.
2. **`RegisterProcessService`** cuando aborta `is_private` / `all_instances_are_private` (422) — mismo tratamiento si el abogado no puede completar alta.
3. Jobs async (`SyncJudicialBranchJob` / `SyncSamaiJob`): si fallan por not found / private definitivo, también crear solicitud (hoy solo notifican al app_user con `ProcessImportFailedNotification`).
4. **No** crear solicitud en: `already_registered`, errores transitorios de API (proxy/403) que se reintentan.

Idempotencia: no spamear Discord si el mismo org+radicado ya tiene `pending` reciente.

---

## 6. MVP recomendado (prioridad)

**Fase 1 (urgente):**

- Interceptar fallos `not_found` / `private` en alta app_user.
- Persistir solicitud `pending`.
- Discord a Edwin.
- Respuesta amable al cliente (202).
- Sin UI admin completa (Edwin puede usar Discord + Excel privado).

**Fase 2:**

- Pantalla admin de pendientes + marcar resuelto.
- Heurística edicto-only (Rama encuentra pero historial inútil).

**Fase 3:**

- Estado “En revisión” en frontend lista del abogado.

---

## 7. Relación con privados / publicaciones

Edwin (audios): en algunos municipios el proceso aparece en Rama **solo para edicto emplazatorio**; actuaciones van por publicaciones procesales. Le preocupa falsos positivos judiciales y no enterarse del juzgado.

Por eso la cola no es solo “404”: también privacidad / no consultable, y más adelante edicto-only.

Alta manual posterior: **`private-import`** + luego **`actuaciones-import`**.

---

## 8. Mensajes / producto (borrador)

**Cliente:**  
“Este radicado no está disponible en consulta automática. Lo dejamos en revisión con tu asesor; te confirmaremos cuando quede registrado.”

**Discord (ejemplo):**  
“Solicitud de alta manual — radicado `…` — org X — usuario Y (cédula) — motivo: privado/no encontrado — rol abogado: …”

**A Edwin (contexto):**  
La digitación Excel ya existe; falta el eslabón: aviso automático + cola cuando el cliente no puede agregar.

---

## 9. Archivos clave

| Área | Path |
|------|------|
| Alta app_user | `src/Application/AppUser/Process/Controllers/ProcessController.php` (`store`) |
| Routing fuentes | `src/Application/AppUser/Process/Services/SmartProcessRegistrationResolverService.php` |
| Scope SAMAI | `src/Application/Shared/Helpers/ProcessConsultationScopeHelper.php` |
| Registro JB | `src/Application/AppUser/Process/Services/RegisterProcessService.php` |
| Registro SAMAI | `src/Application/AppUser/Process/Services/RegisterSamaiProcessService.php` |
| Dispatch async | `DispatchProcessRegistrationService` / `DispatchSamaiProcessRegistrationService` (cola `process-import`) |
| Log async actual | `ProcessRegistrationLog` |
| Import privado admin | `src/Application/Admin/Process/Services/PrivateProcessExcelImportService.php` |
| Discord base | `DiscordNotificationChannelService` + `config/discord-alerts.php` |
| Lang | `resources/lang/es/process.php` |

---

## 10. Decisiones ya tomadas en conversación

- Objetivo: **solicitud + aviso Edwin + mensaje cliente**, no solo Discord suelto sin persistir.
- Canal preferido de aviso: **Discord** (además o en lugar de WhatsApp del cliente).
- Admin Excel privado **ya sirve** para completar el alta.
- Caso edicto-only = **fase 2**.
- MVP técnico sugerido: tabla `manual_registration_requests` (o similar) + notify Discord + 202.

---

## 11. Fuera de alcance de este handoff (otros temas del mismo hilo)

- Puerta `process-import` para app_user durante sync (ya implementado en otro tramo).
- Semáforo unificado instancias/header (hotfix).
- Normalización despacho Tribunal SAMAI `000` = magistrado (fix helper + 2 radicados).
- Exports SQL clientes / SAMAI.
- Fixes puntuales prod (fecha 2070, consolidado histórico Rodrigo).

Esos no son este flujo; no mezclar en la implementación de solicitudes.

---

## 12. Criterios de aceptación (para el chat que implemente)

1. Abogado agrega radicado no consultable/privado → no queda solo en 404/422 silencioso para ops.
2. Queda registro `pending` consultable.
3. Discord llega con radicado + org + usuario + motivo.
4. Cliente recibe mensaje de “en revisión”, no “contacte a su asesor” genérico (o texto acordado).
5. Mismo radicado+org no dispara N alertas Discord en ráfaga.
6. Edwin puede completar con `private-import` y marcar/resolver la solicitud.
7. Tests del path de fallo de registro + (ideal) fake Discord.

---

## 13. Prompt corto para pegar al otro chat

> Implementar flujo: cuando `POST /api/app-user/processes` no puede alta por not_found/private, crear solicitud pending para ops (Edwin), notificar Discord (nuevo webhook en discord-alerts), devolver 202 amable al cliente. Reusar DiscordNotificationChannelService. Admin ya tiene private-import. No implementar aún heurística edicto-only. Ver handoff completo en `docs/handoff-solicitud-alta-manual-edwin.md`.
