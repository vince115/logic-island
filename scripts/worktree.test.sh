#!/usr/bin/env bash
# Self-test for scripts/worktree.sh. Builds a throwaway repository laid out like the real one
# (<tmp>/hub/github/acme/demo with a bare "origin") and drives every command against it. It never touches the
# repository it is run from. Run: bash scripts/worktree.test.sh   (macOS or Linux; needs git, lsof, ps)
set -u

HELPER=$(cd "$(dirname "$0")" && pwd -P)/worktree.sh
[ -f "$HELPER" ] || { echo "worktree.sh not found beside this test"; exit 1; }
T=$(mktemp -d) || exit 1
T=$(cd "$T" && pwd -P)
cleanup() { [ -n "${SLEEPER:-}" ] && kill "$SLEEPER" 2>/dev/null; rm -rf "$T"; }
trap cleanup EXIT

pass=0; fail=0
ok() { pass=$((pass + 1)); printf 'ok    %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL  %s\n' "$1"; [ -z "${2:-}" ] || printf '%s\n' "$2" | sed 's/^/      /'; }
# expect <exit: 0|nonzero> <text the output must contain, or ""> <label> <command...>
expect() {
  local want=$1 text=$2 label=$3 out rc; shift 3
  out=$("$@" 2>&1); rc=$?
  if [ "$want" = 0 ] && [ $rc != 0 ]; then bad "$label (exit $rc)" "$out"; return; fi
  if [ "$want" != 0 ] && [ $rc = 0 ]; then bad "$label (expected a refusal)" "$out"; return; fi
  if [ -n "$text" ] && ! printf '%s' "$out" | grep -qF -- "$text"; then bad "$label (missing: $text)" "$out"; return; fi
  ok "$label"
}
wt() { bash "$HELPER" "$@"; }

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.invalid GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.invalid
unset LOGIC_ISLAND_WORKTREE_ROOT
# The whole test lives in a temp directory, so narrow "temp" to one folder of it.
export LOGIC_ISLAND_WORKTREE_TMP="$T/scratch"

MAIN="$T/hub/github/acme/demo"; ROOT="$T/hub/.worktrees/demo"
mkdir -p "$MAIN" && git init -q --bare "$T/origin.git" && git init -q -b main "$MAIN" && cd "$MAIN" || exit 1
printf 'node_modules/\n.next/\n*.blend\nscratch.log\n' >.gitignore
echo one >a.txt; git add . && git commit -qm init
git remote add origin "$T/origin.git" && git push -q origin main && git fetch -q origin

# --- new ---------------------------------------------------------------------------------------------------------
expect 0 "created $ROOT/alpha on the new branch feat/alpha (from origin/main)" "new: creates in the folder" wt new alpha feat/alpha
[ "$(git -C "$ROOT/alpha" symbolic-ref --short HEAD)" = feat/alpha ] && ok "new: branch checked out" || bad "new: branch checked out"
[ -z "$(git -C "$ROOT/alpha" rev-parse --abbrev-ref '@{u}' 2>/dev/null)" ] && ok "new: a new branch tracks nothing" || bad "new: a new branch tracks nothing"
expect 1 "already checked out" "new: one branch, one directory" wt new beta feat/alpha
expect 1 "already exists" "new: existing path refused" wt new alpha feat/other
expect 1 "short task code" "new: upper case refused" wt new Alpha feat/x
expect 1 "short task code" "new: slash in name refused" wt new a/b feat/x
expect 1 "leave out the 'demo-' prefix" "new: repo prefix refused" wt new demo-x feat/x
expect 1 "start point not found" "new: unknown start point refused" wt new gamma feat/gamma --from nope
[ ! -e "$ROOT/gamma" ] && ok "new: nothing left behind after a refusal" || bad "new: nothing left behind after a refusal"
git branch -q keep main
expect 0 "on the existing branch keep" "new: existing local branch" wt new keepdir keep
git -C "$ROOT/alpha" push -q origin feat/alpha
git -C "$MAIN" worktree remove "$ROOT/alpha" && git branch -qD feat/alpha
expect 0 "tracking origin/feat/alpha" "new: branch that exists only on origin" wt new alpha feat/alpha

