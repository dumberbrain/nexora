# Shared progress machinery for the hooks. `pre-commit` and `pre-push` load it
# with `. "$ROOT/.husky/lib.sh"` — husky only treats files git invokes by hook
# name as hooks, so this file never runs on its own.
#
# Why it exists: lint takes seconds and nothing appeared on screen while it ran,
# so the terminal looked frozen. Each step is therefore printed BEFORE the work
# starts, with no trailing newline ("[2/5] lint … "), and "ok 4.1s" is appended
# to the same line when it returns. No background spinner: a hook has to stay
# simple and stay readable in a CI log.
#
# This file must stay tracked — `set -e` plus a missing `.` target fails the
# hook outright.

fail() { printf '\n' >&2; echo "✖ $1" >&2; exit 1; }

# Timing is optional. Where `date +%s%3N` or `awk` is missing, TIMER=0 and the
# steps print a bare "ok". A missing clock never gates a commit.
TIMER=0
if command -v awk >/dev/null 2>&1; then
  case "$(date +%s%3N 2>/dev/null)" in
    ''|*[!0-9]*) ;;
    *) TIMER=1 ;;
  esac
fi

now_ms() { [ "$TIMER" = 1 ] && date +%s%3N || echo 0; }
since()  { [ "$TIMER" = 1 ] && awk -v a="$1" -v b="$(now_ms)" 'BEGIN{printf " %.1fs",(b-a)/1000}'; }

# Step counter. The calling hook must set TOTAL before the first `step`.
TOTAL=0
STEP=0
STEP_T0=0

step()      { STEP=$((STEP + 1)); STEP_T0="$(now_ms)"; printf '[%d/%d] %s … ' "$STEP" "$TOTAL" "$1"; }
step_ok()   { printf 'ok%s\n' "$(since "$STEP_T0")"; }
step_skip() { printf '⚠ skipped (%s)\n' "$1"; }

count() { echo "$1" | grep -c . ; }
