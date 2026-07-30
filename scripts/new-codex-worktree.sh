#!/usr/bin/env sh
set -eu
task_name=${1:-}
base_ref=${2:-main}
case "$task_name" in '' | *[!a-z0-9-]*) printf '%s\n' "Usage: pnpm worktree:codex <task-name> [base-ref]" >&2; exit 64;; esac
repo_root=$(git rev-parse --show-toplevel)
branch="codex/$task_name"
worktree_path="$(dirname "$repo_root")/$(basename "$repo_root")-$task_name"
if git show-ref --verify --quiet "refs/heads/$branch" || [ -e "$worktree_path" ]; then printf '%s\n' "Branch or worktree path already exists" >&2; exit 1; fi
git worktree add -b "$branch" "$worktree_path" "$base_ref"
git -C "$worktree_path" config core.hooksPath .githooks
printf '%s\n' "Created $worktree_path on $branch"
