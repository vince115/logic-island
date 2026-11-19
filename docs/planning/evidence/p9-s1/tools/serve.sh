#!/bin/zsh
# usage: serve.sh <name> <default|world> <port>  — a long-lived `next start` of an isolated build (kill it by port)
A=$(cd "$(dirname "$0")" && pwd); N=$1; K=$2; P=$3
for v in $(env | grep -E '^LOGIC_ISLAND_|_FIXTURE=' | cut -d= -f1); do unset $v; done
[ "$K" = world ] && export LOGIC_ISLAND_REGIONAL_WORLD=1
cd $A/$N && exec node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port $P > $A/serve-$N.log 2>&1
