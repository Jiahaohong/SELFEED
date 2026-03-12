import { spawn } from 'child_process';
import net from 'net';
import path from 'path';

const PORT = 3000;
const DEV_SERVER_URL = `http://localhost:${PORT}`;
const BACKEND_PORT = 8787;
const LOCALHOST = '127.0.0.1';

const isWin = process.platform === 'win32';
const binExt = isWin ? '.cmd' : '';
const viteBin = path.join(process.cwd(), 'node_modules', '.bin', `vite${binExt}`);
const electronBin = path.join(process.cwd(), 'node_modules', '.bin', `electron${binExt}`);

const waitForPort = (port, name, retries = 120) => new Promise((resolve, reject) => {
  const attempt = () => {
    const socket = net.connect(port, LOCALHOST);
    socket.once('connect', () => {
      socket.end();
      resolve();
    });
    socket.once('error', () => {
      socket.destroy();
      if (retries <= 0) {
        reject(new Error(`${name} not ready on port ${port}`));
        return;
      }
      setTimeout(() => {
        retries -= 1;
        attempt();
      }, 250);
    });
  };
  attempt();
});

const startBackend = () => spawn(process.execPath, ['backend/server.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(BACKEND_PORT)
  }
});

const startVite = () => spawn(viteBin, ['--host', '0.0.0.0', '--port', String(PORT)], {
  stdio: 'inherit',
  env: process.env
});

const startElectron = () => spawn(electronBin, ['.'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: DEV_SERVER_URL
  }
});

const terminateProcess = (proc) => {
  if (!proc || proc.killed) return;
  proc.kill('SIGTERM');
};

const main = async () => {
  const backendProcess = startBackend();
  const viteProcess = startVite();

  let electronProcess;
  try {
    await Promise.all([
      waitForPort(BACKEND_PORT, 'Backend service'),
      waitForPort(PORT, 'Vite dev server')
    ]);
    electronProcess = startElectron();
  } catch (error) {
    console.error(String(error));
    terminateProcess(backendProcess);
    terminateProcess(viteProcess);
    process.exit(1);
  }

  const shutdown = () => {
    terminateProcess(electronProcess);
    terminateProcess(viteProcess);
    terminateProcess(backendProcess);
  };

  process.on('SIGINT', () => {
    shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });

  electronProcess.on('exit', (code) => {
    terminateProcess(viteProcess);
    terminateProcess(backendProcess);
    process.exit(code ?? 0);
  });
};

main();
