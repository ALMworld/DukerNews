#!/bin/bash
# Convert SVG files in public/ to PNG for use in World Developer Portal
# Each image can have its own target width to preserve exact aspect ratios.
# Uses rsvg-convert (brew install librsvg) for proper font-weight & gradient rendering.
# Usage: pnpm gen:images

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/../public"
MAX_KB=500

# Check for rsvg-convert
if ! command -v rsvg-convert &> /dev/null; then
  echo "❌ rsvg-convert not found. Install with: brew install librsvg"
  exit 1
fi

echo "🖼  Converting SVGs to PNGs (using rsvg-convert)..."

# render_svg <src> <out> <target_width>
render_svg() {
  local src="$1" out="$2" tw="$3"

  local w h
  w=$(grep -oE 'width="[0-9]+"' "$src" | head -1 | grep -oE '[0-9]+')
  h=$(grep -oE 'height="[0-9]+"' "$src" | head -1 | grep -oE '[0-9]+')

  if [ -n "$w" ] && [ -n "$h" ]; then
    local nh=$(( tw * h / w ))
    rsvg-convert -w "$tw" -h "$nh" "$src" -o "$out"
    local size_kb=$(( $(stat -f%z "$out") / 1024 ))
    echo "  ✅ $(basename "$out")  ${tw}×${nh}  (${size_kb}kB)"
  else
    rsvg-convert "$src" -o "$out"
    echo "  ✅ $(basename "$out")  (native)"
  fi
}

# Banner: 420×120 native → render at 2x = 840×240
render_svg "$PUBLIC_DIR/duki-banner.svg" "$PUBLIC_DIR/duki-banner.png" 840

# Card: 345×240 native → render at 2x = 690×480 (exact aspect ratio for Mini App Store)
render_svg "$PUBLIC_DIR/duki-card.svg"   "$PUBLIC_DIR/duki-card.png"   690

# Favicon: 500×500 native → render at 512×512
render_svg "$PUBLIC_DIR/favicon.svg"     "$PUBLIC_DIR/favicon.png"     512

# X/Twitter banner: 1500×500 native → render at native size
render_svg "$PUBLIC_DIR/duker-news-x-banner.svg" "$PUBLIC_DIR/duker-news-x-banner.png" 1500

echo "🎉 Done!"
