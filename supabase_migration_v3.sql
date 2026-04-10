-- Migración v3: columna initialBalance en accounts
-- Ejecuta en: Supabase → SQL Editor
alter table accounts add column if not exists "initialBalance" numeric default 0;
