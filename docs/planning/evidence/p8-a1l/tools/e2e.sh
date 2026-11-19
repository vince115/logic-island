#!/bin/sh
# Full E2E on both isolated builds, one after the other, traces kept for failures. World-only first.
A=$(cd "$(dirname "$0")" && pwd)
unset LOGIC_ISLAND_TRIALS LOGIC_ISLAND_REGIONAL_WORLD LOGIC_ISLAND_PRIVATE_BANK LOGIC_ISLAND_REQUIRE_PRIVATE_BANK IPAS_FIXTURE CCARF_FIXTURE PAPER_POLICY_FIXTURE RETIREMENT_FIXTURE
cd $A/world && echo "world start $(date '+%H:%M:%S') load $(uptime | sed 's/.*averages: //')" && ISO_PORT=3134 LOGIC_ISLAND_REGIONAL_WORLD=1 node node_modules/@playwright/test/cli.js test -c playwright.iso.config.ts --trace retain-on-failure --output $A/e2e-world-results > $A/e2e-world.log 2>&1; echo "world exit $? $(date '+%H:%M:%S') load $(uptime | sed 's/.*averages: //')"; tail -6 $A/e2e-world.log
cd $A/default && echo "default start $(date '+%H:%M:%S')" && ISO_PORT=3133 node node_modules/@playwright/test/cli.js test -c playwright.iso.config.ts --trace retain-on-failure --output $A/e2e-default-results > $A/e2e-default.log 2>&1; echo "default exit $? $(date '+%H:%M:%S') load $(uptime | sed 's/.*averages: //')"; tail -6 $A/e2e-default.log
