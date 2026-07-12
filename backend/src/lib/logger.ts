import pino from 'pino';

const logger = pino({
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password',
            '*.passwordHash',
            '*.currentPassword',
            '*.newPassword',
            '*.token',
            '*.secret',
            '*.streamKey',
        ],
        censor: '[REDACTED]',
    },
    ...(process.env.NODE_ENV !== 'production' && {
        transport: {
            target: 'pino/file',
            options: { destination: 1 } // stdout
        }
    })
});

export default logger;
