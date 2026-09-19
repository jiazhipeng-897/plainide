const { BrowserWindow, shell, app } = require('electron')
const path = require('path')
const collector = require('./error-collector')

let errorWindow = null
let isReady = false

function createErrorWindow() {
  if (errorWindow && !errorWindow.isDestroyed()) {
    errorWindow.focus()
    return errorWindow
  }

  errorWindow = new BrowserWindow({
    width: 800,
    height: 500,
    minWidth: 500,
    minHeight: 300,
    frame: false,
    titleBarStyle: 'hidden',
    alwaysOnTop: false,
    show: false,
    title: '🔴 错误日志 - My Code IDE',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload-error.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    errorWindow.loadURL('http://localhost:5173/error-window.html')
  } else {
    errorWindow.loadFile(path.join(__dirname, '../dist/error-window.html'))
  }

  errorWindow.once('ready-to-show', () => {
    isReady = true
    // 不自动显示，等待 showErrorWindow() 调用
  })

  errorWindow.on('closed', () => {
    collector.unregisterWindow(errorWindow.webContents)
    errorWindow = null
    isReady = false
  })

  collector.registerWindow(errorWindow.webContents)

  if (isDev) {
    errorWindow.webContents.openDevTools()
  }

  return errorWindow
}

function showErrorWindow() {
  if (errorWindow && !errorWindow.isDestroyed()) {
    if (errorWindow.isMinimized()) errorWindow.restore()
    errorWindow.show()
    errorWindow.focus()
    return errorWindow
  }

  const win = createErrorWindow()
  if (isReady) {
    win.show()
    win.focus()
  } else {
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })
  }
  return win
}

function getErrorWindow() {
  return errorWindow
}

module.exports = {
  createErrorWindow,
  showErrorWindow,
  getErrorWindow,
}