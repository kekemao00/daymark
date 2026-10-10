//! 前端调用的命令。所有日期计算都交给 daymark-core。

use chrono::{Local, NaiveDate, Utc};
use daymark_core::calendar::{self, LunarDate};
use daymark_core::model::{normalize_offsets, parse_hm, OFFSET_CHOICES};
use daymark_core::reminder::{upcoming_for, Upcoming};
use daymark_core::{store, upcoming, Category, DateRule, Event, EventInput, Settings};
use serde::Serialize;
use tauri::{AppHandle, State};

use crate::state::AppState;

type CmdResult<T> = Result<T, String>;

fn today() -> NaiveDate {
    Local::now().date_naive()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    today: NaiveDate,
    events: Vec<Event>,
    upcoming: Vec<Upcoming>,
    settings: Settings,
    notice: Option<String>,
    data_path: String,
    offset_choices: Vec<u32>,
}

#[tauri::command]
pub fn get_overview(state: State<AppState>) -> Overview {
    let data = state.snapshot();
    let today = today();
    Overview {
        today,
        upcoming: upcoming(&data.events, today),
        events: data.events,
        settings: data.settings,
        notice: state.notice.lock().unwrap().take(),
        data_path: state.store.path().display().to_string(),
        offset_choices: OFFSET_CHOICES.to_vec(),
    }
}

#[tauri::command]
pub fn save_event(state: State<AppState>, id: Option<String>, input: EventInput) -> CmdResult<Event> {
    input.validate().map_err(|e| e.to_string())?;
    let (now, today) = (Utc::now(), today());
    state.mutate(|data| match id {
        Some(id) => {
            let event = data
                .events
                .iter_mut()
                .find(|e| e.id == id)
                .ok_or("这条记录已不存在")?;
            event.apply(input, now, today);
            Ok(event.clone())
        }
        None => {
            let event = Event::new(uuid::Uuid::new_v4().to_string(), input, now, today);
            data.events.push(event.clone());
            Ok(event)
        }
    })
}

#[tauri::command]
pub fn delete_event(state: State<AppState>, id: String) -> CmdResult<()> {
    state.mutate(|data| {
        data.events.retain(|e| e.id != id);
        data.fired.retain(|f| f.event_id != id);
        Ok(())
    })
}

#[tauri::command]
pub fn set_event_enabled(state: State<AppState>, id: String, enabled: bool) -> CmdResult<()> {
    let (now, today) = (Utc::now(), today());
    state.mutate(|data| {
        let event = data.events.iter_mut().find(|e| e.id == id).ok_or("这条记录已不存在")?;
        let input = EventInput {
            name: event.name.clone(),
            category: event.category,
            rule: event.rule,
            offsets: event.offsets.clone(),
            note: event.note.clone(),
            enabled,
        };
        event.apply(input, now, today);
        Ok(())
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulePreview {
    error: Option<String>,
    rule_label: String,
    next: Option<Upcoming>,
    origin_date: Option<NaiveDate>,
}

/// 编辑表单实时预览：下一次是哪天、还有几天。
#[tauri::command]
pub fn preview_rule(rule: DateRule, category: Category) -> RulePreview {
    let error = rule.validate().err().map(|e| e.to_string());
    let next = if error.is_none() {
        let input = EventInput {
            name: "预览".into(),
            category,
            rule,
            offsets: vec![0],
            note: String::new(),
            enabled: true,
        };
        let event = Event::new(String::new(), input, Utc::now(), today());
        upcoming_for(&event, today())
    } else {
        None
    };
    RulePreview { error, rule_label: rule.label(), next, origin_date: rule.origin_date() }
}

/// 公历日期换算成农历，供“按公历生日换算”使用。
#[tauri::command]
pub fn convert_solar(date: NaiveDate) -> CmdResult<LunarDate> {
    calendar::solar_to_lunar(date).ok_or_else(|| {
        format!("只支持 {} 到 {} 年的日期", calendar::MIN_YEAR, calendar::MAX_YEAR)
    })
}

#[tauri::command]
pub fn update_settings(app: AppHandle, state: State<AppState>, settings: Settings) -> CmdResult<Settings> {
    let (h, m) = parse_hm(&settings.remind_time).ok_or("提醒时间格式应为 HH:MM")?;
    let offsets = normalize_offsets(&settings.default_offsets);
    if offsets.is_empty() {
        return Err("至少选择一个默认提醒时间".into());
    }
    let settings = Settings { remind_time: format!("{h:02}:{m:02}"), default_offsets: offsets, ..settings };
    crate::autostart::apply(&app, settings.autostart)?;
    state.mutate(|data| {
        data.settings = settings.clone();
        Ok(settings)
    })
}

#[tauri::command]
pub fn export_data(state: State<AppState>, path: String) -> CmdResult<()> {
    let json = serde_json::to_string_pretty(&state.snapshot()).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("导出失败：{e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    added: usize,
    updated: usize,
    skipped: usize,
}

/// 按 id 合并导入：新的条目加入，同 id 保留较新的一份；内容不合法的条目跳过。设置不导入。
#[tauri::command]
pub fn import_data(state: State<AppState>, path: String) -> CmdResult<ImportResult> {
    let text = std::fs::read_to_string(&path).map_err(|e| format!("读取文件失败：{e}"))?;
    let mut incoming = store::parse(text.trim_start_matches('\u{feff}')).map_err(|e| e.to_string())?;
    let before = incoming.events.len();
    incoming.events.retain(|e| {
        !e.id.is_empty()
            && !e.name.trim().is_empty()
            && e.name.chars().count() <= 40
            && e.rule.validate().is_ok()
            && !normalize_offsets(&e.offsets).is_empty()
    });
    let skipped = before - incoming.events.len();
    state.mutate(|data| {
        let (added, updated) = data.merge(incoming);
        Ok(ImportResult { added, updated, skipped })
    })
}

#[tauri::command]
pub fn test_notification(app: AppHandle) -> CmdResult<()> {
    crate::scheduler::notify(&app, "刻忆通知测试", "看到这条消息，说明提醒可以正常弹出。")
}
