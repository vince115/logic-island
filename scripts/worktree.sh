#!/usr/bin/env bash
# Logic Island worktree helper: every extra working directory lives in one folder.
#
# Rules: docs/handoff/WORKTREE_LIFECYCLE.md (section 6). The public repository has one main checkout; every other
# worktree goes under <dev-hub>/.worktrees/<repo>/<name>, never beside the main checkout as "<repo>-<name>".
#
#   bash scripts/worktree.sh list                         every worktree, where it is, whether something uses it
#   bash scripts/worktree.sh new <name> <branch> [--from <start-point>] [--no-fetch]
#   bash scripts/worktree.sh check <name|path> [--no-fetch]   the seven cleanup conditions, read-only
#   bash scripts/worktree.sh remove <name|path> [--no-fetch]  check, then a plain `git worktree remove`
#   bash scripts/worktree.sh move <name|path> [<new-name>]    bring a worktree from elsewhere into the folder
#   bash scripts/worktree.sh audit                        exit 1 while anything still sits outside the folder
#   bash scripts/worktree.sh install                      `git wt` alias and the creation guard (local, not versioned)
#
# It never forces: no --force, no rm -rf, no reset, no clean, no branch deletion, no stash. When a condition cannot
# be confirmed it stops and leaves the directory as it is. It asks nothing on stdin.
# A temporary worktree under a temp directory (scratch copies for one test run) is not held to the folder.
# macOS bash 3.2 compatible. LOGIC_ISLAND_WORKTREE_ROOT overrides the folder, LOGIC_ISLAND_WORKTREE_TMP the
# colon-separated list of temp directories.

set -u
export GIT_OPTIONAL_LOCKS=0

say() { printf '%s\n' "$*"; }
err() { printf '%s\n' "$*" >&2; }
die() { err "worktree: $*"; exit 1; }

usage() {
  cat <<'EOF'
Logic Island worktree helper (rules: docs/handoff/WORKTREE_LIFECYCLE.md, section 6)

  list                                    every worktree, where it is, whether something uses it
  new <name> <branch> [--from <start>] [--no-fetch]
                                          create <folder>/<name>; a new branch starts at origin/main
  check <name|path> [--no-fetch]          the seven cleanup conditions, read-only
  remove <name|path> [--no-fetch]         check, then a plain `git worktree remove`
  move <name|path> [<new-name>]           bring a worktree from elsewhere into the folder
  audit                                   exit 1 while anything still sits outside the folder
  install                                 `git wt` alias and the creation guard (local, not versioned)

<name> is a short task code such as p98c: lower-case letters, digits, dot, dash, underscore.
Nothing here forces, deletes a branch, or touches a directory another process is using.
EOF
}

git rev-parse --git-dir >/dev/null 2>&1 || die "not inside a Git repository"
# Git hands GIT_DIR (and friends) of the calling worktree to an alias or a hook. Left in place, every
# `git -C <other worktree>` below would silently read the caller's HEAD and index instead of the target's.
unset $(git rev-parse --local-env-vars)
COMMON=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || die "cannot find the repository's Git directory"
COMMON=$(cd "$COMMON" && pwd -P) || die "cannot read $COMMON"
MAIN=$(git worktree list --porcelain | sed -n '1s/^worktree //p')
MAIN=$(cd "$MAIN" 2>/dev/null && pwd -P) || die "cannot find the main checkout"
REPO=$(basename "$MAIN")
SIBLINGS=$(dirname "$MAIN")
if [ -n "${LOGIC_ISLAND_WORKTREE_ROOT:-}" ]; then
  ROOT=$LOGIC_ISLAND_WORKTREE_ROOT
else
  # <dev-hub> is three levels above the main checkout: <dev-hub>/github/<owner>/<repo>.
  HUB=$(cd "$MAIN/../../.." 2>/dev/null && pwd -P) || die "cannot find the folder three levels above $MAIN"
  [ "$HUB" != "/" ] || die "the main checkout is not at <dev-hub>/github/<owner>/<repo>; set LOGIC_ISLAND_WORKTREE_ROOT"
  ROOT="$HUB/.worktrees/$REPO"
