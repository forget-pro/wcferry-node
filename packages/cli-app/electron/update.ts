import { autoUpdater } from "electron-updater";
import { dialog, BrowserWindow, app } from "electron";
import { WCF } from "./wcf";
import axios from "axios";

export class ElectronUpdate extends WCF {
  private updateInProgress: boolean;
  constructor(win: BrowserWindow) {
    super(win);
    this.updateInProgress = false;
  }

  public setUpdatSetFeedUrl = async () => {
    const tag = await this.getLatestVersion();
    const proxyurl = this.wcfConfig?.proxy_url ? this.wcfConfig?.proxy_url + "/" : "";
    if (tag) {
      const url = `${proxyurl}https://github.com/dr-forget/wcferry-node/releases/download/${tag}`;
      autoUpdater.setFeedURL({
        provider: "generic",
        url,
        requestHeaders: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        },
      });
      this.sendLog("设置更新地址成功", "INFO");
    }
  };

  // 获取最新的APP版本号
  public getLatestVersion = async () => {
    try {
      const url = `https://api.github.com/repos/dr-forget/wcferry-node/releases`;
      const res = await axios.get(url, { timeout: 6000 });
      if (res.status !== 200) {
        this.sendLog("获取最新版本失败", "ERROR");
        return null;
      }
      const data = res.data;
      // 获取APP版本号
      const latestAppVersion = data.filter((item: any) => /^app-v/.test(item.tag_name))[0] || null;
      return latestAppVersion.tag_name || null;
    } catch (err: any) {
      this.sendLog(err.message, "ERROR");
      return null;
    }
  };
  // 检查更新
  public checkElectronUpdate = async () => {
    try {
      if (!app.isPackaged) return 0;
      if (this.updateInProgress) return 2;
      await this.setUpdatSetFeedUrl();
      this.updateInProgress = true;
      const res = await autoUpdater.checkForUpdatesAndNotify();
      autoUpdater.on("checking-for-update", () => {
        this.windown?.webContents.send("main-process-message", "🕵️ 正在检查更新...");
      });
      autoUpdater.on("update-available", () => {
        this.updateInProgress = false;
        this.windown?.webContents.send("main-process-message", "update-available");
      });
      autoUpdater.on("update-not-available", () => {
        this.updateInProgress = false;
        this.windown?.webContents.send("main-process-message", "update-not-available");
      });
      autoUpdater.on("error", (err) => {
        this.updateInProgress = false;
        this.windown?.webContents.send("main-process-message", err.message);
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
