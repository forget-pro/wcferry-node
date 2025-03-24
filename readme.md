# WeChat Core SDK for Node.js ![npm version](https://img.shields.io/npm/v/@zippybee/wechatcore.svg)

# WCF-CLI ![npm version](https://img.shields.io/npm/v/@zippybee/wcf-cli.svg)

> 注意：

2.0.x 版本与 2.1.x 版本有较大改动 底层 socket nng 部分重写 两版本并不兼容 请注意函数方法名：建议所有开发者 升级到最新版本

## 使用步骤

### 安装依赖

```bash
npm i @zippybee/wechatcore
```

### 示例代码

详见 examples/ding-dong-bot.js

```javascript
const { Wcferry } = require('@zippybee/wechatcore');

const client = new Wcferry();
client.start();

const isLogin = client.isLogin();
const userinfo = client.getUserInfo();

console.log(isLogin, userinfo);

const off = client.listening((msg) => {
  console.log('收到消息:', msg.content);
});
```

### 运行

在 PC 上启动 WeChat 客户端并登录，运行`node ./examples/ding-dong-bot.js`

## Wcferry Option

| 参数名称                                                                      | 是否必填 | 默认值                                        | 类型     |
| :---------------------------------------------------------------------------- | -------- | --------------------------------------------- | -------- |
| host(service 地址 默认启动 wcf 127.0.0.1 可填远程 service 地址)               | `false`  | `''`                                          | `string` |
| port 端口                                                                     | `false`  | `10086`                                       | `number` |
| recvPyq (是否结束朋友圈消息)                                                  | `false`  | false                                         | `bool`   |
| service (启动模式为 service 模式，此模式仅做注入 dll 使用 其他业务需自行实现) | `false`  | false                                         | `bool`   |
| wcf_path (指定 wcf 工作目录 一般用于 docker 挂载目录使用)                     | `false`  | `path.join(__dirname, '../wcf-sdk/sdk.dll')`  | `string` |
| wechat_dir(微信文件管理目录)                                                  | `false`  | C:/Users/Administrator/Documents/WeChat Files | `string` |

> [!CAUTION]
>
> wechat_dir 路径规范按照 linux / 填写 无需按照 win \ 书写 （文件管理目录详见微信客户端）

## 支持与赞赏

如果本项目对您有所帮助，欢迎扫码赞赏支持！

<p align="center">
  <img src="./qrcode/qrcode.jpg" alt="赞赏码" width="200">
</p>

# Zippy-WCF Service 模式（远程调用可用）

## 说明

在 `service` 模式下，`Zippy-WCF` 仅注入 DLL，其他逻辑需要自行实现。

可通过 `tcp://0.0.0.0:10086` 进行远程调用。

**注意：** `service` 模式与本地模式互斥。

## 使用示例

### 1. 代码方式启动 `service` 模式

```javascript
const { Wcferry } = require('@zippybee/wechatcore');

const client = new Wcferry({ port: 10086, service: true }); // 开启 service 模式

client.start();

// 启动成功后，可通过远程调用 WCF 服务

// 示例代码
const { Wcferry } = require('@zippybee/wechatcore');

const client = new Wcferry({ port: 10086, host: '远程 service IP' });

client.start();

const isLogin = client.isLogin();
const userinfo = client.getUserInfo();

console.log(isLogin, userinfo);

const off = client.on((msg) => {
  console.log('收到消息:', msg.content);
});
```

### 2. CLI 方式启动 `service` 模式

```sh
npm i @zippybee/wcf-cli -g
```

#### 启动 `WCF` 服务

```sh
zippy-wcf start -p 10086   # 启动 WCF 服务，-p 运行端口
                         # -d WCF DLL 所在目录（可选）
                         # -w 微信客户端文件目录（可选）
                         # -f  前台运行 & http 控制
```

### 3. `-f` 参数（前台运行 & HTTP 控制）

`-f` 参数会保持程序在前台运行，并开启一个 HTTP 服务用于控制 WCF 状态。

当 `-f` 参数开启后，将新增以下 HTTP API：

