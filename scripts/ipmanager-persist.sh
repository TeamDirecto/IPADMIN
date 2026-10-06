#!/bin/bash

set -u

RULES_FILE="/etc/iptables/rules.v4"
IPTABLES="/usr/sbin/iptables"
IPTABLES_SAVE="/usr/sbin/iptables-save"
IPTABLES_RESTORE="/usr/sbin/iptables-restore"
CHAIN="IPMANAGER-IN"
JUMP='-A INPUT -m comment --comment "IPMANAGER ENTRY" -j IPMANAGER-IN'

TMP="$(mktemp /tmp/ipmanager-rules.XXXXXX)" || exit 1
IPM_TMP="${TMP}.ipm"

cleanup() {
    rm -f "$TMP" "$IPM_TMP"
}
trap cleanup EXIT

if [ ! -r "$RULES_FILE" ]; then
    echo "ERROR: no se puede leer $RULES_FILE"
    exit 1
fi

if ! grep -q '^\*filter$' "$RULES_FILE"; then
    echo "ERROR: $RULES_FILE no contiene tabla *filter"
    exit 1
fi

if ! "$IPTABLES" -nL "$CHAIN" >/dev/null 2>&1; then
    echo "ERROR: no existe $CHAIN en runtime"
    exit 1
fi

if ! "$IPTABLES_SAVE" -t filter |
    awk '$1 == "-A" && $2 == "IPMANAGER-IN" { print }' > "$IPM_TMP"
then
    echo "ERROR: no fue posible obtener IPMANAGER-IN del runtime"
    exit 1
fi

HAS_CHAIN=0
HAS_JUMP=0

grep -q '^:IPMANAGER-IN ' "$RULES_FILE" && HAS_CHAIN=1

grep -Eq '^-A INPUT .*--comment "IPMANAGER ENTRY".*-j IPMANAGER-IN' \
    "$RULES_FILE" && HAS_JUMP=1

awk \
    -v has_chain="$HAS_CHAIN" \
    -v has_jump="$HAS_JUMP" \
    -v jump="$JUMP" \
    -v ipmfile="$IPM_TMP" '
BEGIN {
    in_filter=0
    inserted_header=0
}
{
    line=$0

    if (line == "*filter") {
        in_filter=1
        print line
        next
    }

    if (in_filter && line == "COMMIT") {

        if (!inserted_header) {

            if (!has_chain)
                print ":IPMANAGER-IN - [0:0]"

            if (!has_jump)
                print jump

            inserted_header=1
        }

        while ((getline ipm < ipmfile) > 0)
            print ipm

        close(ipmfile)
        print line
        in_filter=0
        next
    }

    # Reemplazar exclusivamente las reglas IPMANAGER-IN.
    if (in_filter && line ~ /^-A IPMANAGER-IN /)
        next

    # Crear chain/jump si el archivo todavía no los tiene.
    if (in_filter && !inserted_header && line ~ /^-A /) {

        if (!has_chain)
            print ":IPMANAGER-IN - [0:0]"

        if (!has_jump)
            print jump

        inserted_header=1
    }

    print line
}
' "$RULES_FILE" > "$TMP"

if [ ! -s "$TMP" ]; then
    echo "ERROR: archivo temporal vacío"
    exit 1
fi

if ! "$IPTABLES_RESTORE" --test < "$TMP" >/dev/null 2>&1; then
    echo "ERROR: la nueva rules.v4 no pasa iptables-restore --test"
    exit 1
fi

if cmp -s "$TMP" "$RULES_FILE"; then
    echo "OK: rules.v4 ya estaba sincronizada con IPMANAGER-IN"
    exit 0
fi

cp -p "$RULES_FILE" "${RULES_FILE}.bak-ipmanager"

chmod --reference="$RULES_FILE" "$TMP" 2>/dev/null || true
chown --reference="$RULES_FILE" "$TMP" 2>/dev/null || true

mv -f "$TMP" "$RULES_FILE"

COUNT=$(wc -l < "$IPM_TMP")

echo "OK: ${COUNT} reglas IPMANAGER persistidas en $RULES_FILE"
