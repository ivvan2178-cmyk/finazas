-- Migración v2: columnas para plazos MSI, préstamos y movimientos especiales
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase

-- transactions: columnas nuevas
alter table transactions add column if not exists "loanId"        text;
alter table transactions add column if not exists "skipBudget"    boolean default false;
alter table transactions add column if not exists "isDebt"        boolean default false;
alter table transactions add column if not exists "isLoan"        boolean default false;
alter table transactions add column if not exists "isLoanPayment" boolean default false;

-- installments: columnas nuevas
alter table installments add column if not exists "paidMonths" jsonb default '[]'::jsonb;
alter table installments add column if not exists date          text;
