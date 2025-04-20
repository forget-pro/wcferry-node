import { execSync } from "child_process";

function findProcessOnPort(port: number): number[] | null {
  try {
    let command: string;
    if (process.platform === "win32") {
      command = `netstat -ano | findstr :${port}`;
    } else {
      command = `lsof -i :${port} | awk 'NR>1 {print $2}'`;
    }

    const result = execSync(command, { encoding: "utf8" }).trim();
    if (!result) return null;

    let pids: number[];

    if (process.platform === "win32") {
      // Windows: 解析 netstat 输出的 PID
      const pidRegex = /\s+(\d+)\s*$/; // 匹配行尾的 PID
      pids = result
        .split("\n")
        .map((line: string) => {
          const match = line.match(pidRegex);
          return match ? parseInt(match[1], 10) : NaN;
        })
        .filter((pid: number) => !isNaN(pid));
    } else {
      // macOS / Linux: 解析 lsof 输出
      pids = result
        .split("\n")
        .map((line: string) => parseInt(line.trim(), 10))
        .filter((pid: number) => !isNaN(pid));
    }

    return [...new Set(pids)]; // 去重
  } catch (error) {
    return null;
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
    if (process.platform === "win32") {
      execSync("start weixin://");
    } else if (process.platform === "darwin") {
      open("open weixin://");
    } else {
      console.error("❌ 当前系统不支持微信协议唤醒");
      return;
    }
    console.log("✅ 微信客户端已唤醒");
  } catch (error) {
    console.error("❌ 无法唤醒微信:", (error as Error).message);
  }
}

export function splitLogsByEntry(logText: string): string[] {
  const lines = logText.split("\n");
  const entries = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("[")) {
      if (current.length > 0) {
        entries.push(current.join("\n")); // 拼回 message
      }
      current = [line];
    } else {
      current.push(line); // 多行 message 的 continuation
    }
  }
  if (current.length > 0) {
    entries.push(current.join("\n"));
  }
  return entries;
}

export function parseLog(line: string) {
  const lines = line.split("\n");
  const firstLine = lines[0];
  const regex = /^\[(.*?)\] \[(.*?)\] \[(.*?)\] \[(.*?)\] (.*)$/;
  const match = firstLine.match(regex);
  if (!match) return null;

  return {
    time: match[1],
    level: match[2],
    app: match[3],
    line: match[4],
    message: [match[5], ...lines.slice(1)].join("\n").trim(), // 拼接后续 message 行
  };
}