| API           | 说明                                                |
| ------------- | --------------------------------------------------- |
| `/start`      | 开启 WCF 服务                                       |
| `/stop`       | 关闭 WCF 服务                                       |
| `/force-stop` | 强制关闭微信相关进程，遇到报错可使用此 API 强制重启 |
| `/restart`    | 重启 WCF 服务                                       |

#### API 返回值说明

| 返回值 | 说明         |
| ------ | ------------ |
| `-1`   | WCF 正在运行 |
| `0`    | WCF 未运行   |
| `1`    | 成功开启     |
| `2`    | 重启成功     |
| `3`    | 关闭成功     |

示例启动命令：

```sh
zippy-wcf start -p 10086 -f   # 运行 WCF 并启动 HTTP 控制服务
```

### 4. 停止 `WCF` 服务

```sh
zippy-wcf stop   # 关闭 WCF 服务
```

#### 新增 `-p` 参数（指定关闭端口）

```sh
zippy-wcf stop -p 10086   # 关闭指定端口的 WCF 服务（默认 10086）
```

#### 新增 `-r` 参数（关闭后自动重启微信客户端）

由于 CLI 本身无状态，该停止功能是直接干掉端口，可能导致微信进程退出。

`-r` 参数可用于关闭 WCF 服务后自动重启微信客户端。

```sh
zippy-wcf stop -p 10086 -r   # 关闭 WCF 并自动重启微信客户端
```

## 项目工程

1. **构建 Protobuf 文件**：自动拉取最新的 `.proto` 文件并进行编译。

   ```bash
   npm run build-proto
   ```

   **注意（Windows 用户）**：编译需要特定的环境设置。如果遇到 `3221225781` 错误代码，请安装 Visual Studio 2022 及必要的工具：

   ```bash
   choco install visualstudio2022-workload-vctools --package-parameters "--includeRecommended"
   ```

   请确保提前安装了 Chocolatey (`choco`)。

2. **获取 WCF SDK**：自动获取最新的微信框架 (WCF) SDK。

   ```bash
   npm run get-wcf
   ```

3. **构建项目**：编译项目。

   ```bash
   npm run build
   ```

## sdk 配套微信版本

| Wcferry-node                   | Wechat    |
| ------------------------------ | --------- |
| v1(此版本仅支持 host 远程连接) | 3.9.2.23  |
| <=2.0.15 && >=2.0.0            | 3.9.10.27 |
| >=2.0.16                       | 3.9.11.25 |

## API 说明文档

