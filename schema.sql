-- Libano — schema do Supabase
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase e clique em "Run".
-- Cria uma tabela por seção do app, todas protegidas por Row Level Security (RLS)
-- para que cada pessoa só veja e edite os próprios dados.

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  "desc" text not null,
  cat text,
  value numeric not null,
  type text not null check (type in ('in','out')),
  date text,
  created_at timestamptz not null default now()
);

create table if not exists fixed_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  value numeric not null,
  day int not null check (day between 1 and 31),
  created_at timestamptz not null default now()
);

create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  total numeric not null,
  paid numeric not null default 0,
  next text,
  created_at timestamptz not null default now()
);

create table if not exists card_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cat text not null,
  value numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date text,
  kind text,
  created_at timestamptz not null default now()
);

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text,
  status text not null check (status in ('lido','quero_ler')),
  created_at timestamptz not null default now()
);

-- Atualização: aba Notas (estilo Samsung Notes)
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text,
  created_at timestamptz not null default now()
);

-- Ativa RLS em todas as tabelas
alter table transactions enable row level security;
alter table fixed_payments enable row level security;
alter table debts enable row level security;
alter table card_purchases enable row level security;
alter table reminders enable row level security;
alter table todos enable row level security;
alter table books enable row level security;
alter table notes enable row level security;

-- Atualização: estante de PDFs
-- Adiciona as colunas usadas pelo leitor (arquivo, total de páginas, página atual)
-- e cria o bucket de armazenamento privado onde os PDFs ficam guardados.
alter table books add column if not exists file_path text;
alter table books add column if not exists total_pages int;
alter table books add column if not exists current_page int not null default 1;

-- Atualização: anotações por livro (aba Livros)
-- Cada livro passa a ter seu próprio campo de notas, editado ao lado do PDF no leitor.
alter table books add column if not exists notes text;

-- Atualização: ordem manual (arrastar e soltar) para livros e notas
alter table books add column if not exists sort_order int;
alter table notes add column if not exists sort_order int;

-- Atualização: leitor de livros ganha zoom, busca, tela cheia, modo escuro e
-- páginas favoritas/importantes (mesmas ferramentas do Leitor de PDF de estudo)
alter table books add column if not exists favorite_pages int[] not null default '{}';
alter table books add column if not exists important_pages int[] not null default '{}';

insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;

drop policy if exists "select_own_book_files" on storage.objects;
drop policy if exists "insert_own_book_files" on storage.objects;
drop policy if exists "update_own_book_files" on storage.objects;
drop policy if exists "delete_own_book_files" on storage.objects;

create policy "select_own_book_files" on storage.objects for select
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "insert_own_book_files" on storage.objects for insert
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "update_own_book_files" on storage.objects for update
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete_own_book_files" on storage.objects for delete
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
-- Uma política por tabela: cada usuário só acessa suas próprias linhas
-- (idempotente — pode rodar este script mais de uma vez sem erro)
do $$
declare
  t text;
begin
  foreach t in array array['transactions','fixed_payments','debts','card_purchases','reminders','todos','books','notes']
  loop
    execute format('drop policy if exists "select_own_%1$s" on %1$s', t);
    execute format('drop policy if exists "insert_own_%1$s" on %1$s', t);
    execute format('drop policy if exists "update_own_%1$s" on %1$s', t);
    execute format('drop policy if exists "delete_own_%1$s" on %1$s', t);
    execute format('create policy "select_own_%1$s" on %1$s for select using (auth.uid() = user_id)', t);
    execute format('create policy "insert_own_%1$s" on %1$s for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "update_own_%1$s" on %1$s for update using (auth.uid() = user_id)', t);
    execute format('create policy "delete_own_%1$s" on %1$s for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

-- Novos recursos: orçamento, metas e pagamentos recorrentes
create table if not exists budgets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  cat text not null, limit_value numeric not null default 0, created_at timestamptz not null default now()
);
alter table budgets add column if not exists limit_value numeric not null default 0;
create table if not exists goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, target numeric not null, saved numeric not null default 0, created_at timestamptz not null default now()
);
create table if not exists recurring_payments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, value numeric not null, cat text, day int not null check(day between 1 and 31), type text not null default 'out' check(type in ('in','out')), active boolean not null default true, created_at timestamptz not null default now()
);
-- Área de Estudos: Metas
create table if not exists study_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  icon text not null default 'target',
  color text not null default 'red',
  mode text not null default 'percent' check (mode in ('percent','count')),
  percent numeric not null default 0,
  current_value numeric not null default 0,
  target_value numeric not null default 0,
  unit text,
  due_date date,
  status text not null default 'andamento' check (status in ('andamento','concluida','pausada')),
  created_at timestamptz not null default now()
);
alter table study_goals enable row level security;

