#!/usr/bin/env bash
set -euo pipefail

repository_list="${1:-$HOME/repositories-to-publish.txt}"

if [[ ! -f "$repository_list" ]]; then
  printf 'Repository list not found: %s\n' "$repository_list" >&2
  printf 'Create and review the repository list before running this script.\n' >&2
  exit 1
fi

while IFS= read -r repo_name || [[ -n "$repo_name" ]]; do
  [[ -z "$repo_name" ]] && continue
  printf 'Making %s public...\n' "$repo_name"
  gh repo edit "$repo_name" --visibility public --accept-visibility-change-consequences
done < "$repository_list"
