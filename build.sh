#!/bin/bash
# attestor-core 构建脚本
# 切换 Node 22，清除缓存，安装依赖，重建原生模块，确保 data 目录存在

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== 切换到 Node 22 ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
nvm use 22
echo "Node: $(node --version)"

echo "=== 清除缓存 ==="
rm -rf node_modules/.cache 2>/dev/null || true

echo "=== 检查 node_modules ==="
if [ ! -d "node_modules" ]; then
    echo "node_modules 不存在，执行 npm install..."
    npm install
else
    echo "node_modules 已存在，检查关键依赖..."
    if [ ! -d "node_modules/@reclaimprotocol/tls" ]; then
        echo "@reclaimprotocol/tls 缺失，重新安装..."
        npm install
    else
        echo "依赖完整"
    fi
fi

echo "=== 重建原生模块（确保匹配当前 Node 版本）==="
npm rebuild re2 koffi 2>/dev/null || echo "警告: 部分原生模块重建失败"

echo "=== 确保 data/providers 目录存在 ==="
mkdir -p data/providers

echo "=== 下载 ZK 文件（如需要）==="
if [ ! -d "node_modules/@reclaimprotocol/zk-symmetric-crypto/resources" ] || [ -z "$(ls -A node_modules/@reclaimprotocol/zk-symmetric-crypto/resources 2>/dev/null)" ]; then
    echo "下载 ZK 证明文件..."
    npm run download:zk-files 2>/dev/null || echo "警告: ZK 文件下载失败，可能影响证明生成"
else
    echo "ZK 文件已存在"
fi

echo ""
echo "=== 构建完成 ==="
echo "启动服务: source ~/.nvm/nvm.sh && nvm use 22 && npm start"
echo "服务地址: http://localhost:8001"
echo "WebSocket: ws://localhost:8001/ws"
