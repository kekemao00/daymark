<div align="center">

<img src="src-tauri/icons/128x128.png" width="88" alt="刻忆">

# 刻忆 Daymark

**重要的日子，录入一次，每年都不会忘。**

生日、纪念日只记一次，农历自动换算成每年的公历日期，<br>
在提前 1 个月、1 周和当天主动弹出 Windows 通知。

[![最新版本](https://img.shields.io/github/v/release/kekemao00/daymark?label=下载&color=d9493b)](https://github.com/kekemao00/daymark/releases/latest)
[![CI](https://github.com/kekemao00/daymark/actions/workflows/ci.yml/badge.svg)](https://github.com/kekemao00/daymark/actions/workflows/ci.yml)
[![平台](https://img.shields.io/badge/平台-Windows%2010%20%7C%2011-0078d4)](#下载安装)
[![许可](https://img.shields.io/badge/许可-MIT-green)](LICENSE)

<img src="docs/screenshots/home.png" width="760" alt="刻忆首页：按今天、7 天内、30 天内、更晚分组列出即将到来的日子">

</div>

## 为什么做刻忆

手机日历能记公历生日，但长辈的农历生日每年对应的公历日期都不一样，常常要现查；
纪念日记得住日子，却总在当天才想起来，来不及准备礼物。

刻忆只做一件事：把这些日子记下来，**提前**提醒你。它常驻在系统托盘，开机自动启动，
关掉窗口也照常提醒，不需要你每天打开它看。

## 下载安装

到 [Releases](https://github.com/kekemao00/daymark/releases/latest) 下载 `Daymark_<版本>_x64-setup.exe`，双击安装即可。

- 支持 Windows 10 1809 及以上、Windows 11
- 装在当前用户下，不需要管理员权限；缺少 WebView2 时安装程序会自动下载
- 安装包暂未签名，Windows SmartScreen 可能提示“已保护你的电脑”，点“更多信息 → 仍要运行”

## 功能

| | |
| --- | --- |
| 📅 **公历 / 农历双轨** | 农历支持闰月、大小月和“三十”，1901–2099 年与香港天文台农历表逐日一致；只记得公历出生日期也能一键换算成农历 |
| ⏰ **多级提前提醒** | 每条可选提前 30 / 7 / 3 / 1 天和当天，默认提前 1 个月、1 周和当天 |
| 🔁 **错过自动补发** | 电脑没开错过的提醒，下次开机到点后补发一次，同一阶段不会重复打扰 |
| 🔔 **常驻托盘** | Windows Toast 通知、开机自启（只进托盘不弹窗）、关闭窗口继续提醒、单实例运行 |
| 👀 **一目了然** | 首页按“今天 / 7 天内 / 30 天内 / 更晚”分组，显示倒数天数、岁数和周年，可搜索、按类型筛选 |
| 🔒 **数据只在本机** | 不联网、不需要账号；原子写入并自动备份，可导出导入 |
| 🌗 **浅色 / 深色** | 跟随系统主题 |

## 截图

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/editor.png" alt="编辑条目：选择农历九月初六，实时显示下一次是哪天、还有几天、几岁生日"></td>
    <td width="50%"><img src="docs/screenshots/settings.png" alt="设置：每日提醒时间、开机自启、新建时默认提醒、测试通知、导出导入"></td>
  </tr>
  <tr>
    <td align="center">添加 / 编辑：选好农历日期，立刻看到下一次是哪天</td>
    <td align="center">设置：提醒时刻、开机自启、默认提醒、备份</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/home-dark.png" alt="深色模式下的首页"></td>
    <td width="50%" valign="middle">
      <b>深色模式</b><br><br>
      系统切到深色时自动跟随。<br><br>
      <sub>截图中的人名与日期均为示例数据。</sub>
    </td>
  </tr>
</table>

## 提醒是怎么工作的

1. 每天到了提醒时刻（默认 09:00，可在设置里改），刻忆检查每个条目处在哪个提醒阶段。
   例如提前量是“1 个月 / 1 周 / 当天”、离生日还剩 20 天，就处在“提前 1 个月”阶段。
2. 当前阶段还没提醒过，就弹出一条系统通知，文案写的是真实剩余天数（如“「妈妈生日」还有 5 天”）。
3. 开机晚于提醒时刻，会立即补发；但只补当前阶段，不会把已经过去的阶段一股脑全弹出来。
4. 刚新建或改过日期的条目，当天之前的阶段视为已跳过，不会一录入就弹窗。

农历的几个边界情况：闰月条目当年没有闰月时按普通月提醒；农历三十在小月落到廿九；
公历 2 月 29 日在平年落到 2 月 28 日。详见 [docs/architecture.md](docs/architecture.md)。

## 数据与备份

所有数据保存在本机一个 JSON 文件里：

```
%APPDATA%\app.daymark.desktop\daymark.json
```

- 写入时先写临时文件再替换，同时保留上一份为 `.bak`；主文件损坏时自动从备份恢复
- 设置里可以“导出备份”到任意位置，换电脑时再“导入”，同一条目按修改时间合并

## 路线图

- [x] **V0.1** Windows 桌面 MVP：公历 / 农历、多级提醒、托盘、开机自启、导入导出
- [ ] **V0.2** 通知里的“稍后提醒 / 已准备”按钮
- [ ] 重要度分级，不同重要度使用不同提醒强度
- [ ] AI 生成祝福语
- [ ] 云同步，扩展到移动端和浏览器插件

完整的产品规划（定位、PRD、MVP 范围、技术选型、路线图）见 [docs/README.md](docs/README.md)。

## 参与开发

技术栈：[Tauri 2](https://tauri.app/) + Rust，界面用 React + TypeScript + Vite。

```
crates/daymark-core   核心逻辑（纯 Rust，不依赖 Tauri）：农历换算、下一次日期、提醒阶段、存储
src-tauri             Tauri 2 外壳：命令、提醒调度线程、托盘、开机自启
src                   界面（React + TypeScript）
scripts               农历数据表生成与逐日对照脚本
docs                  工程文档与截图
```

需要 Node.js 22+ 和 Rust（stable）。Windows 上还需要 WebView2（Win10/11 一般已自带）和
Visual Studio 生成工具（“使用 C++ 的桌面开发”）。

```bash
npm install
npm run tauri dev            # 启动桌面应用（调试版不会注册开机自启）
npm run dev                  # 只在浏览器里预览界面，使用内存示例数据
npm test                     # 前端单测
cargo test -p daymark-core   # 核心逻辑单测
npm run verify:lunar         # 农历 1901–2099 逐日对照
npm run tauri build          # 生成 Windows 安装包
```

在 Linux 上交叉编译 Windows 安装包、发版流程和发布前验收清单见 [docs/development.md](docs/development.md)。

## 许可

[MIT](LICENSE)
