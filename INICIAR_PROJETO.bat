@echo off
setlocal
title EduVault v10.0 - Plataforma Educacional Completa
color 0B

echo ==========================================================
echo     EduVault v10.0 - PLATAFORMA EDUCACIONAL COMPLETA
echo ==========================================================
echo.
echo  === MODO DESENVOLVIMENTO (npm run dev) ===
echo.
echo  Recursos ativos:
echo  - Branding Dinamico (cores, logo, nome por cliente)
echo  - Streaming HLS Multi-qualidade com FFmpeg (timeout 30min)
echo  - Dashboard Premium do Aluno com Progresso (batch otimizado)
echo  - Editor de Blocos drag-and-drop (25 fontes Google Fonts)
echo  - Material PDF por modulo + Calendario por curso
echo  - Importacao de alunos via Excel (.xlsx/.xls) em batch
echo  - Painel Admin paginado com busca + senha forte
echo  - Pino structured logging + Health Check + Metricas
echo  - Aulas ao Vivo (Zoom) com agendamento e status
echo  - Audit Log + Notificacoes + Certificado de Conclusao
echo  - Monitoramento (Uptime Kuma) + CloudFlare CDN + k6 Load Tests
echo  - Rate Limiting Nginx (4 zonas) + Runbook de Incidentes (9 cenarios)
echo  - Health Check avancado (DB latencia + disco + fila)
echo  - PM2 Log Rotation + Teste automatico de backup + Rollback
echo  - Forum de Comentarios por aula (polling 5s, respostas, denuncias)
echo  - Sistema de Punicoes (filtro profanidade, bans automaticos, recursos)
echo  - Painel de Moderacao e Punicoes no Admin
echo  - Sistema de Presenca Automatica (heartbeat 30s, tempo configuravel)
echo  - Listas de Presenca editaveis com auditoria de justificativa
echo  - 18 testes automatizados (Vitest)
echo.
echo  PRODUCAO: Use PM2 + Nginx (ver DEPLOY.md)
echo.

echo [1/5] Instalando dependencias do Backend...
pushd backend
call npm install
if errorlevel 1 (
    echo ERRO: Falha ao instalar dependencias do backend!
    popd
    pause
    exit /b 1
)
popd

echo.
echo [2/5] Instalando dependencias do Frontend...
pushd frontend
call npm install
if errorlevel 1 (
    echo ERRO: Falha ao instalar dependencias do frontend!
    popd
    pause
    exit /b 1
)
popd

echo.
echo [3/5] Sincronizando Modelos e Banco de Dados (Prisma)...
pushd backend
call npx prisma generate
call npx prisma db push
call npx ts-node prisma/seed.ts
popd

echo.
echo [4/5] Iniciando Motor de Video e API (Backend porta 4000)...
start "EduVault Backend" cmd /k "cd /d %~dp0backend && npm run dev"

echo.
echo Aguardando inicializacao do backend...
timeout /t 6 /nobreak >nul

echo.
echo [5/5] Iniciando Interface Premium (Frontend porta 5173)...
start "EduVault Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ==========================================================
echo               SISTEMA INICIADO COM SUCESSO!
echo ==========================================================
echo.
echo  Acesso: http://localhost:5173
echo.
echo  Primeiro acesso:
echo    Usuario: plataforma
echo    Senha:   !Senha123
echo.
echo  Apos login, va em Configuracoes ^> Aparencia da Plataforma
echo  para definir o logo, nome e cores do seu cliente.
echo.
echo  NAO FECHE as janelas secundarias para manter o sistema online.
echo ==========================================================
echo.
echo Abrindo o navegador...
timeout /t 3 /nobreak >nul
start http://localhost:5173
echo.
pause
