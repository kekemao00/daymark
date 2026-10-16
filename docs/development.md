# 开发与发布

## 环境

- Node.js 22+、Rust stable
- Windows：WebView2（Win10 1809+ / Win11 一般已自带）、Visual Studio 生成工具（勾选"使用 C++ 的桌面开发"）
- Linux 开发：`libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev`

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装前端依赖 |
| `npm run tauri dev` | 启动桌面应用；调试版不注册开机自启 |
| `npm run dev` | 只在浏览器里预览界面（`src/mock.ts` 提供内存假数据；URL 加 `?today=2026-10-10` 固定日期，`&empty` 看空状态，`&update` 模拟有新版本，`&notice` 模拟启动提示） |
| `npm test` | 前端单测（Vitest） |
| `cargo test -p daymark-core` | 核心逻辑单测 |
| `cargo clippy -p daymark-core --all-targets -- -D warnings` | 核心逻辑 lint（CI 会跑） |
| `npm run verify:lunar` | 农历 1901–2099 逐日对照 lunar-javascript |
| `npm run tauri build` | 在 Windows 上生成 NSIS 安装包 `target/release/bundle/nsis/`（需要签名密钥，见下；日常验证可加 `--config '{"bundle":{"createUpdaterArtifacts":false}}'` 跳过签名） |
| `npm run version:set -- 0.3.0` | 一次改齐 package.json、package-lock.json、tauri.conf.json、Cargo.toml、Cargo.lock 里的版本号 |
| `node scripts/check-version.mjs [v0.3.0]` | 检查版本号一致（CI 会跑） |
| `node scripts/screenshots.mjs` | 用浏览器预览重新生成 README 截图（需要 playwright，先 `npm run dev`） |

农历数据表需要更新时：`node scripts/gen-lunar-table.mjs > crates/daymark-core/src/lunar_table.rs`，然后跑一遍
`cargo test -p daymark-core` 和 `npm run verify:lunar`。

## 在 Linux 上检查 Tauri 外壳

Linux 上没有 webkit2gtk 开发库时编不过 `src-tauri`，但可以对 Windows 目标做类型检查和 clippy：

```bash
rustup target add x86_64-pc-windows-gnu
# tauri-build 要用 windres 编译图标资源，用 LLVM 的顶上
mkdir -p ~/bin && ln -sf "$(which llvm-windres-18 || which llvm-windres)" ~/bin/x86_64-w64-mingw32-windres
PATH=~/bin:$PATH cargo clippy --target x86_64-pc-windows-gnu -p daymark
```

真正打包仍需在 Windows 上做（或 CI 的 windows-latest）。

## 应用内更新是怎么工作的

