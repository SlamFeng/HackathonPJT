# ToonHub — 3D Figurine Hero Carousel

A full-viewport hero carousel built with **React + TypeScript + Vite + Tailwind CSS**.

---

## 技术栈

| 工具 | 版本 |
|---|---|
| React | 18 |
| TypeScript | 5 |
| Vite | 5 |
| Tailwind CSS | 3 |
| lucide-react | 0.344 |

---

## 重启电脑后，如何在终端启动项目

### 前提条件（首次使用需确认）

确保电脑已安装 **Node.js**（建议 v18 或以上版本）。可在终端运行以下命令验证：

```powershell
node -v
npm -v
```

如未安装，请前往 [https://nodejs.org](https://nodejs.org) 下载 LTS 版本。

---

### 每次启动步骤

**第一步：打开终端（PowerShell 或 VS Code 内置终端）**

**第二步：进入项目目录**

```powershell
cd "c:\Users\jiawei.feng\OneDrive - Accenture\old\ドキュメント\ClaudeCode-PJT\test"
```

**第三步：启动开发服务器**

```powershell
npm run dev
```

**第四步：在浏览器中打开**

终端出现如下输出后，表示服务器已就绪：

```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
```

打开浏览器，访问：

```
http://localhost:5173
```

**第五步：停止服务器**

在终端按下 `Ctrl + C` 即可停止。

---

### 常见问题

**Q: 启动时报错 `Cannot find module` 或 `node_modules not found`**

说明依赖包未安装（重新克隆或首次使用时会遇到）。运行以下命令安装依赖后，再执行 `npm run dev`：

```powershell
npm install
```

**Q: 端口 5173 已被占用**

Vite 会自动尝试下一个可用端口（如 5174），终端输出中会显示实际地址。

**Q: 样式没有生效 / 页面空白**

确认已正确安装依赖（`npm install`），然后重新运行 `npm run dev`。

---

## 项目结构

```
test/
├── index.html                   # 页面入口，加载 Google Fonts
├── package.json                 # 依赖与脚本
├── vite.config.ts               # Vite 配置
├── tailwind.config.js           # Tailwind 配置
├── tsconfig.json                # TypeScript 配置
└── src/
    ├── main.tsx                 # React 应用入口
    ├── App.tsx                  # 根组件
    ├── index.css                # Tailwind 指令 + 全局样式
    └── components/
        └── ToonHubHero.tsx      # 主轮播组件
```

---

## 构建生产版本

```powershell
npm run build
```

产物输出至 `dist/` 目录，可直接部署到任意静态托管服务。