alter table budgets enable row level security;
alter table goals enable row level security;
alter table recurring_payments enable row level security;
do $$ declare t text; begin foreach t in array array['budgets','goals','recurring_payments','study_goals'] loop
 execute format('drop policy if exists "select_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "insert_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "update_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "delete_own_%1$s" on %1$s',t);
 execute format('create policy "select_own_%1$s" on %1$s for select using(auth.uid()=user_id)',t);
 execute format('create policy "insert_own_%1$s" on %1$s for insert with check(auth.uid()=user_id)',t);
 execute format('create policy "update_own_%1$s" on %1$s for update using(auth.uid()=user_id)',t);
 execute format('create policy "delete_own_%1$s" on %1$s for delete using(auth.uid()=user_id)',t);
end loop; end $$;

-- Área de Estudos: Leitor de PDF
-- Estante própria de PDFs de estudo (separada da estante de "Livros"), com
-- página atual (salva automaticamente), páginas favoritas e páginas marcadas como importantes.
create table if not exists study_pdfs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_path text,
  total_pages int,
  current_page int not null default 1,
  favorite_pages int[] not null default '{}',
  important_pages int[] not null default '{}',
  sort_order int,
  created_at timestamptz not null default now()
);
alter table study_pdfs enable row level security;

-- Atualização: Ferramentas de estudo (selecionar texto no PDF)
-- Trechos destacados e trechos favoritados, cada um com a página e o texto selecionado.
alter table study_pdfs add column if not exists highlights jsonb not null default '[]'::jsonb;
alter table study_pdfs add column if not exists favorite_excerpts jsonb not null default '[]'::jsonb;

-- Atualização: Anotações no Leitor de PDF da Área de Estudos (mesmo conceito já usado em "Livros")
alter table study_pdfs add column if not exists notes text;

-- Atualização: Modo Caneta — desenhos/marcações à mão livre por cima do PDF,
-- guardados como uma camada separada (o arquivo original nunca é alterado).
-- Formato: { "<numero_da_pagina>": [ {id, type, ...}, ... ] }
alter table study_pdfs add column if not exists drawings jsonb not null default '{}'::jsonb;

-- Atualização: Fundo usado nas páginas de PDFs criados pelo usuário.
-- PDFs enviados/importados usam branco por padrão no leitor.
alter table study_pdfs add column if not exists bg_color text not null default 'white' check (bg_color in ('white','black'));

-- Atualização: Metas vinculadas a um PDF (Área de Estudos ou Livros)
-- Quando vinculada, o progresso da meta é atualizado automaticamente conforme a leitura avança.
alter table study_goals add column if not exists link_source text not null default 'none' check (link_source in ('none','estudo','livro'));
alter table study_goals add column if not exists link_pdf_id uuid;
alter table study_goals add column if not exists link_page_start int;
alter table study_goals add column if not exists link_page_end int;

-- Atualização: Grupos (pastas) para organizar os PDFs de estudo, ex.: "Matemática", "Física"
create table if not exists study_pdf_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int,
  created_at timestamptz not null default now()
);
alter table study_pdf_groups enable row level security;
alter table study_pdfs add column if not exists group_id uuid references study_pdf_groups(id) on delete set null;

-- Atualização: foto de capa personalizada para cada pasta (salva como imagem em base64)
alter table study_pdf_groups add column if not exists cover_image text;

-- Flashcards criados a partir de um trecho selecionado no Leitor de PDF (ou manualmente, no futuro)
create table if not exists study_flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null,
  back text,
  source_title text,
  source_page int,
  created_at timestamptz not null default now()
);
alter table study_flashcards enable row level security;

