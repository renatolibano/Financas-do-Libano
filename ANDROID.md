# App Android (APK) do Libano

O app Android é o mesmo código do site, empacotado com o Capacitor (pasta `android/`).
O APK é gerado **no GitHub** (Actions), publicado em **Releases**, e a página `/baixar.html` do seu site aponta para ele.

## Configurar (uma vez só)

1. **Repositório:** edite `public/app-config.json` e troque `SEU-USUARIO/SEU-REPOSITORIO` pelo seu (ex.: `renato/libano`). O repositório precisa ser **público** para a página de download e o aviso de atualização enxergarem a versão.
2. **Chave de assinatura:** abra o arquivo `SEGREDOS-GITHUB.txt` (vem no zip `Libano-chave-assinatura`) e cadastre os 4 itens em *Settings > Secrets and variables > Actions > New repository secret*.
   - Não coloque `libano.p12` nem `SEGREDOS-GITHUB.txt` no repositório. Guarde-os num lugar seguro: sem a chave não dá para publicar atualizações.
3. Suba o projeto para o GitHub (push) como de costume. Isso também atualiza o site com a página `/baixar.html`.

## Publicar uma versão

- Pelo GitHub: aba **Releases > Draft a new release**, crie a tag `v1.0.0` e clique em **Publish release**.
- Ou pelo terminal: `git tag v1.0.0 && git push origin v1.0.0`.

Em cerca de 5 a 10 minutos a aba **Actions** termina e o `libano.apk` aparece na release. A partir daí:

- Página de download: `https://libanoapp.pages.dev/baixar.html`
- Link direto sempre da última versão: `https://github.com/SEU-USUARIO/SEU-REPOSITORIO/releases/latest/download/libano.apk`

Para atualizar o app depois, publique uma tag maior (`v1.0.1`, `v1.1.0`...). Quem já tem o app instalado vê um aviso "Nova versão disponível" e baixa por ali. A chave tem que ser a mesma, senão o Android recusa a atualização.

Teste sem publicar: aba **Actions > Gerar APK Android > Run workflow**. O APK fica em "Artifacts" no fim da execução.

## O que funciona diferente no app

- **Notificações:** lembretes com hora (inclusive recorrentes) são agendados no próprio Android e tocam com o app fechado. Na primeira vez o Android pede permissão.
- **Audiolivros:** tocam com a tela apagada e têm controles na notificação.
- **Atualização:** o app confere a última release ao abrir.
- **Redefinir senha:** o link do e-mail abre o site (`https://libanoapp.pages.dev`), não o app.

## Limitações conhecidas

- Downloads de arquivos feitos pelo app (backup, exportar documento, Baixador) usam o mecanismo do navegador e **não funcionam dentro do WebView do Android**. Para isso, use o site no navegador do celular.
- Login/conexão com Strava e links de convite usam o endereço do site.
- Não há versão para iPhone (continue usando o PWA).

## Rodar localmente (opcional)

`npm run build:android` gera o build e copia para `android/`. Para compilar o APK na sua máquina é preciso Android Studio (ou JDK 17 + Android SDK). Pelo GitHub não precisa de nada disso.
