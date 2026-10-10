use std::sync::mpsc::Sender;
use std::sync::Mutex;

use daymark_core::{Data, Store};

pub struct AppState {
    pub store: Store,
    pub data: Mutex<Data>,
    /// 启动时要告诉用户的事（如已从备份恢复）。
    pub notice: Mutex<Option<String>>,
    /// 数据文件读不出来时为 true：不写盘，避免覆盖用户还可能救回的文件。
    pub read_only: bool,
    pub wake: Mutex<Option<Sender<()>>>,
}

impl AppState {
    /// 修改数据并立即落盘；成功后唤醒调度线程重新检查。
    pub fn mutate<T>(&self, f: impl FnOnce(&mut Data) -> Result<T, String>) -> Result<T, String> {
        if self.read_only {
            return Err(format!(
                "数据文件无法读取，为避免覆盖已暂停保存。请检查文件：{}",
                self.store.path().display()
            ));
        }
        let out = {
            let mut data = self.data.lock().unwrap();
            let mut next = data.clone();
            let out = f(&mut next)?;
            self.store.save(&next).map_err(|e| e.to_string())?;
            *data = next;
            out
        };
        self.wake_scheduler();
        Ok(out)
    }

    pub fn snapshot(&self) -> Data {
        self.data.lock().unwrap().clone()
    }

    pub fn wake_scheduler(&self) {
        if let Some(tx) = self.wake.lock().unwrap().as_ref() {
            let _ = tx.send(());
        }
    }
}
