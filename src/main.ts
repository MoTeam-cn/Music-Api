// 入口：读配置、起服务、优雅退出。

import { loadConfig } from './config.ts';
import { createApp } from './server.ts';

const config = loadConfig(process.env);
const server = createApp(config);

server.listen(config.port, config.host, () => {
  console.log('music-api ' + config.version + ' listening on http://' + config.host + ':' + config.port);
});

function shutdown(signal: string): void {
  console.log('music-api shutting down (' + signal + ')');
  server.close(() => process.exit(0));
  const timer = setTimeout(() => process.exit(0), 5000);
  timer.unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
