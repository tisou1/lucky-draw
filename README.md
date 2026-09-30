# 星选 · STAR PICK

一个面向活动大屏的 3D 抽奖系统。使用 Vite、React、TypeScript、shadcn/ui、Tailwind CSS、Three.js / React Three Fiber。当前为 Web 版，数据全部保存在浏览器 IndexedDB。

## 启动

本机依赖已经安装，在 PowerShell 中执行：

```powershell
cd D:\doing\lucky-draw
pnpm dev
```

打开 http://localhost:5173 。开发服务固定端口，端口被占用时会退出，避免访问端口变化导致看到另一份本地数据。

首次在其他设备或从 Git 获取代码时，使用 Node.js 24 或满足 Vite `engines` 的版本，安装 pnpm 后执行：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

首次安装所有直接依赖均使用 `@latest`，`pnpm-lock.yaml` 保存本次实际版本。后续开发不需要自动升级依赖。

```powershell
pnpm typecheck       # 应用和配置类型检查
pnpm test:core       # 定向核心模块测试
pnpm lint           # Oxlint
pnpm build          # 生产构建到 dist
pnpm preview        # 本地预览生产构建
```

## 使用流程

1. 进入“参与者”，导入名单或手动添加。也可以主动点击“加载演示”，追加 100 人演示名单。
2. 进入“奖项设置”，配置奖品、总名额和每轮默认人数，支持上传奖品图片。
3. 回到舞台，选择奖项和本轮人数。点击开始，待球体加速后点击停止，保存成功后揭晓。
4. 点击右上角全屏；舞台空白处可通过 `Space` 开始／停止。输入框、按钮及弹窗不触发全局快捷键。
5. 查看“中奖记录”并导出 CSV。点击右上角设置，在下一场前导出完整 ZIP 备份。

默认每场活动每人只能中奖一次。开启“允许跨奖项重复中奖”后，可以获得不同奖项；同一奖项仍不会重复中奖。开关变更只影响后续候选池，保留历史记录。

结果由 `crypto.getRandomValues()` 的无偏随机数抽取，一轮内不放回。舞台显示数量与中奖概率无关，完整 1000 人名单全部参与候选池计算。抽奖期间，参与者、奖项及活动规则不可修改。写入失败可以重试保存同一结果，不重新随机。

## 名单导入

- 支持 `.csv`、`.xlsx`。旧版 `.xls` 请先另存为 `.xlsx`。
- 第一条非空行为表头，可在导入预览里选择工作表、映射列。
- CSV 默认 UTF-8，也可选择 GB18030 / GBK；姓名必填，编号未提供时自动生成。
- 编号作为文本保留；XLSX 中 `0000` 等数字格式也会保留前导零。CSV 导出到 Excel 时，编号列仍应按文本导入。
- 默认追加名单，重复编号跳过，同名不同编号可以存在。有效参与者上限为 1000 人，超出的行会报告并跳过。
- 姓名和编号最多 80 字，部门 100 字，备注 300 字。导入会列出不符合要求的行。
- CSV / XLSX 文件大小上限为 20 MB，Excel 工作表上限为 10000 行、200 列。

模板：`public/templates/participants.csv`。

1000 人人工验收名单：`public/demo/participants-1000.csv`。舞台不会自动加载任何名单。

## 图片

支持 PNG、JPEG、WebP，单张原始图片不超过 15 MB。参与者头像压缩到最大边长 256px，奖品图片压缩到 1024px，以 Blob 保存。

批量头像文件名应匹配参与者编号，例如 `0001.png`、`0002.jpg`；同一编号的重复文件和无法匹配的文件会报告。未上传图片时使用本地生成的默认头像。

编辑参与者或奖项后，中奖记录中的文字和头像快照仍会保留；无引用图片会在后续保存时回收。

## 本地数据与备份

- 数据按浏览器、站点地址隔离；localhost、其他主机名及不同端口是独立的存储空间。活动期间请固定访问 `http://localhost:5173`。
- 完整 ZIP 包含版本化 JSON、名单、奖项、活动设置、中奖记录和全部引用图片。
- 恢复前校验结构、编号、名额、图片内容和引用，并展示二次确认；确认后使用事务覆盖，不会部分替换。
- ZIP 文件上限为 100 MB，解压总量上限为 128 MB。
- “清空中奖记录”保留名单、图片、奖项和设置；“重置整个活动”恢复空名单与三个默认奖项。两种操作均需确认，建议先备份。
- 使用 Web Locks 保证同地址只有一个操作页面，其他页面只读并通过 BroadcastChannel 接收更新。关闭操作页面后，在只读页面点击“获取操作权限”。
- 请通过 localhost 或 HTTPS 使用 Chrome / Edge。不能直接双击 `index.html` 使用。

## 3D 与兼容

标准画质最多展示 300 张卡片，像素比上限 1.5；低画质最多 120 张卡片，像素比为 1。超过显示上限时，待机每 12 秒循环展示后续名单。所有人员仍进入真实抽奖候选池。

卡片采用 Canvas 纹理图集与 `InstancedMesh`，每帧动画由 `useFrame` 更新。隐藏页面暂停帧循环，纹理、Geometry、Material、Bitmap 和 Object URL 在不用时释放。Excel 解析、3D 场景和备份模块按需加载。

支持球体和螺旋布局、粒子与轨道效果、多人中奖分页。可切换 2D 卡片舞台；没有 WebGL2 或场景初始化失败时自动降级。系统启用 `prefers-reduced-motion` 时减少持续动画。

Chrome / Edge 桌面和投影为主要目标，管理界面适配手机。当前未实现 Electron 打包、后端、登录、多活动、云同步或部署。

## 代码结构与 Electron 扩展

- `src/domain`：类型、规则、无偏随机取样、抽奖状态机及验证。
- `src/storage`：`StorageRepository` 的 IndexedDB 实现、操作锁、ZIP 备份。
- `src/store`：Zustand 活动状态和写入入口。
- `src/importing`：CSV、Excel 及批量头像匹配。
- `src/scene`：延迟加载的 Three.js 场景、纹理图集、2D 降级。
- `src/components`：舞台和管理界面；`ui` 为官方 shadcn CLI 生成的组件。

后续 Electron 可复用 React 界面与 domain 逻辑，在 `StorageRepository` 入口替换存储实现。Vite 使用相对资源路径，但不代表当前版本已经完成 Electron 打包或验证。

## 验证与人工验收

自动测试覆盖导入编码、多工作表、前导零、去重、头像匹配、随机规则、重复操作、保存重试、持久化、图片写入失败回滚、备份恢复和操作锁。

完整人工清单见 `docs/acceptance.md`。本次没有执行浏览器视觉、E2E、现场帧率或投影验收，这些需要在目标设备上按清单检查。
