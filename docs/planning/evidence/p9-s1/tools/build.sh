#!/bin/zsh
# usage: build.sh <name> <default|world>  — isolated build; every flag unset first, the world build sets only the world flag
A=$(cd "$(dirname "$0")" && pwd); N=$1; K=$2; cd $A/$N || exit 1
for v in $(env | grep -E '^LOGIC_ISLAND_|_FIXTURE=' | cut -d= -f1); do unset $v; done
export NEXT_TELEMETRY_DISABLED=1
[ "$K" = world ] && export LOGIC_ISLAND_REGIONAL_WORLD=1
rm -rf .next; node node_modules/next/dist/bin/next build > $A/build-$N-first.log 2>&1; rc=$?
if [ $rc -ne 0 ] && grep -q SecurityFatalError $A/build-$N-first.log; then node node_modules/next/dist/bin/next build > $A/build-$N.log 2>&1; rc=$?; else cp $A/build-$N-first.log $A/build-$N.log; fi
echo "build $N ($K, world=${LOGIC_ISLAND_REGIONAL_WORLD:-unset}) exit $rc  $(grep -cE '^[├└┌]' $A/build-$N.log) routes  $(date '+%H:%M:%S')"
