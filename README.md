# RAZ 分级阅读平台

在线阅览 RAZ 分级阅读绘本，边看边听。

## 项目结构

```
/Volumes/SD/raz/
├── web/                    # 前端 React 应用
├── worker/                 # Cloudflare Workers API
├── scripts/                # 上传脚本
├── RAZ绘本pdf/             # PDF 源文件
└── raz音频/                 # MP3 源文件
```

## 快速开始

### 1. 创建 R2 Bucket

在 Cloudflare Dashboard 中创建名为 `raz-files` 的 R2 Bucket。

### 2. 上传文件到 R2

```bash
cd scripts
npm install

# 设置环境变量（从 Cloudflare Dashboard > R2 > Manage R2 API Tokens 获取）
export R2_ACCOUNT_ID="你的账户ID"
export R2_ACCESS_KEY_ID="你的访问密钥ID"
export R2_SECRET_ACCESS_KEY="你的访问密钥"

npm run upload
```

### 3. 部署 Worker

```bash
cd worker
npm install
npx wrangler login
npm run deploy
```

### 4. 部署前端

```bash
cd web
npm install
npm run build
npx wrangler pages deploy dist --project-name=raz-reading
```

## 本地开发

```bash
# 终端 1: 启动 Worker
cd worker && npm run dev

# 终端 2: 启动前端
cd web && npm run dev
```

访问 http://localhost:5173

## 环境变量

Worker 会自动绑定 R2 Bucket，在 `wrangler.toml` 中配置。
