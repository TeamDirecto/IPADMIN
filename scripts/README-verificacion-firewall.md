# IPADMIN - verificacion de firewall por IP (piloto de solo lectura)

El script ipmanager-verify.py comprueba una direccion IPv4 concreta en el propio nodo. No modifica reglas, no llama al agente y no requiere SSH desde el frontend.

## Fuentes consultadas

- iptables-save -t filter: estado actual de la cadena IPMANAGER-IN y salto desde INPUT.
- /etc/iptables/rules.v4: estado persistido en la tabla filter.

Compara las reglas completas de la IP, incluyendo protocolo, puertos, accion y comentarios. Un resultado CONSISTENT confirma exclusivamente que hay reglas para esa IP, coinciden en runtime/persistencia, existe la cadena y hay exactamente un salto INPUT -> IPMANAGER-IN en ambas fuentes. NO demuestra que el acceso de extremo a extremo funcione ni que coincida con el estado DESEADO por el backend.

## Requisitos

Python 3.6+, iptables-save y acceso de lectura al archivo de persistencia (normalmente requiere root). Sin dependencias de terceros.

## Piloto en AliadosD2

Tras revision y despliegue manual del script en el nodo:

~~~bash
python3 /root/bin/ipmanager-verify.py 177.249.173.89
~~~

Salida: un objeto JSON con schema, node, ip, checked_at_utc, status, runtime, persisted, rules_match y note.

Estados:

- CONSISTENT: cadena y salto presentes, reglas de la IP identicas en runtime y persistencia.
- DRIFT: discrepancias entre las fuentes o topologia inesperada.
- ABSENT: no hay reglas /32 especificas en ninguna fuente; no implica bloqueo efectivo por reglas generales.
- ERROR: no se pudo inspeccionar alguna fuente.

Codigos de salida: 0 para CONSISTENT o ABSENT; 2 para DRIFT o ERROR.

## Pruebas locales sin firewall

~~~bash
python3 -m unittest discover -s scripts/tests -p 'test_ipmanager_verify.py'
~~~

## Integracion pendiente

El piloto produce evidencia local. Para mostrarla en IPADMIN hace falta un contrato autenticado agent -> backend en vici97 para registrar verificaciones puntuales y un endpoint de solo lectura para el administrador. Mantener el backend como fuente del estado deseado y comparar DESIRED, APPLIED y PERSISTED por separado. No permitir ejecucion de comandos arbitrarios desde el navegador ni abrir SSH desde el frontend.
