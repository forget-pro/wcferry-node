import { Log, useLog } from "./log";
import { useNotification, NButton, useMessage } from "naive-ui";
import { reactive, h } from "vue";
import dayjs from "dayjs";
interface WCFConfig {
  port: number;
  debug: boolean;
  proxy_url: string;
  version: string;
  httpPort: number;
  cronUpdate: number;
  app_version: string;
}
interface Istate {
  memory: string;
  wcfConfig: Partial<WCFConfig>;
  active: boolean;
  httpLoading: boolean;
  wcf_isRun: boolean;
  http_isRun: boolean;
  wcfStarting: boolean;
  HttpServeStart: boolean;
  formData: {
    wcfPort: number;
    httpProt: number;
    debug: boolean;
    isHttp: boolean;
    proxyUrl: string;
    version: string;
    download_wechat: boolean;
  };
}

export function useHook(log: Log) {
  const notification = useNotification();
  const message = useMessage();
  const { logs, push, unshift } = useLog();
  const state = reactive<Istate>({
    memory: "",
    wcfConfig: {},
    active: false,
    httpLoading: false,
    wcf_isRun: false,
    http_isRun: false,
    formData: {
      wcfPort: 0,
      httpProt: 0,
      debug: false,
      isHttp: false,
      proxyUrl: "",
      version: "",
      download_wechat: false,
    },
    HttpServeStart: false,
    wcfStarting: false,
  });

  //   注册监听事件
  const registerEvent = () => {
    window.ipcRenderer.on("wcf:log", (_, data) => {
      unshift(data);
    });
    window.ipcRenderer.on("memory-usage", (_, data) => {
      state.memory = data;
    });
    window.ipcRenderer.on("wcf:config", (_, data) => {
      console.log(data, 66);
      state.wcfConfig = data;
    });
    window.ipcRenderer.on("wcf:startEvent", (_, data) => {
      state.wcf_isRun = data.wcf_run;
      state.http_isRun = data.http;
    });
    window.ipcRenderer.on("wcf:checkUpdateNotiy", (_, data) => {
      if (data.status) {
        checkUpdate(true, data);
      }
    });
    window.ipcRenderer.on("unhandledRejection", (_, data) => {
      unshift(log.error(`发生错误:${data}`));
    });
  };

  // WCF检测更新
  const checkUpdate = async (showModal: boolean = false, data?: any) => {
    const result = data ? data : await window.ipcRenderer.invoke("wcf:checkUpdate");
    if (result.status) {
      !data && unshift(log.success(`检测到WCF有新版本可用:${result.version}`));
      if (!showModal) return true;
      const n = notification.create({
        title: "WCF更新通知",
        content: `WCF核心有新版本可用:${result.version},是否立即更新?`,
        meta: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        duration: 5 * 1000,
        action: () =>
          h(
            NButton,
            {
              text: true,
              type: "primary",
              onClick: () => {
                n.destroy();
                updateWcf(true);
              },
            },
            {
              default: () => "立即更新",
            },
          ),
        onClose: () => {},
      });
      return true;
    }
    return false;
  };

  // WCF 启动Http服务
  const startWcfHttpServer = async (start: boolean) => {
    try {
      state.httpLoading = true;
      start && unshift(log.info("正在准备启动HTTP服务..."));
      if (start) {
        await window.ipcRenderer.invoke("wcf:startWcfHttpServer");
      } else {
        await window.ipcRenderer.invoke("wcf:closeWcfHttpServer");
      }
    } finally {
      state.httpLoading = false;
    }
  };

  //   启动检查
  const appStartCheck = async () => {
    // 检测WCF是否存在
    const result = await window.ipcRenderer.invoke("wcf:checkWCF");
    if (!result) {
      unshift(log.warn("WCF核心不存在即将自动下载"));
      const res = await window.ipcRenderer.invoke("wcf:downloadWCF");
      if (res) {
        unshift(log.info("WCF已准备就绪"));
        // startWcfHttpServer(true);
      }
    } else {
      const res = await window.ipcRenderer.invoke("wcf:chekWcfIsRun");
      state.wcf_isRun = res.wcf;
      state.http_isRun = res.http;
      if (!res.wcf) {
        unshift(log.info("WCF已准备就绪"));
      } else {
        unshift(log.info(`当前端口已被占用:${state.wcfConfig.port}`));
      }
      checkUpdate(true);
      !res.http && startWcfHttpServer(true);
    }
  };

  const saveWcfPort = async () => {
    if (!state.formData.wcfPort) {
      message.error("端口不能为空");
      return;
    }
    if (state.formData.wcfPort == state.wcfConfig.port) return;
    await window.ipcRenderer.invoke("wcf:updateConfig", {
      port: state.formData.wcfPort,
    });
    unshift(log.success(`✅ WCF端口已修改为:${state.formData.wcfPort}`));
    unshift(log.info("WCF即将开始重启...."));
    await window.ipcRenderer.invoke("wcf:restartWcf");
  };

  const saveHttpPort = async () => {
    if (!state.formData.httpProt) {
      message.error("端口不能为空");
      return;
    }
    if (state.formData.httpProt == state.wcfConfig.httpPort) return;
    await window.ipcRenderer.invoke("wcf:updateConfig", {
      httpPort: state.formData.httpProt,
    });
    unshift(log.success(`✅ HTTP端口已修改为:${state.formData.httpProt}`));
    unshift(log.info("HTTP即将开始重启...."));
    await window.ipcRenderer.invoke("wcf:closeWcfHttpServer");
    await window.ipcRenderer.invoke("wcf:startWcfHttpServer");
  };

  const saveProxyUrl = async () => {
    if (state.formData.proxyUrl == state.wcfConfig.proxy_url) return;
    await window.ipcRenderer.invoke("wcf:updateConfig", {
      proxy_url: state.formData.proxyUrl,
    });
    unshift(log.success(`✅ 代理地址已修改为:${state.formData.proxyUrl}`));
  };

  const debugChange = async (checked: boolean) => {
    if (state.formData.debug == state.wcfConfig.debug) return;
    await window.ipcRenderer.invoke("wcf:updateConfig", {
      debug: checked,
    });
    unshift(log.success(`✅WCF调试模式已修改为:${checked},下次启动生效`));
  };

  const updateWcf = async (froce: boolean = false) => {
    if (!froce) {
      unshift(log.info("正在检查更新..."));
      const result = await checkUpdate();
      if (!result) return unshift(log.info("当前版本已是最新版本"));
    }

    if (state.wcf_isRun) {
      unshift(log.info("WCF正在运行中,即将停止服务,更新完成后自动启动...."));
      await window.ipcRenderer.invoke("wcf:stopWCF");
    }
    // 开始更新
    const res = await window.ipcRenderer.invoke("wcf:downloadWCF");
    if (!res) return;
    // 开始启动
    unshift(log.success("WCF更新完成,正在启动..."));
    await window.ipcRenderer.invoke("wcf:startWCF");
  };

  const injectVersion = async () => {
    // 注入指定版本
    if (!state.formData.version) return message.error("版本号不能为空");
    if (state.wcfConfig.version == state.formData.version) return message.error("与当前版本相同 无需注入");
    const res = await window.ipcRenderer.invoke("wcf:injectVersionWcf", {
      version: state.formData.version,
      download_wechat: state.formData.download_wechat,
    });
    if (res == 404) {
      message.error("版本号不存在");
      return;
    }
  };

  return {
    state,
    registerEvent,
    checkUpdate,
    updateWcf,
    debugChange,
    saveProxyUrl,
    saveHttpPort,
    logs,
    message,
    push,
    unshift,
    appStartCheck,
    startWcfHttpServer,
    saveWcfPort,
    injectVersion,
  };
}
