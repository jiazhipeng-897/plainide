const { ipcMain } = require('electron')
const EventEmitter = require('events')

class ErrorCollector extends EventEmitter {
  constructor() {
    super()
    this.errors = []
    this.maxErrors = 1000 // 最多保留1000条
    this.windowRefs = new Set()
  }

  // 添加错误
  add(error) {
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toISOString(),
      level: error.level || 'error', // error | warning | info
      message: error.message || '未知错误',
      stack: error.stack || null,
      source: error.source || 'system', // system | ipc | python | renderer
      details: error.details || null,
    }

    this.errors.unshift(entry)

    // 限制数量
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors)
    }

    // 广播给所有错误窗口
    this.broadcast('new-error', entry)

    // 触发首次错误事件
    if (this.errors.length === 1) {
      this.emit('first-error', entry)
    }

    return entry
  }

  // 获取所有错误
  getAll() {
    return this.errors
  }

  // 清空错误
  clear() {
    this.errors = []
    this.broadcast('errors-cleared')
  }

  // 导出错误日志
  export() {
    return JSON.stringify(this.errors, null, 2)
  }

  // 注册错误窗口
  registerWindow(webContents) {
    this.windowRefs.add(webContents)
    // 发送历史错误
    webContents.send('error-history', this.errors)
  }

  // 注销错误窗口
  unregisterWindow(webContents) {
    this.windowRefs.delete(webContents)
  }

  // 广播消息给所有错误窗口
  broadcast(channel, data) {
    for (const win of this.windowRefs) {
      try {
        if (!win.isDestroyed()) {
          win.send(channel, data)
        }
      } catch (e) {
        // 忽略
      }
    }
  }
}

// 单例
const collector = new ErrorCollector()

module.exports = collector