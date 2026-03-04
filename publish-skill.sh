#!/usr/bin/env bash
# Publish the m2m-ads OpenClaw skill to ClawHub.
# Reads version from clients/m2m-ads/package.json automatically.
#
# Usage:
#   ./publish-skill.sh                        # empty changelog
#   ./publish-skill.sh "What changed"         # with changelog
#   ./publish-skill.sh "What changed" 1.2.3   # override version

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/clients/openclaw/skills/m2m-ads" && pwd)"
PKG_FILE="$(cd "$(dirname "$0")/clients/m2m-ads" && pwd)/package.json"

CHANGELOG="${1:-}"

# Version: explicit arg takes priority, then package.json
if [[ -n "${2:-}" ]]; then
  VERSION="$2"
else
  VERSION=$(node -p "require('$PKG_FILE').version")
fi

if [[ -z "$VERSION" ]]; then
  echo "ERROR: could not read version from $PKG_FILE" >&2
  exit 1
fi

echo "Publishing m2m-ads skill v$VERSION to ClawHub..."
clawhub publish "$SKILL_DIR" \
  --slug m2m-ads \
  --name "M2M Classified Ads" \
  --version "$VERSION" \
  --tags latest \
  --changelog "$CHANGELOG"

echo "Done: m2m-ads@$VERSION"
