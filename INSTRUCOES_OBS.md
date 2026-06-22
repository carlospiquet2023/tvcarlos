# Guia Passo a Passo: Integrando o OBS Studio com a TV Carlos

Este guia orienta você sobre como configurar o seu OBS Studio no Windows para transmitir ao vivo diretamente para o site da sua TV Carlos.

---

## Passo 1: Configurar a Transmissão no OBS

1. Abra o **OBS Studio**.
2. No menu inferior direito, clique em **Configurações** (ou vá no menu superior em *Arquivo* -> *Configurações*).
3. Na barra lateral esquerda, clique em **Transmissão**.
4. No campo **Serviço**, mude para **Personalizado...**.
5. Preencha os campos com os seguintes valores:
   - **Servidor**: `rtmp://127.0.0.1:1935/live`
   - **Chave de transmissão**: `stream?token=<RTMP_STREAM_KEY>`
6. Clique em **Aplicar**.

> [!IMPORTANT]
> A chave de transmissão agora possui uma assinatura de segurança (`token`). Caso altere o valor do `RTMP_STREAM_KEY` no arquivo `.env` do projeto, você deverá atualizar este token no OBS também. Deixe a opção *Utilizar autenticação* desmarcada. A API valida o token antes de aceitar a publicação. Não compartilhe nem coloque essa chave em prints ou documentação pública.

---

## Passo 2: Otimizar as Configurações de Vídeo (Recomendado)

Para garantir que a transição entre a sua live e os vídeos gravados seja suave e não cause travamentos no player dos seus espectadores, configure a saída do OBS para **720p (30 FPS)**:

### Ajustar a Saída de Vídeo:
1. Nas **Configurações** do OBS, clique na aba **Saída** na barra lateral.
2. Em *Modo de Saída*, você pode deixar em **Simples**.
3. Configure os valores:
   - **Taxa de Bits do Vídeo (Bitrate)**: `2000 Kbps`
   - **Codificador (Encoder)**: Selecione `Hardware (NVENC)` (se você tiver placa de vídeo Nvidia), `Hardware (QSV/AMF)` ou `Software (x264)` como padrão.
   - **Taxa de Bits do Áudio**: `128 Kbps`

### Ajustar a Resolução:
1. Clique na aba **Vídeo** na barra lateral.
2. Defina os campos:
   - **Resolução de Base (Tela)**: Pode ser a resolução do seu monitor (ex: `1920x1080`).
   - **Resolução de Saída (Escalada)**: Selecione `1280x720` (720p).
   - **Filtro de Redimensionamento**: `Bicúbico` ou `Lanczos`.
   - **Valores Comuns de FPS**: `30` (30 FPS é ideal para estabilidade).
3. Clique em **OK** para salvar e fechar a janela de configurações.

---

## Passo 3: Entrar No Ar (Ao Vivo)

1. Monte sua cena no OBS (adicione sua Webcam, capturas de janela, microfone, imagens, etc.).
2. Quando estiver pronto para transmitir, clique no botão **Iniciar Transmissão** no canto inferior direito do OBS.
3. Fique de olho no site da sua TV no navegador (`http://localhost:8082`):
   - Em até **5 a 10 segundos** (o tempo padrão que o Nginx leva para gerar os fragmentos HLS iniciais), o site detectará a transmissão.
   - O player recarregará automaticamente exibindo a sua live do OBS.
   - O selo no topo da página mudará de **PROGRAMAÇÃO** (verde) para **AO VIVO** (vermelho piscando).
   - O banner de sobreposição do player exibirá **"Transmissão ao Vivo Iniciada"**.

---

## Passo 4: Encerrar a Transmissão e Voltar para os Vídeos

1. Quando terminar de fazer a sua live, basta clicar no botão **Interromper Transmissão** no OBS.
2. O site da TV Carlos detectará que a live caiu:
   - O player alternará de forma automática de volta para a programação gravada em loop (`video1`, `video2`, etc.).
   - O selo mudará de volta para **PROGRAMAÇÃO** (verde).
   - A grade de programação voltará ao estado normal.

---

## Solução de Problemas Comuns

* **O player ficou girando o carregador infinitamente ao iniciar a live:**
  - Isso é normal nos primeiros segundos enquanto o Nginx cria os arquivos do fluxo. Aguarde cerca de 10 segundos. Se demorar muito, recarregue a página uma vez.
* **O OBS dá erro ao tentar conectar:**
  - Verifique se os containers do Docker estão de fato rodando (`docker compose ps`).
  - Verifique se o endereço `rtmp://localhost:1935/live` está escrito exatamente assim, sem barras adicionais no final.
  - Confirme que a chave contém `stream?token=` seguida do token correto.

## Uso remoto/produção

A configuração Docker vincula RTMP somente a `127.0.0.1`. Para transmitir de outra máquina, use uma VPN privada ou um ingress RTMPS com firewall e rotação de credenciais. Não exponha a porta 1935 diretamente à internet.
