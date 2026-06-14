# WebApp Editor

WebApp Editor 是一个面向结构化 WebApp 项目的可视化编辑器框架。它负责提供编辑器、运行时预览、项目协议、资源管理和校验工具；具体应用内容应放在独立的项目目录中，通过 `project.webapp.json` 和 `layouts/*.layout.json` 描述。

这个仓库是“编辑器引擎”，不是某个具体 App 项目。日常开发中应优先修改外部项目目录里的 JSON、资源、脚本和数据；只有当现有协议表达不了新能力时，才修改本仓库的编辑器或运行时代码。

## 当前能力

- 可视化编辑：在 `SceneView` 中选择、拖拽、缩放元素，支持多选、框选后的整体变换、滚轮缩放和中键平移。
- 运行预览：`GameView` 与 `/play` 使用同一套 `RuntimeRenderer`，用于检查最终运行效果。
- 元素类型：当前支持 `panel`、`text`、`button`、`image`。
- 属性编辑：在 `Inspector` 中调整位置、尺寸、文本、颜色、圆角、图片填充方式、层级分组和脚本绑定。
- 层级管理：在 `Hierarchy` 中搜索、选择、重命名、显隐、新建、删除元素，并支持拖拽生成可复用组件资产。
- 项目资源：在 `Project` 中浏览 layouts、assets、scripts、data，支持搜索、打开布局、删除资源、在文件管理器中定位资源。
- 组件资产：支持 `.component.webapp.json` 组件资产，从项目资源拖入场景，或从层级元素生成组件资产。
- 对齐辅助：场景编辑支持边缘吸附、网格吸附和对齐参考线。
- 历史记录：支持撤销、重做，以及拖拽/连续编辑时的历史分组。
- 可停靠工作区：编辑器面板可拖拽重排、调整分割比例，并可保存本地工作区布局。
- 项目校验：提供脚本校验 manifest、layout、组件资产和资源引用。

## 快速开始

安装依赖：

```powershell
npm install
```

初始化本地 CodeGraph 索引：

```powershell
npm run setup
```

如果 `codegraph` 不在 `PATH` 中，先安装或暴露 `codegraph` 命令，再运行：

```powershell
npm run codegraph:init
```

Windows 下也可以直接双击启动器：

```text
WebApp Editor.cmd
```

启动后打开：

```text
http://127.0.0.1:5173/editor
```

运行态预览地址：

```text
http://127.0.0.1:5173/play
```

## 项目工作流

可以在编辑器中创建外部 WebApp 项目：

```text
http://127.0.0.1:5173/editor
```

打开后使用“文件 -> 新建项目”，输入项目名和父目录。新项目必须创建在 WebApp-Editor 仓库外部，不能放在本仓库根目录或其子目录中。

创建一个外部 WebApp 项目：

```powershell
npm run new-project -- "F:\WebApp Projects\My App"
```

用编辑器打开指定项目：

```powershell
npm run dev:project -- "F:\WebApp Projects\My App"
```

指定端口：

```powershell
npm run dev:project -- "F:\WebApp Projects\My App" --port 5174
```

校验项目：

```powershell
npm run validate-project -- "F:\WebApp Projects\My App"
```

## 外部项目结构

新建项目会生成类似结构：

```text
My App/
  AGENTS.md
  project.webapp.json
  layouts/
    main_page.layout.json
  assets/
    ui/
    components/
  data/
  scripts/
```

核心文件说明：

- `project.webapp.json`：项目 manifest，声明引擎、协议版本、项目名、基础分辨率、入口 layout 和资源根目录。
- `layouts/*.layout.json`：场景/页面文档，编辑器和运行时都会读取。
- `assets/**`：图片、组件资产和其他项目资源。
- `assets/**/*.component.webapp.json`：可复用组件资产。
- `scripts/**`：预留给元素脚本绑定和后续行为系统。
- `data/**`：预留给项目数据。
- `AGENTS.md`：给 AI 协作者看的项目边界和常用命令。

路径统一使用项目相对路径和 `/`，不要在项目 JSON 中写绝对路径、反斜杠、`.` 或 `..`。

## 常用操作

- 保存当前 layout：点击工具栏保存按钮，或按 `Ctrl+S`。
- 撤销/重做：`Ctrl+Z`、`Ctrl+Y` 或 `Ctrl+Shift+Z`。
- 删除选中元素：选中元素后按 `Delete`。
- 微调位置：选中元素后按方向键；长按会逐步加速。
- 多选元素：按住 `Ctrl`/`Cmd` 点击切换选择，按住 `Shift` 进行范围选择。
- 重命名元素：选中单个元素后按 `F2`，或在层级面板右键重命名。
- 拖入资源：从 `Project` 面板把图片或组件资产拖到 `SceneView`。
- 添加脚本：在 `Inspector` 的 `Scripts` 区域选择或拖入 `scripts/**` 资源。
- 保存工作区布局：点击工具栏中的布局保存按钮。

## 开发命令

启动编辑器：

```powershell
npm run dev
```

构建编辑器：

```powershell
npm run build
```

检查框架根目录是否干净：

```powershell
npm run check-root
```

预览构建产物：

```powershell
npm run preview
```

## 框架扩展约定

当需要新增编辑器/运行时能力，例如新增元素类型、样式字段、布局嵌套、行为脚本、场景切换或导出打包能力时，应在同一次变更中同步更新：

- `src/shared/schema/projectContract.ts`
- `src/runtime/runtimeTypes.ts`
- `src/shared/schema/*.ts`
- `src/runtime/RuntimeElementRenderer.tsx`
- `src/editor/panels/**`
- `scripts/validate-project.mjs`
- `docs/WEBAPP_PROJECT_PROTOCOL.md`

然后运行：

```powershell
npm run validate-project -- "<project-folder>"
npm run build
```

## AI 协作建议

让 AI 创建或修改应用时，建议同时提供两个路径：

```text
Framework: F:\WebApp Editor\webapp-editor
Project: F:\WebApp Projects\My App
```

默认应让 AI 优先修改 `Project` 路径中的内容。只有当项目协议无法表达需求时，才进入 `Framework` 路径修改编辑器或运行时。

更多协议和协作细节见：

- `docs/WEBAPP_PROJECT_PROTOCOL.md`
- `docs/AI_PROJECT_WORKFLOW.md`

## 根目录卫生

本仓库根目录必须保持干净。不要把应用项目、日志、临时文件、截图、诊断报告或生成产物写到 `package.json` 同级目录。

构建前会执行 `check-root`。如果失败，先清理无关文件，再继续构建。
