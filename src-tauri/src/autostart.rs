//! 开机自启：写入当前用户的注册表 Run 项（由 tauri-plugin-autostart 完成），启动参数带 --autostart，
//! 这样开机时只进托盘、不弹窗口。调试版不注册，避免把开发中的程序写进开机启动。

use tauri::AppHandle;

pub const ARG: &str = "--autostart";

pub fn launched_by_autostart() -> bool {
    std::env::args().any(|a| a == ARG)
}

#[cfg(desktop)]
pub fn apply(app: &AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    if cfg!(debug_assertions) {
        return Ok(());
    }
    let launcher = app.autolaunch();
    let current = launcher.is_enabled().unwrap_or(false);
    let result = match (enabled, current) {
        (true, false) => launcher.enable(),
        (false, true) => launcher.disable(),
        _ => Ok(()),
    };
    result.map_err(|e| format!("设置开机自启失败：{e}"))
}

#[cfg(not(desktop))]
pub fn apply(_app: &AppHandle, _enabled: bool) -> Result<(), String> {
    Ok(())
}
