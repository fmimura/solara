-- =============================================================
-- Solara OS — Financeiro (SPEC secao 5.1)
-- Cole no Supabase: SQL Editor -> New query -> Run
-- =============================================================

-- -------------------------------------------------------------
-- extratos_importados
-- -------------------------------------------------------------
create table if not exists public.extratos_importados (
  id              uuid primary key default gen_random_uuid(),
  nome_arquivo    text not null,
  importado_em    timestamptz not null default now(),
  importado_por   uuid references public.perfis(id) on delete set null,
  total_linhas    int not null default 0,
  total_creditos  int not null default 0
);

-- -------------------------------------------------------------
-- lancamentos
-- -------------------------------------------------------------
create table if not exists public.lancamentos (
  id                uuid primary key default gen_random_uuid(),
  extrato_id        uuid not null references public.extratos_importados(id) on delete cascade,
  data              date not null,
  descricao         text not null,
  valor             numeric(12,2) not null,
  tipo              text not null,                 -- credito | debito
  cod_titulo_casado text,                           -- null se nao casou
  situacao          text not null default 'divergente' -- casado | divergente | ignorado
);

create index if not exists idx_lancamentos_extrato on public.lancamentos (extrato_id);

-- -------------------------------------------------------------
-- divergencias
-- -------------------------------------------------------------
create table if not exists public.divergencias (
  id               uuid primary key default gen_random_uuid(),
  extrato_id       uuid not null references public.extratos_importados(id) on delete cascade,
  tipo_inicial     text not null,                   -- valor_diferente_mesma_nf | sem_titulo_correspondente | possivel_soma | duplicado | vencido_sem_pagamento
  lancamento_id    uuid references public.lancamentos(id) on delete set null, -- null p/ vencido_sem_pagamento
  cod_titulo       text,                             -- pode ser null
  valor_lancamento numeric(12,2),
  valor_titulo     numeric(12,2),
  status           text not null default 'nova',    -- nova | investigando | aguardando_aprovacao | resolvida
  hipotese         jsonb,
  criado_em        timestamptz not null default now()
);

create index if not exists idx_divergencias_extrato on public.divergencias (extrato_id);
create index if not exists idx_divergencias_status  on public.divergencias (status);

-- -------------------------------------------------------------
-- RLS
-- Mesmo padrao do motor (execucoes_agentes/aprovacoes): escrita
-- (insert/update) e feita no servidor com a service role, que
-- ignora RLS. O browser le as 3 tabelas; so `divergencias` recebe
-- tambem uma policy de update, porque a decisao na fila (SPEC 5.5)
-- atualiza o status dela direto do browser, igual o Vendas faz em
-- `aprovacoes`.
-- -------------------------------------------------------------
alter table public.extratos_importados enable row level security;
alter table public.lancamentos         enable row level security;
alter table public.divergencias        enable row level security;

drop policy if exists "extratos: leitura autenticada" on public.extratos_importados;
create policy "extratos: leitura autenticada"
  on public.extratos_importados for select
  to authenticated using (true);

drop policy if exists "lancamentos: leitura autenticada" on public.lancamentos;
create policy "lancamentos: leitura autenticada"
  on public.lancamentos for select
  to authenticated using (true);

drop policy if exists "divergencias: leitura autenticada" on public.divergencias;
create policy "divergencias: leitura autenticada"
  on public.divergencias for select
  to authenticated using (true);

drop policy if exists "divergencias: decisao autenticada" on public.divergencias;
create policy "divergencias: decisao autenticada"
  on public.divergencias for update
  to authenticated using (true) with check (true);

-- -------------------------------------------------------------
-- Realtime
-- Kanban de divergencias e listas Bateram/Ignorados dependem de
-- Realtime, igual o kanban de pedidos_orcamento em Vendas.
-- -------------------------------------------------------------
alter table public.lancamentos  replica identity full;
alter table public.divergencias replica identity full;

alter publication supabase_realtime add table public.lancamentos;
alter publication supabase_realtime add table public.divergencias;
