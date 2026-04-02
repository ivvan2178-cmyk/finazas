-- Mis Finanzas: Actualizar politicas a autenticacion requerida
-- Ejecuta este script en el SQL Editor de Supabase

-- Eliminar politicas anteriores (acceso anonimo)
drop policy if exists "anon_all" on accounts;
drop policy if exists "anon_all" on transactions;
drop policy if exists "anon_all" on installments;
drop policy if exists "anon_all" on loans;
drop policy if exists "anon_all" on settings;

-- Crear politicas nuevas (solo usuarios con sesion iniciada)
create policy "auth_all" on accounts     for all to authenticated using (true) with check (true);
create policy "auth_all" on transactions for all to authenticated using (true) with check (true);
create policy "auth_all" on installments for all to authenticated using (true) with check (true);
create policy "auth_all" on loans        for all to authenticated using (true) with check (true);
create policy "auth_all" on settings     for all to authenticated using (true) with check (true);