fi
case "$ROOT" in /*) ;; *) die "LOGIC_ISLAND_WORKTREE_ROOT must be an absolute path" ;; esac
ROOT=${ROOT%/}
APP_ROOT="$MAIN/.claude/worktrees"
TMP_DIRS=${LOGIC_ISLAND_WORKTREE_TMP:-/private/tmp:/tmp:/private/var/folders:/var/folders}

is_tmp() {
  local IFS=: d
  for d in $TMP_DIRS; do
    [ -n "$d" ] || continue
    case "$1" in "${d%/}"/*) return 0 ;; esac
  done
  return 1
}

# path <TAB> head <TAB> branch <TAB> flags, one worktree per line
worktrees() {
  git worktree list --porcelain | awk '
    /^worktree / { if (p != "") print p "\t" h "\t" b "\t" f; p = substr($0, 10); h = "-"; b = "(detached)"; f = "-" }
    /^HEAD /     { h = $2 }
    /^branch /   { b = substr($0, 8); sub("^refs/heads/", "", b) }
    /^bare/      { b = "(bare)" }
    /^locked/    { f = (f == "-" ? "" : f ",") "locked" }
    /^prunable/  { f = (f == "-" ? "" : f ",") "missing" }
    END { if (p != "") print p "\t" h "\t" b "\t" f }'
}

kind_of() {
  case "$1" in
    "$MAIN") say main ;;
    "$APP_ROOT"/*) say app ;;
    "$ROOT"/*) say central ;;
    *) if is_tmp "$1"; then say scratch; else say legacy; fi ;;
  esac
}

# A name, or a path, to the absolute path of a registered worktree of this repository.
resolve() {
  local t=$1 cand="" c top
  case "$t" in
    */*) cand=$t ;;
    *)
      for c in "$ROOT/$t" "$SIBLINGS/$REPO-$t" "$SIBLINGS/$t" "$APP_ROOT/$t"; do
        if [ -d "$c" ]; then cand=$c; break; fi
      done ;;
  esac
  [ -n "$cand" ] && [ -d "$cand" ] || die "no such worktree: $t (see: worktree.sh list)"
  cand=$(cd "$cand" && pwd -P) || die "cannot read $t"
  top=$(git -C "$cand" rev-parse --show-toplevel 2>/dev/null) || die "$cand is not a Git working directory"
  [ "$top" = "$cand" ] || die "$cand is inside the worktree $top; name the worktree itself"
  c=$(git -C "$cand" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || die "cannot read $cand"
  c=$(cd "$c" && pwd -P)
  [ "$c" = "$COMMON" ] || die "$cand belongs to another repository"
  say "$cand"
}

# One look at the process table for the whole run (lsof takes a couple of seconds).
PROCS_READY=0
PROCS_LSOF=""
PROCS_PS=""
PROCS_OK=1
snapshot_procs() {
  [ "$PROCS_READY" = 1 ] && return 0
  PROCS_READY=1
  if command -v lsof >/dev/null 2>&1 && command -v ps >/dev/null 2>&1; then
    # From "/", so that neither lsof nor the reader holds a directory open itself.
    PROCS_LSOF=$(cd / && lsof -n 2>/dev/null)
    PROCS_PS=$(ps -axo pid=,ppid=,command= 2>/dev/null)
    # A partial listing (restricted lsof, truncated ps) must not read as "nobody uses it": this shell itself has
    # to be in both, or the snapshot is not trusted.
    printf '%s\n' "$PROCS_LSOF" | awk -v me="$$" '$2 == me { f = 1 } END { exit !f }' || PROCS_OK=0
    printf '%s\n' "$PROCS_PS" | awk -v me="$$" '$1 == me { f = 1 } END { exit !f }' || PROCS_OK=0
  else
    PROCS_OK=0
  fi
}

