#!/usr/bin/env bash
# scaffold-designer-block.sh (S-D7)
# Creates a new Designer Block under ~/.salilvnair/istorybook/designer-blocks/<id>/
#
# Usage:
#   ./cli/scaffold-designer-block.sh <id> [display-name] [author]
#
# Example:
#   ./cli/scaffold-designer-block.sh my-stickers "My Sticker Pack" "salilvnair"
#
# After scaffolding, edit the generated designer-block.json, then click
# "↻ Refresh" in Settings › Designer Blocks to load it into the palette.

set -euo pipefail

BLOCKS_DIR="${HOME}/.salilvnair/istorybook/designer-blocks"
ID="${1:-}"
NAME="${2:-$ID}"
AUTHOR="${3:-me}"

if [[ -z "$ID" ]]; then
  echo "Usage: $0 <id> [display-name] [author]"
  echo "  id must be lowercase-kebab (a-z, 0-9, -)."
  exit 1
fi

if ! [[ "$ID" =~ ^[a-z0-9-]+$ ]]; then
  echo "Error: id must match ^[a-z0-9-]+$" >&2
  exit 1
fi

BLOCK_DIR="${BLOCKS_DIR}/${ID}"
MANIFEST="${BLOCK_DIR}/designer-block.json"

if [[ -d "$BLOCK_DIR" ]]; then
  echo "Error: block '${ID}' already exists at ${BLOCK_DIR}" >&2
  exit 1
fi

mkdir -p "$BLOCK_DIR"

cat > "$MANIFEST" <<JSON
{
  "id": "${ID}",
  "name": "${NAME}",
  "version": "1.0.0",
  "author": "${AUTHOR}",
  "enabled": true,
  "elements": [
    {
      "type": "${ID}.example",
      "baseType": "sticker",
      "palette": {
        "icon": "⭐",
        "label": "Example element",
        "group": "${NAME}"
      },
      "defaults": {
        "w": 80,
        "h": 80,
        "props": {
          "emoji": "⭐",
          "size": 56,
          "opacity": 1
        }
      }
    }
  ]
}
JSON

echo "✓ Scaffolded designer block at: ${BLOCK_DIR}"
echo ""
echo "Next steps:"
echo "  1. Edit ${MANIFEST}"
echo "     – Change element type, icon, label, group"
echo "     – baseType must be an existing palette element type:"
echo "       sticker | text | shape.rect | shape.ellipse | image"
echo "       bubble.rounded | bubble.oval | bubble.rect | bubble.shout"
echo "       bubble.whisper | bubble.thought"
echo "     – defaults.props override the base element's default properties"
echo "  2. Open iStorybook › Settings › Designer Blocks and click ↻ Refresh"
echo "  3. Your new element appears in the Designer palette under '${NAME}'"
