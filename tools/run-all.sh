#!/bin/sh
# Runs every browser test (needs: python3 -m http.server 8080, node tools/relay-broker.mjs). Prints each test's last lines.
cd "$(dirname "$0")/.."
for t in rotate menu-fit layout devices touch trapbar gadget tutorial gamepad guide achv score match online-preview reconnect rejoin endless random lookahead decoy-camera matchmaking batchA ${EXTRA_TESTS}; do
  echo "== $t"; timeout 240 node tools/$t-test.mjs 2>&1 | tail -6
done
