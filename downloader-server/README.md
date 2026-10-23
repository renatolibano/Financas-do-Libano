# Servidor do Baixador

Pequeno servidor (Python + yt-dlp + ffmpeg) que a aba **Baixador** do app usa para ler links de vídeo e gerar os arquivos
MP4/MP3. Ele precisa rodar em algum lugar; o app só mostra a tela e conversa com ele.

## Opção 1: no seu computador (a mais simples)

1. Instale o Python 3.10+ e o ffmpeg (no Windows: `winget install ffmpeg`).
2. Nesta pasta:
   ```
   pip install -r requirements.txt
   uvicorn app:app --host 0.0.0.0 --port 8000
   ```
3. No app, aba **Baixador** → **Configurar servidor** → endereço `http://localhost:8000` (no mesmo computador).
   Para usar do celular, no mesmo Wi-Fi: `http://IP-DO-SEU-PC:8000`.

> Se o app estiver em `https://`, o navegador só aceita falar com um servidor também em `https://`
> (exceto `localhost`). Para usar de qualquer lugar, use a opção 2 ou um túnel (Cloudflare Tunnel / Tailscale Funnel).

## Opção 2: na nuvem (Docker)

A pasta já tem `Dockerfile`. Funciona em Render, Railway, Fly.io ou numa VPS:

```
docker build -t libano-baixador .
docker run -p 8000:8000 -e API_KEY=uma-chave-secreta -e ALLOWED_ORIGINS=https://SEU-APP.com libano-baixador
```

Depois coloque o endereço `https://...` e a mesma chave em **Configurar servidor** no app.

## Variáveis de ambiente

| Variável | Para que serve | Padrão |
|---|---|---|
| `API_KEY` | Chave que o app envia. **Defina sempre** se o servidor ficar na internet. | vazio (sem chave) |
| `ALLOWED_ORIGINS` | Endereço(s) do app permitidos, separados por vírgula. | `*` |
| `MAX_DURATION_MIN` | Duração máxima de um vídeo, em minutos. | `180` |
| `MAX_PARALLEL` | Downloads ao mesmo tempo. | `2` |
| `JOB_TTL_MIN` | Por quantos minutos o arquivo pronto fica disponível. | `30` |
| `COOKIES_FILE` | Caminho de um `cookies.txt` (opcional). | vazio |

## Observações

- **YouTube em servidor na nuvem:** o YouTube costuma bloquear IPs de datacenter ("confirme que você não é um robô").
  Rodando no seu PC/casa isso quase nunca acontece. Na nuvem, exporte os cookies do seu navegador
  (extensão "Get cookies.txt LOCALLY"), salve como `cookies.txt` e aponte `COOKIES_FILE`.
- **Mantenha o yt-dlp atualizado** (os sites mudam o tempo todo): `pip install -U yt-dlp` ou refaça o build do Docker.
- Use apenas para conteúdo que você tem o direito de baixar. Baixar vídeos de alguns sites (como o YouTube) vai contra os
  termos de uso deles.
- Os arquivos prontos são apagados sozinhos após `JOB_TTL_MIN` minutos.
