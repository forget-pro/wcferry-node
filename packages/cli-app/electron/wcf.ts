import { app, BrowserWindow } from 'electron';
import { createRequire } from 'node:module';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dayjs from 'dayjs';
import AdmZip from 'adm-zip';
import { PortIsRun } from './tool';
const require = createRequire(import.meta.url);
const koffi = require('koffi');
// @ts-ignore
import cron = require('node-cron');
interface WCFConfig {
  port: number;
  debug: boolean;
  proxy_url: string;
  version: string;
  httpPort: number;
  cronCheck: number;
}
export class WCF {
  private Wcf_directory: string;
  private wcfconfigPath: string;
  private wcfConfig: WCFConfig;
  private windown: BrowserWindow;
  private server: FastifyInstance | null;
  private WxInitSDK: Function | null;
  private WxDestroySDK: Function | null;
  private scheduleJobs: cron.ScheduledTask[];
  constructor(win: BrowserWindow) {
    this.windown = win;
    this.server = null;
    this.Wcf_directory = path.join(app.getPath('documents'), 'WCFApp');
    this.wcfconfigPath = path.join(this.Wcf_directory, 'config.json');
    this.WxInitSDK = null;
    this.WxDestroySDK = null;
    // 判断文件夹是否存在
    if (!fs.existsSync(this.Wcf_directory)) {
      fs.mkdirSync(this.Wcf_directory, { recursive: true });
    }
    const initConfig: WCFConfig = {
      port: 10086,
      debug: false,
      proxy_url: '',
      version: '',
      httpPort: 9200,
      cronCheck: 12,
    };
    if (fs.existsSync(this.wcfconfigPath)) {
      const config = JSON.parse(fs.readFileSync(this.wcfconfigPath, 'utf-8'));
      this.wcfConfig = { ...initConfig, ...config };
    } else {
      this.wcfConfig = initConfig;
    }
    this.writeConfig(this.wcfConfig);
    this.scheduleJobs = [];
  }

  //   上报配置文件
  public reportConfig = () => {
    this.windown.webContents.send('wcf:config', this.wcfConfig);
  };

  //   写入配置文件
  public writeConfig = (config: WCFConfig) => {
    this.wcfConfig = config;
    fs.writeFileSync(this.wcfconfigPath, JSON.stringify(config, null, 4));
  };

