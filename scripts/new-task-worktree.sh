#!/usr/bin/env sh
set -eu

usage() {
	printf '%s\n' "Usage: pnpm worktree:task <task-name> [base-ref]"
	exit 64
}

task_name=${1:-}
base_ref=${2:-main}

case "$task_name" in
	'' | *[!a-z0-9-]*) usage ;;
esac

repo_root=$(git rev-parse --show-toplevel)
repo_name=$(basename "$repo_root")
parent_dir=$(dirname "$repo_root")
branch="task/$task_name"
worktree_path="$parent_dir/$repo_name-$task_name"

if git show-ref --verify --quiet "refs/heads/$branch"; then
	printf '%s\n' "Branch already exists: $branch" >&2
	printf '%s\n' "Choose another task name or add the existing branch with git worktree add." >&2
	exit 1
fi

if [ -e "$worktree_path" ]; then
	printf '%s\n' "Worktree path already exists: $worktree_path" >&2
	exit 1
fi

git worktree add -b "$branch" "$worktree_path" "$base_ref"
git -C "$worktree_path" config core.hooksPath .githooks
printf '%s\n' "Created $worktree_path on $branch"
