# Contrato: verificación de una IP en un nodo (piloto AliadosD2)

## Evidencia del piloto (2026-10-19)
- Nodo: AliadosD2.
- IP: 177.249.173.89.
- Consulta `/node-api/AliadosD2/desired`: IP incluida; lista de 102 IPs.
- Verificador local: `CONSISTENT`, `rules_match=true`, un salto `INPUT -> IPMANAGER-IN` y reglas TCP/UDP idénticas en runtime y persistencia.

**Alcance**: estos datos no certifican conectividad extremo a extremo, ni la corrección de los puertos contra una política central. No confundir `CONSISTENT` con "cliente conectado".

## Diseño (todavía no desplegado)

Separar el heartbeat general y la cola de acciones existente de la verificación puntual. La solicitud administrativa crea un trabajo de solo lectura que un verificador del nodo consume. Evitar que un navegador llame comandos del servidor o que un servicio central haga SSH a los nodos.

1. `POST /webadmin/nodes/{node_name}/ip-verifications` (superadministrador):
   cuerpo `{"ip": "177.249.173.89"}`; crea trabajo `PENDING`; valida IPv4 y nodo administrado.
2. `GET /node-api/{node_name}/ip-verifications/pending` (agente autenticado):
   devuelve un trabajo válido en espera, únicamente ID e IP. Nunca devuelve instrucciones shell.
3. `POST /node-api/{node_name}/ip-verifications/{job_id}/result` (agente autenticado):
   acepta evidencia `schema=ipmanager.verify.v1` limitada en tamaño. Valida que `node` e `ip` coincidan con la solicitud y que el trabajo no esté vencido. Almacena resultado, fecha de recepción y fecha reportada (ambas).
4. `GET /webadmin/nodes/{node_name}/ip-verifications?ip=...` (administrador):
   obtiene última evidencia, antigüedad, estado `DESIRED` calculado **en el servidor** desde el mismo origen que `/desired`, reglas `APPLIED` y `PERSISTED`.

## Autenticación y control de seguridad

- Apache `/ip-node-api/` filtra IPs, pero esto **no es autenticación de identidad de nodo**.
- Exigir credencial de nodo individual en los dos endpoints nuevos; comparar con `hmac.compare_digest`. El secreto se guarda fuera de Git con permisos restrictivos. No registrar el header ni secretos.
- Validar que la identidad del token esté autorizada exclusivamente para el `node_name` de la URL (no basta el valor enviado en JSON).
- Administradores: reutilizar `ipm_require_admin_auth`, con rol `SUPERADMIN` para crear verificaciones.
- Rate limit / TTL / expiración en trabajos, una verificación pendiente por `(nodo, IP)`, límites de payload y retención.
- No aceptar comandos enviados por API; script ejecuta solamente `iptables-save` contra direcciones IPv4 validadas.
- La observación nunca escribe reglas, ni reemplaza `/node-api/{node_name}/actions`, ni altera `/heartbeat`, ni toma el lock de reconciliación.
- Si evidencia queda vieja (por ejemplo más de 180 s), mostrar `STALE`, nunca `VERIFIED`.

## Modelo conceptual SQLite separado de node_health

`node_ip_verification_jobs`: id, node_name, ip, status, requested_at, requested_by, delivered_at, expires_at, completed_at, error.

`node_ip_verification_results`: job_id, node_name, ip, checked_at_node, received_at_server, schema_version, evidence_json, desired_at_receipt, runtime_persisted_consistent.

Distinguir:
- DESIRED: estado que devuelve `node_desired(node_name)` al momento de consultar.
- APPLIED: lectura local runtime.
- PERSISTED: archivo local.
- CONSISTENT: runtime igual a persistencia y topología correcta.
- VERIFIED: DESIRED/APPLIED/PERSISTED según reglas y políticas vigentes, con evidencia fresca y autenticada.

## Pendiente antes de escribir el backend

Confirmar cómo se pasan los headers de `curl` desde `/root/bin/ipmanager-node.sh` y cómo se extrae el rol en `ipm_require_admin_auth`. El código FastAPI actualmente opera en vici97 y no reside en este repositorio frontal. Preparar módulo independiente, validación en staging y despliegue explícito posterior.
