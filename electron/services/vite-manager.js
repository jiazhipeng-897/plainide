// electron/services/vite-manager.js
const { spawn, exec } = require('child_process');
const path = require('path');
const net = require('net');

let viteDevProcess = null;

// 端口探测
function findAvailablePort(startPort, maxTry = 20) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryNext = () => {
      if (port - startPort >= maxTry) {
        return reject(new Error('无法找到可用端口'));
      }
      const server = net.createServer();
      server.once('error', () => {
        port++;
        tryNext();
      });
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.listen(port, '127.0.0.1');
    };
    tryNext();
  });
}

// 启动 Vite 开发服务器
function startViteDevServer() {
  return new Promise((resolve, reject) => {
    findAvailablePort(5173, 10).then(port => {
      const url = `http://localhost:${port}`;
      console.log(`[Vite] 使用端口: ${port}`);
      
      viteDevProcess = spawn('npm', ['run', 'dev', '--', '--port', port.toString()], {
        cwd: path.resolve(__dirname, '../../'),
        shell: true
      });
      
      let isReady = false;
      
      viteDevProcess.stdout.on('data', (data) => {
        const msg = data.toString();
        console.log('[Vite]', msg);
        if (!isReady && (msg.includes('ready') || msg.includes('Local:'))) {
          isReady = true;
          resolve(url);
        }
      });
      
      viteDevProcess.stderr.on('data', (data) => {
        const msg = data.toString();
        console.error('[Vite Err]', msg);
        if (msg.includes('Port') && msg.includes('is already in use')) {
          reject(new Error('端口被占用'));
        }
      });
      
      viteDevProcess.on('error', (err) => {
        reject(err);
      });
      
      setTimeout(() => {
        if (!isReady) {
          resolve(url);
        }
      }, 5000);
    }).catch(err => {
      reject(err);
    });
  });
}

// 停止 Vite 服务
function stopViteDevServer() {
  if (!viteDevProcess) return;
  const pid = viteDevProcess.pid;
  const proc = viteDevProcess;
  viteDevProcess = null;
  if (process.platform === 'win32') {
    exec(`taskkill /pid ${pid} /T /F`, (err) => {
      if (!err) console.log('[Vite] 开发服务进程已销毁');
    });
  } else {
    proc.kill('SIGTERM');
    setTimeout(() => proc.kill('SIGKILL'), 2000);
  }
}

function getViteProcess() { return viteDevProcess; }

module.exports = {
  startViteDevServer,
  stopViteDevServer,
  getViteProcess,
};