# Processes using a directory: working directory or open file (lsof), or the path on a command line (ps).
# Prints one line per process; returns 2 when the process table could not be read (the caller then refuses).
users_of() {
  local p=$1 anc q
  [ "$PROCS_OK" = 1 ] || return 2
  # lsof prints non-ASCII bytes of a path as \xNN, so such a path could never be matched: refuse instead.
  if printf '%s' "$p" | LC_ALL=C grep -q '[^ -~]'; then return 2; fi
  anc=" $$ "; q=$$
  while [ -n "$q" ] && [ "$q" -gt 1 ] 2>/dev/null; do
    q=$(printf '%s\n' "$PROCS_PS" | awk -v q="$q" '$1 == q { print $2; exit }')
    [ -n "$q" ] && anc="$anc$q "
  done
  {
    printf '%s\n' "$PROCS_LSOF" | WT_P="$p" WT_ME="$$" awk '
      function uses(s, p,   i, off, c) {
        off = 0
        while ((i = index(substr(s, off + 1), p)) > 0) {
          off += i + length(p) - 1; c = substr(s, off + 1, 1)
          if (c == "" || c !~ /[A-Za-z0-9._-]/) return 1
        }
        return 0
      }
      NR > 1 && $2 != ENVIRON["WT_ME"] && uses($0, ENVIRON["WT_P"]) { print $1 " (pid " $2 ") has it open" }'
    # This run, the shells that started it and its own helpers name the path on their command lines: not users.
    printf '%s\n' "$PROCS_PS" | WT_P="$p" WT_ANC="$anc" WT_ME="$$" awk '
      function uses(s, p,   i, off, c) {
        off = 0
        while ((i = index(substr(s, off + 1), p)) > 0) {
          off += i + length(p) - 1; c = substr(s, off + 1, 1)
          if (c == "" || c !~ /[A-Za-z0-9._-]/) return 1
        }
        return 0
      }
      {
        pid = $1; ppid = $2
        if (index(ENVIRON["WT_ANC"], " " pid " ") || ppid == ENVIRON["WT_ME"]) next
        if (uses($0, ENVIRON["WT_P"])) { cmd = $3; sub(".*/", "", cmd); print cmd " (pid " pid ") names it on its command line" }
      }'
  } | sort -u
  return 0
}

valid_name() {
  case "$1" in ""|[!a-z0-9]*|*[!a-z0-9._-]*) return 1 ;; esac
  [ "${#1}" -le 40 ]
}