1. [构造函数](#构造函数)
2. [属性](#属性)
3. [方法](#方法)
   - [连接管理](#连接管理)
   - [用户与联系人管理](#用户与联系人管理)
   - [消息管理](#消息管理)
   - [数据库操作](#数据库操作)
   - [事件处理](#事件处理)
   - [文件操作](#文件操作)
   - [其他功能](#其他功能)
4. [类型定义](#类型定义)
5. [弃用方法](#弃用方法)

## 构造函数

### `constructor(options?: WcferryOptions)`

创建一个新的 `Wcferry` 实例。

#### 参数

- `options` _(可选)_: `WcferryOptions` 类型的配置选项。

#### 示例

```typescript
const wcferry = new Wcferry({
  port: 10086,
  host: '127.0.0.1',
  debug: true,
  sigint: false,
  // 其他选项...
});
```

---

## 属性

### `connected: boolean`

获取当前是否已连接到 WCF RPC 服务器。

- **类型**: `boolean`
- **访问权限**: 只读

### `msgReceiving: boolean`

获取当前是否正在接收消息。

- **类型**: `boolean`
- **访问权限**: 只读

---

## 方法

### 连接管理

#### `start(): void`

启动 `Wcferry` 实例，建立与 WCF RPC 服务器的连接。

#### `stop(): void`

停止 `Wcferry` 实例，关闭连接并释放资源。

---

### 用户与联系人管理

#### `isLogin(): boolean`

检查当前是否已登录。

- **返回值**: `boolean` - `true` 表示已登录，`false` 表示未登录。

#### `getSelfWxid(): string`

获取当前登录账号的 wxid。

- **返回值**: `string` - 登录账号的 wxid。

#### `getUserInfo(): UserInfo`

获取当前登录账号的个人信息。

- **返回值**: `UserInfo` - 用户信息对象。

#### `getContacts(): Contact[]`

获取完整的通讯录。

- **返回值**: `Contact[]` - 联系人数组。

#### `getContact(wxid: string): Contact | undefined`

通过 wxid 查询微信号昵称等信息。

- **参数**:
  - `wxid` _(必需)_: 要查询的微信号 wxid。
- **返回值**: `Contact | undefined` - 如果找到联系人，返回 `Contact` 对象；否则返回 `undefined`。

#### `getChatRooms(): Contact[]`

获取群聊列表。

- **返回值**: `Contact[]` - 群聊联系人数组。

#### `getFriends(): Contact[]`

获取好友列表。

- **返回值**: `Contact[]` - 好友联系人数组。

#### `getChatRoomMembers(roomid: string, times?: number): Promise<Record<string, string>>`

获取群成员列表。

- **参数**:
  - `roomid` _(必需)_: 群的 id。
  - `times` _(可选)_: 重试次数，默认值为 `5`。
- **返回值**: `Promise<Record<string, string>>` - 返回一个包含群成员 wxid 和昵称的对象。

#### `getAliasInChatRoom(wxid: string, roomid: string): string | undefined`

获取群成员的群名片。

- **参数**:
  - `wxid` _(必需)_: 成员的 wxid。
  - `roomid` _(必需)_: 群的 id。
- **返回值**: `string | undefined` - 如果找到，返回成员的群名片；否则返回 `undefined`。

#### `getNickName(...wxids: string[]): Array<string | undefined>`

通过 wxid 获取昵称。

- **参数**:
  - `wxids` _(必需)_: 一个或多个 wxid。
- **返回值**: `Array<string | undefined>` - 返回一个包含昵称的数组。

---

### 消息管理

#### `isLogin(): boolean`

检查当前是否已登录。

- **返回值**: `boolean` - `true` 表示已登录，`false` 表示未登录。

#### `getMsgTypes(): { code?: number; label?: string }[]`

获取消息类型列表。

- **返回值**: `Array<{ code?: number; label?: string }>` - 包含消息类型代码和标签的数组。

#### `refreshPyq(id: string): number`

刷新朋友圈。

- **参数**:
  - `id` _(必需)_: 开始 id，`0` 表示最新页（基于字符串的 uint64）。
- **返回值**: `number` - `1` 表示成功，其他表示失败。

#### `sendTxt(msg: string, receiver: string, aters?: string): number`

发送文本消息。

- **参数**:
  - `msg` _(必需)_: 要发送的消息内容，支持换行符 `\n`。如果 @ 人，需要在 `aters` 参数中指定。
  - `receiver` _(必需)_: 消息接收人，wxid 或 roomid。
  - `aters` _(可选)_: 要 @ 的 wxid，多个用逗号分隔；`notify@all` 表示 @所有人。
- **返回值**: `number` - `0` 表示成功，其他表示失败。

#### `sendImage(image: string | Buffer | { type: 'Buffer'; data: number[] } | FileSavableInterface, receiver: string): Promise<number>`

发送图片消息。

- **参数**:
  - `image` _(必需)_: 图片资源的位置，可以是本地路径、URL、Buffer、特定对象或 `FileSavableInterface` 实例。
  - `receiver` _(必需)_: 消息接收人，wxid 或 roomid。
- **返回值**: `Promise<number>` - `0` 表示成功，其他表示失败。

#### `sendFile(file: string | Buffer | { type: 'Buffer'; data: number[] } | FileSavableInterface, receiver: string): Promise<number>`

发送文件消息。

- **参数**:
  - `file` _(必需)_: 文件资源的位置，可以是本地路径、URL、Buffer、特定对象或 `FileSavableInterface` 实例。
  - `receiver` _(必需)_: 消息接收人，wxid 或 roomid。
- **返回值**: `Promise<number>` - `0` 表示成功，其他表示失败。

#### `sendRichText(desc: Omit<ReturnType<wcf.RichText['toObject']>, 'receiver'>, receiver: string): number`

发送富文本消息。

- **参数**:
  - `desc` _(必需)_: 富文本描述对象，不包含 `receiver` 属性。
  - `receiver` _(必需)_: 接收人，wxid 或 roomid。
- **返回值**: `number` - `0` 表示成功，其他表示失败。

#### `sendPat(roomid: string, wxid: string): number`

发送“拍一拍”消息。

- **参数**:
  - `roomid` _(必需)_: 群的 id。
  - `wxid` _(必需)_: 要拍的群成员的 wxid。
- **返回值**: `number` - `1` 表示成功，其他表示失败。

#### `revokeMsg(msgid: string): number`

撤回消息。

- **参数**:
  - `msgid` _(必需)_: 消息 id（基于字符串的 uint64）。
- **返回值**: `number` - `1` 表示成功，其他表示失败。

#### `forwardMsg(msgid: string, receiver: string): number`

转发消息。

- **参数**:
  - `msgid` _(必需)_: 消息 id（基于字符串的 uint64）。
  - `receiver` _(必需)_: 消息接收人，wxid 或 roomid。
- **返回值**: `number` - `1` 表示成功，其他表示失败。

---

### 数据库操作

#### `getDbNames(): string[]`

获取所有数据库名称。

- **返回值**: `string[]` - 数据库名称数组。

#### `getDbTables(db: string): DbTable[]`

获取指定数据库中的所有表。

- **参数**:
  - `db` _(必需)_: 数据库名称。
- **返回值**: `DbTable[]` - 表名称数组。

#### `dbSqlQuery(db: string, sql: string): Record<string, string | number | Buffer | undefined>[]`

执行 SQL 查询。

- **参数**:
  - `db` _(必需)_: 数据库名称。
  - `sql` _(必需)_: 要执行的 SQL 语句。
- **返回值**: `Record<string, string | number | Buffer | undefined>[]` - 查询结果数组。

---

### 事件处理

#### `listening(callback: (msg: Message) => void): () => void`

注册消息回调监听函数。当注册的监听函数数量大于 0 时，自动调用 `enableMsgReceiving`；否则自动调用 `disableMsgReceiving`。

- **参数**:
  - `callback` _(必需)_: 监听函数，接收一个 `Message` 对象。
- **返回值**: `() => void` - 一个函数，用于注销监听。

#### 示例

```typescript
const unsubscribe = wcferry.listening((msg) => {
  console.log('收到消息:', msg);
});

// 取消监听
unsubscribe();
```

---

### 文件操作

#### `downloadImage(msgid: string, dir: string, extra?: string, thumb?: string, times?: number): Promise<string>`

下载图片消息并保存为 MP3。

- **参数**:
  - `msgid` _(必需)_: 消息中的 id。
  - `dir` _(必需)_: 保存图片的目录（目录不存在会出错）。
  - `extra` _(可选)_: 消息中的 extra，如果为空，将自动通过 `msgid` 获取。
  - `thumb` _(可选)_: 消息中的 thumb。
  - `times` _(可选)_: 超时时间（秒），默认值为 `30`。
- **返回值**: `Promise<string>` - 成功返回存储路径；失败时抛出错误。

#### `getAudioMsg(msgid: string, dir: string, times?: number): Promise<string>`

获取语音消息并转成 MP3。

- **参数**:
  - `msgid` _(必需)_: 语音消息 id。
  - `dir` _(必需)_: MP3 保存目录（目录不存在会出错）。
  - `times` _(可选)_: 超时时间（秒），默认值为 `3`。
- **返回值**: `Promise<string>` - 成功返回存储路径；失败时抛出错误。

#### `getOCRResult(extra: string, times?: number): Promise<string>`

获取 OCR 结果。

- **参数**:
  - `extra` _(必需)_: 待识别的图片路径，消息里的 extra。
  - `times` _(可选)_: 重试次数，默认值为 `2`。
- **返回值**: `Promise<string>` - OCR 结果字符串。

---

### 其他功能

#### `acceptNewFriend(v3: string, v4: string, scene?: number): number`

通过好友申请。

- **参数**:
  - `v3` _(必需)_: 加密用户名（好友申请消息里 v3 开头的字符串）。
  - `v4` _(必需)_: Ticket（好友申请消息里 v4 开头的字符串）。
  - `scene` _(可选)_: 申请方式（好友申请消息里的 scene），默认为 `30`（扫码添加）。
- **返回值**: `number` - `1` 表示成功，其他表示失败。

#### `receiveTransfer(wxid: string, transferid: string, transactionid: string): number`

接收转账。

- **参数**:
  - `wxid` _(必需)_: 转账消息里的发送人 wxid。
  - `transferid` _(必需)_: 转账消息里的 transferid。
  - `transactionid` _(必需)_: 转账消息里的 transactionid。
- **返回值**: `number` - `1` 表示成功，其他表示失败。

#### `send_xml_message(content: string, wx_id: string): number | undefined`

发送 XML 数据。

- **参数**:
  - `content` _(必需)_: XML 文件路径或 XML 字符串。
  - `wx_id` _(必需)_: 接收人的 wxid。
- **返回值**: `number | undefined` - `1` 表示成功，其他表示失败，或在某些情况下返回 `undefined`。

---

## 类型定义

### `WcferryOptions`

配置 `Wcferry` 实例的选项。

```typescript
export interface WcferryOptions {
  port?: number;
  /** 如果 host 为空，程序将尝试加载 wcferry.exe 和 *.dll */
  host?: string;
  socketOptions?: SocketOptions;
  /** 用于保存临时文件的缓存目录，默认为 `os.tmpdir()/wcferry` */
  cacheDir?: string;
  /** 使用 `wcferry.on(...)` 监听消息时，是否接受朋友圈消息 */
  recvPyq?: boolean;
  /** service 模式 */
  service?: boolean;
  /** WCF SDK 的路径 */
  wcf_path?: string;
  /** debug 模式 */
  debug?: boolean;
  /** 是否监听 Ctrl+C 事件 */
  sigint?: boolean;
  /** 微信客户端文件管理目录 */
  wechat_dir?: string;
}
```

### `UserInfo`

用户信息类型，基于 `wcf.UserInfo` 的简化类型。

### `Contact`

联系人类型，基于 `wcf.RpcContact` 的简化类型。

### `DbTable`

数据库表类型，基于 `wcf.DbTable` 的简化类型。

---

## 弃用方法

以下方法已弃用，不建议继续使用：

- `sendXML`: 发送 XML 数据（不支持）。请使用当前目录下的 send_xml 示例代码发送 xml
- `sendEmotion`: 发送表情消息（不支持）。
- `downloadAttach`: 下载附件（图片、视频、文件）；建议使用 `downloadImage` 替代。
- `decryptImage`: 解密图片；建议使用 `downloadImage` 替代。

---

## 其他注意事项

1. **确保 WCF SDK 正在运行**

   `Wcferry` 类依赖于 WCF SDK 的运行。请确保在使用前，WCF SDK（例如 `wcferry.exe` 和相关的 `.dll` 文件）已正确启动并在指定的端口上监听。

2. **正确配置接收人 wxid 或 roomid**

   在发送消息时，确保使用正确的接收人 `wxid` 或 `roomid`，否则消息发送可能会失败。

3. **处理异步操作**

   许多方法为异步方法，使用时请确保正确处理 `Promise`，例如使用 `async/await`。

4. **调试模式**

   `WcferryOptions` 中的 `debug` 选项可以帮助在开发过程中获取更多日志信息，有助于调试。

5. **资源清理**

   无论操作是否成功，都应确保在完成后调用 `stop()` 方法以释放资源并关闭连接。

## 免责声明

本项目的代码仅供学习和研究用途。任何人不得将本项目或其代码用于违反法律或从事任何非法活动。

使用本项目中的代码或衍生代码所造成的任何后果，开发者不承担任何责任。请在遵守适用法律的前提下使用本项目。

## 致谢

本项目借鉴了 并复制相关代码 特别感谢 [stkevintan](https://github.com/stkevintan) 的付出

特别感谢 [查克大佬](https://github.com/lich0821) 的付出 提供核心 SDK 支持

[node-wcferry]: https://github.com/wechatferry/wechatferry
