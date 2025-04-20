import { app, BrowserWindow, Tray, Menu } from "electron";
import { createRequire } from "node:module";
import Fastify, { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import axios from "axios";
import dayjs from "dayjs";
import AdmZip from "adm-zip";
import { execSync } from "child_process";
import { PortIsRun, parseLog, splitLogsByEntry } from "./tool";
const require = createRequire(import.meta.url);
const koffi = require("koffi");
// @ts-ignore
import cron = require("node-cron");
export interface WCFConfig {
  port: number;
  debug: boolean;
  proxy_url: string;
  version: string;
  httpPort: number;
  cronCheck: number;
  app_version: string;
}
export class WCF {
  private Wcf_directory: string;
  private wcfconfigPath: string;
  public wcfConfig: WCFConfig;
  public windown: BrowserWindow;
  private server: FastifyInstance | null;
  private WxInitSDK: Function | null;
  private WxDestroySDK: Function | null;
  public tray: Tray | null = null;
  private scheduleJobs: cron.ScheduledTask[];
  constructor(win: BrowserWindow) {
    this.windown = win;
    this.server = null;
    this.Wcf_directory = path.join(app.getPath("documents"), "WCFApp");
    this.wcfconfigPath = path.join(this.Wcf_directory, "config.json");
    this.WxInitSDK = null;
    this.WxDestroySDK = null;

    // 判断文件夹是否存在
    if (!fs.existsSync(this.Wcf_directory)) {
      fs.mkdirSync(this.Wcf_directory, { recursive: true });
    }
    const version = app.getVersion();
    const initConfig: WCFConfig = {
      port: 10086,
      debug: false,
      proxy_url: "",
      version: "",
      httpPort: 9200,
      cronCheck: 12,
      app_version: version,
    };
    if (fs.existsSync(this.wcfconfigPath)) {
      const config = JSON.parse(fs.readFileSync(this.wcfconfigPath, "utf-8"));
      this.wcfConfig = { ...initConfig, ...config, app_version: version };
    } else {
      this.wcfConfig = initConfig;
    }
    this.writeConfig(this.wcfConfig);
    this.scheduleJobs = [];
  }

  //   上报配置文件
  public reportConfig = () => {
    this.windown.webContents.send("wcf:config", this.wcfConfig);
  };

  //   写入配置文件
  public writeConfig = (config: WCFConfig) => {
    this.wcfConfig = config;
    fs.writeFileSync(this.wcfconfigPath, JSON.stringify(config, null, 4));
  };

  //   发送日志
  public sendLog = (message: string, level: "INFO" | "ERROR" | "WARN" | "SUCCESS") => {
    this.windown.webContents.send("wcf:log", { message, level: level || "INFO", timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss.SSS ") });
  };

  //   检测WCF是否有更新
  public checkUpdate = async () => {
    const config_path = path.join(this.Wcf_directory, "config.json");
    if (fs.existsSync(config_path)) {
      const config = JSON.parse(fs.readFileSync(config_path, "utf-8"));
      const version = config.version.replace("v", "").split(".").join("") || "0";
      const result = await this.getWCFVersion();
      const remove_version = result?.version.replace("v", "").split(".").join("") || "0";
      if (Number(version) < Number(remove_version)) {
        return { status: true, version: result?.version || "" };
      }
    }
    return { staus: false, version: this.wcfConfig.version };
  };

  //   检测WCF是否存在
  public checkWCF = (): boolean => {
    const wcf_path = path.join(this.Wcf_directory, "sdk.dll");
    if (fs.existsSync(wcf_path)) {
      return true;
    } else {
      return false;
    }
  };

  // 获取WCF版本信息
  public getWCFVersion = async () => {
    const github_apiUrl = "https://api.github.com/repos/lich0821/WeChatFerry/releases/latest";
    try {
      const response = await axios.get(github_apiUrl, {
        responseType: "json",
        validateStatus: (status) => status < 500,
      });
      if (!response || !response.data || !response.data.assets || response.data.assets.length === 0) {
        this.sendLog("Failed to retrieve valid data from GitHub API.", "ERROR");
        if (response.data.message) {
          this.sendLog(response.data.message, "ERROR");
        }
        return { version: "", download_url: "" };
      }
      return {
        version: response.data.tag_name,
        download_url: response.data.assets[0].browser_download_url,
      };
    } catch (err: any) {
      this.sendLog(`获取WCF版本信息失败:${err?.message}`, "ERROR");
      return null;
    }
  };

  public downloadFile = async (url: string, dest: string) => {
    const writer = fs.createWriteStream(dest);
    try {
      const proxyurl = this.wcfConfig.proxy_url ? this.wcfConfig.proxy_url + "/" : "";
      const down_url = proxyurl + url;
      this.sendLog(`开始下载文件:${down_url}`, "INFO");
      const download = await axios({
        method: "get",
        url: down_url,
        responseType: "stream",
        timeout: 12000,
      });

      download.data.pipe(writer);
      return await new Promise((resolve, reject) => {
        writer.on("finish", async () => {
          this.sendLog("下载完成", "SUCCESS");
          resolve(true);
        });
        writer.on("error", reject);
      });
    } catch (error: any) {
      await writer.close();
      this.sendLog(`下载失败:${error.message},url:${url}`, "ERROR");
      fs.unlinkSync(dest);
      return false;
    }
  };

  //   下载最新版的WCF
  public downloadWCF = async () => {
    this.sendLog("开始下载最新版本的WCF", "INFO");
    let output: string = "";
    try {
      const result = await this.getWCFVersion();
      this.sendLog(`✅ 获取WCF最新版本信息成功:${result?.version}`, "SUCCESS");
      this.wcfConfig.version = result?.version || "";
      //   获取下载URL
      const filename = path.basename(result?.download_url);
      output = path.join(this.Wcf_directory, filename);
      if (fs.existsSync(output)) {
        console.log("文件存在跳过下载");
        return await this.unzipFile(output);
      }
      const res = await this.downloadFile(result?.download_url, output);
      if (!res) return res;
      const unCompress = await this.unzipFile(output);
      if (unCompress) {
        this.wcfConfig.version = result?.version || "";
        this.writeConfig(this.wcfConfig);
        this.reportConfig();
      }
    } catch (error: any) {
      this.sendLog(`下载WCF失败:${error.message}`, "ERROR");
      return false;
    }
  };

  //   解压文件
  public async unzipFile(filePath: string, dest = this.Wcf_directory) {
    try {
      this.sendLog("开始解压文件", "INFO");
      const zip = new AdmZip(filePath);
      return await new Promise((resolve, reject) => {
        try {
          // @ts-ignore
          zip.extractAllToAsync(dest, true, (err: any) => {
            console.log(err, 195);
            if (err) reject(err);
            else {
              this.sendLog("✅ 解压文件完成", "SUCCESS");
              fs.unlinkSync(filePath); // 删除压缩包
              resolve(true);
            }
          });
        } catch (err) {
          console.log(err, 205);
        }
      });
    } catch (error) {
      this.sendLog(`解压文件失败: ${error}`, "ERROR");
      fs.unlinkSync(filePath);
      return false;
    }
  }

  // 注入Dll
  public InjectWCF = async () => {
    if (process.platform !== "win32") {
      this.sendLog("当前系统不支持WCF注入", "ERROR");
      return;
    }
    // 判断是否存在sdk.dll
    const hasDll = this.checkWCF();
    if (!hasDll) {
      this.sendLog("WCF核心不存在，即将自动下载", "WARN");
      await this.downloadWCF();
    }

    // 判断是否在运行
    const result = await this.checkWCFIsRun();
    if (!result.wcf_run && result.portOcc) {
      this.sendLog(`当前端口已被占用:${this.wcfConfig.port}请修改系统设置端口，避免启动失败！`, "WARN");
      return false;
    }

    this.sendLog("开始注入WCF", "INFO");
    const dllPath = path.join(this.Wcf_directory, "sdk.dll");
    const sdkDLL = koffi.load(dllPath);
    // 注册Dll方法
    this.WxInitSDK = sdkDLL.func("int WxInitSDK(bool, int)", "stdcall");
    // 销毁Dll
    this.WxDestroySDK = sdkDLL.func("WxDestroySDK", "void", []);
    return true;
  };

  // 启动WCF
  public startWCF = async () => {
    try {
      const res = await this.InjectWCF();
      if (!res) return res;
      const result = this.WxInitSDK?.(this.wcfConfig.debug, this.wcfConfig.port);
      if (result !== 0) {
        this.sendLog(`WCF启动失败：${result}`, "ERROR");
        return;
      }
      this.sendLog(`✅WCF启动成功:Tcp://0.0.0.0:${this.wcfConfig.port}`, "SUCCESS");
      this.checkWCFIsRun();
      return true;
    } catch (error: any) {
      this.sendLog(`启动WCF失败:${error.message}`, "ERROR");
    }
  };

  // 更新WCFdLL
  public updateWCF = async () => {
    // 检测是否在运行
    const result = await this.checkWCFIsRun();
    if (result.wcf_run) {
      // 先关闭WCF
      this.WxDestroySDK?.();
      this.sendLog("WCF已关闭", "INFO");
    }
    // 开始更新
    await this.downloadWCF();
    // 开始启动
    await this.startWCF();
  };

  // 重启WCF
  public restartWCF = async () => {
    // 检测是否在运行
    const result = await this.checkWCFIsRun();
    if (result.wcf_run) {
      // 先关闭WCF
      await this.WxDestroySDK?.();
    }
    // 开始启动
    await this.startWCF();
  };

  // 关闭WCF
  public closeWCF = async () => {
    if (this.WxDestroySDK) {
      this.WxDestroySDK();
      this.sendLog("WCF已关闭", "INFO");
    } else {
      this.sendLog("WCF未运行", "INFO");
    }
    this.checkWCFIsRun();
    this.clearWcfLog();
  };

  // 修改WCF配置文件
  public modifyWCFConfig = async (_: Electron.IpcMainInvokeEvent, config: Partial<WCFConfig>) => {
    this.wcfConfig = { ...this.wcfConfig, ...config };
    this.writeConfig(this.wcfConfig);
    this.reportConfig();
  };

  // 获取配置文件
  public getWCFConfig = async () => {
    return this.wcfConfig;
  };
  //   检测WCF是否在运行
  public checkWCFIsRun = async () => {
    const params = {
      portOcc: PortIsRun(this.wcfConfig.port),
      wcf_run: PortIsRun(this.wcfConfig.port) && Boolean(this.WxInitSDK),
      http: this.server && PortIsRun(this.wcfConfig.httpPort) ? true : false,
    };
    this.windown.webContents.send("wcf:startEvent", params);
    await this.updateTrayMenu(params);
    return params;
  };
  // 重置WCF环境
  public resetWCF = async () => {
    this.sendLog("开始重置WCF环境", "INFO");
    await this.KillPort(this.wcfConfig.port);
    await this.KillPort(+this.wcfConfig.port + 1);
    this.checkWCFIsRun();
  };
  public KillPort = async (port: number) => {
    try {
      const pids = await this.getPidsByPort(port);
      // 过滤掉pid为0的进程
      const filteredPids = pids.filter((pid) => pid !== 0);
      if (filteredPids.length == 0) {
        this.sendLog(`当前端口:${port}没有被占用`, "INFO");
        return;
      }
      if (pids.length == 0) {
        this.sendLog(`当前端口:${port}没有被占用`, "INFO");
        return;
      }
      this.sendLog(`成功检测${port}端口对应的PID:${pids},即将终止相关PID进程`, "INFO");
      filteredPids.forEach((item) => {
        const result = this.killProcessByPid(item);
        this.sendLog(result.message, result.success ? "SUCCESS" : "ERROR");
      });
    } catch (error: any) {
      this.sendLog(`重置WCF环境失败:${error.message}`, "ERROR");
    }
  };

  // 开启http服务
  public startWcfServer = async () => {
    try {
      const fastify = Fastify({ trustProxy: true });
      fastify.get("/", async () => {
        return { code: 0, ...this.wcfConfig };
      });
      fastify.get("/start-wcf", async () => {
        const result = await this.startWCF();
        if (!result) {
          return { code: 1, message: "WCF启动失败,详情请看软件日志区域" };
        }
        return { code: 0, message: "WCF启动成功" };
      });
      fastify.get("/close-wcf", async () => {
        await this.closeWCF();
        return { code: 0, message: "WCF关闭成功" };
      });
      fastify.addHook("onSend", async (request, _, playLoad) => {
        this.sendLog(`HTTP LOG: Method: ${request.method}、Url: ${request.url}、ClientIp:${request.ip}、Response:${playLoad}`, "INFO");
      });

      await fastify.listen({ host: "0.0.0.0", port: this.wcfConfig.httpPort });
      this.sendLog(`✅ HTTP SERVER IS START:0.0.0.0:${this.wcfConfig.httpPort}`, "SUCCESS");
      this.server = fastify;
      this.checkWCFIsRun();
    } catch (err: any) {
      this.sendLog(err.message, "ERROR");
    }
  };
  // 关闭http服务
  public closeWcfServer = async () => {
    if (this.server) {
      await this.server.close();
      this.sendLog("Http Server Is Close", "INFO");
    }
    this.checkWCFIsRun();
  };

  // 注册定时任务
  public registerSchedule = (cronTime: string, callback: () => void) => {
    const job = cron.schedule(cronTime, callback);
    this.scheduleJobs.push(job);
    job.start();
  };
  // 清空定时任务
  public clearSchedule = () => {
    this.scheduleJobs.map((job) => {
      job.stop();
    });
    this.scheduleJobs.length = 0;
  };

  // 检测端口对应的pid
  public getPidsByPort = async (port: number) => {
    try {
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf-8" });
      const lines = output.split("\n").filter((line) => line.includes(`:${port}`));
      if (lines.length === 0) return [];

      const pids = lines.map((line) => {
        const pid = line.trim().split(/\s+/).pop();
        return Number(pid);
      });

      return pids;
    } catch {
      return [];
    }
  };
  public killProcessByPid = (pid: number) => {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
      return { success: true, message: `✅ 成功终止 PID ${pid} 的进程` };
    } catch (err: any) {
      return { success: false, message: `❌ 无法终止 PID ${pid}，可能不存在或已退出,请打开任务管理器核对` };
    }
  };

  // 唤醒微信
  public wakeUpWeChat = () => {
    try {
      if (process.platform === "win32") {
        execSync("start weixin://");
      } else if (process.platform === "darwin") {
        open("open weixin://");
      } else {
        this.sendLog("❌ 当前系统不支持微信协议唤醒", "ERROR");
        return;
      }
      console.log("✅ 微信客户端已唤醒");
    } catch (error) {
      this.sendLog(`❌ 无法唤醒微信:${(error as Error).message}`, "ERROR");
    }
  };
  public injectVersionDll = async (version: string, download_wechat: boolean = false) => {
    const app_downloadDir = app.getPath("downloads");
    // 先关闭WCF
    this.closeWCF();
    //检查指定版本是否存在
    this.sendLog(`开始检测指定版本:${version}是否存在`, "INFO");
    const url = `https://api.github.com/repos/lich0821/WeChatFerry/releases/tags/${version}`;
    const res = await axios.get(url, {
      validateStatus: (status) => status < 500,
    });
    const info = res.data;
    if (info.status == 404) {
      this.sendLog(`指定版本:${version}不存在`, "ERROR");
      return 404;
    }
    // 获取assets列表
    const assets = info.assets;
    const [sdkInfo, WechatInfo] = assets;
    const sdkUrl = sdkInfo.browser_download_url;
    this.sendLog(`✅ 获取指定版本:${version}下载地址成功:${sdkUrl}`, "SUCCESS");
    const filename = path.basename(sdkUrl);
    const sdkFilepath = path.join(this.Wcf_directory, filename);
    const sdkResponse = await this.downloadFile(sdkUrl, sdkFilepath);
    if (!sdkResponse) return sdkResponse;
    const unCompress = await this.unzipFile(sdkFilepath, this.Wcf_directory);
    if (unCompress) {
      this.wcfConfig.version = version || "";
      this.writeConfig(this.wcfConfig);
      this.reportConfig();
    }
    if (!unCompress) return unCompress;
    this.sendLog(`✅ 指定版本:${version}下载完成`, "SUCCESS");
    // 开始下载对应的wechat.exe
    if (download_wechat) {
      const wechatUrl = WechatInfo.browser_download_url;
      const wechatFilename = path.basename(wechatUrl);
      // 开始下载Wechat.exe
      this.sendLog(`开始下载指定版本:${version}对应的${WechatInfo.name}`, "INFO");
      const wechatFilepath = path.join(app_downloadDir, wechatFilename);
      const wechatResponse = await this.downloadFile(wechatUrl, wechatFilepath);
      if (!wechatResponse) return wechatResponse;
      this.sendLog(`✅ 指定版本:${version}对应的${WechatInfo.name}下载完成`, "SUCCESS");
      this.sendLog(`文件已保存:${wechatFilepath}`, "INFO");
      this.sendLog(`安装指定版本微信登录成功后 重新启动WCF即可`, "INFO");
    }
  };

  // 读取wcf日志
  public readWcfLog = () => {
    try {
      const exePath = app.getPath("exe");
      const installDir = path.dirname(exePath);
      const logsPath = app.isPackaged ? path.join(installDir, "logs/wcf.txt") : path.join(app.getAppPath(), "logs/wcf.txt");
      if (fs.existsSync(logsPath)) {
        const log = fs.readFileSync(logsPath, "utf-8").trim();
        const logs = splitLogsByEntry(log);
        const res = logs.reverse().map((line) => parseLog(line.trim()));
        console.log(res, 509);
        return res;
      } else {
        this.sendLog("WCF日志文件不存在", "ERROR");
        this.sendLog("请先启动WCF后再查看日志", "ERROR");
      }

      return [];
    } catch (error) {
      this.sendLog(`读取WCF日志失败:${(error as Error).message}`, "ERROR");
    }
  };

  //清空日志
  public clearWcfLog = () => {
    const logsPath = path.join(app.getAppPath(), "logs/wcf.txt");
    if (fs.existsSync(logsPath)) {
      fs.writeFileSync(logsPath, "");
    }
  };
  // 创建托盘图标
  public crateTray = async () => {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
    this.tray = new Tray(path.join(process.env.VITE_PUBLIC, "iconTemplate.png"));
    this.tray.setToolTip("WCF-TOOL");
    this.tray.on("double-click", () => {
      this.windown?.show();
    });
    this.tray.on("click", () => {
      this.windown?.show();
    });
  };

  // 更新系统托盘菜单
  public updateTrayMenu = async (runConfig: { portOcc: boolean; wcf_run: boolean; http: boolean }) => {
    if (this.tray) {
      const wcf_run = !runConfig.portOcc && runConfig.wcf_run;
      const wcf_meun = wcf_run
        ? [
            {
              label: "❌ 关闭WCF",
              click: () => {
                this.closeWCF();
              },
            },
            {
              label: "🔄 重启WCF",
              click: () => {
                this.restartWCF();
              },
            },
          ]
        : [
            {
              label: "🚀 启动WCF ",
              click: () => {
                this.closeWCF();
              },
            },
            {
              label: "♻️ 清理WCF环境",
              click: () => {
                this.resetWCF();
              },
            },
          ];
      const http_meun = runConfig.http
        ? [
            {
              label: "❌ 关闭HTTP",
              click: () => {
                this.closeWcfServer();
              },
            },
            {
              label: "🔄 重启HTTP",
              click: () => {
                this.closeWcfServer();
                this.startWcfServer();
              },
            },
          ]
        : [
            {
              label: "🚀 启动HTTP",
              click: () => {
                this.startWcfServer();
              },
            },
          ];
      const contextMenu = Menu.buildFromTemplate([
        {
          label: `🧱 WCF运行状态：${wcf_run ? "🟢" : "🔴"} 端口:${this.wcfConfig.port}`,
        },
        {
          label: `🧱 HTTP运行状态：${runConfig.http ? "🟢" : "🔴"} 端口:${this.wcfConfig.httpPort}`,
        },
        ...wcf_meun,
        ...http_meun,
        { type: "separator" },
        {
          label: "❎ 退出",
          click: () => {
            this.closeWcfServer(); // 关闭WCF核心
            this.clearSchedule(); // 清除定时任务
            this.closeWCF(); // 关闭WCF核心
            this.tray?.destroy();
            app.quit();
          },
        },
      ]);
      this.tray.setContextMenu(contextMenu);
    }
  };
}
