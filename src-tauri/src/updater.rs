//! 应用内更新：从 GitHub Releases 的 `latest.json` 检查新版本；用户确认后下载安装包，
//! 校验签名（公钥在 tauri.conf.json）后以被动模式运行安装程序并自动重启。
//!
//! 检查分三种触发：窗口打开时（前端调用 `check_update`）、设置里手动点击、后台每 6 小时一次
//! （只在托盘运行时发现新版本会弹一条通知）。结果缓存 1 小时，避免反复请求。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::state::AppState;

pub const RELEASES_URL: &str = "https://github.com/kekemao00/daymark/releases";
const CACHE_TTL: Duration = Duration::from_secs(60 * 60);
const BACKGROUND_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const BACKGROUND_FIRST_DELAY: Duration = Duration::from_secs(30);
/// 安装前写下目标版本，重启后据此弹出窗口并提示“已更新”。
const RELAUNCH_MARKER: &str = "update-relaunch";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current_version: String,
    pub notes: Option<String>,
    /// 发布日期，YYYY-MM-DD。
    pub date: Option<String>,
    /// 发布页面，供“查看更新说明”打开。
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[derive(Default)]
pub struct UpdaterState {
    update: Mutex<Option<Update>>,
    checked_at: Mutex<Option<Instant>>,
    notified: Mutex<Option<String>>,
    installing: AtomicBool,
}

impl UpdaterState {
    fn cached(&self) -> Option<Option<UpdateInfo>> {
        let fresh = self.checked_at.lock().unwrap().is_some_and(|t| t.elapsed() < CACHE_TTL);
        fresh.then(|| self.update.lock().unwrap().as_ref().map(info))
    }
}

fn info(update: &Update) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        current_version: update.current_version.clone(),
        notes: update.body.clone().filter(|s| !s.trim().is_empty()),
        date: update.date.map(|d| d.date().to_string()),
        url: format!("{RELEASES_URL}/tag/v{}", update.version),
    }
}

fn describe(e: tauri_plugin_updater::Error) -> String {
    use tauri_plugin_updater::Error::*;
    match e {
        Reqwest(e) if e.is_connect() || e.is_timeout() => "连不上 GitHub，请检查网络后再试".into(),
        Reqwest(e) => format!("网络请求失败：{e}"),
        ReleaseNotFound => "GitHub 上还没有发布版本".into(),
        TargetNotFound(_) | TargetsNotFound(_) => "最新版本没有提供 Windows 安装包".into(),
        Minisign(_) | SignatureUtf8(_) => "安装包签名校验失败，已放弃安装。请到发布页手动下载".into(),
        e => format!("更新失败：{e}"),
    }
}

/// 向 GitHub 查询最新版本。`force` 为 false 时一小时内复用上次结果。
pub async fn check(app: &AppHandle, force: bool) -> Result<Option<UpdateInfo>, String> {
    let state = app.state::<UpdaterState>();
    if !force {
        if let Some(cached) = state.cached() {
            return Ok(cached);
        }
    }
    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .on_before_exit({
            let app = app.clone();
            move || write_relaunch_marker(&app)
        })
        .build()
        .map_err(describe)?;
    let result = updater.check().await.map_err(describe)?;
    let info = result.as_ref().map(info);
    *state.update.lock().unwrap() = result;
    *state.checked_at.lock().unwrap() = Some(Instant::now());
    let _ = app.emit("update://result", &info);
    Ok(info)
}

/// 下载并安装上次检查到的版本。进度通过 `update://progress` 事件推送；
/// 安装程序启动后本进程退出，安装完成由安装程序重新启动刻忆。
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<UpdaterState>();
    let update = state.update.lock().unwrap().clone().ok_or("还没有检查到新版本")?;
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err("正在更新中".into());
    }
    let mut downloaded: u64 = 0;
    let result = update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                let _ = app.emit("update://progress", DownloadProgress { downloaded, total });
            },
            || {
                let _ = app.emit("update://installing", ());
            },
        )
        .await;
    state.installing.store(false, Ordering::SeqCst);
    result.map_err(describe)
}

/// 后台定期检查：只在托盘运行、窗口没开时，发现新版本弹一条通知（每个版本只提醒一次）。
pub fn spawn_background_check(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(BACKGROUND_FIRST_DELAY).await;
        loop {
            let enabled = app.state::<AppState>().snapshot().settings.check_updates;
            if enabled {
                if let Ok(Some(update)) = check(&app, false).await {
                    let window_open = app.get_webview_window("main").is_some();
                    let state = app.state::<UpdaterState>();
                    let already = state.notified.lock().unwrap().as_deref() == Some(update.version.as_str());
                    if !window_open && !already {
                        *state.notified.lock().unwrap() = Some(update.version.clone());
                        let _ = crate::scheduler::notify(
                            &app,
                            &format!("刻忆 {} 可以更新了", update.version),
                            "打开刻忆，在顶部的提示里点“立即更新”即可。",
                        );
                    }
                }
            }
            tokio::time::sleep(BACKGROUND_INTERVAL).await;
        }
    });
}

/// 托盘菜单“检查更新”：打开窗口并强制检查，结果由 `update://result` 事件送到界面。
pub fn check_from_tray(app: &AppHandle) {
    crate::tray::show_main(app);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = check(&app, true).await {
            let _ = app.emit("update://error", e);
        }
    });
}

fn marker_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(RELAUNCH_MARKER))
}

fn write_relaunch_marker(app: &AppHandle) {
    let version = app
        .state::<UpdaterState>()
        .update
        .lock()
        .unwrap()
        .as_ref()
        .map(|u| u.version.clone())
        .unwrap_or_default();
    if let Some(path) = marker_path(app) {
        let _ = std::fs::write(path, version);
    }
}

/// 启动时调用：如果是更新后由安装程序重新启动的，返回 true（并清掉标记），调用方据此弹出窗口。
pub fn consume_relaunch_marker(app: &AppHandle) -> Option<String> {
    let path = marker_path(app)?;
    let version = std::fs::read_to_string(&path).ok()?;
    let _ = std::fs::remove_file(&path);
    Some(version.trim().to_string())
}
