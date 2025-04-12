import dayjs from 'dayjs';
import { reactive } from 'vue';
export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}
export class Log {
  public info(message: string): LogEntry {
    return {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
      level: 'INFO',
      message,
    };
  }
  public error(message: string): LogEntry {
    return {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
      level: 'ERROR',
      message,
    };
  }
  public warn(message: string): LogEntry {
    return {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
      level: 'WARN',
      message,
    };
  }
  public success(message: string): LogEntry {
    return {
      timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss.SSS'),
      level: 'SUCCESS',
      message,
    };
  }
}

export function useLog(maxlimit: number = 1000) {
  const logs: LogEntry[] = reactive([]);
  const push = (log: LogEntry) => {
    logs.push(log);
    if (logs.length > maxlimit) {
      logs.shift();
    }
  };
  const unshift = (log: LogEntry) => {
    logs.unshift(log);
    if (logs.length > maxlimit) {
      logs.pop();
    }
  };
  return {
    logs,
    push,
    unshift,
  };
}
