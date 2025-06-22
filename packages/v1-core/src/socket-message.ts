
import { Socket, SocketOptions, MessageRecvDisposable } from "@zippybee/nng"
export class AutoReconnectReceiver {
    url: string;
    options: SocketOptions;
    isRunning: boolean;
    reconnectDelay: number;
    maxReconnectAttempts: number;
    reconnectAttempts: number;
    disposable: null | MessageRecvDisposable;
    messageHandler: null | ((bytes: Buffer) => void) = null;
    errorHandler: ((err: null | Error) => void) | null = null;
    constructor(url: string, options = {}) {
        this.url = url;
        this.options = options;
        this.disposable = null;
        this.isRunning = false;
        this.reconnectDelay = 3000; // 重连延迟
        this.maxReconnectAttempts = 5;
        this.reconnectAttempts = 0;
    }

    async start(messageHandler: (bytes: Buffer) => void, errorHandler: (err: null | Error,) => void) {
        this.messageHandler = messageHandler;
        this.errorHandler = errorHandler;
        this.isRunning = true;
        this.reconnectAttempts = 0;

        await this._connect();
    }

    async _connect() {
        if (!this.isRunning) return;

        try {
            // 测试连接
            const canConnect = Socket.testConnection(this.url, this.options);
            if (!canConnect) {
                throw new Error("Cannot connect to server");
            }
            this.disposable = Socket.recvMessage(
                this.url,
                (err, data) => {
                    if (err) {
                        console.error("接收错误:", err.message);
                        if (this.errorHandler) {
                            this.errorHandler(err);
                        }

                        if (err.message.includes("Connection lost")) {
                            this._handleConnectionLost();
                        }
                        return;
                    }

                    // 成功接收消息，重置重连计数
                    this.reconnectAttempts = 0;

                    if (this.messageHandler) {
                        this.messageHandler(data);
                    }
                },
                this.options,
            );
            this.reconnectAttempts = 0;
        } catch (error: any) {
            console.error("连接失败:", error.message);
            this._handleConnectionLost();
        }
    }
    _handleConnectionLost() {
        if (!this.isRunning) return;

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("达到最大重连次数，停止重连");
            this.stop();
            if (this.errorHandler) {
                this.errorHandler(new Error("Max reconnection attempts reached"));
            }
            return;
        }

        this.reconnectAttempts++;
        console.log(
            `连接丢失，${this.reconnectDelay}ms 后进行第 ${this.reconnectAttempts} 次重连...`
        );

        if (this.disposable) {
            try {
                this.disposable.dispose();
            } catch (e) {
                console.error("关闭连接时出错:", e);
            }
            this.disposable = null;
        }

        setTimeout(() => this._connect(), this.reconnectDelay);
    }

    stop() {
        this.isRunning = false;
        if (this.disposable) {
            try {
                this.disposable.dispose();
            } catch (error) {
                console.error("停止时出错:", error);
            }
            this.disposable = null;
        }
    }

    isActive() {
        return (
            this.isRunning &&
            this.disposable &&
            !this.disposable.isClosed() &&
            this.disposable.isConnectionAlive()
        );
    }
}