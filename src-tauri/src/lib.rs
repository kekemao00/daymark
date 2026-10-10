mod autostart;
mod commands;
mod scheduler;
mod state;
mod tray;

use std::sync::Mutex;

use daymark_core::Store;
use tauri::{Manager, RunEvent};

use state::AppState;

pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // 单实例必须最先注册：再次启动时唤起已有窗口
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![autostart::ARG]),
            ));
    }

    let app = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let dir = app.path().app_data_dir()?;
            let store = Store::new(dir.join("daymark.json"));
            let first_run = !store.path().exists();

            let (data, notice, read_only) = match store.load() {
                Ok(out) => {
                    let notice = out
                        .recovered_from_backup
                        .then(|| "数据文件损坏，已自动从备份恢复。损坏的文件已改名保留在数据目录。".to_string());
                    (out.data, notice, false)
                }
                Err(e) => (
                    Default::default(),
                    Some(format!("{e}。为避免覆盖原文件，本次修改不会保存：{}", store.path().display())),
                    true,
                ),
            };
            let autostart = data.settings.autostart;
            app.manage(AppState {
                store,
                data: Mutex::new(data),
                notice: Mutex::new(notice),
                read_only,
                wake: Mutex::new(None),
            });

            // 首次运行按默认设置开启自启；之后以用户设置为准，与系统状态对齐
            if first_run || autostart {
                if let Err(e) = autostart::apply(&handle, autostart) {
                    eprintln!("{e}");
                }
            }

            tray::create(&handle)?;
            scheduler::spawn(handle.clone());
            if !autostart::launched_by_autostart() {
                tray::show_main(&handle);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_overview,
            commands::save_event,
            commands::delete_event,
            commands::set_event_enabled,
            commands::preview_rule,
            commands::convert_solar,
            commands::update_settings,
            commands::export_data,
            commands::import_data,
            commands::test_notification,
        ])
        .build(tauri::generate_context!())
        .expect("启动刻忆失败");

    app.run(|_app, event| {
        // 关闭窗口不退出：托盘和提醒线程继续运行；只有托盘菜单“退出”才结束进程
        if let RunEvent::ExitRequested { code: None, api, .. } = event {
            api.prevent_exit();
        }
    });
}
