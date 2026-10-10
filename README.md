# 刻忆 Daymark

重要日期主动提醒的 Windows 桌面工具：生日、纪念日只录入一次，农历自动换算成每年的公历日期，
在提前 1 个月、1 周和当天弹出系统通知。开机自启后只在托盘运行，关闭窗口也照常提醒。

当前版本 V0.1（MVP）。产品规划（定位、评估、PRD、MVP 范围、技术选型、架构、路线图）见
[docs/README.md](docs/README.md)。

## 功能

- 公历 / 农历双轨：农历支持闰月、大小月，1901–2099 年与香港天文台农历表逐日一致
- 多级提醒：每条可选提前 30 / 7 / 3 / 1 / 0 天，默认 30 / 7 / 0
- 开机补发：错过的提醒在下次开机、到达每日提醒时刻后补发一次，同一阶段不重复
- Windows Toast 通知、系统托盘、开机自启（不需要管理员权限）、单实例
- 首页按“今天 / 7 天内 / 30 天内 / 更晚”分组，显示岁数和周年，可搜索、按类型筛选
- 数据只存在本机 `%APPDATA%\app.daymark.desktop\daymark.json`，原子写入并保留 `.bak`，可导入导出

## 目录

```
crates/daymark-core   核心逻辑（纯 Rust，不依赖 Tauri）：农历换算、下一次日期、提醒阶段、存储
src-tauri             Tauri 2 外壳：命令、提醒调度线程、托盘、开机自启
src                   界面（React + TypeScript + Vite）
scripts               农历数据表生成与逐日对照脚本
docs                  工程文档
```

## 开发

需要 Node.js 22+、Rust（stable）。Windows 上还需要 WebView2（Win10/11 一般已自带）和
Visual Studio 生成工具（“使用 C++ 的桌面开发”）。

```bash
npm install
npm run tauri dev        # 启动桌面应用（调试版不会注册开机自启）
npm run dev              # 只在浏览器里预览界面，使用内存假数据
npm test                 # 前端单测
cargo test -p daymark-core   # 核心逻辑单测
npm run verify:lunar     # 农历 1901–2099 逐日对照
npm run tauri build      # 生成安装包：target/release/bundle/nsis/刻忆_0.1.0_x64-setup.exe
```

更多说明见 [docs/development.md](docs/development.md)。

## 许可

MIT
