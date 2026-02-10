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
    if [ ! -d "node_modules/@joclaim/tls" ]; then
        echo "@joclaim/tls 缺失，重新安装..."
        npm install
    else
        echo "依赖完整"
    fi
fi

echo "=== 重建原生模块（确保匹配当前 Node 版本）==="
npm rebuild re2 koffi 2>/dev/null || echo "警告: 部分原生模块重建失败"

echo "=== 检查环境配置文件 ==="
if [ ! -f ".env.development" ]; then
    echo ".env.development 不存在，从 .env.sample 生成默认开发配置..."
    cp .env.sample .env.development
    sed -i '' 's|^PRIVATE_KEY=.*|PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80|' .env.development
    sed -i '' 's|^CHAIN_ID=.*|CHAIN_ID=31337|' .env.development
    sed -i '' 's|^RECLAIM_PUBLIC_URL=.*|RECLAIM_PUBLIC_URL=ws://localhost:8001|' .env.development
    sed -i '' 's|^ACCEPT_CLAIM_PAYMENT_REQUESTS=.*|ACCEPT_CLAIM_PAYMENT_REQUESTS=1|' .env.development
    sed -i '' 's|^TOPRF_PUBLIC_KEY=.*|TOPRF_PUBLIC_KEY=0x8814db70394db2d1f819cf1a93a26c71080d170fac919bdfdb9cebf7cebab38a|' .env.development
    sed -i '' 's|^TOPRF_SHARE_PRIVATE_KEY=.*|TOPRF_SHARE_PRIVATE_KEY=0x05d5f9b4d08f17d66b6569e4d07f036818070d7b6c049d3d533f54c561c9d3b9|' .env.development
    sed -i '' 's|^TOPRF_SHARE_PUBLIC_KEY=.*|TOPRF_SHARE_PUBLIC_KEY=0x8814db70394db2d1f819cf1a93a26c71080d170fac919bdfdb9cebf7cebab38a|' .env.development
    sed -i '' 's|^DISABLE_BGP_CHECKS=.*|DISABLE_BGP_CHECKS=1|' .env.development
    echo ".env.development 已生成"
else
    echo ".env.development 已存在"
fi

echo "=== 确保 data/providers 目录存在 ==="
mkdir -p data/providers

echo "=== 下载 ZK 文件（如需要）==="
if [ ! -d "node_modules/@joclaim/zk-symmetric-crypto/resources" ] || [ -z "$(ls -A node_modules/@joclaim/zk-symmetric-crypto/resources 2>/dev/null)" ]; then
    echo "下载 ZK 证明文件..."
    npm run download:zk-files 2>/dev/null || echo "警告: ZK 文件下载失败，可能影响证明生成"
else
    echo "ZK 文件已存在"
fi

echo "=== 编译 TypeScript（生成 lib/ 目录）==="
rm -rf lib 2>/dev/null || true
npm run build
echo "lib/ 目录已生成"

echo ""
echo "=== 构建完成 ==="
echo "启动服务: source ~/.nvm/nvm.sh && nvm use 22 && npm start"
echo "服务地址: http://localhost:8001"
echo "WebSocket: ws://localhost:8001/ws"
