-- Seguridad: restringir acceso solo a usuarios autenticados
-- Ejecuta en: Supabase → SQL Editor

-- Crear tabla settings si no existe
create table if not exists settings (
  key   text primary key,
  value jsonb
);

-- Activar RLS en settings (por si no estaba)
alter table settings enable row level security;

-- Eliminar políticas anteriores
drop policy if exists "anon_all" on accounts;
drop policy if exists "anon_all" on transactions;
drop policy if exists "anon_all" on installments;
drop policy if exists "anon_all" on loans;
drop policy if exists "anon_all" on settings;

-- Nuevas políticas: solo usuarios con sesión activa
create policy "auth_only" on accounts     for all to authenticated using (true) with check (true);
create policy "auth_only" on transactions for all to authenticated using (true) with check (true);
create policy "auth_only" on installments for all to authenticated using (true) with check (true);
create policy "auth_only" on loans        for all to authenticated using (true) with check (true);
create policy "auth_only" on settings     for all to authenticated using (true) with check (true);
