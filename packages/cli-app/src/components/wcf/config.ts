export interface ButtonGroupItem {
  name: string;
  key: 'start' | 'update' | 'close' | 'setting' | 'restart';
  icon: string;
  btn_background: string;
}
export const buttonGrounp: ButtonGroupItem[] = [
  {
    name: '启动WCF核心',
    key: 'start',
    icon: 'fas fa-play',
    btn_background: 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
  },
  {
    name: '更新WCF核心',
    key: 'update',
    icon: 'fas fa-sync-alt',
    btn_background: 'bg-gray-800 hover:bg-gray-600 focus:ring-gray-500',
  },
  {
    name: '重启WCF',
    key: 'restart',
    icon: 'fas fa-redo',
    btn_background: 'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400',
  },
  {
    name: '关闭WCF核心',
    key: 'close',
    icon: 'fas fa-stop',
    btn_background: 'bg-red-600  hover:bg-red-700 focus:ring-red-500',
  },
  {
    name: '设置',
    key: 'setting',
    icon: 'fas  fa-gear',
    btn_background: 'bg-gray-400  hover:bg-gray-500 focus:ring-gray-300',
  },
];