-- Atualização: Listas de flashcards criadas manualmente na aba Flashcards (estilo "Quizlet"),
-- organizadas em pastas, com cartões de termo/definição e modos de estudo (cartões, aprender, combinar)
create table if not exists study_flashcard_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int,
  created_at timestamptz not null default now()
);
alter table study_flashcard_folders enable row level security;

create table if not exists study_flashcard_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  folder_id uuid references study_flashcard_folders(id) on delete set null,
  cards jsonb not null default '[]'::jsonb,
  sort_order int,
  created_at timestamptz not null default now()
);
alter table study_flashcard_lists enable row level security;

insert into storage.buckets (id, name, public)
values ('study_pdfs', 'study_pdfs', false)
on conflict (id) do nothing;

drop policy if exists "select_own_study_pdf_files" on storage.objects;
drop policy if exists "insert_own_study_pdf_files" on storage.objects;
drop policy if exists "update_own_study_pdf_files" on storage.objects;
drop policy if exists "delete_own_study_pdf_files" on storage.objects;

create policy "select_own_study_pdf_files" on storage.objects for select
  using (bucket_id = 'study_pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "insert_own_study_pdf_files" on storage.objects for insert
  with check (bucket_id = 'study_pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "update_own_study_pdf_files" on storage.objects for update
  using (bucket_id = 'study_pdfs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete_own_study_pdf_files" on storage.objects for delete
  using (bucket_id = 'study_pdfs' and (storage.foldername(name))[1] = auth.uid()::text);

do $$ declare t text; begin foreach t in array array['study_pdfs','study_flashcards','study_pdf_groups','study_flashcard_folders','study_flashcard_lists'] loop
 execute format('drop policy if exists "select_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "insert_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "update_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "delete_own_%1$s" on %1$s',t);
 execute format('create policy "select_own_%1$s" on %1$s for select using(auth.uid()=user_id)',t);
 execute format('create policy "insert_own_%1$s" on %1$s for insert with check(auth.uid()=user_id)',t);
 execute format('create policy "update_own_%1$s" on %1$s for update using(auth.uid()=user_id)',t);
 execute format('create policy "delete_own_%1$s" on %1$s for delete using(auth.uid()=user_id)',t);
end loop; end $$;

-- Atualização: Metas vinculadas a Flashcards ("Fazer os flashcards 'Lista 1' 'Lista 2'").
-- Cada lista marca sozinha "completed=true" assim que é estudada até o fim (em qualquer modo),
-- e a meta soma quantas das listas vinculadas (link_list_ids) já estão concluídas.
alter table study_flashcard_lists add column if not exists completed boolean not null default false;
alter table study_goals add column if not exists link_list_ids uuid[];
alter table study_goals drop constraint if exists study_goals_link_source_check;
alter table study_goals add constraint study_goals_link_source_check check (link_source in ('none','estudo','livro','flashcards'));

-- Área de Lazer: Treino (treinos personalizados em pastas, com exercícios em séries e GIF de referência)
create table if not exists workout_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  cover_image text,
  sort_order int,
  created_at timestamptz not null default now()
);
alter table workout_folders enable row level security;

create table if not exists workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references workout_folders(id) on delete cascade,
  name text not null,
  mode text not null default 'reps' check (mode in ('reps','tempo')),
  sets int not null default 1,
  value numeric not null default 0,
  gif_url text,
  sort_order int,
  created_at timestamptz not null default now()
);
alter table workout_exercises enable row level security;

do $$ declare t text; begin foreach t in array array['workout_folders','workout_exercises'] loop
 execute format('drop policy if exists "select_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "insert_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "update_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "delete_own_%1$s" on %1$s',t);
 execute format('create policy "select_own_%1$s" on %1$s for select using(auth.uid()=user_id)',t);
 execute format('create policy "insert_own_%1$s" on %1$s for insert with check(auth.uid()=user_id)',t);
 execute format('create policy "update_own_%1$s" on %1$s for update using(auth.uid()=user_id)',t);
 execute format('create policy "delete_own_%1$s" on %1$s for delete using(auth.uid()=user_id)',t);
end loop; end $$;

-- Finanças: Lista de compras (itens com foto, preço e link para a loja)
create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price numeric,
  link text,
  photo text,
  sort_order int,
  created_at timestamptz not null default now()
);
alter table shopping_items enable row level security;

