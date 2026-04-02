-- Mis Finanzas: Schema Supabase
-- Ejecuta este script en el SQL Editor de tu proyecto

create table if not exists accounts (
  id            text primary key,
  name          text not null,
  type          text not null,
  balance       numeric default 0,
  color         text,
  "creditLimit" numeric,
  "cutoffDay"   integer,
  "paymentDay"  integer
);

create table if not exists transactions (
  id              text primary key,
  date            text,
  type            text,
  amount          numeric default 0,
  "accountId"     text,
  "toAccountId"   text,
  category        text,
  description     text,
  nota            text,
  "installmentId" text
);

create table if not exists installments (
  id              text primary key,
  description     text,
  "totalAmount"   numeric default 0,
  months          integer default 12,
  "monthlyAmount" numeric default 0,
  "accountId"     text,
  "startMonth"    text,
  nota            text,
  archived        boolean default false
);

create table if not exists loans (
  id               text primary key,
  "personName"     text,
  amount           numeric default 0,
  "fromAccountId"  text,
  date             text,
  "dueDate"        text,
  description      text,
  note             text,
  payments         jsonb default '[]'::jsonb,
  "createdAt"      text
);

create table if not exists settings (
  key   text primary key,
  value jsonb
);

alter table accounts     enable row level security;
alter table transactions enable row level security;
alter table installments enable row level security;
alter table loans        enable row level security;
alter table settings     enable row level security;

create policy "anon_all" on accounts     for all to anon using (true) with check (true);
create policy "anon_all" on transactions for all to anon using (true) with check (true);
create policy "anon_all" on installments for all to anon using (true) with check (true);
create policy "anon_all" on loans        for all to anon using (true) with check (true);
create policy "anon_all" on settings     for all to anon using (true) with check (true);