inside() { case "$(pwd -P)/" in "$1"/*) return 0 ;; *) return 1 ;; esac; }

fetch_origin() {
  git -C "$MAIN" remote get-url origin >/dev/null 2>&1 || { err "worktree: no remote named origin; skipping fetch"; return 0; }
  git -C "$MAIN" fetch --quiet origin || err "worktree: git fetch origin failed; continuing with the refs already here"
}

cmd_list() {
  local p h b f k n state others=0 legacy=0 u
  snapshot_procs
  printf '%-8s %-38s %-8s %-26s %s\n' KIND BRANCH HEAD STATE PATH
  while IFS=$'\t' read -r p h b f; do
    k=$(kind_of "$p")
    if [ ! -d "$p" ]; then
      state="directory missing"
    else
      n=$(git -C "$p" status --porcelain --untracked-files=normal 2>/dev/null | wc -l | tr -d ' ')
      if [ "$n" = 0 ]; then state=clean; else state="$n uncommitted"; fi
      if [ "$k" != main ]; then
        u=$(users_of "$p"); if [ $? = 2 ]; then state="$state, use unknown"; elif [ -n "$u" ]; then state="$state, IN USE"; fi
      fi
    fi
    [ "$f" = "-" ] || state="$state, $f"
    printf '%-8s %-38s %-8s %-26s %s\n' "$k" "$b" "$(printf '%s' "$h" | cut -c1-7)" "$state" "$p"
    case "$k" in central|legacy) others=$((others + 1)) ;; esac
    [ "$k" = legacy ] && legacy=$((legacy + 1))
  done <<EOF
$(worktrees)
EOF
  say ""
  say "folder for new worktrees: $ROOT"
  [ "$legacy" = 0 ] || say "legacy = outside that folder (Pending Migration): 'worktree.sh move <name>' once nothing uses it."
  [ "$others" -le 3 ] || say "note: $others worktrees besides the main checkout; the working limit is 3. Reuse or clean up before adding one."
  say "app = made by the desktop app under .claude/worktrees; the app removes it with its session."
  say "scratch = temporary, under a temp directory; the session that made it removes it."
}

cmd_new() {
  local name="" branch="" from="" fetch=1 p where path n=0 k
  while [ $# -gt 0 ]; do
    case "$1" in
      --from) [ $# -ge 2 ] || die "--from needs a start point"; from=$2; shift 2 ;;
      --no-fetch) fetch=0; shift ;;
      -*) die "unknown option: $1" ;;
      *) if [ -z "$name" ]; then name=$1; elif [ -z "$branch" ]; then branch=$1; else die "too many arguments"; fi; shift ;;
    esac
  done
  [ -n "$name" ] && [ -n "$branch" ] || die "usage: new <name> <branch> [--from <start-point>] [--no-fetch]"
  valid_name "$name" ||
    die "the name must be a short task code: lower-case letters, digits, dot, dash, underscore (got: $name)"
  case "$name" in
    "$REPO"|"$REPO"-*) die "leave out the '$REPO-' prefix: the folder is already $ROOT" ;;
  esac
  git check-ref-format --branch "$branch" >/dev/null 2>&1 || die "not a valid branch name: $branch"
  path="$ROOT/$name"
  [ ! -e "$path" ] || die "$path already exists (see: worktree.sh list)"

  # One branch, one directory: Git refuses a second checkout, and two sessions must not write the same branch.
  where=$(worktrees | awk -F '\t' -v b="$branch" '$3 == b { print $1; exit }')
  [ -z "$where" ] || die "branch $branch is already checked out in $where; work there, or use another branch"

  while IFS=$'\t' read -r p _ _ _; do
    k=$(kind_of "$p"); case "$k" in central|legacy) n=$((n + 1)) ;; esac
  done <<EOF
$(worktrees)
EOF
  [ "$n" -lt 3 ] || err "worktree: note: there are already $n worktrees besides the main checkout (working limit 3); check 'worktree.sh list' for one to reuse or clean up."

  [ "$fetch" = 0 ] || fetch_origin
  mkdir -p "$ROOT" || die "cannot create $ROOT"
  if git -C "$MAIN" show-ref --verify --quiet "refs/heads/$branch"; then
    [ -z "$from" ] || die "branch $branch already exists; --from only applies to a new branch"
    git -C "$MAIN" worktree add "$path" "$branch" || die "git worktree add failed"
    say "created $path on the existing branch $branch"
  elif [ -z "$from" ] && git -C "$MAIN" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    git -C "$MAIN" worktree add --track -b "$branch" "$path" "origin/$branch" || die "git worktree add failed"
    say "created $path on $branch, tracking origin/$branch"
  else
    [ -n "$from" ] || from=refs/remotes/origin/main
    git -C "$MAIN" rev-parse --verify --quiet "$from^{commit}" >/dev/null || die "start point not found: $from"
    git -C "$MAIN" worktree add --no-track -b "$branch" "$path" "$from" || die "git worktree add failed"
    say "created $path on the new branch $branch (from ${from#refs/remotes/})"
  fi
  say "when its pull request is merged: worktree.sh remove $name"
}

# The seven conditions of WORKTREE_LIFECYCLE section 4. Read-only. Returns 0 only when every one holds.
run_check() {
  local p=$1 fetch=$2 fails=0 k head out u rc

  ok() { say "  PASS $1"; }
  no() { say "  FAIL $1"; fails=$((fails + 1)); }

  [ "$fetch" = 0 ] || fetch_origin
  say "checking $p"

  k=$(kind_of "$p")
  case "$k" in
    main) no "1 registered worktree: this is the main checkout, never removed" ;;
    app) no "1 registered worktree: made by the desktop app, which removes it with its session" ;;
    *)
      if worktrees | awk -F '\t' -v p="$p" '$1 == p && $4 ~ /locked/ { found = 1 } END { exit !found }'; then
        no "1 registered worktree: it is locked (git worktree unlock is its owner's decision)"
      else ok "1 registered worktree of this repository"; fi ;;
  esac

  head=$(git -C "$p" rev-parse HEAD 2>/dev/null)
  if ! git -C "$p" rev-parse --verify --quiet refs/remotes/origin/main >/dev/null; then
    no "2 HEAD is in origin/main: there is no origin/main here to compare with"
  elif [ -n "$head" ] && git -C "$p" merge-base --is-ancestor "$head" refs/remotes/origin/main; then
    ok "2 HEAD $(printf '%s' "$head" | cut -c1-7) is in origin/main"
  else
    no "2 HEAD $(printf '%s' "$head" | cut -c1-7) is not in origin/main (not merged, or merged as another commit)"
  fi

  out=$(git -C "$p" status --porcelain --untracked-files=normal 2>/dev/null); rc=$?
  if [ $rc != 0 ]; then no "3 nothing uncommitted: git status failed"
  elif [ -n "$out" ]; then no "3 nothing uncommitted: $(printf '%s\n' "$out" | wc -l | tr -d ' ') uncommitted or untracked path(s)"
  elif git -C "$p" ls-files -v 2>/dev/null | grep -q '^[a-zS] '; then
    # 3. such files never show in git status, so an edit to one would go unseen
    no "3 nothing uncommitted: files are marked skip-worktree or assume-unchanged; their edits cannot be seen"
  elif ls "$(git -C "$p" rev-parse --absolute-git-dir)" 2>/dev/null | grep -Eq '^(MERGE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|BISECT_LOG|rebase-merge|rebase-apply|index\.lock)$'; then
    no "3 nothing uncommitted: a merge, rebase, cherry-pick or bisect is in progress"
  else ok "3 no uncommitted or untracked files, no operation in progress"; fi

  out=$(git -C "$p" rev-list --count HEAD --not --remotes 2>/dev/null)
  if [ "$out" = 0 ]; then ok "4 every commit is on a remote"
  else no "4 every commit is on a remote: ${out:-?} commit(s) exist only here"; fi

  out=$(git -C "$p" status --porcelain --ignored --untracked-files=normal 2>/dev/null | sed -n 's/^!! //p' |
    grep -Ev '^(node_modules/|\.next/|test-results/|tsconfig\.tsbuildinfo|(.*/)?\.DS_Store)$')
  if [ -z "$out" ]; then ok "5 ignored files are build output only"
  else no "5 ignored files are build output only: $(printf '%s\n' "$out" | head -3 | tr '\n' ' ')"; fi

  snapshot_procs
  u=$(users_of "$p"); rc=$?
  if [ $rc = 2 ]; then no "6 nothing uses the directory: the process table could not be read (lsof, ps)"
  elif inside "$p"; then no "6 nothing uses the directory: this command runs inside it; run it from another directory"
  elif [ -n "$u" ]; then no "6 nothing uses the directory: $(printf '%s\n' "$u" | head -3 | tr '\n' ';')"
  else ok "6 no process uses the directory"; fi

  out=$(cd "$p" 2>/dev/null && find . \( -path ./node_modules -o -path ./.next -o -path ./.git \) -prune -o \
    \( -iname '*.blend*' -o -iname '*.pem' -o -iname '*.key' -o -iname '*.p12' -o -iname '*.pfx' \
       -o -iname 'credentials*.json' -o \( -iname '.env*' ! -name '.env.example' \) \
       -o \( -type d -path './private' \) -o \( -type d -name .vercel \) \) -print 2>/dev/null | head -3)
  if ! (cd "$p" 2>/dev/null); then no "7 no private bank, Blender source, env file or credential: the directory cannot be read"
  elif [ -z "$out" ]; then ok "7 no private bank, Blender source, env file or credential"
  else no "7 no private bank, Blender source, env file or credential: $(printf '%s\n' "$out" | tr '\n' ' ')"; fi

  if [ "$fails" = 0 ]; then say "result: all seven conditions hold"; return 0; fi
  say "result: $fails condition(s) not met; the directory stays"
  return 1
}

