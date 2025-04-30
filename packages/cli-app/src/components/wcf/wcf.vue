<template>

  <div class="text-gray-800 p-4 mx-4 flex flex-col h-screen">
    <div class="text-xl font-bold flex items-center justify-between">
      <div class="flex items-center">
        <img src="https://up.shobee.cn/cdn-static/wcf-tool.png" class="w-12" alt="">
        <span>WCF工具控制台</span>
      </div>
      <div class="flex items-center" @click="openGithub">
        <div class="text-xs text-gray-600 cursor-pointer">
          <i class="fa-brands fa-github text-sm"></i>
          <span class="ml-1">项目地址</span>
        </div>
        <div class="text-xs text-gray-600 cursor-pointer ml-4">
          <i class="fa-solid fa-user-nurse"></i>
          <span class="ml-1">作者:Forget</span>
          <span class="ml-2">v{{ state.wcfConfig.app_version }}</span>
        </div>
      </div>

    </div>
    <div class="rounded-md bg-white mt-4 py-4 px-4">
      <button
        class="rounded-md cursor-pointer text-xs inline-flex items-center px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-offset-2 mr-4"
        :class="item.btn_background" v-for="(item, i) in buttonGrounp" :key="i" @click="handleOperation(item)">
        <i class="mr-2" :class="item.icon"></i>
        <span>{{ item.name }}</span>
      </button>
    </div>
    <div class="bg-white rounded-md mt-2 p-4 text-xs flex items-center flex-wrap gap-y-2">
      <div class="flex items-center">
        <div class="w-3 h-3 rounded-full mr-2" :class="{
          'animate-pulse': state.wcf_isRun,
          'bg-green-500': state.wcf_isRun,
          'bg-red-500': !state.wcf_isRun,
        }"></div>
        <span>WCF核心状态:</span>
        <span class="ml-2 text-xs font-semibold" :class="{
          'text-green-600': state.wcf_isRun,
          'text-red-500': !state.wcf_isRun,
        }">{{ state.wcf_isRun ? "运行中" : '未运行' }}</span>
      </div>
      <div class="flex items-center ml-2">
        <div class="w-3 h-3  rounded-full mr-2 " :class="{
          'animate-pulse': state.http_isRun,
          'bg-green-500': state.http_isRun,
          'bg-red-500': !state.http_isRun,
        }"></div>
        <span>HTTP状态:</span>
        <span class="ml-2 text-xs font-semibold" :class="{
          'text-green-600': state.http_isRun,
          'text-red-500': !state.http_isRun,
        }">{{ state.http_isRun ? '运行中' : '未运行' }}</span>
      </div>
      <div class="flex items-center ml-4">
        <div class="fas fa-network-wired text-gray-400 mr-2"></div>
        <span>WCF运行端口:</span>
        <span class="ml-2 text-xs text-gray-600">{{ state.wcfConfig.port }}</span>
      </div>
      <div class="flex items-center ml-4">
        <div class="fas fa-network-wired text-gray-400 mr-2"></div>
        <span>HTTP运行端口:</span>
        <span class="ml-2 text-xs text-gray-600">{{ state.wcfConfig.httpPort }}</span>
      </div>
      <div class="flex items-center ml-4">
        <div class="fas fa-memory text-gray-400 mr-2"></div>
        <span>内存占用:</span>
        <span class="ml-2 text-xs text-gray-600">{{ state.memory }}MB</span>
      </div>
      <div class="flex items-center ml-4">
        <div class="fas fa-code-branch text-gray-400 mr-2"></div>
        <span>SDK版本:</span>
        <span class="ml-2 text-xs text-gray-600">{{ state.wcfConfig.version }}</span>
      </div>
    </div>
    <div class="bg-white rounded-md mt-2 flex flex-col flex-1">
      <div class="flex items-center justify-between w-full border-b border-gray-200 py-4 px-4">
        <span class="text-sm font-medium">系统日志</span>
        <div>
          <button @click="readWcfLog"
            class="rounded-sm cursor-pointer text-xs inline-flex items-center px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 mr-2">
            <i class="fas fa-eraser mr-2"></i>
            加载WCF日志
          </button>
          <button @click="logs.length = 0"
            class="rounded-sm cursor-pointer text-xs inline-flex items-center px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200">
            <i class="fas fa-eraser mr-2"></i>
            清空日志
          </button>
        </div>

      </div>
      <div class="bg-gray-100 rounded-md m-4 p-4 text-xs overflow-auto flex-1">
        <virtualizer :data="logs" ref="virtualizerRef">
          <template #default="{ item, index }">
            <div :key="index" class="mb-1">
              <span class="text-gray-400 mr-2">[ {{ item.timestamp }} ]</span>
              <span :class="{
                'text-yellow-600': item.level === 'WARN',
                'text-gray-600': item.level === 'INFO',
                'text-red-500': item.level == 'ERROR',
                'text-green-500': item.level == 'SUCCESS',
              }">[ {{ item.level }} ]</span>
              <span class="text-12 ml-2 leading-5 break-all" :class="{
                'text-yellow-600': item.level === 'WARN',
                'text-gray-600': item.level === 'info',
                'text-red-500': item.level == 'ERROR',
                'text-green-500': item.level == 'SUCCESS',
              }">{{ item.message }}</span>
            </div>
          </template>
        </virtualizer>
      </div>
    </div>
    <n-drawer v-model:show="state.active" :width="502" close-on-esc placement="right">
      <n-drawer-content title="设置" closable>
        <div>
          <p class="font-semibold mb-2">WCF运行端口:</p>
          <div class="flex">
            <n-input-number placeholder="请输入运行端口号" v-model:value="state.formData.wcfPort" clearable class="flex-1 mr-4"
              :show-button="false" />
            <n-button @click="saveWcfPort" color="#374153" type="primary" :loading="state.wcfStarting" class="ml-4">
              <i class="fas fa-save mr-2"></i>
              保存
            </n-button>
          </div>
        </div>
        <div class="mt-4">
          <p class="font-semibold mb-2">HTTP运行端口:</p>
          <div class="flex">
            <n-input-number placeholder="请输入运行端口号" v-model:value="state.formData.httpProt" clearable class="flex-1 mr-4"
              :show-button="false" />
            <n-button color="#374153" type="primary" :loading="state.HttpServeStart" class="ml-4" @click="saveHttpPort">
              <i class="fas fa-save mr-2"></i>
              保存
            </n-button>
          </div>
        </div>
        <div class="mt-4">
          <p class="font-semibold mb-2"><i class="fas fa-brands fa-github text-lg"></i> GitHub代理地址:</p>
          <div class="flex">
            <n-input placeholder="请输入代理地址" type="text" v-model:value="state.formData.proxyUrl" clearable
              class="flex-1 mr-4" />
            <n-button color="#374153" type="primary" :loading="state.HttpServeStart" @click="saveProxyUrl" class="ml-4">
              <i class="fas fa-save mr-2"></i>
              保存
            </n-button>
          </div>
        </div>
        <div class="mt-4">
          <div class="font-semibold mb-2">
            <span class="mr-2">下载指定版本:</span>
            <n-checkbox v-model:checked="state.formData.download_wechat"> 同时下载对应版本微信 </n-checkbox>
          </div>
          <div class="flex">
            <n-input placeholder="请输入 Release Tag" type="text" v-model:value="state.formData.version" clearable
              class="flex-1 mr-4" />
            <n-button color="#374153" type="primary" :loading="state.HttpServeStart" @click="injectVersion"
              class="ml-4">
              <i class="fas fa-save mr-2"></i>
              下载
            </n-button>
          </div>
          <div class="text-xs text-gray-500 mt-2 flex items-center">
            <span>此处填写：WCF Release Tag 即可 例如：v39.4.5</span>

            <div class="text-xs text-blue-600 cursor-pointer ml-2" @click="openGithubRelease">
              <i class="fa-brands fa-github text-sm"></i>
              <span class="ml-1">Wechatferry</span>
            </div>
          </div>
        </div>
        <div class="mt-4">
          <p class="font-semibold mb-2">Debug模式:</p>
          <div class="flex">
            <n-checkbox v-model:checked="state.formData.debug" @update:checked="debugChange"> 启用Debug模式运行 </n-checkbox>
          </div>
        </div>
        <div class="mt-4">
          <p class="font-semibold mb-2">HTTP服务:</p>
          <div class="flex items-center">
            <n-checkbox :disabled="state.httpLoading" v-model:checked="state.formData.isHttp"
              @update:checked="HttpEvent">
              开启HTTP服务 </n-checkbox>
            <loading color="#bebebe" :show="state.httpLoading" :size="16"></loading>
          </div>
        </div>

      </n-drawer-content>
    </n-drawer>
    <n-drawer v-model:show="state.showWcflog" height="90vh" close-on-esc placement="bottom">
      <n-drawer-content title="WCF日志" closable>
        <div class="flex flex-col h-full relative">
          <div class="bg-gray-100 rounded-md m-4 p-4 text-xs  overflow-auto flex-1">
            <virtualizer :data="state.wcflogs" ref="virtualizerRef">
              <template #default="{ item, index }">
                <div :key="index" class="mb-1 select-text">
                  <!-- <span class="text-gray-400 mr-2">{{ item }}</span> -->
                  <span class="text-gray-400 mr-2">[ {{ item.time }} ]</span>
                  <span :class="{
                    'text-yellow-600': item.level === 'warning',
                    'text-gray-600': item.level === 'info',
                    'text-red-500': item.level == 'error',
                  }">[ {{ item.level }} ]</span>
                  <span class="text-12 ml-2 leading-5 break-all" :class="{
                    'text-yellow-600': item.level === 'warning',
                    'text-gray-600': item.level === 'info',
                    'text-red-500': item.level == 'error',
                  }">[ {{ item.app }} ]</span>
                  <span class="text-12 ml-2 leading-5 break-all" :class="{
                    'text-yellow-600': item.level === 'warning',
                    'text-gray-600': item.level === 'info',
                    'text-red-500': item.level == 'error',
                  }">{{ item.line }}</span>
                  <span class="text-12 ml-2 leading-5 break-all" :class="{
                    'text-yellow-600': item.level === 'warning',
                    'text-gray-600': item.level === 'info',
                    'text-red-500': item.level == 'error',
                  }">{{ item.message }}</span>
                </div>
              </template>

            </virtualizer>

          </div>
          <transition name="fade" mode="out-in">
            <div v-if="state.readying"
              class=" absolute top-0 bottom-0 right-0 left-0 bg-black opacity-50 flex items-center justify-center">
              <div class="text-center text-white">
                <loading :size="24" show></loading>
                <p class="mt-2">读取中...</p>
              </div>
            </div>
          </transition>

        </div>
      </n-drawer-content>
    </n-drawer>

  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useDialog } from 'naive-ui';
