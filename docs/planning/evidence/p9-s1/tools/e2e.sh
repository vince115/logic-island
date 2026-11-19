#!/bin/zsh
# usage: e2e.sh <name> <default|world> <port> [playwright args...]  — full E2E on an isolated build; flags unset first
A=$(cd "$(dirname "$0")" && pwd); N=$1; K=$2; P=$3; shift 3
for v in $(env | grep -E '^LOGIC_ISLAND_|_FIXTURE=' | cut -d= -f1); do unset $v; done
[ "$K" = world ] && export LOGIC_ISLAND_REGIONAL_WORLD=1
cd $A/$N || exit 1
echo "$N ($K) start $(date '+%H:%M:%S') load $(uptime | sed 's/.*averages: //')"
ISO_PORT=$P node node_modules/@playwright/test/cli.js test -c playwright.iso.config.ts --trace retain-on-failure --output $A/e2e-$N-results "$@" > $A/e2e-$N.log 2>&1
echo "$N exit $? end $(date '+%H:%M:%S')"; tail -8 $A/e2e-$N.log | cut -c1-200