cmd_check() {
  local target="" fetch=1 p
  while [ $# -gt 0 ]; do
    case "$1" in --no-fetch) fetch=0 ;; -*) die "unknown option: $1" ;; *) [ -z "$target" ] || die "too many arguments"; target=$1 ;; esac
    shift
  done
  [ -n "$target" ] || die "usage: check <name|path> [--no-fetch]"
  p=$(resolve "$target") || exit 1
  run_check "$p" "$fetch"
}

cmd_remove() {
  local target="" fetch=1 p b
  while [ $# -gt 0 ]; do
    case "$1" in
      --no-fetch) fetch=0 ;;
      --force|-f) die "this helper never forces; a directory that fails the check stays" ;;
      -*) die "unknown option: $1" ;;
      *) [ -z "$target" ] || die "too many arguments"; target=$1 ;;
    esac
    shift
  done
  [ -n "$target" ] || die "usage: remove <name|path> [--no-fetch]"
  p=$(resolve "$target") || exit 1
  run_check "$p" "$fetch" || die "not removed: $p"
  b=$(git -C "$p" symbolic-ref --quiet --short HEAD 2>/dev/null)
  git -C "$MAIN" worktree remove "$p" || die "git worktree remove refused; nothing was forced, $p stays"
  [ ! -e "$p" ] || die "$p still exists after git worktree remove"
  say "removed $p"
  [ -z "$b" ] || say "branch $b is kept (merged branches and tags are never deleted here)"
  if [ -f "$MAIN/.claude/launch.json" ] && grep -qF "$p" "$MAIN/.claude/launch.json"; then
    say "note: $MAIN/.claude/launch.json still has an entry for that path; remove the entry"
  fi
}

