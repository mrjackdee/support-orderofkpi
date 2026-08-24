#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "${project_root}/.next/BUILD_ID" ]]; then
  exec "${project_root}/node_modules/.bin/next" start
fi

exec "${project_root}/node_modules/.bin/vinext" start
