# Operação da plataforma

## Subida e verificação

```powershell
docker compose up --build -d
docker compose ps
Invoke-RestMethod http://localhost:8082/api/health/ready
Invoke-RestMethod http://localhost:8082/api/stream/status
```

`ready` confirma API + PostgreSQL. O status do stream informa separadamente o OBS (`live`) e a programação automática (`loop`), sem expor as chaves RTMP.

## Segredos e credenciais

- Gere `RTMP_STREAM_KEY` e `LOOP_STREAM_KEY` independentes com 32 bytes aleatórios ou mais.
- Use uma senha exclusiva no PostgreSQL e mantenha a mesma senha dentro de `DATABASE_URL`.
- `ADMIN_INITIAL_PASSWORD` serve apenas ao primeiro boot. Troque a senha no painel e remova o valor do ambiente depois.
- Em produção, use secret manager e `COOKIE_SECURE=true`; `.env` não é mecanismo de segredo de produção.
- A porta 1935 permanece em loopback. Para OBS remoto, use VPN privada ou ingress RTMPS; não publique RTMP diretamente na internet.

## Backup e restauração

Há três conjuntos de dados: PostgreSQL, imagens e vídeos. Um backup só é válido depois de uma restauração testada.

```powershell
docker compose exec -T database pg_dump -U tvcarlos -d tvcarlos -Fc > tvcarlos.dump
docker run --rm -v tvcarlos_image-data:/source:ro -v ${PWD}:/backup alpine:3.22 tar czf /backup/images.tgz -C /source .
docker run --rm -v tvcarlos_video-data:/source:ro -v ${PWD}:/backup alpine:3.22 tar czf /backup/videos.tgz -C /source .
```

Faça a restauração em ambiente separado, execute as migrations e valide login, grade, uploads e reprodução. Defina RPO/RTO com o responsável pelo negócio antes da produção.

## Atualização e rollback

1. Tire backup e registre as versões atuais das imagens.
2. Execute `npm run quality` contra um ambiente equivalente.
3. Construa imagens imutáveis e aplique a atualização.
4. Aguarde os health checks e valide a Web TV em desktop e celular.
5. Em falha, reverta as imagens. Não reverta banco sem avaliar a compatibilidade das migrations.

## Incidentes

- Correlacione erros pelo `X-Request-ID` e pelos logs JSON da API.
- Nunca cole cookies, senhas ou chaves RTMP em chamados.
- Em suspeita de vazamento: revogue sessões alterando a credencial, rotacione as duas chaves RTMP, troque segredos de banco e preserve logs para análise.
- Monitore disponibilidade, espaço dos volumes, expiração TLS, falhas de login, uso de CPU/memória e atraso/ausência das playlists HLS.

## Limites de escala

O adapter local é adequado a uma instalação. Para múltiplas réplicas, substitua arquivos por S3/MinIO + CDN, sessão/rate limit por Redis ou equivalente, e adicione fila isolada para transcodificação e antivírus. Isso é evolução de adapters, não reescrita do domínio.
