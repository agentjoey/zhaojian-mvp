#!/usr/bin/env bash
# release.sh — 版本发布 + 文档同步（遵循 orchestration-spec v2.0 §7）
# 用法: ./scripts/release.sh [patch|minor|major]
set -euo pipefail

BUMP_TYPE="${1:-patch}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- 读取并 bump 版本（来源: package.json） ---
CUR_VERSION="$(node -p "require('./package.json').version")"
IFS='.' read -r MAJ MIN PAT <<< "$CUR_VERSION"
case "$BUMP_TYPE" in
  major) MAJ=$((MAJ+1)); MIN=0; PAT=0 ;;
  minor) MIN=$((MIN+1)); PAT=0 ;;
  patch) PAT=$((PAT+1)) ;;
  *) echo "未知 bump 类型: $BUMP_TYPE (patch|minor|major)"; exit 1 ;;
esac
NEW_VERSION="${MAJ}.${MIN}.${PAT}"
TODAY_STR="$(date +%Y-%m-%d)"
echo "Release: v${CUR_VERSION} → v${NEW_VERSION} (${BUMP_TYPE})"

# package.json 版本
node -e "const f='./package.json',p=require(f);p.version='${NEW_VERSION}';require('fs').writeFileSync(f,JSON.stringify(p,null,2)+'\n')"

# --- Doc Sync (spec §7) ---
AGENT_CURRENT=".agent/CURRENT.md"
if [[ -f "$AGENT_CURRENT" ]]; then
  sed -i.bak "s/^Version:.*$/Version:        v${NEW_VERSION}/" "$AGENT_CURRENT"
  sed -i.bak "s/^Last Updated:.*$/Last Updated:   ${TODAY_STR} by [agent-id]  ← 请更新/" "$AGENT_CURRENT"
  if [[ "${BUMP_TYPE}" == "minor" || "${BUMP_TYPE}" == "major" ]]; then
    sed -i.bak "s/^Sprint Status:.*$/Sprint Status:  ✅ Done/" "$AGENT_CURRENT"
  fi
  sed -i.bak "/^| Version | Date | Summary |/{n; s/^/| v${NEW_VERSION} | ${TODAY_STR} | [请补充] |\n/}" "$AGENT_CURRENT"
  rm -f "${AGENT_CURRENT}.bak"
fi
# CLAUDE.md Version 字段
if [[ -f CLAUDE.md ]]; then
  sed -i.bak "s/^\*\*Version:\*\*.*$/\*\*Version:\*\*  v${NEW_VERSION}/" CLAUDE.md && rm -f CLAUDE.md.bak
fi

git add package.json "$AGENT_CURRENT" CLAUDE.md 2>/dev/null || true
echo "✅ 版本与文档已更新。POST-RELEASE: 补充 Version History 描述 / Sprint Summary / Last Updated agent-id。"
echo "下一步（手动）: git commit -m \"release: v${NEW_VERSION}\" && git tag v${NEW_VERSION}"
