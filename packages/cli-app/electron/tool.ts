import { execSync } from 'child_process';

function findProcessOnPort(port: number): number[] | null {
  try {
    let command: string;
    if (process.platform === 'win32') {
      command = `netstat -ano | findstr :${port}`;
    } else {
      command = `lsof -i :${port} | awk 'NR>1 {print $2}'`;
    }

    const result = execSync(command, { encoding: 'utf8' }).trim();
    if (!result) return null;

    let pids: number[];

    if (process.platform === 'win32') {
      // Windows: 解析 netstat 输出的 PID
      const pidRegex = /\s+(\d+)\s*$/; // 匹配行尾的 PID
      pids = result
        .split('\n')
        .map((line: string) => {
          const match = line.match(pidRegex);
          return match ? parseInt(match[1], 10) : NaN;
        })
        .filter((pid: number) => !isNaN(pid));
    } else {
      // macOS / Linux: 解析 lsof 输出
      pids = result
        .split('\n')
        .map((line: string) => parseInt(line.trim(), 10))
        .filter((pid: number) => !isNaN(pid));
    }

    return [...new Set(pids)]; // 去重
  } catch (error) {
    return null;
  }
}

function killProcess(pid: number) {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /F`);
    } else {
      process.kill(pid, 'SIGKILL');
    }
    console.log(`✅ WCF 进程 ${pid} 已被终止`);
  } catch (error: any) {
    console.error(`❌ 无法终止进程 ${pid}:`, error.message);
  }
}

export function PortIsRun(port: number) {
  const pids = findProcessOnPort(port);
  if (pids && pids.length > 0) {
    return true;
  } else {
    return false;
  }
}

export function openWeChat() {
  try {
    if (process.platform === 'win32') {
      execSync('start weixin://');
    } else if (process.platform === 'darwin') {
      open('open weixin://');
    } else {
      console.error('❌ 当前系统不支持微信协议唤醒');
      return;
    }
    console.log('✅ 微信客户端已唤醒');
  } catch (error) {
    console.error('❌ 无法唤醒微信:', (error as Error).message);
  }
}

export const KillPort = (port: number) => {
  const pids = findProcessOnPort(port);
  if (pids && pids.length > 0) {
    pids.forEach((pid: any) => killProcess(pid));
  } else {
    console.log(`✅ 端口 ${port} 未被占用`);
  }
};
