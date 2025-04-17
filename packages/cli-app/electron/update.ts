import { autoUpdater } from 'electron-updater';
import { dialog } from 'electron';
export class ElectronUpdate {
  private updateInProgress: boolean;
  constructor() {
    this.updateInProgress = false;
  }
  // 检查更新
  public async checkUpdate() {
    if (this.updateInProgress) return;
    this.updateInProgress = true;
    autoUpdater.checkForUpdates();
    autoUpdater.on('update-not-available', () => {
      this.updateInProgress = false;
    });
    autoUpdater.on('error', () => {
      this.updateInProgress = false;
    });

    autoUpdater.on('update-downloaded', () => {
      dialog
        .showMessageBox({
          type: 'info',
          title: '更新已下载',
          message: '新版本已准备好，是否现在安装？',
          buttons: ['安装并重启', '稍后'],
        })
        .then((result) => {
          if (result.response === 0) {
            autoUpdater.quitAndInstall();
          }
          this.updateInProgress = false;
        });
    });
  }
}
