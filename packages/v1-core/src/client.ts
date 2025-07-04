import { Socket, SocketOptions, lz4Compress } from '@zippybee/nng';
import { AutoReconnectReceiver } from "./socket-message"
import { wcf } from './proto/wcf';
import { EventEmitter } from 'events';
import { createTmpDir, ensureDirSync, sleep, uint8Array2str, type ToPlainType } from './utils';
import { FileRef, FileSavableInterface } from './file-ref';
import { Message } from './message';
import * as rd from './proto/roomdata';
import * as eb from './proto/extrabyte';
import debug from 'debug';
import path from 'path';
import fs from 'fs';
import os from 'os';
export type UserInfo = ToPlainType<wcf.UserInfo>;
export type Contact = ToPlainType<wcf.RpcContact>;
export type DbTable = ToPlainType<wcf.DbTable>;

export interface WcferryOptions {
  port?: number;
  /** if host is empty, the program will try to load wcferry.exe and *.dll */
  host?: string;
  socketOptions?: SocketOptions;
  /** the cache dir to hold temp files, defaults to `os.tmpdir()/wcferry`  */
  cacheDir?: string;
  // 当使用wcferry.on(...)监听消息时，是否接受朋友圈消息
  recvPyq?: boolean;
  // 微信文件目录
  wechat_dir?: string; // 默认为C:/Users/Administrator/Documents/WeChat Files   按照linux路径格式填写 不需要反斜杠 填写微信客户端文件管理的路径
}

const logger = debug('wcferry:client');

export class Wcferry {
  readonly NotFriend = {
    fmessage: '朋友推荐消息',
    medianote: '语音记事本',
    floatbottle: '漂流瓶',
    filehelper: '文件传输助手',
    newsapp: '新闻',
  };

  private isMsgReceiving = false;
  private msgDispose?: () => void;
  private socket: Socket;
  private readonly msgEventSub = new EventEmitter();
  private options: Required<WcferryOptions>;
  private Receiver: AutoReconnectReceiver | null = null;
  constructor(options?: WcferryOptions) {
    this.options = {
      port: options?.port || 10086,
      host: options?.host || '127.0.0.1',
      socketOptions: options?.socketOptions ?? {},
      cacheDir: options?.cacheDir || createTmpDir(),
      recvPyq: !!options?.recvPyq,
      wechat_dir: options?.wechat_dir || path.win32.join(os.homedir(), 'Documents', 'WeChat Files'),
    };

    ensureDirSync(this.options.cacheDir);

    this.msgEventSub.setMaxListeners(0);
    this.socket = new Socket(this.options.socketOptions);
  }

  public trapOnExit() {
    process.on("SIGINT", () => this.stop('SIGINT')) //用户主动终端 例如 Ctrl+C
    process.on("SIGTERM", () => this.stop('SIGTERM')) // 系统终止信号，例如 kill 命令
    process.on('SIGHUP', () => this.stop('SIGHUP')) // 终端挂起信号，通常在终端关闭时发送
    process.on('SIGQUIT', () => this.stop('SIGQUIT')) // 用户发送 quit 信号，通常是 Ctrl+\

    // process.on('uncaughtException', (err) => {
    // process.on('exit', () => this.stop());
  }

  get connected() {
    return this.socket.connected();
  }



  public msgReceivingStatus(): boolean {
    return this.Receiver ? this.Receiver?.isActive() || false : this.isMsgReceiving;
  }

  private createUrl(channel: 'cmd' | 'msg' = 'cmd') {
    const url = `tcp://${this.options.host}:${this.options.port + (channel === 'cmd' ? 0 : 1)}`;
    logger(`wcf ${channel} url: %s`, url);
    return url;
  }

  /**
   * 设置是否接受朋友圈消息
   */
  set recvPyq(pyq: boolean) {
    if (this.options.recvPyq === pyq) {
      return;
    }
    this.options.recvPyq = pyq;
    if (this.connected) {
      this.disableMsgReceiving();
      this.enableMsgReceiving();
    }
  }

