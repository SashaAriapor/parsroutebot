import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: {
    targets: [
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', level: config.LOG_LEVEL, options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
        : { target: 'pino/file', level: config.LOG_LEVEL, options: { destination: 1 } },
      { target: 'pino/file', level: config.LOG_LEVEL, options: { destination: '/tmp/bot.log', append: true } },
    ],
  },
});
