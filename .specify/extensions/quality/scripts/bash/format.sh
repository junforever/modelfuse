#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

echo "Quality Gate: Prettier Format"
echo

prettier_cmd=()
runtime_wrapper=""

if [[ -x "$repo_root/agent-scripts/run-pnpm.sh" ]]; then
    runtime_wrapper="$repo_root/agent-scripts/run-pnpm.sh"
    prettier_cmd=("$runtime_wrapper" exec prettier)
elif [[ -x "$repo_root/node_modules/.bin/prettier" ]]; then
    prettier_cmd=("$repo_root/node_modules/.bin/prettier")
elif command -v prettier >/dev/null 2>&1; then
    prettier_cmd=(prettier)
elif command -v npx >/dev/null 2>&1; then
    prettier_cmd=(npx --no-install prettier)
else
    echo "ERROR: Prettier is not installed in the project." >&2
    exit 1
fi

if ! "${prettier_cmd[@]}" --version >/dev/null; then
    if [[ -n "$runtime_wrapper" ]]; then
        echo "ERROR: The repository runtime wrapper could not execute Prettier." >&2
    else
        echo "ERROR: The selected Prettier command could not execute." >&2
    fi
    exit 1
fi

config_file=""
for candidate in \
    .prettierrc \
    .prettierrc.json \
    .prettierrc.yml \
    .prettierrc.yaml \
    .prettierrc.js \
    .prettierrc.cjs \
    .prettierrc.mjs \
    prettier.config.js \
    prettier.config.cjs \
    prettier.config.mjs
do
    if [[ -f "$candidate" ]]; then
        config_file="$candidate"
        break
    fi
done

if [[ -z "$config_file" && -f package.json ]] && node -e '
    const pkg = require("./package.json");
    process.exit(Object.prototype.hasOwnProperty.call(pkg, "prettier") ? 0 : 1);
' 2>/dev/null; then
    config_file='package.json (prettier property)'
fi

if [[ -z "$config_file" ]]; then
    echo "ERROR: No Prettier configuration was found at the repository root." >&2
    exit 1
fi

format_args=(--write .)
if [[ -f .prettierignore ]]; then
    format_args+=(--ignore-path .prettierignore)
fi

"${prettier_cmd[@]}" "${format_args[@]}"
echo "Prettier formatting completed successfully."
