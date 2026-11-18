#!/bin/sh
A=$(cd "$(dirname "$0")" && pwd); P=https://logic-island-psi.vercel.app; D=http://127.0.0.1:3131; W=http://127.0.0.1:3132
PAGES="/ /islands /curriculum /learn /regions/cs /regions/ai /regions/design /regions/web /regions/sys /learn/linux-terminal"
node $A/same.mjs $A/default $D $P $PAGES > $A/same-default-prod.jsonl 2>&1
node $A/same.mjs $A/world $W $P $PAGES > $A/same-world-prod.jsonl 2>&1
node $A/same.mjs $A/world $D $W $PAGES > $A/same-default-world.jsonl 2>&1
for t in default:$D:default world:$W:world production:$P:default; do n=${t%%:*}; rest=${t#*:}; b=${rest%:*}; k=${rest##*:}; rm -rf $A/post-$n; node $A/post.mjs $A/world $b $A/post-$n $k > $A/post-$n.jsonl 2>&1; echo "post $n exit $?"; done
for t in default:$D world:$W production:$P; do n=${t%%:*}; b=${t#*:}; node $A/bundle.mjs $b $PAGES /curriculum/programs-and-algorithms /learn/bfs > $A/bundle-$n.jsonl 2>&1; done
node $A/bundle.mjs $W /world /world/cs /world/ai /world/design /world/web /world/sys > $A/bundle-world-pages.jsonl 2>&1
echo done