- 刻忆用 [tauri-plugin-updater](https://v2.tauri.app/plugin/updater/)，更新清单固定在
  `https://github.com/kekemao00/daymark/releases/latest/download/latest.json`（指向最新的**非预发布** Release）。
- 打开窗口、托盘菜单"检查更新"、设置里手动检查，以及后台每 6 小时各触发一次检查，结果缓存 1 小时。
  只在托盘运行时发现新版本，会弹一条通知。设置里可以关闭自动检查。
- 用户点"立即更新"后：下载安装包 → 用 `tauri.conf.json` 里的公钥校验 minisign 签名 → 以被动模式（只显示进度）
  运行 NSIS 安装程序 → 当前进程退出 → 安装程序装完后重新启动刻忆。
- 安装前会在数据目录写一个 `update-relaunch` 标记，重启后据此弹出窗口并提示"已更新到 x.y.z"（即使是开机自启参数）。
- 相关代码：`src-tauri/src/updater.rs`、`src/components/UpdateBanner.tsx`，发布端 `scripts/release-manifest.mjs`。

## 发版

### 一次性准备：更新签名密钥

更新包必须签名，刻忆才会安装。密钥对用 Tauri CLI 生成：

```bash
npx tauri signer generate -w ~/.tauri/daymark.key
```

- 公钥（`daymark.key.pub` 的内容）填进 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`（仓库里已经填好当前的）。
- 私钥内容加到仓库 Secrets：`TAURI_SIGNING_PRIVATE_KEY`；如果生成时设了密码，再加 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- **私钥只此一份，务必另行保管。** 丢了就只能换一对：改 `pubkey`、发新版本，已装旧版本的用户要手动装一次。

### 每次发版

1. `npm run version:set -- 0.3.0`
2. 写 `.github/release-notes/v0.3.0.md`（发布说明，也会出现在应用内更新横幅的"更新说明"里）
3. 提交，推送标签：`git tag v0.3.0 && git push origin v0.3.0`；或在 GitHub 的 Actions → Release 页面点 Run workflow 并填写 `v0.3.0`

`.github/workflows/release.yml` 会在 Windows 上：校验标签与版本号一致、检查密钥存在 → 跑核心单测 → 构建并签名 →
生成 `latest.json` 和 `SHA256SUMS.txt` → 创建 GitHub Release，附件：

| 附件 | 用途 |
| --- | --- |
| `Daymark_<版本>_x64-setup.exe` | 安装包，手动下载安装 |
| `Daymark_<版本>_x64-setup.exe.sig` | 更新签名 |
| `latest.json` | 应用内更新清单 |
| `SHA256SUMS.txt` | 校验和 |

标签带 `-`（如 `v0.3.0-beta.1`）会标为预发布，`releases/latest` 不会指向它，所以不会推给现有用户；适合先发给少数人试用。

## 在 Linux 上交叉编译 Windows 安装包

用 MinGW 工具链（不需要下载 MSVC）：

```bash
sudo apt install nsis mingw-w64
rustup target add x86_64-pc-windows-gnu
npx tauri build --target x86_64-pc-windows-gnu
# 产物：target/x86_64-pc-windows-gnu/release/bundle/nsis/刻忆_<版本>_x64-setup.exe
```

Tauri 官方说明交叉编译属于实验功能；正式发布一律走 Release 工作流在 windows-latest 上构建。
安装包未做代码签名，首次运行 Windows SmartScreen 会提示"未知发布者"，公开发布前需要代码签名证书。

## 发布前手工验收（Windows 实机）

把系统时间或条目日期调到合适的位置逐项验证：

- [ ] 安装后首次启动显示空状态，设置里"开机自动启动"默认勾选
- [ ] 新建一条今天的条目（提醒含"当天"）：到达每日提醒时刻后 1 分钟内弹出 Toast；重启应用不再重复弹出
- [ ] 新建一条 20 天后的条目：不会立即弹出"30 天"提醒
- [ ] 一条 5 天后的条目标记"已准备"后，到点不弹"7 天"提醒；把日期调到当天仍会弹
- [ ] 把每日提醒时间改到当前时刻之后：到点才弹出
- [ ] 删除一条后点"撤销"，条目原样回来
- [ ] 关闭窗口后托盘图标仍在，托盘提示显示最近的一件事；左键托盘图标重新打开窗口，大小位置与关闭前一致
- [ ] 再次双击桌面图标，只唤起已有窗口，不启动第二个进程
- [ ] 重启电脑：只出现托盘图标，不弹窗口；任务管理器"启动"页能看到刻忆
- [ ] 设置里"发送测试通知"能弹出；导出后在另一台电脑导入，条目一致
- [ ] 装上一个旧版本，发布新版本后：打开窗口出现更新横幅；点"立即更新"能下载、安装并自动重启，重启后提示"已更新到"；设置里版本号正确
- [ ] 托盘菜单"检查更新…"、设置里"检查更新"在没有新版本时提示"已是最新版本"
- [ ] 窗口关闭后，任务管理器里刻忆的内存占用（不含系统 WebView2 进程）在 30 MB 以内
