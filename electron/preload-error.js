const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('errorAPI', {
  // 监听新错误
  onNewError: (callback) => {
    ipcRenderer.on('new-error', (event, error) => callback(error))
  },
  // 监听历史错误
  onHistory: (callback) => {
    ipcRenderer.on('error-history', (event, errors) => callback(errors))
  },
  // 监听清空事件
  onCleared: (callback) => {
    ipcRenderer.on('errors-cleared', () => callback())
  },
  // 清空错误
  clearErrors: () => ipcRenderer.send('clear-errors'),
  // 导出日志
  exportErrors: () => ipcRenderer.invoke('export-errors'),
  
  // ========== 窗口控制 ==========
  minimizeWindow: () => ipcRenderer.send('error-window-minimize'),
  maximizeWindow: () => ipcRenderer.send('error-window-maximize'),
  closeWindow: () => ipcRenderer.send('error-window-close'),
})