  get recvPyq(): boolean {
    return this.options.recvPyq;
  }

  private get msgListenerCount() {
    return this.msgEventSub.listenerCount('wxmsg');
  }

  // 检查 receive message 是否连接
  get isMsgConnected() {
    return
  }

  start() {
    try {
      this.socket.connect(this.createUrl());
      // this.trapOnExit();
      if (this.msgListenerCount > 0) {
        this.enableMsgReceiving();
      }
    } catch (err) {
      logger('cannot connect to wcf RPC server, did wcf.exe started?');
      throw err;
    }
  }

  async stop(signal: string) {
    console.log('WCFerry is stopping due to signal:', signal);
    try {
      await this.disableMsgReceiving();
      await this.socket.close();
      process.exit(0);
    } catch (err) {
      console.log(err, '关闭连接失败')
      process.exit(1)
    }

  }

  private sendRequest(req: wcf.Request): wcf.Response {
    try {
      const data = req.serialize();
      const buf = this.socket.send(Buffer.from(data));
      const res = wcf.Response.deserialize(buf);
      return res;
    } catch (error: any) {
      console.log(error.message, '发送请求指令失败')
      throw error;
    }

  }

  /** 是否已经登录 */
  isLogin(): boolean {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_IS_LOGIN,
    });
    const rsp = this.sendRequest(req);
    return rsp.status == 1;
  }

  /**获取登录账号wxid */
  getSelfWxid(): string {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_GET_SELF_WXID,
    });
    const rsp = this.sendRequest(req);
    return rsp.str;
  }

  /** 获取登录账号个人信息 */
  getUserInfo(): UserInfo {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_GET_USER_INFO,
    });
    const rsp = this.sendRequest(req);
    return rsp.ui;
  }

  /** 获取完整通讯录 */
  getContacts(): Contact[] {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_GET_CONTACTS,
    });
    const rsp = this.sendRequest(req);
    return rsp.contacts.contacts.map((c) => c.toObject() as Contact);
  }

  /** 通过 wxid 查询微信号昵称等信息 */
  getContact(wxid: string): Contact | undefined {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_GET_CONTACT_INFO,
      str: wxid,
    });
    const rsp = this.sendRequest(req);
    return rsp.contacts.contacts[0].toObject() as Contact;
  }

  /** 获取所有数据库 */
  getDbNames(): string[] {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_GET_DB_NAMES,
    });
    const rsp = this.sendRequest(req);
    return rsp.dbs.names;
  }

  /** 获取数据库中所有表 */
  getDbTables(db: string): DbTable[] {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_GET_DB_TABLES,
      str: db,
    });
    const rsp = this.sendRequest(req);
    return rsp.tables.tables.map((t) => t.toObject() as DbTable);
  }

  /**
   * 执行 SQL 查询，如果数据量大注意分页
   * @param db
   * @param sql
   */
  dbSqlQuery(db: string, sql: string): Record<string, string | number | Buffer | undefined>[] {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_EXEC_DB_QUERY,
      query: new wcf.DbQuery({ db, sql }),
    });
    const rsp = this.sendRequest(req);
    const rows = rsp.rows.rows;
    return rows.map((r) => Object.fromEntries(r.fields.map((f) => [f.column, parseDbField(f.type, f.content)])));
  }

  /**
   * 获取消息类型
   * {"47": "石头剪刀布 | 表情图片", "62": "小视频", "43": "视频", "1": "文字", "10002": "撤回消息", "40": "POSSIBLEFRIEND_MSG", "10000": "红包、系统消息", "37": "好友确认", "48": "位置", "42": "名片", "49": "共享实时位置、文件、转账、链接", "3": "图片", "34": "语音", "9999": "SYSNOTICE", "52": "VOIPNOTIFY", "53": "VOIPINVITE", "51": "微信初始化", "50": "VOIPMSG"}
   */
  getMsgTypes(): { code?: number; label?: string }[] {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_GET_MSG_TYPES,
    });
    const rsp = this.sendRequest(req);
    return rsp.types.types.map((t) => t.toObject());
  }

  /**
   * 刷新朋友圈
   * @param id 开始 id，0 为最新页 (string based uint64)
   * @returns 1 为成功，其他失败
   */
  refreshPyq(id: string): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_REFRESH_PYQ,
      ui64: id,
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /** 获取群聊列表 */
  getChatRooms(): Contact[] {
    const contacts = this.getContacts();
    return contacts.filter((c) => c.wxid.endsWith('@chatroom'));
  }

  /**
   * 获取好友列表
   * @returns
   */
  getFriends() {
    const contacts = this.getContacts();
    return contacts.filter((c) => !c.wxid.endsWith('@chatroom') && !c.wxid.startsWith('gh_') && !Object.hasOwn(this.NotFriend, c.wxid));
  }

  /**
   * 获取群成员
   * @param roomid 群的 id
   * @param times 重试次数
   * @returns 群成员列表: {wxid1: 昵称1, wxid2: 昵称2, ...}
   */
  async getChatRoomMembers(roomid: string, times = 5): Promise<Record<string, string>> {
    if (times === 0) {
      return {};
    }
    const [room] = this.dbSqlQuery('MicroMsg.db', `SELECT RoomData FROM ChatRoom WHERE ChatRoomName = '${roomid}';`);
    if (!room) {
      await sleep();
      return this.getChatRoomMembers(roomid, times - 1) ?? {};
    }

    const r = rd.com.iamteer.wcf.RoomData.deserialize(room['RoomData'] as Buffer);

    const userRds = this.dbSqlQuery('MicroMsg.db', 'SELECT UserName, NickName FROM Contact;');

    const userDict = Object.fromEntries(userRds.map((u) => [u['UserName'], u['NickName']] as const));

    return Object.fromEntries(r.members.map((member) => [member.wxid, member.name || userDict[member.wxid]]));
  }

  /**
   * 获取群成员昵称
   * @param wxid
   * @param roomid
   * @returns 群名片
   */
  getAliasInChatRoom(wxid: string, roomid: string): string | undefined {
    const [room] = this.dbSqlQuery('MicroMsg.db', `SELECT RoomData FROM ChatRoom WHERE ChatRoomName = '${roomid}';`);
    if (!room) {
      return undefined;
    }

    const roomData = rd.com.iamteer.wcf.RoomData.deserialize(room['RoomData'] as Buffer);
    return roomData.members.find((m) => m.wxid === wxid)?.name || this.getNickName(wxid)?.[0];
  }

  /**
   * be careful to SQL injection
   * @param wxids wxids
   */
  getNickName(...wxids: string[]): Array<string | undefined> {
    const rows = this.dbSqlQuery('MicroMsg.db', `SELECT NickName FROM Contact WHERE UserName in (${wxids.map((id) => `'${id}'`).join(',')});`);
    return rows.map((row) => row['NickName'] as string | undefined);
  }

  /**
   * 邀请群成员
   * @param roomid
   * @param wxids
   * @returns int32 1 为成功，其他失败
   */
  inviteChatroomMembers(roomid: string, wxids: string[]): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_INV_ROOM_MEMBERS,
      m: new wcf.MemberMgmt({
        roomid,
        wxids: wxids.join(',').replaceAll(' ', ''),
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * 添加群成员
   * @param roomid
   * @param wxids
   * @returns int32 1 为成功，其他失败
   */
  addChatRoomMembers(roomid: string, wxids: string[]): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_ADD_ROOM_MEMBERS,
      m: new wcf.MemberMgmt({
        roomid,
        wxids: wxids.join(',').replaceAll(' ', ''),
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * 删除群成员
   * @param roomid
   * @param wxids
   * @returns int32 1 为成功，其他失败
   */
  delChatRoomMembers(roomid: string, wxids: string[]): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_DEL_ROOM_MEMBERS,
      m: new wcf.MemberMgmt({
        roomid,
        wxids: wxids.join(',').replaceAll(' ', ''),
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * 撤回消息
   * @param msgid (uint64 in string format): 消息 id
   * @returns int: 1 为成功，其他失败
   */
  revokeMsg(msgid: string): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_REVOKE_MSG,
      ui64: msgid,
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * 转发消息。可以转发文本、图片、表情、甚至各种 XML；语音也行，不过效果嘛，自己验证吧。
   * @param msgid (uint64 in string format): 消息 id
   * @param receiver string 消息接收人，wxid 或者 roomid
   * @returns int: 1 为成功，其他失败
   */
  forwardMsg(msgid: string, receiver: string): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_FORWARD_MSG,
      fm: new wcf.ForwardMsg({
        id: msgid,
        receiver,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * 发送文本消息
   * @param msg 要发送的消息，换行使用 `\n` （单杠）；如果 @ 人的话，需要带上跟 `aters` 里数量相同的 @
   * @param receiver 消息接收人，wxid 或者 roomid
   * @param aters 要 @ 的 wxid，多个用逗号分隔；`@所有人` 只需要 `notify@all`
   * @returns 0 为成功，其他失败
   */
  sendTxt(msg: string, receiver: string, aters?: string): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_SEND_TXT,
      txt: new wcf.TextMsg({
        msg,
        receiver,
        aters,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * @param image location of the resource, can be:
   * - a local path (`C:\\Users` or `/home/user`),
   * - a link starts with `http(s)://`,
   * - a buffer (base64 string can be convert to buffer by `Buffer.from(<str>, 'base64')`)
   * - an object { type: 'Buffer', data: number[] } which can convert to Buffer
   * - a FileSavableInterface instance
   * @param receiver 消息接收人，wxid 或者 roomid
   * @returns 0 为成功，其他失败
   */
  async sendImage(image: string | Buffer | { type: 'Buffer'; data: number[] } | FileSavableInterface, receiver: string): Promise<number> {
    const fileRef = toRef(image);
    const { path, discard } = await fileRef.save(this.options.cacheDir);
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_SEND_IMG,
      file: new wcf.PathMsg({
        path,
        receiver,
      }),
    });
    const rsp = this.sendRequest(req);
    void discard();
    return rsp.status;
  }

  /**
   * @param file location of the resource, can be:
   * - a local path (`C:\\Users` or `/home/user`),
   * - a link starts with `http(s)://`,
   * - a buffer (base64 string can be convert to buffer by `Buffer.from(<str>, 'base64')`)
   * - an object { type: 'Buffer', data: number[] } which can convert to Buffer
   * - a FileSavableInterface instance
   * @param receiver 消息接收人，wxid 或者 roomid
   * @returns 0 为成功，其他失败
   */
  async sendFile(file: string | Buffer | { type: 'Buffer'; data: number[] } | FileSavableInterface, receiver: string): Promise<number> {
    const fileRef = toRef(file);
    const { path, discard } = await fileRef.save(this.options.cacheDir);
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_SEND_FILE,
      file: new wcf.PathMsg({
        path,
        receiver,
      }),
    });
    const rsp = this.sendRequest(req);
    void discard();
    return rsp.status;
  }

  /**
   * @deprecated Not supported
   * 发送XML
   * @param xml.content xml 内容
   * @param xml.path 封面图片路径
   * @param receiver xml 类型，如：0x21 为小程序
   * @returns 0 为成功，其他失败
   */
  sendXML(xml: { content: string; path?: string; type: number }, receiver: string): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_SEND_XML,
      xml: new wcf.XmlMsg({
        receiver,
        content: xml.content,
        type: xml.type,
        path: xml.path,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * @deprecated Not supported
   * 发送表情
   * @param path 本地表情路径，如：`C:/Projs/WeChatRobot/emo.gif`
   * @param receiver 消息接收人，wxid 或者 roomid
   * @returns 0 为成功，其他失败
   */
  sendEmotion(path: string, receiver: string): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_SEND_EMOTION,
      file: new wcf.PathMsg({
        path,
        receiver,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * 发送富文本消息
   *  卡片样式：
   *       |-------------------------------------|
   *       |title, 最长两行
   *       |(长标题, 标题短的话这行没有)
   *       |digest, 最多三行，会占位    |--------|
   *       |digest, 最多三行，会占位    |thumburl|
   *       |digest, 最多三行，会占位    |--------|
   *       |(account logo) name
   *       |-------------------------------------|
   * @param desc.name 左下显示的名字
   * @param desc.account 填公众号 id 可以显示对应的头像（gh_ 开头的）
   * @param desc.title 标题，最多两行
   * @param desc.digest 摘要，三行
   * @param desc.url 点击后跳转的链接
   * @param desc.thumburl 缩略图的链接
   * @param receiver 接收人, wxid 或者 roomid
   * @returns 0 为成功，其他失败
   */
  sendRichText(desc: Omit<ReturnType<wcf.RichText['toObject']>, 'receiver'>, receiver: string): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_SEND_RICH_TXT,
      rt: new wcf.RichText({
        ...desc,
        receiver,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * 拍一拍群友
   * @param roomid 群 id
   * @param wxid 要拍的群友的 wxid
   * @returns 1 为成功，其他失败
   */
  sendPat(roomid: string, wxid: string): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_SEND_PAT_MSG,
      pm: new wcf.PatMsg({
        roomid,
        wxid,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * 获取语音消息并转成 MP3
   * @param msgid 语音消息 id
   * @param dir MP3 保存目录（目录不存在会出错）
   * @param times 超时时间（秒）
   * @returns 成功返回存储路径；空字符串为失败，原因见日志。
   */
  async getAudioMsg(msgid: string, dir: string, times = 3): Promise<string> {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_GET_AUDIO_MSG,
      am: new wcf.AudioMsg({
        id: msgid,
        dir,
      }),
    });
    const rsp = this.sendRequest(req);
    if (rsp.str) {
      return rsp.str;
    }
    if (times > 0) {
      await sleep();
      return this.getAudioMsg(msgid, dir, times - 1);
    }
    throw new Error('Timeout: get audio msg');
  }

  /**
   * 获取 OCR 结果。鸡肋，需要图片能自动下载；通过下载接口下载的图片无法识别。
   * @param extra 待识别的图片路径，消息里的 extra
   * @param times OCR 结果
   * @returns
   */
  async getOCRResult(extra: string, times = 2): Promise<string> {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_EXEC_OCR,
      str: extra,
    });
    const rsp = this.sendRequest(req);
    if (rsp.ocr.status === 0 && rsp.ocr.result) {
      return rsp.ocr.result;
    }

    if (times > 0) {
      await sleep();
      return this.getOCRResult(extra, times - 1);
    }
    throw new Error('Timeout: get ocr result');
  }

  /**
   * @deprecated 下载附件（图片、视频、文件）。这方法别直接调用，下载图片使用 `download_image`
   * @param msgid 消息中 id
   * @param thumb 消息中的 thumb
   * @param extra 消息中的 extra
   * @returns 0 为成功, 其他失败。
   */
  downloadAttach(msgid: string, thumb: string = '', extra: string = ''): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_DOWNLOAD_ATTACH,
      att: new wcf.AttachMsg({
        id: msgid,
        thumb,
        extra,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  private getMsgAttachments(msgid: string): {
    extra?: string;
    thumb?: string;
  } {
    const messages = this.dbSqlQuery('MSG0.db', `Select * from MSG WHERE MsgSvrID = "${msgid}"`);
    const buf = messages?.[0]?.['BytesExtra'];
    if (!Buffer.isBuffer(buf)) {
      return {};
    }
    const extraData = eb.com.iamteer.wcf.Extra.deserialize(buf);
    const { properties } = extraData.toObject();
    if (!properties) {
      return {};
    }
    const propertyMap: Partial<Record<eb.com.iamteer.wcf.Extra.PropertyKey, string>> = Object.fromEntries(properties.map((p) => [p.type, p.value]));
    const extra = propertyMap[eb.com.iamteer.wcf.Extra.PropertyKey.Extra];
    const thumb = propertyMap[eb.com.iamteer.wcf.Extra.PropertyKey.Thumb];

    return {
      extra: extra ? path.win32.join(this.options.wechat_dir, extra) : '',
      thumb: thumb ? path.win32.join(this.options.wechat_dir, thumb) : '',
    };
  }

  /**
   * @deprecated 解密图片。这方法别直接调用，下载图片使用 `download_image`。
   * @param src 加密的图片路径
   * @param dir 保存图片的目录
   * @returns
   */
  decryptImage(src: string, dir: string): string {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_DECRYPT_IMAGE,
      dec: new wcf.DecPath({
        src,
        dst: dir,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.str;
  }

  /**
   * 下载图片
   * @param msgid 消息中 id
   * @param dir 存放图片的目录（目录不存在会出错）
   * @param extra 消息中的 extra, 如果为空，自动通过msgid获取
   * @param times 超时时间（秒）
   * @returns 成功返回存储路径；空字符串为失败，原因见日志。
   */
  async downloadImage(msgid: string, dir: string, extra?: string, thumb?: string, times = 30): Promise<string> {
    const msgAttachments = extra ? { extra, thumb } : this.getMsgAttachments(msgid);
    if (this.downloadAttach(msgid, msgAttachments.thumb, msgAttachments.extra) !== 0) {
      return Promise.reject('Failed to download attach');
    }
    for (let cnt = 0; cnt < times; cnt++) {
      const path = this.decryptImage(msgAttachments.extra || '', dir);

      if (path) {
        return path;
      }
      await sleep();
    }
    return Promise.reject('Failed to decrypt image');
  }

  /**
   * 通过好友申请
   * @param v3 加密用户名 (好友申请消息里 v3 开头的字符串)
   * @param v4 Ticket (好友申请消息里 v4 开头的字符串)
   * @param scene 申请方式 (好友申请消息里的 scene); 为了兼容旧接口，默认为扫码添加 (30)
   * @returns 1 为成功，其他失败
   */
  acceptNewFriend(v3: string, v4: string, scene = 30): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_ACCEPT_FRIEND,
      v: new wcf.Verification({
        v3,
        v4,
        scene,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * 接收转账
   * @param wxid 转账消息里的发送人 wxid
   * @param transferid 转账消息里的 transferid
   * @param transactionid 转账消息里的 transactionid
   * @returns 1 为成功，其他失败
   */
  receiveTransfer(wxid: string, transferid: string, transactionid: string): number {
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_RECV_TRANSFER,
      tf: new wcf.Transfer({
        wxid,
        tfid: transferid,
        taid: transactionid,
      }),
    });
    const rsp = this.sendRequest(req);
    return rsp.status;
  }

  /**
   * @internal 允许接收消息,自动根据on(...)注册的listener调用
   * @param pyq
   * @returns
   */
  private enableMsgReceiving(): boolean {
    if (this.isMsgReceiving) {
      return true;
    }
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_ENABLE_RECV_TXT,
      flag: this.options.recvPyq,
    });
    const rsp = this.sendRequest(req);
    if (rsp.status !== 0) {
      this.isMsgReceiving = false;
      return false;
    }
    try {
      this.msgDispose = this.receiveMessage();
      this.isMsgReceiving = true;
      return true;
    } catch (err) {
      this.msgDispose?.();
      this.isMsgReceiving = false;
      logger('enable message receiving error: %O', err);
      return false;
    }
  }

  /**
   * @internal 停止接收消息,自动根据on(...)注册/注销的listener 调用
   * @param force
   * @returns
   */
  private disableMsgReceiving(force = false): number {
    if (!force && !this.isMsgReceiving) {
      return 0;
    }
    const req = new wcf.Request({
      func: wcf.Functions.FUNC_DISABLE_RECV_TXT,
    });
    const rsp = this.sendRequest(req);
    this.isMsgReceiving = false;
    this.msgDispose?.();
    this.msgDispose = undefined;
    return rsp.status;
  }

  private receiveMessage() {
    try {
      const Receiver = new AutoReconnectReceiver(this.createUrl('msg'))
      Receiver.start(this.messageCallback.bind(this), (err) => {
        console.log(err, 774, 'nng库抛出错误')
      });
      this.Receiver = Receiver;
      return () => Receiver.stop();
    } catch (err) {
      console.log(err, 774)
    }

  }

  private messageCallback(buf: Buffer) {
    const rsp = wcf.Response.deserialize(buf);
    this.msgEventSub.emit('wxmsg', new Message(rsp.wxmsg));
  }

  //  构造xml数据
  private struct_xml_data(xml: string, wx_id: string) {
    const msgs = this.dbSqlQuery('MSG0.db', `select * from MSG where Type = 49 ORDER BY CreateTime DESC LIMIT 1`);
    if (!msgs.length) return console.log('请先发送一条卡片消息 type:49');
    const xml_info = lz4Compress(Buffer.from(xml)).toString('hex');
    const MsgSvrID = `10${Date.now()}`;
    const sql = `UPDATE MSG SET MsgSvrID = ${MsgSvrID},CompressContent = x'${xml_info}', BytesExtra=x''  WHERE localId = ${msgs[0].localId}`;
    this.dbSqlQuery('MSG0.db', sql);
    return this.forwardMsg(MsgSvrID, wx_id);
  }
  /**
   * 发送xml数据
   * @param content xml文件path 或xml字符串
   * @returns 1 为成功，其他失败
   */
  public send_xml_message(content: string, wx_id: string) {
    const is_xml = typeof content === 'string' && content.trim().startsWith('<');
    if (is_xml) {
      return this.struct_xml_data(content, wx_id);
    }
    if (fs.existsSync(content)) {
      const xml_info = fs.readFileSync(content, 'utf-8');
      return this.struct_xml_data(xml_info, wx_id);
    }
    console.log('xml or xml_path is not empty');
  }

  /**
   * 注册消息回调监听函数(listener), 通过call返回的函数注销
   * 当注册的监听函数数量大于0是自动调用enableMsgReceiving,否则自动调用disableMsgReceiving
   * 设置wcferry.recvPyq = true/false 来开启关闭接受朋友圈消息
   * @param callback 监听函数
   * @returns 注销监听函数
   */
  listening(callback: (msg: Message) => (void | Promise<void>)): () => any {
    this.msgEventSub.on('wxmsg', callback);
    if (this.connected && this.msgEventSub.listenerCount('wxmsg') === 1) {
      this.enableMsgReceiving();
    }
    return () => {
      if (this.connected && this.msgEventSub.listenerCount('wxmsg') === 1) {
        this.disableMsgReceiving();
      }
      this.msgEventSub.off('wxmsg', callback);
    };
  }
}

function toRef(file: string | Buffer | { type: 'Buffer'; data: number[] } | FileSavableInterface): FileSavableInterface {
  if (typeof file === 'string' || Buffer.isBuffer(file)) {
    return new FileRef(file);
  }
  if ('save' in file) {
    return file;
  }
  return new FileRef(Buffer.from(file.data));
}

function parseDbField(type: number, content: Uint8Array) {
  // self._SQL_TYPES = {1: int, 2: float, 3: lambda x: x.decode("utf-8"), 4: bytes, 5: lambda x: None}
  switch (type) {
    case 1:
      const strContent = uint8Array2str(content);
      const bigIntContent = BigInt(strContent);
      if (bigIntContent > Number.MAX_SAFE_INTEGER) {
        // bigInt 在JSON.stringify时会出问题，还是返回字符串吧
        // TypeError: Do not know how to serialize a BigInt
        return strContent;
      }
      return Number.parseInt(strContent, 10);
    case 2:
      return Number.parseFloat(uint8Array2str(content));
    case 3:
    default:
      return uint8Array2str(content);
    case 4:
      return Buffer.from(content);
    case 5:
      return undefined;
  }
}