  //   发送日志
  public sendLog = (message: string, level: 'INFO' | 'ERROR' | 'WARN' | 'SUCCESS') => {
    this.windown.webContents.send('wcf:log', { message, level: level || 'INFO', timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS ') });
  };

  //   检测WCF是否有更新
  public checkUpdate = async () => {
    const config_path = path.join(this.Wcf_directory, 'config.json');
    if (fs.existsSync(config_path)) {
      const config = JSON.parse(fs.readFileSync(config_path, 'utf-8'));
      const version = config.version.replace('v', '').split('.').join('') || '0';
      const result = await this.getWCFVersion();
      const remove_version = result?.version.replace('v', '').split('.').join('') || '0';
      if (Number(version) < Number(remove_version)) {
        return { status: true, version: result?.version || '' };
      }
    }
    return { staus: false, version: this.wcfConfig.version };
  };

  //   检测WCF是否存在
  public checkWCF = (): boolean => {
    const wcf_path = path.join(this.Wcf_directory, 'sdk.dll');
    if (fs.existsSync(wcf_path)) {
      return true;
    } else {
      return false;
    }
  };

  // 获取WCF版本信息
  public getWCFVersion = async () => {
    const github_apiUrl = 'https://api.github.com/repos/lich0821/WeChatFerry/releases/latest';
    try {
      const response = await axios.get(github_apiUrl, {
        responseType: 'json',
        validateStatus: (status) => status < 500,
      });
      if (!response || !response.data || !response.data.assets || response.data.assets.length === 0) {
        this.sendLog('Failed to retrieve valid data from GitHub API.', 'ERROR');
        if (response.data.message) {
          this.sendLog(response.data.message, 'ERROR');
        }
        return { version: '', download_url: '' };
      }
      return {
        version: response.data.tag_name,
        download_url: response.data.assets[0].browser_download_url,
      };
    } catch (err: any) {
      this.sendLog(`获取WCF版本信息失败:${err?.message}`, 'ERROR');
      return null;
    }
  };

  //   下载最新版的WCF
  public downloadWCF = async () => {
    this.sendLog('开始下载最新版本的WCF', 'INFO');
    let output: string = '';
    try {
      const result = await this.getWCFVersion();
      this.sendLog(`获取WCF最新版本信息成功:${result?.version}`, 'SUCCESS');
      this.wcfConfig.version = result?.version || '';
      //   获取下载URL
      const proxyurl = this.wcfConfig.proxy_url ? this.wcfConfig.proxy_url + '/' : '';
      const repoUrl = proxyurl + result?.download_url || '';
      this.sendLog(`获取WCF最新版本下载地址成功:${repoUrl}`, 'SUCCESS');
      const filename = path.basename(repoUrl);
      output = path.join(this.Wcf_directory, filename);
      if (fs.existsSync(output)) {
        console.log('文件存在 跳过下载');
        return await this.unzipFile(output);
      }

      const writer = fs.createWriteStream(output);

      const download = await axios({
        method: 'get',
        url: repoUrl,
        responseType: 'stream',
      });
      console.log(download, 154);

      download.data.pipe(writer);
      return await new Promise((resolve, reject) => {
        writer.on('finish', async () => {
          this.sendLog('WCF下载完成', 'SUCCESS');
          this.writeConfig(this.wcfConfig);
          const res = await this.unzipFile(output);
          resolve(res);
        });
        writer.on('error', reject);
      });
    } catch (error: any) {
      this.sendLog(`下载WCF失败:${error.message}`, 'ERROR');
      fs.unlinkSync(output); // 删除下载的文件
      return false;
    }
  };

  //   解压文件
  public async unzipFile(filePath: string, dest = this.Wcf_directory) {
    try {
      this.sendLog('开始解压文件', 'INFO');
      const zip = new AdmZip(filePath);
      return await new Promise((resolve, reject) => {
        // @ts-ignore
        zip.extractAllToAsync(dest, true, (err: any) => {
          if (err) reject(err);
          else {
            this.sendLog('解压文件完成', 'SUCCESS');
            fs.unlinkSync(filePath); // 删除压缩包
            resolve(true);
          }
        });
      });
    } catch (error) {
      this.sendLog(`解压文件失败: ${error}`, 'ERROR');
      fs.unlinkSync(filePath);
      return false;
    }
  }

  // 注入Dll
  public InjectWCF = async () => {
    if (process.platform !== 'win32') {
      this.sendLog('当前系统不支持WCF注入', 'ERROR');
      return;
    }
    // 判断是否存在sdk.dll
    const hasDll = this.checkWCF();
    if (!hasDll) {
      this.sendLog('WCF核心不存在，即将自动下载', 'WARN');
      await this.downloadWCF();
    }

    // 判断是否在运行
    const result = await this.checkWCFIsRun();
    if (!result.wcf_run && result.portOcc) {
      this.sendLog(`当前端口已被占用:${this.wcfConfig.port}请修改系统设置端口，避免启动失败！`, 'WARN');
      return false;
    }

    this.sendLog('开始注入WCF', 'INFO');
    const dllPath = path.join(this.Wcf_directory, 'sdk.dll');
    const sdkDLL = koffi.load(dllPath);
    // 注册Dll方法
    this.WxInitSDK = sdkDLL.func('WxInitSDK', 'bool', ['bool', 'int']);
    // 销毁Dll
    this.WxDestroySDK = sdkDLL.func('WxDestroySDK', 'void', []);
    return true;
  };

  // 启动WCF
  public startWCF = async () => {
    try {
      const res = await this.InjectWCF();
      if (!res) return res;
      const result = this.WxInitSDK?.(this.wcfConfig.debug, this.wcfConfig.port);
      if (result !== 0) {
        this.sendLog(`WCF启动失败：${result}`, 'ERROR');
        return;
      }
      this.sendLog('WCF启动成功', 'SUCCESS');
      this.checkWCFIsRun();
      return true;
    } catch (error: any) {
      this.sendLog(`启动WCF失败:${error.message}`, 'ERROR');
    }
  };

  // 更新WCFdLL
  public updateWCF = async () => {
    // 检测是否在运行
    const result = await this.checkWCFIsRun();
    if (result.wcf_run) {
      // 先关闭WCF
      this.WxDestroySDK?.();
      this.sendLog('WCF已关闭', 'INFO');
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
      this.WxDestroySDK?.();
      this.sendLog('WCF已关闭', 'INFO');
    }
    // 开始启动
    await this.startWCF();
  };

  // 关闭WCF
  public closeWCF = async () => {
    if (this.WxDestroySDK) {
      this.WxDestroySDK();
      this.sendLog('WCF已关闭', 'INFO');
    } else {
      this.sendLog('WCF未运行', 'INFO');
    }
    this.checkWCFIsRun();
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
      wcf_run: PortIsRun(this.wcfConfig.port) && this.WxInitSDK,
      http: this.server && PortIsRun(this.wcfConfig.httpPort) ? true : false,
    };
    this.windown.webContents.send('wcf:startEvent', params);
    return params;
  };

  // 开启http服务
  public startWcfServer = async () => {
    try {
      const fastify = Fastify({ trustProxy: true });
      fastify.get('/', async () => {
        return { code: 0, ...this.wcfConfig };
      });
      fastify.get('/start-wcf', async () => {
        const result = await this.startWCF();
        if (!result) {
          return { code: 1, message: 'WCF启动失败,详情请看软件日志区域' };
        }
        return { code: 0, message: 'WCF启动成功' };
      });
      fastify.get('/close-wcf', async () => {
        await this.closeWCF();
        return { code: 0, message: 'WCF关闭成功' };
      });
      fastify.addHook('onSend', async (request, _, playLoad) => {
        this.sendLog(`HTTP LOG: Method: ${request.method}、Url: ${request.url}、ClientIp:${request.ip}、Response:${playLoad}`, 'INFO');
      });

      await fastify.listen({ host: '0.0.0.0', port: this.wcfConfig.httpPort });
      this.sendLog(`HTTP SERVER IS START:0.0.0.0:${this.wcfConfig.httpPort}`, 'SUCCESS');
      this.server = fastify;
      this.checkWCFIsRun();
    } catch (err: any) {
      this.sendLog(err.message, 'ERROR');
    }
  };
  // 关闭http服务
  public closeWcfServer = async () => {
    if (this.server) {
      await this.server.close();
      this.sendLog('Htt Server Is Close', 'INFO');
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
}
