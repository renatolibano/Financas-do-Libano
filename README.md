# Libano — protótipo

Dashboard financeiro pessoal + organização de vida.

## Rodar no PC

1. Instale Node.js 20+.
2. Abra esta pasta no terminal.
3. Rode `npm install`.
4. Rode `npm run dev`.
5. Abra o endereço mostrado pelo Vite.

Sem nenhuma configuração extra, o app funciona em **modo local**: os dados ficam salvos só neste navegador/dispositivo (via `localStorage`). Para sincronizar entre celular e PC, siga o passo a passo abaixo.

## Ativar sincronização entre dispositivos (Supabase)

O app já vem pronto para usar o [Supabase](https://supabase.com) (gratuito) como backend. Enquanto você não configurar, ele continua funcionando 100% localmente — nada quebra.

1. Crie uma conta em supabase.com e um novo projeto (gratuito).
2. No painel do projeto, vá em **SQL Editor**, cole o conteúdo do arquivo `schema.sql` (na raiz deste projeto) e clique em **Run**. Isso cria as tabelas e as regras de segurança (cada pessoa só vê seus próprios dados). *Se você já tinha configurado a sincronização antes, rode o `schema.sql` de novo — ele é seguro de rodar mais de uma vez e vai criar a nova tabela `books` (usada pela aba Livros).*
3. Vá em **Project Settings → API** e copie a **Project URL** e a **anon public key**.
4. Nesta pasta, copie `.env.example` para um novo arquivo chamado `.env` e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
   ```
5. Rode `npm install` de novo (para instalar o pacote `@supabase/supabase-js`) e depois `npm run dev`.
6. Agora o app vai pedir para criar uma conta (e-mail + senha). Crie a mesma conta no celular e no PC — os dados aparecem sincronizados nos dois.

Por padrão, o Supabase pede confirmação por e-mail ao criar conta. Se quiser testar mais rápido, você pode desativar isso em **Authentication → Providers → Email → Confirm email** (desligue), só para desenvolvimento.

## Ativar a IA real

A análise de gastos por IA roda em uma Supabase Edge Function (`supabase/functions/ai-insights`), que chama a API da Anthropic (Claude) com sua própria chave, guardada **só no servidor** — nunca no navegador. Isso exige que a sincronização (passo acima) já esteja configurada.

1. Instale a CLI do Supabase: `npm install -g supabase` (ou veja outras opções em supabase.com/docs/guides/cli).
2. Faça login e associe este projeto ao seu projeto Supabase:
   ```
   supabase login
   supabase link --project-ref SEU-PROJECT-REF
   ```
   (o `project-ref` aparece na URL do painel do Supabase, ex.: `abcdefghijk`)
3. Pegue uma chave de API em console.anthropic.com (aba API Keys).
4. Configure a chave como segredo do projeto (fica só no servidor):
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-sua-chave
   ```
5. Publique a função:
   ```
   supabase functions deploy ai-insights
   ```
6. Pronto — no app, entre logado e clique em "Perguntar à IA" na Visão Geral. O botão de IA só funciona com sincronização ativa (a função exige login).

## O que já funciona

- Dashboard visual responsivo.
- Visão geral de saldo, entradas, gastos e cartão.
- Movimentações com inclusão e exclusão.
- Pagamentos fixos, com adicionar/excluir.
- Dívidas, com adicionar/excluir e registro de pagamentos.
- Cartão/fatura, com compras por categoria editáveis.
- Menu lateral retrátil, organizado em: Finanças (Visão Geral, Movimentações, Pagamentos Fixos, Dívidas, Cartões), Lembretes (comuns e aniversários), Quero fazer e Livros (lidos e para ler). No PC ele expande ao passar o mouse; no celular, ao tocar na setinha.
- Lembretes, com adicionar/excluir, separados em "comuns" e "aniversários".
- Lista "Quero fazer", com adicionar/marcar/excluir.
- Livros, com adicionar/excluir e mover entre "já li" e "quero ler".
- Dados salvos localmente (funciona offline).
- Sincronização real entre dispositivos via Supabase (login por e-mail/senha), quando configurado.
- Análise de gastos por IA real (Claude, via Supabase Edge Function), quando configurada.
- Layout adaptado para celular e PC.

## Próximas etapas para produção

Transforme o projeto em PWA e publique o frontend em um host como Vercel/Cloudflare Pages.