# What must be the same before and after a move.
fingerprint() {
  local p=$1
  say "head=$(git -C "$p" rev-parse HEAD 2>/dev/null)"
  say "branch=$(git -C "$p" symbolic-ref --quiet HEAD 2>/dev/null || echo detached)"
  say "status=$(git -C "$p" status --porcelain=v1 --ignored --untracked-files=normal 2>/dev/null | cksum)"
  say "files=$(cd "$p" && find . \( -path ./node_modules -o -path ./.next \) -prune -o -type f ! -path ./.git -print 2>/dev/null | LC_ALL=C sort | cksum)"
}

cmd_move() {
  local target="" name="" p k dest u rc before after
  while [ $# -gt 0 ]; do
    case "$1" in
      --force|-f) die "this helper never forces" ;;
      -*) die "unknown option: $1" ;;
      *) if [ -z "$target" ]; then target=$1; elif [ -z "$name" ]; then name=$1; else die "too many arguments"; fi ;;
    esac
    shift
  done
  [ -n "$target" ] || die "usage: move <name|path> [<new-name>]"
  p=$(resolve "$target") || exit 1
  k=$(kind_of "$p")
  case "$k" in
    main) die "the main checkout does not move" ;;
    app) die "$p is managed by the desktop app; it stays where the app put it" ;;
    central) die "$p is already in $ROOT" ;;
  esac
  if [ -z "$name" ]; then name=$(basename "$p"); name=${name#"$REPO"-}; fi
  valid_name "$name" || die "the new name must be a short task code (got: $name)"
  dest="$ROOT/$name"
  [ ! -e "$dest" ] || die "$dest already exists"
  if worktrees | awk -F '\t' -v p="$p" '$1 == p && $4 ~ /locked/ { found = 1 } END { exit !found }'; then
    die "$p is locked; it stays"
  fi
  [ ! -f "$p/.gitmodules" ] || die "$p has submodules; git worktree move cannot move it"
  inside "$p" && die "this command runs inside $p; run it from another directory"
  snapshot_procs
  u=$(users_of "$p"); rc=$?
  [ $rc != 2 ] || die "the process table could not be read (lsof, ps); not moving $p"
  if [ -n "$u" ]; then
    err "worktree: $p is in use (Pending Migration; move it when its session is done):"
    printf '%s\n' "$u" | head -5 | sed 's/^/  /' >&2
    exit 1
  fi
  before=$(fingerprint "$p")
  mkdir -p "$ROOT" || die "cannot create $ROOT"
  git -C "$MAIN" worktree move "$p" "$dest" || die "git worktree move refused; nothing was forced, $p stays"
  after=$(fingerprint "$dest")
  say "moved $p"
  say "   to $dest"
  if [ "$before" = "$after" ] && [ ! -e "$p" ] && [ "$(git -C "$dest" rev-parse --show-toplevel 2>/dev/null)" = "$dest" ]; then
    say "verified: HEAD, branch, git status (tracked, untracked, ignored) and the file list are unchanged"
    printf '%s\n' "$after" | sed -n '1,2s/^/  /p'
  else
    err "worktree: the directory moved, but its state differs from before. Do not continue; compare:"
    err "before:"; printf '%s\n' "$before" | sed 's/^/  /' >&2
    err "after:";  printf '%s\n' "$after" | sed 's/^/  /' >&2
    exit 1
  fi
  say "sessions and notes that used the old path must use the new one."
}

