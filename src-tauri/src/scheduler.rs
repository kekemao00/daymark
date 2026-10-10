//! 后台提醒线程：每 60 秒（或数据变更后立即）检查一次。到达每日提醒时刻后，
//! 发出所有“当前阶段尚未提醒”的通知并记下，所以关机、睡眠错过的提醒会在下次检查时补发。

use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::Duration;

use chrono::{Local, NaiveTime, Timelike, Utc};
use daymark_core::{due_reminders, upcoming, FiredRecord};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::state::AppState;

const INTERVAL: Duration = Duration::from_secs(60);

pub fn spawn(app: AppHandle) {
    let (tx, rx) = mpsc::channel::<()>();
    *app.state::<AppState>().wake.lock().unwrap() = Some(tx);
    std::thread::Builder::new()
        .name("daymark-scheduler".into())
        .spawn(move || loop {
            tick(&app);
            match rx.recv_timeout(INTERVAL) {
                Ok(()) | Err(RecvTimeoutError::Timeout) => {
                    // 合并短时间内的多次唤醒
                    while rx.try_recv().is_ok() {}
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        })
        .expect("spawn scheduler thread");
}

fn tick(app: &AppHandle) {
    let state = app.state::<AppState>();
    let now = Local::now();
    let today = now.date_naive();
    let data = state.snapshot();

    crate::tray::set_tooltip(app, &tooltip(&data, today));

    let (h, m) = data.settings.remind_hm().unwrap_or((9, 0));
    let remind_at = NaiveTime::from_hms_opt(h, m, 0).unwrap_or_default();
    if now.time().with_nanosecond(0).unwrap_or_default() < remind_at {
        return;
    }
    let due = due_reminders(&data, today);
    if due.is_empty() {
        return;
    }
    let mut fired = vec![];
    for r in &due {
        match notify(app, &r.title, &r.body) {
            Ok(()) => fired.push(FiredRecord {
                event_id: r.event_id.clone(),
                occurrence: r.occurrence,
                offset: r.offset,
                fired_at: Utc::now(),
            }),
            Err(e) => eprintln!("通知发送失败：{e}"),
        }
    }
    if fired.is_empty() {
        return;
    }
    // 不经过 mutate，避免唤醒自己
    let mut guard = state.data.lock().unwrap();
    let mut next = guard.clone();
    next.fired.extend(fired);
    next.prune_fired(today);
    if !state.read_only {
        if let Err(e) = state.store.save(&next) {
            eprintln!("保存提醒记录失败：{e}");
        }
    }
    *guard = next;
}

pub fn notify(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

/// 托盘提示：今天的事，或最近的一件。
fn tooltip(data: &daymark_core::Data, today: chrono::NaiveDate) -> String {
    let enabled: Vec<_> = data.events.iter().filter(|e| e.enabled).cloned().collect();
    let list = upcoming(&enabled, today);
    let name = |id: &str| enabled.iter().find(|e| e.id == id).map(|e| e.name.clone()).unwrap_or_default();
    let today_names: Vec<String> = list.iter().filter(|u| u.days_until == 0).map(|u| name(&u.event_id)).collect();
    if !today_names.is_empty() {
        return format!("刻忆 · 今天：{}", today_names.join("、"));
    }
    match list.first() {
        Some(u) => format!("刻忆 · {}还有 {} 天", name(&u.event_id), u.days_until),
        None => "刻忆".into(),
    }
}
