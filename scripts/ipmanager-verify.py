#!/usr/bin/env python3
"""Comprobación local y de solo lectura de reglas IPMANAGER para una IPv4.

Este comando comprueba runtime (iptables-save) y persistencia (rules.v4).
NO consulta el estado deseado del backend, NO aplica reglas y NO prueba conexión
end-to-end desde la IP de origen.
"""

import argparse
import datetime
import ipaddress
import json
import shlex
import socket
import subprocess
import sys

CHAIN = "IPMANAGER-IN"


def parse_filter(text):
    """Extraer cadena, salto y reglas dentro de la tabla filter."""
    in_filter = False
    chain_present = False
    jumps = 0
    rules = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line == "*filter":
            in_filter = True
            continue
        if line == "COMMIT" and in_filter:
            in_filter = False
            continue
        if not in_filter:
            continue
        if line.startswith(":" + CHAIN + " "):
            chain_present = True
            continue
        if not line.startswith("-A "):
            continue
        try:
            args = shlex.split(line)
        except ValueError:
            continue
        if len(args) < 3:
            continue
        if args[1] == "INPUT" and "-j" in args:
            target_index = args.index("-j")
            if target_index + 1 < len(args) and args[target_index + 1] == CHAIN:
                jumps += 1
        if args[1] == CHAIN:
            rules.append(args)
    return {"chain_present": chain_present, "jump_count": jumps, "rules": rules}


def get_arg(args, key, default=None):
    try:
        pos = args.index(key)
        return args[pos + 1] if pos + 1 < len(args) else default
    except ValueError:
        return default


def for_ip(parsed, ip):
    matching = []
    for args in parsed["rules"]:
        source = get_arg(args, "-s", get_arg(args, "--source"))
        if not source:
            continue
        try:
            source_network = ipaddress.ip_network(source, strict=False)
        except ValueError:
            continue
        # Para una IP individual, exigir regla específica /32.
        if source_network.prefixlen != 32 or str(source_network.network_address) != ip:
            continue
        protocol = get_arg(args, "-p", get_arg(args, "--protocol", "all"))
        target = get_arg(args, "-j", get_arg(args, "--jump", ""))
        ports = get_arg(args, "--dports", get_arg(args, "--dport", "all"))
        # Mantener la especificación para comparar runtime y archivo.
        matching.append({"protocol": protocol, "ports": ports, "target": target,
                         "spec": args})
    matching.sort(key=lambda r: json.dumps(r["spec"], separators=(",", ":")))
    return {"chain_present": parsed["chain_present"], "jump_count": parsed["jump_count"],
            "rules": matching}


def read_runtime(source_file, executable):
    if source_file:
        with open(source_file, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    process = subprocess.run([executable, "-t", "filter"], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, timeout=8, universal_newlines=True)
    if process.returncode != 0:
        raise RuntimeError("iptables-save devolvió código {}: {}".format(
            process.returncode, process.stderr.strip()[:250]))
    return process.stdout


def inspect(ip, runtime_text, persisted_text):
    runtime = for_ip(parse_filter(runtime_text), ip)
    persisted = for_ip(parse_filter(persisted_text), ip)
    runtime_specs = [r["spec"] for r in runtime["rules"]]
    persisted_specs = [r["spec"] for r in persisted["rules"]]
    match = runtime_specs == persisted_specs
    healthy_structure = (runtime["chain_present"] and persisted["chain_present"]
                         and runtime["jump_count"] == 1 and persisted["jump_count"] == 1)
    if not runtime_specs and not persisted_specs and healthy_structure:
        status = "ABSENT"
    elif match and healthy_structure:
        status = "CONSISTENT"
    else:
        status = "DRIFT"
    return {"status": status, "rules_match": match,
            "runtime": runtime, "persisted": persisted,
            "note": "CONSISTENT confirma runtime/persistencia, no el estado deseado ni conectividad."}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ip", help="IPv4 exacta a verificar")
    parser.add_argument("--rules-file", default="/etc/iptables/rules.v4")
    parser.add_argument("--runtime-file", help="Salida guardada de iptables-save (pruebas)")
    parser.add_argument("--iptables-save", default="/usr/sbin/iptables-save")
    args = parser.parse_args(argv)
    try:
        parsed_ip = ipaddress.ip_address(args.ip)
        if parsed_ip.version != 4:
            raise ValueError("Se requiere una dirección IPv4")
        ip = str(parsed_ip)
    except ValueError as exc:
        parser.error("IP no válida: {}".format(exc))

    result = {"schema": "ipmanager.verify.v1", "node": socket.gethostname(),
              "ip": ip,
              "checked_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        runtime = read_runtime(args.runtime_file, args.iptables_save)
        with open(args.rules_file, "r", encoding="utf-8", errors="replace") as f:
            persisted = f.read()
        result.update(inspect(ip, runtime, persisted))
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as exc:
        result.update({"status": "ERROR", "error": str(exc)[:500]})
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if result["status"] in ("CONSISTENT", "ABSENT") else 2


if __name__ == "__main__":
    sys.exit(main())
