/**
 * PM2 Ecosystem Config — Cluster Mode para produção
 *
 * Uso:
 *   npm install -g pm2
 *   pm2 start ecosystem.config.js
 *   pm2 monit                   (monitoramento em tempo real)
 *   pm2 logs                    (logs agregados)
 *   pm2 reload eduvault-api     (zero-downtime restart)
 *
 * IMPORTANTE: Apenas 1 instância deve rodar o pg-boss worker.
 * As demais instâncias apenas servem HTTP.
 * O env PGBOSS_WORKER=true controla qual instância roda o worker.
 *
 * LOG ROTATION (instalar após primeiro deploy):
 *   pm2 install pm2-logrotate
 *   pm2 set pm2-logrotate:max_size 100M
 *   pm2 set pm2-logrotate:retain 30
 *   pm2 set pm2-logrotate:compress true
 *   pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
 *   pm2 set pm2-logrotate:rotateModule true
 */
module.exports = {
    apps: [
        {
            name: 'eduvault-api',
            script: 'dist/server.js',
            cwd: './backend',
            instances: 'max',           // 1 processo por core
            exec_mode: 'cluster',       // Cluster mode = multi-core
            max_memory_restart: '1G',   // Restart se passar de 1GB (memory leak)
            env: {
                NODE_ENV: 'production',
            },
            // Logs
            error_file: './logs/err.log',
            out_file: './logs/out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            // Graceful shutdown
            kill_timeout: 35000,        // 35s (boss tem 30s de timeout)
            listen_timeout: 10000,
            // Restart policy
            max_restarts: 10,
            min_uptime: '10s',
            autorestart: true,
        },
        {
            name: 'eduvault-worker',
            script: 'dist/server.js',
            cwd: './backend',
            instances: 1,               // APENAS 1 worker pg-boss
            exec_mode: 'fork',
            max_memory_restart: '1G',   // Worker processa FFmpeg, precisa de mais RAM
            env: {
                NODE_ENV: 'production',
                PGBOSS_WORKER: 'true',  // Flag para este processo rodar o worker
            },
            error_file: './logs/worker-err.log',
            out_file: './logs/worker-out.log',
            merge_logs: true,
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            kill_timeout: 35000,
            max_restarts: 5,
            min_uptime: '10s',
            autorestart: true,
        }
    ]
};
