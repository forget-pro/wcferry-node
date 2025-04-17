import { autoUpdater } from "electron-updater";
import { dialog, BrowserWindow, app } from "electron";
import dayjs from "dayjs";

export class ElectronUpdate {
  private updateInProgress: boolean;
  private windown: BrowserWindow;
  constructor(win: BrowserWindow) {
    this.updateInProgress = false;
    this.windown = win;
  }
  //   发送日志
  public sendLog = (message: string, level: "INFO" | "ERROR" | "WARN" | "SUCCESS") => {
    this.windown.webContents.send("wcf:log", { message, level: level || "INFO", timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss.SSS ") });
  };
  // 检查更新
  public checkUpdate = async () => {
    try {
      if (!app.isPackaged) return 0;
      if (this.updateInProgress) return 2;
      this.updateInProgress = true;
      const res = await autoUpdater.checkForUpdates();
      autoUpdater.on("update-not-available", () => {
        this.updateInProgress = false;
      });

      autoUpdater.on("error", () => {
        console.log(666);
        this.updateInProgress = false;
      });

      autoUpdater.on("update-downloaded", () => {
        dialog
          .showMessageBox({
            type: "info",
            title: "更新已下载",
            message: "新版本已准备好，是否现在安装？",
            buttons: ["安装并重启", "稍后"],
          })
          .then((result) => {
            if (result.response === 0) {
              autoUpdater.quitAndInstall();
            }
            this.updateInProgress = false;
          });
      });
      if (res && res?.updateInfo.version !== app.getVersion()) {
        return 1;
      } else {
        return 0;
      }
    } catch (err: any) {
      this.updateInProgress = false;
      this.sendLog(err.message, "ERROR");
    }
  };
}
