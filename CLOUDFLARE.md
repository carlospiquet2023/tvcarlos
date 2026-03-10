# CloudFlare — Guia de Configuração para EduVault

## Por que CloudFlare (Free Tier)?
| Benefício | Detalhe |
|-----------|---------|
| **DDoS Protection** | Absorve até 100 Gbps de ataque gratuitamente |
| **CDN Global** | Assets estáticos cacheados em 300+ PoPs mundiais |
| **SSL/TLS** | Certificado universal gratuito + Full (Strict) mode |
| **WAF Básico** | Regras automáticas contra SQLi, XSS, bots |
| **Analytics** | Tráfego, ameaças bloqueadas, cache hit ratio |
| **Custo** | R$ 0 — Free tier é suficiente para 10k+ alunos |

---

## Passo a Passo

### 1. Criar Conta
1. Acesse [cloudflare.com](https://cloudflare.com) e crie uma conta
2. Clique em **"Add a site"** e digite seu domínio
3. Selecione o plano **Free**

### 2. Atualizar Nameservers
1. CloudFlare fornece 2 nameservers (ex: `anna.ns.cloudflare.com`)
2. No seu registrador de domínio (GoDaddy, Registro.br, etc):
   - Remova os nameservers atuais
   - Adicione os 2 do CloudFlare
3. Aguarde propagação (até 24h, geralmente 30min)

### 3. Configurar DNS
No painel CloudFlare → DNS:

| Tipo | Nome | Conteúdo | Proxy |
|------|------|----------|-------|
| A | `@` | IP do seu servidor | ✅ Proxied (nuvem laranja) |
| A | `www` | IP do seu servidor | ✅ Proxied |
| A | `monitor` | IP do servidor (Uptime Kuma) | ❌ DNS only (cinza) |

> **Importante:** O registro do monitor NÃO deve passar pelo proxy, para o Uptime Kuma monitorar diretamente.

### 4. SSL/TLS
No painel CloudFlare → SSL/TLS:

1. **Modo de criptografia:** `Full (Strict)`
   - Requer certificado válido no servidor (Let's Encrypt)
   - Criptografa de ponta a ponta
2. **Always Use HTTPS:** ✅ Ativado
3. **Minimum TLS Version:** `TLS 1.2`
4. **Automatic HTTPS Rewrites:** ✅ Ativado

### 5. Cache & Performance
No painel CloudFlare → Caching:

1. **Caching Level:** Standard
2. **Browser Cache TTL:** Respect Existing Headers
   - O Nginx já envia cache headers corretos (immutable para HLS .ts)
3. **Always Online:** ✅ Ativado (serve cache se o servidor cair)

#### Page Rules (3 regras gratuitas):
| URL Pattern | Configuração | Motivo |
|-------------|-------------|--------|
| `seudominio.com.br/api/*` | Cache Level: Bypass | API jamais deve ser cacheada |
| `seudominio.com.br/hls/*.m3u8` | Cache Level: Bypass | Playlists precisam ser fresh |
| `seudominio.com.br/hls/*.ts` | Cache Level: Cache Everything, Edge TTL: 1 month | Segmentos HLS são imutáveis |

### 6. Security
No painel CloudFlare → Security:

1. **Security Level:** Medium
2. **Bot Fight Mode:** ✅ Ativado
3. **Browser Integrity Check:** ✅ Ativado
4. **Challenge Passage:** 30 minutes

#### Firewall Rules (5 regras gratuitas):
| Regra | Expressão | Ação |
|-------|-----------|------|
| Bloquear países suspeitos | `(ip.geoip.country in {"CN" "RU" "KP"})` | Block (ajuste conforme necessidade) |
| Proteger login | `(http.request.uri.path contains "/api/auth/login" and cf.threat_score gt 10)` | Challenge |
| Proteger admin | `(http.request.uri.path contains "/api/admin" and cf.threat_score gt 5)` | Challenge |

### 7. Configurar Nginx para CloudFlare
Descomente a seção **"CLOUDFLARE REAL IP"** no arquivo `nginx.conf`:

```bash
# No nginx.conf, descomente as linhas:
set_real_ip_from 173.245.48.0/20;
# ... (todas as faixas de IP do CloudFlare)
real_ip_header CF-Connecting-IP;
```

Isso garante que o rate limiting e logs usem o IP real do cliente, não o do CloudFlare.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

#### Atualizar IPs do CloudFlare Automaticamente

As faixas de IP do CloudFlare podem mudar. Use o script abaixo para manter atualizado:

```bash
# Criar script de atualização
sudo tee /usr/local/bin/update-cloudflare-ips.sh << 'EOF'
#!/bin/bash
set -euo pipefail
OUT="/etc/nginx/conf.d/cloudflare-real-ip.conf"
echo "# CloudFlare Real IP — atualizado em $(date)" > "$OUT"
for ip in $(curl -sL https://www.cloudflare.com/ips-v4); do
    echo "set_real_ip_from $ip;" >> "$OUT"
done
for ip in $(curl -sL https://www.cloudflare.com/ips-v6); do
    echo "set_real_ip_from $ip;" >> "$OUT"
done
echo 'real_ip_header CF-Connecting-IP;' >> "$OUT"
nginx -t && systemctl reload nginx
EOF
sudo chmod +x /usr/local/bin/update-cloudflare-ips.sh

# Executar uma vez agora
sudo /usr/local/bin/update-cloudflare-ips.sh

# Agendar atualização semanal (domingo às 4h)
echo "0 4 * * 0 root /usr/local/bin/update-cloudflare-ips.sh >> /var/log/cloudflare-ip-update.log 2>&1" \
  | sudo tee /etc/cron.d/cloudflare-ip-update
```

> **Nota:** Quando usar o script automático, comente a seção `CLOUDFLARE REAL IP` estática do `nginx.conf` para evitar duplicação. O Nginx carregará os IPs via `include /etc/nginx/conf.d/cloudflare-real-ip.conf;` no bloco `http`.
>
> Lista oficial de IPs: [cloudflare.com/ips](https://www.cloudflare.com/ips/)

---

## Verificação

Após ativar o CloudFlare:

```bash
# Verificar que o site está passando pelo CloudFlare
curl -I https://seudominio.com.br
# Deve ter header: cf-ray: xxxxxxx-GRU

# Verificar SSL Full (Strict)
curl -vI https://seudominio.com.br 2>&1 | grep "subject"

# Testar que API não está cacheada
curl -I https://seudominio.com.br/api/config/public
# Deve ter: cf-cache-status: DYNAMIC (não HIT)

# Testar que HLS .ts está cacheado na CDN
curl -I https://seudominio.com.br/hls/algum-id/v0/fileSequence0.ts
# Deve ter: cf-cache-status: HIT (após segundo request)
```

---

## Métricas a Acompanhar
- **Cache Hit Ratio:** Ideal > 80% (HLS + assets estáticos)
- **Threats Blocked:** Monitorar picos de ataques
- **Bandwidth Saved:** CloudFlare economiza banda do servidor
- **SSL Certificate:** Renovação automática (verificar no painel)
