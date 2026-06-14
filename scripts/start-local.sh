#!/usr/bin/env bash
# =============================================================
#  AI 智能试衣间 —— 本地一键启动脚本（macOS / Linux，零配置 SQLite 模式）
#  给非技术成员：双击根目录的 start.command 即可，不用看这个文件。
#
#  它会做这些事：
#   1. 检查 Python3 / Node 是否安装，缺了就自动装（macOS 用 Homebrew）
#   2. 首次运行自动装好前后端依赖
#   3. 后台启动后端(API) 和前端(Web)，自动打开浏览器
#   4. 在本窗口按 Ctrl+C 即可同时停止前后端
#
#  数据库用本地 SQLite 文件（api/local.db），不需要 Docker、不需要 Postgres。
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
API_DIR="$REPO_ROOT/api"
WEB_DIR="$REPO_ROOT/web"

step() { printf "\n==> %s\n" "$1"; }
ok()   { printf "    [OK] %s\n" "$1"; }
warn() { printf "    [!]  %s\n" "$1"; }

ensure_tool() {
  local cmd="$1" brewpkg="$2" name="$3"
  if command -v "$cmd" >/dev/null 2>&1; then ok "$name 已安装"; return; fi
  warn "$name 未安装，尝试自动安装（首次可能需要几分钟）…"
  if command -v brew >/dev/null 2>&1; then
    brew install "$brewpkg"
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y "$brewpkg"
  else
    printf "    无法自动安装 %s。请手动安装后重试。\n" "$name"
    printf "    macOS 建议先装 Homebrew：https://brew.sh\n"
    exit 1
  fi
}

echo "================================================"
echo "   AI 智能试衣间 - 本地启动 (SQLite 零配置)"
echo "================================================"

step "检查运行环境"
ensure_tool python3 python "Python"
ensure_tool node node "Node.js"

step "准备后端（API）"
cd "$API_DIR"
if [ ! -x ".venv/bin/python" ]; then
  echo "    首次运行：创建 Python 虚拟环境…"
  python3 -m venv .venv
fi
echo "    安装后端依赖…"
./.venv/bin/python -m pip install --upgrade pip -q
./.venv/bin/python -m pip install -r requirements.txt -q
ok "后端依赖就绪"

step "准备前端（Web）"
cd "$WEB_DIR"
if [ ! -d "node_modules" ]; then
  echo "    首次运行：安装前端依赖（可能需要几分钟）…"
  npm install
fi
ok "前端依赖就绪"

# ---------- 启动后端 ----------
step "启动后端 API（端口 8000）"
cd "$API_DIR"
export DATABASE_URL="sqlite+aiosqlite:///./local.db"
export ADMIN_EMAIL="admin@ailurus.com"
export ADMIN_PASSWORD="admin12345"
export CORS_ORIGINS="http://localhost:3000"
./.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 &
API_PID=$!
ok "后端启动中 (PID $API_PID)"

# ---------- 启动前端 ----------
step "启动前端 Web（端口 3000）"
cd "$WEB_DIR"
export NEXT_PUBLIC_API_BASE_URL="http://localhost:8000"
npm run dev &
WEB_PID=$!
ok "前端启动中 (PID $WEB_PID)"

cleanup() {
  printf "\n正在停止前后端…\n"
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ---------- 等前端就绪后打开浏览器 ----------
step "等待前端就绪后自动打开浏览器…"
opened=false
for _ in $(seq 1 60); do
  sleep 2
  if curl -s -o /dev/null --max-time 3 "http://localhost:3000/login"; then opened=true; break; fi
done
if [ "$opened" = true ]; then
  ( open "http://localhost:3000/login" 2>/dev/null \
    || xdg-open "http://localhost:3000/login" 2>/dev/null \
    || true )
  echo ""
  echo "  全部启动完成！浏览器已打开登录页。"
  echo "  默认管理员账号：admin@ailurus.com / admin12345"
  echo "  也可以点页面上的“注册”自己建一个普通账号。"
else
  warn "前端启动较慢，请稍后手动打开浏览器访问 http://localhost:3000/login"
fi

echo ""
echo "  前后端正在运行。按 Ctrl+C 停止。"
wait
