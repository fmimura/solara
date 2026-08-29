-- =============================================================
-- Solara OS — Motor (SPEC secao 3)
-- Cole no Supabase: SQL Editor -> New query -> Run
-- =============================================================

-- -------------------------------------------------------------
-- 3.1  execucoes_agentes
-- -------------------------------------------------------------
create table if not exists public.execucoes_agentes (
  id              uuid primary key default gen_random_uuid(),
  area            text not null,                 -- vendas | financeiro
  item_tipo       text not null,                 -- pedido | divergencia
  item_id         text not null,                 -- cod_pedido ou id da divergencia
  agente          text not null,                 -- orquestrador | triador | pesquisador | redator | revisor | investigador | consolidador
  chamado_por     uuid references public.execucoes_agentes(id) on delete set null,
  status          text not null default 'rodando', -- rodando | ok | erro
  entrada         jsonb,
  saida           jsonb,
  erro            text,
  tokens_entrada  int,
  tokens_saida    int,
  inicio          timestamptz not null default now(),
  fim             timestamptz
);

create index if not exists idx_execucoes_item        on public.execucoes_agentes (item_id);
create index if not exists idx_execucoes_area_item   on public.execucoes_agentes (area, item_id);
create index if not exists idx_execucoes_chamado_por on public.execucoes_agentes (chamado_por);

-- -------------------------------------------------------------
-- 3.4  aprovacoes
-- -------------------------------------------------------------
create table if not exists public.aprovacoes (
  id            uuid primary key default gen_random_uuid(),
  area          text not null,                   -- vendas | financeiro
  item_tipo     text not null,                   -- pedido | divergencia
  item_id       text not null,
  titulo        text not null,                   -- resumo em uma linha
  proposta      jsonb,                           -- resposta ao cliente ou hipotese de conciliacao
  status        text not null default 'pendente',-- pendente | aprovada | editada | rejeitada
  decidido_por  uuid references public.perfis(id) on delete set null,
  decidido_em   timestamptz,
  observacao    text,
  criado_em     timestamptz not null default now()
);

create index if not exists idx_aprovacoes_area_status on public.aprovacoes (area, status);
create index if not exists idx_aprovacoes_item        on public.aprovacoes (item_id);

-- -------------------------------------------------------------
-- RLS
-- Escrita (insert/update) das execucoes e criacao de aprovacoes
-- e feita no servidor com a service role, que ignora RLS.
-- O browser so precisa de leitura das execucoes e de leitura +
-- decisao (update) das aprovacoes.
-- -------------------------------------------------------------
alter table public.execucoes_agentes enable row level security;
alter table public.aprovacoes        enable row level security;

drop policy if exists "execucoes: leitura autenticada" on public.execucoes_agentes;
create policy "execucoes: leitura autenticada"
  on public.execucoes_agentes for select
  to authenticated using (true);

drop policy if exists "aprovacoes: leitura autenticada" on public.aprovacoes;
create policy "aprovacoes: leitura autenticada"
  on public.aprovacoes for select
  to authenticated using (true);

drop policy if exists "aprovacoes: decisao autenticada" on public.aprovacoes;
create policy "aprovacoes: decisao autenticada"
  on public.aprovacoes for update
  to authenticated using (true) with check (true);

-- -------------------------------------------------------------
-- Realtime
-- Organograma assina execucoes_agentes; a fila assina aprovacoes.
-- REPLICA IDENTITY FULL garante que os eventos de UPDATE/DELETE
-- carreguem a linha inteira (o Organograma depende do UPDATE
-- rodando -> ok e da saida do revisor).
-- -------------------------------------------------------------
alter table public.execucoes_agentes replica identity full;
alter table public.aprovacoes        replica identity full;

alter publication supabase_realtime add table public.execucoes_agentes;
alter publication supabase_realtime add table public.aprovacoes;

-- =============================================================
-- OPCIONAL — policies de leitura em perfis
-- Rode este bloco somente se a tabela perfis ainda nao tiver
-- policy de SELECT. O menu de areas (/) le o proprio perfil pelo
-- cliente do browser; sem isso os cartoes de area nao aparecem.
-- =============================================================
-- alter table public.perfis enable row level security;
--
-- drop policy if exists "perfis: le o proprio" on public.perfis;
-- create policy "perfis: le o proprio"
--   on public.perfis for select
--   to authenticated using (id = auth.uid());
--
-- drop policy if exists "perfis: admin le todos" on public.perfis;
-- create policy "perfis: admin le todos"
--   on public.perfis for select
--   to authenticated using (
--     exists (select 1 from public.perfis p where p.id = auth.uid() and p.papel = 'admin')
--   );
