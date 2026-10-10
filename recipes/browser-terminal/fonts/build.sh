#!/usr/bin/env bash
# Rebuilds the self-hosted JetBrainsMono Nerd Font Mono WOFF2 files from a pinned Nerd Fonts release.
# Keeps the Basic Multilingual Plane (Latin, box drawing, Powerline, Font Awesome, Devicons, Octicons, Codicons)
# and drops the supplementary-plane Material Design icons, which are most of the size.
# Needs curl and uv (for fonttools).
set -euo pipefail
version=v3.5.1
here=$(cd "$(dirname "$0")" && pwd)
source="https://raw.githubusercontent.com/ryanoasis/nerd-fonts/$version/patched-fonts/JetBrainsMono/Ligatures"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

for style in Regular Bold; do
  curl -fsSL -o "$work/$style.ttf" "$source/JetBrainsMonoNerdFontMono-$style.ttf"
  uvx --from 'fonttools[woff]' pyftsubset "$work/$style.ttf" \
    --unicodes='U+0000-FFFF' --layout-features='*' --flavor=woff2 \
    --output-file="$here/JetBrainsMonoNerdFontMono-$style.woff2"
done
curl -fsSL -o "$here/OFL.txt" "$source/OFL.txt"
ls -l "$here"/*.woff2
