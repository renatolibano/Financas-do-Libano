-- Libano — schema do Supabase
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase e clique em "Run".
-- Cria uma tabela por seção do app, todas protegidas por Row Level Security (RLS)
-- para que cada pessoa só veja e edite os próprios dados.

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  desc text not null,
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

-- Ativa RLS em todas as tabelas
alter table transactions enable row level security;
alter table fixed_payments enable row level security;
alter table debts enable row level security;
alter table card_purchases enable row level security;
alter table reminders enable row level security;
alter table todos enable row level security;
alter table books enable row level security;

-- Uma política por tabela: cada usuário só acessa suas próprias linhas
-- (idempotente — pode rodar este script mais de uma vez sem erro)
do $$
declare
  t text;
begin
  foreach t in array array['transactions','fixed_payments','debts','card_purchases','reminders','todos','books']
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
