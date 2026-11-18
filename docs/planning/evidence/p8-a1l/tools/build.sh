#!/bin/sh
# usage: build.sh <default|world>  — isolated build + typecheck. Every flag is removed from the environment first;
# only the world build sets LOGIC_ISLAND_REGIONAL_WORLD=1. LOGIC_ISLAND_TRIALS is never set.
A=$(cd "$(dirname "$0")" && pwd); K=$1; cd $A/$K || exit 1
unset LOGIC_ISLAND_TRIALS LOGIC_ISLAND_REGIONAL_WORLD LOGIC_ISLAND_PRIVATE_BANK LOGIC_ISLAND_REQUIRE_PRIVATE_BANK LOGIC_ISLAND_ASSET_VAULT IPAS_FIXTURE CCARF_FIXTURE PAPER_POLICY_FIXTURE RETIREMENT_FIXTURE
export NEXT_TELEMETRY_DISABLED=1
[ "$K" = world ] && export LOGIC_ISLAND_REGIONAL_WORLD=1
echo "kind=$K world=${LOGIC_ISLAND_REGIONAL_WORLD:-unset} trials=${LOGIC_ISLAND_TRIALS:-unset} private=$( [ -e private ] && echo present || echo absent)"
echo "== tsc"; node node_modules/typescript/bin/tsc --noEmit; echo "tsc exit $?"
echo "== build"; rm -rf .next; node node_modules/next/dist/bin/next build > $A/build-$K-first.log 2>&1; rc=$?; echo "build first exit $rc"
# Next's upgrade nudge stops the first build of an affected version and lets the same command through on a retry
# (receipt in .next/cache/next-agentic-upgrade-retries, 5 minutes): the retry keeps .next for that reason only.
if [ $rc -ne 0 ] && grep -q SecurityFatalError $A/build-$K-first.log; then echo "stopped by the Next.js security nudge; retrying the same command"; node node_modules/next/dist/bin/next build > $A/build-$K.log 2>&1; rc=$?; else cp $A/build-$K-first.log $A/build-$K.log; fi; echo "build exit $rc"
env | grep -E "LOGIC_ISLAND|FIXTURE" | sed 's/=.*/=<set>/' > .next/BUILD_ENV; echo "kind=$K commit=$(cat $A/COMMIT) built=$(date '+%Y-%m-%dT%H:%M:%S%z')" >> .next/BUILD_ENV
cat .next/BUILD_ENV; grep -E "○|●|ƒ|├|└|┌" $A/build-$K.log | grep -E "/world|/trials|/regions|/learn|/islands|/curriculum|^┌|/ " | cut -c1-90 | head -40; tail -4 $A/build-$K.log | cut -c1-160