cmd_audit() {
  local p h b f k bad=0 d
  while IFS=$'\t' read -r p h b f; do
    k=$(kind_of "$p")
    if [ "$k" = legacy ]; then say "outside the folder: $p ($b)"; bad=$((bad + 1)); fi
  done <<EOF
$(worktrees)
EOF
  # Directories beside the main checkout that look like one more copy of it. "<repo>-private" is the private
  # repository's fixed place, not a worktree.
  for d in "$SIBLINGS/$REPO"-*; do
    [ -d "$d" ] || continue
    [ "$d" = "$SIBLINGS/$REPO-private" ] && continue
    if ! worktrees | cut -f1 | grep -qxF "$d"; then say "beside the main checkout, not a worktree: $d"; bad=$((bad + 1)); fi
  done
  if [ "$bad" = 0 ]; then say "clean: every worktree is in $ROOT (or app-managed)"; return 0; fi
  say "$bad director$([ "$bad" = 1 ] && echo y || echo ies) outside $ROOT"
  return 1
}

HOOK_MARK="logic-island worktree guard"
hook_body() {
  cat <<'EOF'
#!/bin/sh
# logic-island worktree guard (installed by scripts/worktree.sh install; remove this file to disable it).
# Runs after every checkout; acts only when a NEW worktree has just been created outside the worktree folder.
# It warns and never fails: a checkout is never blocked by it. Rules: docs/handoff/WORKTREE_LIFECYCLE.md section 6.
[ "$1" = "0000000000000000000000000000000000000000" ] || exit 0
top=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
main=${common%/.git}
[ "$top" != "$main" ] || exit 0
repo=${main##*/}
if [ -n "${LOGIC_ISLAND_WORKTREE_ROOT:-}" ]; then root=${LOGIC_ISLAND_WORKTREE_ROOT%/}
else hub=$(cd "$main/../../.." 2>/dev/null && pwd -P) || exit 0; root="$hub/.worktrees/$repo"; fi
case "$top" in "$root"/*|"$main"/.claude/worktrees/*) exit 0 ;; esac
# Temporary worktrees (scratch copies for one test run) are not held to the folder.
for d in $(printf '%s' "${LOGIC_ISLAND_WORKTREE_TMP:-/private/tmp:/tmp:/private/var/folders:/var/folders}" | tr ':' ' '); do
  case "$top" in "${d%/}"/*) exit 0 ;; esac
done
name=${top##*/}; name=${name#"$repo"-}
cat >&2 <<MSG

*** worktree guard: $top
*** is outside the worktree folder $root
*** New worktrees do not go beside the main checkout (docs/handoff/WORKTREE_LIFECYCLE.md, section 6).
*** Before working in it:   git worktree move "$top" "$root/$name"
*** Next time:              git wt new <name> <branch>

MSG
exit 0
EOF
}

alias_body() {
  # Runs the helper as it is on origin/main, so every checkout uses the same version whatever branch it is on;
  # falls back to the copy in the current checkout, then to the one in the main checkout.
  cat <<'EOF'
!f() { c=$(git rev-parse --path-format=absolute --git-common-dir) || exit 1; m=${c%/.git}; t=$(mktemp) || exit 1; if git -C "$m" show origin/main:scripts/worktree.sh >"$t" 2>/dev/null && [ -s "$t" ]; then :; elif [ -f scripts/worktree.sh ]; then cat scripts/worktree.sh >"$t"; elif [ -f "$m/scripts/worktree.sh" ]; then cat "$m/scripts/worktree.sh" >"$t"; else rm -f "$t"; echo "git wt: scripts/worktree.sh is not on origin/main and not in this checkout (git fetch origin)" >&2; exit 1; fi; cd "${GIT_PREFIX:-.}" || exit 1; bash "$t" "$@"; rc=$?; rm -f "$t"; exit $rc; }; f
EOF
}

cmd_install() {
  local hooks hook cur
  [ -z "$(git config --get core.hooksPath 2>/dev/null)" ] || die "core.hooksPath is set; add the guard to that hooks directory by hand"
  hooks="$COMMON/hooks"; hook="$hooks/post-checkout"
  mkdir -p "$hooks" || die "cannot create $hooks"
  if [ -e "$hook" ] && ! grep -qF "$HOOK_MARK" "$hook"; then
    err "worktree: $hook exists and is not this guard; left untouched. Add the guard to it by hand if wanted."
  else
    hook_body >"$hook.tmp.$$" && chmod +x "$hook.tmp.$$" && mv "$hook.tmp.$$" "$hook" || die "cannot write $hook"
    say "guard installed: $hook (warns when a new worktree is created outside $ROOT)"
  fi
  cur=$(git config --local --get alias.wt 2>/dev/null)
  if [ -n "$cur" ] && ! printf '%s' "$cur" | grep -qF 'scripts/worktree.sh'; then
    err "worktree: the alias 'wt' already means something else here; left untouched."
  else
    git config --local alias.wt "$(alias_body)" || die "cannot set the alias"
    say "alias installed: git wt <command> (works in every worktree of this repository)"
  fi
}

cmd=${1:-}
[ $# -gt 0 ] && shift
case "$cmd" in
  list) cmd_list "$@" ;;
  new) cmd_new "$@" ;;
  check) cmd_check "$@" ;;
  remove) cmd_remove "$@" ;;
  move) cmd_move "$@" ;;
  audit) cmd_audit "$@" ;;
  install) cmd_install "$@" ;;
  ""|help|-h|--help) usage ;;
  *) err "worktree: unknown command: $cmd"; usage >&2; exit 1 ;;
esac