do $$ declare t text; begin foreach t in array array['shopping_items'] loop
 execute format('drop policy if exists "select_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "insert_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "update_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "delete_own_%1$s" on %1$s',t);
 execute format('create policy "select_own_%1$s" on %1$s for select using(auth.uid()=user_id)',t);
 execute format('create policy "insert_own_%1$s" on %1$s for insert with check(auth.uid()=user_id)',t);
 execute format('create policy "update_own_%1$s" on %1$s for update using(auth.uid()=user_id)',t);
 execute format('create policy "delete_own_%1$s" on %1$s for delete using(auth.uid()=user_id)',t);
end loop; end $$;

-- Atualização: descanso entre séries de cada exercício do Treino (em segundos)
alter table workout_exercises add column if not exists rest_seconds int not null default 0;

-- Integração bancária via Pluggy (Open Finance)
-- Guarda a conexão (item) de cada banco ligado pelo usuário.
create table if not exists bank_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null unique,
  institution_name text,
  status text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
alter table bank_connections enable row level security;

do $$ declare t text; begin foreach t in array array['bank_connections'] loop
 execute format('drop policy if exists "select_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "insert_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "update_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "delete_own_%1$s" on %1$s',t);
 execute format('create policy "select_own_%1$s" on %1$s for select using(auth.uid()=user_id)',t);
 execute format('create policy "insert_own_%1$s" on %1$s for insert with check(auth.uid()=user_id)',t);
 execute format('create policy "update_own_%1$s" on %1$s for update using(auth.uid()=user_id)',t);
 execute format('create policy "delete_own_%1$s" on %1$s for delete using(auth.uid()=user_id)',t);
end loop; end $$;

-- Marca de onde veio cada movimentação, e o id da transação na Pluggy
-- (evita duplicar a mesma movimentação importada em mais de uma sincronização).
alter table transactions add column if not exists source text not null default 'manual' check (source in ('manual','pluggy'));
alter table transactions add column if not exists pluggy_transaction_id text;
alter table transactions add column if not exists bank_connection_id uuid references bank_connections(id) on delete set null;
-- unique (não parcial): no Postgres, colunas NULL nunca conflitam entre si numa
-- constraint unique, então as movimentações manuais (sem pluggy_transaction_id)
-- continuam livres — só transações importadas duplicadas são bloqueadas.
alter table transactions drop constraint if exists transactions_pluggy_transaction_id_key;
alter table transactions add constraint transactions_pluggy_transaction_id_key unique (pluggy_transaction_id);

-- Área de Lazer: Filmes e Séries (o que a pessoa quer ver, está vendo ou já viu,
-- com progresso de episódios/temporadas e franquias/universos agrupados em pastas)
create table if not exists media_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('filme','serie')),
  cover_image text,
  sort_order int,
  created_at timestamptz not null default now()
);
alter table media_groups enable row level security;

create table if not exists media_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid references media_groups(id) on delete cascade,
  kind text not null check (kind in ('filme','serie')),
  title text not null,
  link text,
  status text not null default 'quero_ver' check (status in ('quero_ver','assistindo','concluido')),
  has_seasons boolean not null default false,
  total_episodes int not null default 0,
  current_episode int not null default 0,
  current_season int not null default 1,
  seasons jsonb not null default '[]'::jsonb,
  sort_order int,
  created_at timestamptz not null default now()
);
alter table media_items enable row level security;

do $$ declare t text; begin foreach t in array array['media_groups','media_items'] loop
 execute format('drop policy if exists "select_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "insert_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "update_own_%1$s" on %1$s',t);
 execute format('drop policy if exists "delete_own_%1$s" on %1$s',t);
 execute format('create policy "select_own_%1$s" on %1$s for select using(auth.uid()=user_id)',t);
 execute format('create policy "insert_own_%1$s" on %1$s for insert with check(auth.uid()=user_id)',t);
 execute format('create policy "update_own_%1$s" on %1$s for update using(auth.uid()=user_id)',t);
 execute format('create policy "delete_own_%1$s" on %1$s for delete using(auth.uid()=user_id)',t);
end loop; end $$;
