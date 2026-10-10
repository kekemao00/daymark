# 开发与发布

## 环境

- Node.js 22+、Rust stable
- Windows：WebView2（Win10 1809+ / Win11 一般已自带）、Visual Studio 生成工具（勾选“使用 C++ 的桌面开发”）
- Linux 开发：`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装前端依赖 |
| `npm run tauri dev` | 启动桌面应用；调试版不注册开机自启 |
| `npm run dev` | 只在浏览器里预览界面（`src/mock.ts` 提供内存假数据；URL 加 `?today=2026-10-10` 固定日期，加 `&empty` 看空状态） |
| `npm test` | 前端单测（Vitest） |
| `cargo test -p daymark-core` | 核心逻辑单测 |
| `npm run verify:lunar` | 农历 1901–2099 逐日对照 lunar-javascript |
| `npm run tauri build` | 在 Windows 上生成 NSIS 安装包 `target/release/bundle/nsis/` |

农历数据表需要更新时：`node scripts/gen-lunar-table.mjs > crates/daymark-core/src/lunar_table.rs`，然后跑一遍
`cargo test -p daymark-core` 和 `npm run verify:lunar`。

## 在 Linux 上交叉编译 Windows 安装包

用 MinGW 工具链（不需要下载 MSVC）：

```bash
sudo apt install nsis mingw-w64
rustup target add x86_64-pc-windows-gnu
npx tauri build --target x86_64-pc-windows-gnu
# 产物：target/x86_64-pc-windows-gnu/release/bundle/nsis/刻忆_0.1.0_x64-setup.exe
```

Tauri 官方说明交叉编译属于实验功能；正式发布建议用 `.github/workflows/ci.yml` 里的 windows-latest 任务构建。
安装包未签名，首次运行 Windows SmartScreen 会提示“未知发布者”，公开发布前需要代码签名证书。

## 发布前手工验收（Windows 实机）

把系统时间或条目日期调到合适的位置逐项验证：

- [ ] 安装后首次启动显示空状态，设置里“开机自动启动”默认勾选
- [ ] 新建一条今天的条目（提醒含“当天”）：到达每日提醒时刻后 1 分钟内弹出 Toast；重启应用不再重复弹出
- [ ] 新建一条 20 天后的条目：不会立即弹出“30 天”提醒
- [ ] 把每日提醒时间改到当前时刻之后：到点才弹出
- [ ] 关闭窗口后托盘图标仍在，托盘提示显示最近的一件事；左键托盘图标重新打开窗口
- [ ] 再次双击桌面图标，只唤起已有窗口，不启动第二个进程
- [ ] 重启电脑：只出现托盘图标，不弹窗口；任务管理器“启动”页能看到刻忆
- [ ] 设置里“发送测试通知”能弹出；导出后在另一台电脑导入，条目一致
- [ ] 窗口关闭后，任务管理器里刻忆的内存占用（不含系统 WebView2 进程）在 30 MB 以内
