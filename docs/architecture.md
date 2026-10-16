# 工程架构

## 模块

| 模块 | 职责 |
| --- | --- |
| `crates/daymark-core` | 纯 Rust，无 Tauri 依赖。`calendar` 公历↔农历；`occurrence` 规则→下一次日期；`reminder` 提醒阶段与通知文案；`model` 数据模型与校验；`store` JSON 存储 |
| `src-tauri/src/commands.rs` | 前端调用的命令：概览、增删改、撤销删除、"已准备"、预览、换算、设置、导入导出、测试通知、打开目录 / 项目网址、检查 / 安装更新 |
| `src-tauri/src/scheduler.rs` | 后台线程，每 60 秒或数据变更后检查一次，发 Toast 并记录 |
| `src-tauri/src/updater.rs` | 应用内更新：查 GitHub Releases 的 `latest.json`、下载并校验签名、运行安装程序；后台每 6 小时检查一次 |
| `src-tauri/src/tray.rs` | 托盘图标、菜单（打开、检查更新、退出）与提示文字；按需创建主窗口并记住大小位置 |
| `src-tauri/src/autostart.rs` | 开机自启（当前用户注册表 Run 项，参数 `--autostart`） |
| `src` | React 界面，只做展示与输入，所有日期计算都调 Rust 命令。`toast.tsx` 轻提示，`hooks.ts` 快捷键与主题，`components/Icon.tsx` 自绘图标 |

关闭主窗口会销毁 WebView 以节省内存，进程靠托盘和调度线程常驻；托盘菜单"退出刻忆"才结束进程。
以 `--autostart` 启动（开机自启）时不创建窗口；但如果是更新后由安装程序重启的（数据目录里有 `update-relaunch` 标记），仍会弹出窗口并提示已更新。

Rust 端通过事件把更新进度推给界面：`update://result`（检查结果）、`update://progress`（下载进度）、`update://installing`、`update://error`。

## 日期规则

- 公历 2 月 29 日：平年落到 2 月 28 日。
- 农历闰月条目：当年有同名闰月时过闰月，否则过同名普通月；普通月条目每年都过普通月。
- 农历三十：当年该月只有 29 天时落到廿九（例如除夕）。
- 填了起始年份：不会算出早于起始年的日期；岁数 / 周年 = 当次所在年 − 起始年（农历条目用农历年）。

## 提醒规则

- 当前阶段 = 提前量列表中不小于剩余天数的最小值。剩 20 天、提前量 [30, 7, 0] 时处于“30 天”阶段。
- 到达每日提醒时刻（默认 09:00）后，当前阶段若未提醒过就立即提醒；文案用真实剩余天数。
- 只补发当前阶段，不补发已过去的更早阶段；每个（条目, 当次日期, 阶段）只提醒一次。
- 新建、改日期、改提醒级别或重新开启时，把 `remindFrom` 设为当天：触发日早于这一天的阶段视为跳过，
  避免刚录入就弹窗。
- 标记"已准备"（`prepared` = 当次日期）后，这一次的提前阶段不再提醒，当天阶段仍提醒；改日期会清除标记，
  下一年是新的一次，自动恢复。
- 删除条目时不立即删 `fired` 记录，几秒内"撤销"恢复后不会重复弹同一阶段；记录由调度线程的 `prune_fired` 清理。

## 数据文件

`%APPDATA%\app.daymark.desktop\daymark.json`，导出文件格式相同。

```json
{
  "schemaVersion": 1,
  "events": [
    {
      "id": "UUID",
      "name": "妈妈生日",
      "category": "birthday",
      "calendar": "lunar",
      "month": 9, "day": 6, "leap": false, "year": 1966,
      "offsets": [30, 7, 0],
      "note": "喜欢兰花",
      "enabled": true,
      "createdAt": "2026-10-10T06:00:00Z",
      "updatedAt": "2026-10-10T06:00:00Z",
      "remindFrom": "2026-10-10",
      "prepared": "2026-10-15"
    }
  ],
  "settings": {
    "remindTime": "09:00", "autostart": true, "defaultOffsets": [30, 7, 0],
    "checkUpdates": true, "theme": "system"
  },
  "fired": [{ "eventId": "UUID", "occurrence": "2026-10-15", "offset": 7, "firedAt": "…" }]
}
```

- 写入：先写 `daymark.json.tmp` 并落盘，再把旧文件复制为 `.bak`，最后替换。
- 读取：主文件损坏时从 `.bak` 恢复，并把坏文件改名为 `.corrupt-时间戳` 保留；两者都坏时进入只读模式，
  不覆盖任何文件。
- `schemaVersion` 高于当前版本时拒绝打开；以后的格式迁移放在 `store::parse` 里逐级升级。
  V0.2 新增的 `prepared`、`checkUpdates`、`theme` 都有默认值且 `prepared` 为空时不写出，所以格式版本仍是 1，
  V0.1 也能读 V0.2 写的文件。
- 导入按 `id` 合并，同 id 保留 `updatedAt` 较新的一份，不合法的条目跳过，设置不导入。

## 农历数据

`crates/daymark-core/src/lunar_table.rs` 内置农历 1900–2099 年每年的月大小与闰月，由
`scripts/gen-lunar-table.mjs` 从 lunar-javascript 生成。

选型时对比了三个库在 1901–2099 年的逐日结果。tyme4rs 与 lunar-javascript 有 330 天不同（集中在 1906–1957 年
的 10 个月份），chinese-lunisolar-calendar 与 lunar-javascript 有 60 天不同（2089、2097 年）。抽查香港天文台
农历表的 1906-04-24、1957-03-02、2089-09-04、2097-08-07 四天，都与 lunar-javascript 一致，所以以它为数据源，
并把这四天写进单元测试。`npm run verify:lunar` 会重新逐日对照 1901-01-01 至 2099-12-31 的每一天。
