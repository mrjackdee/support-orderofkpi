#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

command -v timeout || {
  echo "build-verified.sh requires GNU timeout." >&2
  exit 69
}

if [[ -f "${SITES_PROJECT_ROOT}/.openai/hosting.json" ]]; then
  vinext="${SITES_PROJECT_ROOT}/node_modules/.bin/vinext"
  if [[ ! -x "${vinext}" ]]; then
    echo "vinext is unavailable. Run npm run install:ci and wait for it to finish before building." >&2
    exit 69
  fi

  echo "Running bounded vinext build..."
  timeout \
    --signal=TERM \
    --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
    "${SITES_BUILD_TIMEOUT:-3m}" \
    "${vinext}" build
else
  next="${SITES_PROJECT_ROOT}/node_modules/.bin/next"
  if [[ ! -x "${next}" ]]; then
    echo "Next.js is unavailable. Run npm install and try again." >&2
    exit 69
  fi

  echo "Running Hostinger-compatible Next.js build..."
  timeout \
    --signal=TERM \
    --kill-after="${SITES_BUILD_KILL_AFTER:-10s}" \
    "${SITES_BUILD_TIMEOUT:-3m}" \
    "${next}" build --webpack
fi