# --- check / remove ----------------------------------------------------------------------------------------------
expect 0 "all seven conditions hold" "check: a merged, clean worktree passes" wt check alpha
echo two >"$ROOT/alpha/b.txt"
expect 1 "FAIL 3" "check: untracked file fails 3" wt check alpha
expect 1 "not removed" "remove: refuses a dirty worktree" wt remove alpha
[ -f "$ROOT/alpha/b.txt" ] && ok "remove: the dirty worktree is intact" || bad "remove: the dirty worktree is intact"
git -C "$ROOT/alpha" add b.txt && git -C "$ROOT/alpha" commit -qm two
out=$(wt check alpha 2>&1)
printf '%s' "$out" | grep -q 'FAIL 2' && printf '%s' "$out" | grep -q 'FAIL 4' && ok "check: unmerged and unpushed fail 2 and 4" || bad "check: unmerged and unpushed fail 2 and 4" "$out"
git -C "$ROOT/alpha" push -q origin feat/alpha
out=$(wt check alpha 2>&1)
printf '%s' "$out" | grep -q 'FAIL 2' && printf '%s' "$out" | grep -q 'PASS 4' && ok "check: pushed but unmerged fails 2 only" || bad "check: pushed but unmerged fails 2 only" "$out"
expect 1 "not removed" "remove: refuses unmerged work" wt remove alpha
git merge -q --no-ff -m merge feat/alpha && git push -q origin main
expect 0 "all seven conditions hold" "check: passes once merged" wt check alpha
: >"$ROOT/alpha/model.blend"
expect 1 "FAIL 7" "check: a Blender source fails 7" wt check alpha
rm "$ROOT/alpha/model.blend"; : >"$ROOT/alpha/scratch.log"
expect 1 "FAIL 5" "check: an unknown ignored file fails 5" wt check alpha
rm "$ROOT/alpha/scratch.log"; : >"$ROOT/alpha/.env.local"
expect 1 "FAIL 7" "check: an env file fails 7" wt check alpha
rm "$ROOT/alpha/.env.local"; mkdir "$ROOT/alpha/node_modules" && : >"$ROOT/alpha/node_modules/x"
expect 0 "all seven conditions hold" "check: node_modules is build output" wt check alpha
(cd "$ROOT/alpha" && exec sleep 300) & SLEEPER=$!
sleep 1
expect 1 "FAIL 6" "check: a process inside fails 6" wt check alpha
expect 1 "not removed" "remove: refuses while a process is inside" wt remove alpha
kill "$SLEEPER" 2>/dev/null; wait "$SLEEPER" 2>/dev/null; SLEEPER=""
out=$(cd "$ROOT/alpha" && wt check alpha 2>&1)
printf '%s' "$out" | grep -q 'FAIL 6' && ok "check: run from inside fails 6" || bad "check: run from inside fails 6" "$out"
expect 1 "main checkout" "check: the main checkout never passes" wt check "$MAIN"
expect 1 "never forces" "remove: --force refused" wt remove alpha --force
expect 0 "branch feat/alpha is kept" "remove: removes a merged, clean, unused worktree" wt remove alpha
[ ! -e "$ROOT/alpha" ] && git show-ref --verify -q refs/heads/feat/alpha && ok "remove: directory gone, branch kept" || bad "remove: directory gone, branch kept"

# --- move / audit ------------------------------------------------------------------------------------------------
git worktree add -q -b old/one "$T/hub/github/acme/demo-old" main 2>/dev/null
echo wip >"$T/hub/github/acme/demo-old/wip.txt"; : >"$T/hub/github/acme/demo-old/art.blend"
before=$(git -C "$T/hub/github/acme/demo-old" status --porcelain --ignored)
expect 1 "outside the folder" "audit: flags a worktree beside the main checkout" wt audit
(cd "$T/hub/github/acme/demo-old" && exec sleep 300) & SLEEPER=$!
sleep 1
expect 1 "in use" "move: refuses while a process is inside" wt move old
[ -d "$T/hub/github/acme/demo-old" ] && ok "move: the busy worktree stayed" || bad "move: the busy worktree stayed"
kill "$SLEEPER" 2>/dev/null; wait "$SLEEPER" 2>/dev/null; SLEEPER=""
expect 0 "verified: HEAD, branch, git status" "move: brings it into the folder by name" wt move old
after=$(git -C "$ROOT/old" status --porcelain --ignored 2>/dev/null)
[ "$before" = "$after" ] && [ -f "$ROOT/old/wip.txt" ] && [ -f "$ROOT/old/art.blend" ] && [ ! -e "$T/hub/github/acme/demo-old" ] &&
  ok "move: untracked and ignored files came along unchanged" || bad "move: untracked and ignored files came along unchanged"
