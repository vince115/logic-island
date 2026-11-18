#!/bin/sh
# A1-P: the whole Preview acceptance in one run, through the Preview door (preview-proxy.mjs). Reuses the A1-L tools
# (../../p8-a1l/tools) unchanged, so A1-L and A1-P are measured the same way.
#
# usage: sh a1p.sh <copy-root> <out-dir> <commit>
#   <copy-root>  an isolated checkout of <commit> (git archive), with node_modules, built world-only by
#                ../../p8-a1l/tools/build.sh, and served on $LOCAL for the local-against-Preview comparison
#   $DOOR        the Preview door, default http://127.0.0.1:3150 (start preview-proxy.mjs first)
#   $LOCAL       the local world-only build of the same commit, default http://127.0.0.1:3132
#   $LOGIC_ISLAND_PRIVATE_BANK  the private bank's checkout, for the leak scan only (read; never copied)
# Stops at the preflight if the server is not the release combination or is Vercel's login page.
# Does not deploy, does not change any Vercel setting and never touches Production (it is only read, to compare).
T=$(cd "$(dirname "$0")" && pwd); L=$T/../../p8-a1l/tools; R=$1; O=$2; C=$3
DOOR=${DOOR:-http://127.0.0.1:3150}; LOCAL=${LOCAL:-http://127.0.0.1:3132}; PROD=https://logic-island-psi.vercel.app
[ -n "$R" ] && [ -n "$O" ] && [ -n "$C" ] || { echo "usage: sh a1p.sh <copy-root> <out-dir> <commit>"; exit 2; }
BANK=${LOGIC_ISLAND_PRIVATE_BANK:-}
unset LOGIC_ISLAND_TRIALS LOGIC_ISLAND_REGIONAL_WORLD LOGIC_ISLAND_WORLD_REVIEW LOGIC_ISLAND_PRIVATE_BANK LOGIC_ISLAND_REQUIRE_PRIVATE_BANK IPAS_FIXTURE CCARF_FIXTURE PAPER_POLICY_FIXTURE RETIREMENT_FIXTURE
PAGES="/ /islands /curriculum /learn /regions/cs /regions/ai /regions/design /regions/web /regions/sys /learn/linux-terminal"
WORLD="/world /world/cs /world/ai /world/design /world/web /world/sys"
mkdir -p "$O"; O=$(cd "$O" && pwd)
door() { curl -s "$DOOR/__proxy/status"; }
echo "A1-P $(date '+%Y-%m-%dT%H:%M:%S%z') commit=$C door=$(door | sed -E 's/"requests".*//')" | tee "$O/RUN"

echo "== 1 preflight";            node "$T/preview-check.mjs" "$R" "$DOOR" "$C" > "$O/check.json"; rc=$?; grep -E '"(id|result)"' "$O/check.json" | paste - - | sed -E 's/[" ,]//g'
[ $rc -eq 0 ] || { echo "preflight failed: this is not the release combination, or the Preview was not reached. Stopped."; exit 1; }
echo "== 2 routes and trials";    node "$L/phase2.mjs" "$R" "$DOOR" "$O/resp" world > "$O/phase2.jsonl" 2>&1; echo "exit $?"
echo "== 3 V-01..V-10";           node "$L/a1.mjs" "$R" "$DOOR" "$O/a1" preview "$C" > "$O/a1.log" 2>&1; echo "exit $?"
                                  node "$L/sheets.mjs" "$R" "$O/a1/shots" "$O/a1/sheets" "A1-P | preview | $C" >> "$O/a1.log" 2>&1
echo "== 4 lessons and terminal"; node "$L/post.mjs" "$R" "$DOOR" "$O/post" world > "$O/post.jsonl" 2>&1; echo "exit $?"
echo "== 5 script weight";        node "$L/bundle.mjs" "$DOOR" $PAGES $WORLD > "$O/bundle.jsonl" 2>&1; echo "exit $?"
echo "== 6 same as the local build, same as Production"
                                  node "$L/same.mjs" "$R" "$LOCAL" "$DOOR" $PAGES > "$O/same-local-preview.jsonl" 2>&1; echo "local/preview exit $?"
                                  node "$L/same.mjs" "$R" "$DOOR" "$PROD" $PAGES > "$O/same-preview-production.jsonl" 2>&1; echo "preview/production exit $?"
echo "== 7 E2E (world-only)";     cp "$T/playwright.remote.config.ts" "$R/"; ( cd "$R" && REMOTE_BASE=$DOOR LOGIC_ISLAND_REGIONAL_WORLD=1 node node_modules/@playwright/test/cli.js test -c playwright.remote.config.ts --output "$O/e2e-results" > "$O/e2e.log" 2>&1 ); echo "exit $?"; tail -5 "$O/e2e.log"
echo "== 8 leak scans"
if [ -n "$BANK" ]; then for d in resp post; do ( cd "$R" && LOGIC_ISLAND_PRIVATE_BANK=$BANK node --experimental-transform-types --no-warnings --import ./scripts/trials/register.mjs scripts/trials/leak-scan.ts --dir "$O/$d" ); echo "private bank, $d: exit $?"; done > "$O/leak-scan.txt" 2>&1; cat "$O/leak-scan.txt"
else echo "private bank: NOT TESTED (LOGIC_ISLAND_PRIVATE_BANK is not set)" | tee "$O/leak-scan.txt"; fi
node "$L/pubscan.mjs" "$R" "$O/resp" "$O/post" >> "$O/leak-scan.txt" 2>&1
echo "== 9 the door"; door | tee "$O/door.json"; echo
door | grep -q '"loginPages":0' || { echo "some responses were Vercel's login page: this run is void"; exit 1; }
echo "done $(date '+%H:%M:%S'); results in $O"