import { buttonGrounp, ButtonGroupItem } from './config';
import { Log } from './log';
import { useHook } from './hook';
import loading from '../loading/loading.vue';
import virtualizer from './virtualizer.vue';

const log = new Log();


const dialog = useDialog()

const { state, logs, readWcfLog, registerEvent, injectVersion, saveProxyUrl, debugChange, updateWcf, saveHttpPort, message, unshift, saveWcfPort, appStartCheck, startWcfHttpServer } = useHook(log);



const handleOperation = async (value: ButtonGroupItem) => {
  const operation = {
    start: async () => {
      try {
        if (state.wcfStarting) {
          unshift(log.warn('WCF正在启动中,请勿重复操作',));
          return message.info('WCF正在启动中,请勿重复操作')
        }
        state.wcfStarting = true
        await window.ipcRenderer.invoke('wcf:startWCF');
      } catch (e: any) {
        unshift(log.error(`WCF启动失败:${e.message}`));
      } finally {
        state.wcfStarting = false
      }

    },
    update: () => updateWcf(),
    restart: async () => {
      try {
        state.wcfStarting = true
        unshift(log.info('WCF即将重新启动'));
        await window.ipcRenderer.invoke('wcf:restartWcf');
      } finally {
        state.wcfStarting = false
      }

    },
    close: async () => {
      unshift(log.info('WCF即将停止服务...'));
      await window.ipcRenderer.invoke('wcf:closeWcf');
    },
    reset: () => {
      dialog.warning({
        title: '重置WCF',
        content: '重置WCF会直接KILL掉WCF端口，由于端口Hook了微信进程，会导致微信退出进程，重新唤醒微信，是否继续？',
        positiveText: '确定',
        negativeText: '取消',
        draggable: true,
        onPositiveClick: async () => {
          unshift(log.info('WCF即将重置服务...'));
          await window.ipcRenderer.invoke('wcf:resetWcf');
          unshift(log.warn('程序重置完成,请尝试重新启动WCF，如果无法启动请尝试重启程序，请打开任务管理器查看是否有WCF进程未关闭'));
        },
      })

    },
    setting: () => {
      state.formData = {
        wcfPort: state.wcfConfig.port || 0,
        httpProt: state.wcfConfig.httpPort || 0,
        proxyUrl: state.wcfConfig.proxy_url || '',
        debug: state.wcfConfig.debug || false,
        isHttp: state.http_isRun || false,
        version: state.wcfConfig.version || '',
        download_wechat: false,
      }
      state.active = true;

    },
    checkUpdate: async () => {
      unshift(log.warn('资源托管在GitHub请注意网络环境'));
      try {
        const res = await window.ipcRenderer.invoke('app:update');
        const resultMap = new Map([
          [0, '当前版本已是最新版本'],
          [1, '当前版本有更新,即将更新到最新版本'],
          [2, '当前正在更新中，请勿重复操作'],
          [3, '新版本正在下载中，请勿重复操作']])
        const result = resultMap.get(res)
        result && unshift(log.success(result));
      } catch (e: any) {
        unshift(log.error(`检查更新失败:${e.message}`));
      }
    }
  };
  // @ts-ignore
  if (!['close', 'setting', 'restart', 'checkUpdate', 'reset'].includes(value.key)) {
    if (state.wcfStarting) {
      unshift(log.warn('WCF正在启动中,请勿重复操作',));
      return message.info('WCF正在启动中,请勿重复操作')
    }
  }
  // @ts-ignore
  operation[value.key]?.();
};

const HttpEvent = async (checked: boolean) => {
  startWcfHttpServer(checked)
};

const openGithub = () => {
  window.ipcRenderer.invoke('open:url', 'https://github.com/dr-forget/wcferry-node')
}

const openGithubRelease = () => {
  window.ipcRenderer.invoke('open:url', 'https://github.com/lich0821/WeChatFerry/releases')

}

onMounted(async () => {

  registerEvent();
  appStartCheck();
});
</script>

<style lang="scss" scoped></style>
