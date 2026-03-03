#!/usr/bin/env bash
# Publish the m2m-ads OpenClaw skill to ClawHub.
# Reads version from the SKILL.md frontmatter automatically.
#
# Usage:
#   ./publish-skill.sh                   # empty changelog
#   ./publish-skill.sh "What changed"    # with changelog

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/clients/openclaw/skills/m2m-ads" && pwd)"
SKILL_FILE="$SKILL_DIR/SKILL.md"

# Extract version from frontmatter (line: version: "x.y.z")
VERSION=$(grep -m1 '^version:' "$SKILL_FILE" | sed 's/version: *"\(.*\)"/\1/')

if [[ -z "$VERSION" ]]; then
  echo "ERROR: could not read version from $SKILL_FILE frontmatter" >&2
  exit 1
fi

CHANGELOG="${1:-}"

echo "Publishing m2m-ads skill v$VERSION to ClawHub..."
clawhub publish "$SKILL_DIR" \
  --slug m2m-ads \
  --name "M2M Classified Ads" \
  --version "$VERSION" \
  --tags latest \
  --changelog "$CHANGELOG"

echo "Done: m2m-ads@$VERSION"