expect 1 "already in" "move: a worktree already in the folder stays" wt move old
expect 1 "does not move" "move: the main checkout stays" wt move "$MAIN"
mkdir "$T/hub/github/acme/demo-stray" "$T/hub/github/acme/demo-private"
out=$(wt audit 2>&1)
printf '%s' "$out" | grep -q 'demo-stray' && ! printf '%s' "$out" | grep -q 'demo-private' && ok "audit: stray folder flagged, <repo>-private left alone" || bad "audit: stray folder flagged, <repo>-private left alone" "$out"
rmdir "$T/hub/github/acme/demo-stray"
expect 0 "clean:" "audit: clean when everything is in the folder" wt audit

# --- list --------------------------------------------------------------------------------------------------------
out=$(wt list 2>&1)
printf '%s' "$out" | grep -Eq '^main +main ' && printf '%s' "$out" | grep -Eq '^central +old/one .*1 uncommitted' && ok "list: kinds and state" || bad "list: kinds and state" "$out"

# --- install: guard and alias ------------------------------------------------------------------------------------
expect 0 "guard installed" "install: guard and alias" wt install
expect 0 "guard installed" "install: twice is the same" wt install
out=$(git worktree add -b raw/one "$T/hub/github/acme/demo-raw" main 2>&1)
printf '%s' "$out" | grep -q 'worktree guard' && printf '%s' "$out" | grep -qF "git worktree move \"$T/hub/github/acme/demo-raw\" \"$ROOT/raw\"" && ok "guard: warns on a worktree beside the main checkout" || bad "guard: warns on a worktree beside the main checkout" "$out"
out=$(git worktree add -b raw/two "$ROOT/two" main 2>&1)
printf '%s' "$out" | grep -q 'worktree guard' && bad "guard: silent inside the folder" "$out" || ok "guard: silent inside the folder"
mkdir -p "$MAIN/.claude/worktrees"
out=$(git worktree add -b raw/app "$MAIN/.claude/worktrees/app-one" main 2>&1)
printf '%s' "$out" | grep -q 'worktree guard' && bad "guard: silent for app worktrees" "$out" || ok "guard: silent for app worktrees"
out=$(git -C "$T/hub/github/acme/demo-raw" checkout -q -b raw/three 2>&1; git -C "$T/hub/github/acme/demo-raw" checkout -q raw/one 2>&1)
[ -z "$out" ] && ok "guard: silent on ordinary checkouts, even outside the folder" || bad "guard: silent on ordinary checkouts, even outside the folder" "$out"
mkdir -p "$T/scratch"
out=$(git worktree add -b raw/tmp "$T/scratch/run1" main 2>&1)
printf '%s' "$out" | grep -q 'worktree guard' && bad "guard: silent for a temporary worktree" "$out" || ok "guard: silent for a temporary worktree"
out=$(wt list 2>&1)
printf '%s' "$out" | grep -Eq '^scratch +raw/tmp ' && ok "list: a temporary worktree is scratch" || bad "list: a temporary worktree is scratch" "$out"
out=$(wt audit 2>&1)
printf '%s' "$out" | grep -q 'scratch/run1' && bad "audit: a temporary worktree is not flagged" "$out" || ok "audit: a temporary worktree is not flagged"
git worktree remove "$T/scratch/run1"
expect 1 "desktop app" "check: an app worktree is not ours to remove" wt check app-one
expect 1 "desktop app" "move: an app worktree stays" wt move app-one
mkdir -p scripts && cp "$HELPER" scripts/worktree.sh
out=$(cd "$ROOT/two" && git wt audit 2>&1)
printf '%s' "$out" | grep -q 'demo-raw' && ok "alias: git wt runs from any worktree (copy in the main checkout)" || bad "alias: git wt runs from any worktree (copy in the main checkout)" "$out"
git add scripts/worktree.sh && git commit -qm helper && git push -q origin main && git fetch -q origin && git rm -q scripts/worktree.sh && git commit -qm drop
out=$(cd "$ROOT/two" && git wt move raw 2>&1)
printf '%s' "$out" | grep -q 'verified:' && [ -d "$ROOT/raw" ] && ok "alias: git wt uses the helper on origin/main" || bad "alias: git wt uses the helper on origin/main" "$out"
printf '#!/bin/sh\n# someone else\n' >.git/hooks/post-checkout
expect 0 "left untouched" "install: a foreign post-checkout hook is not overwritten" wt install
grep -q 'someone else' .git/hooks/post-checkout && ok "install: the foreign hook is intact" || bad "install: the foreign hook is intact"

echo
echo "worktree.sh self-test: $pass passed, $fail failed"
[ "$fail" = 0 ]
