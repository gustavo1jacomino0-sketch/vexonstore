-- New tables only; existing business tables are not modified.
begin;
create table public.vexon_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  request_key uuid not null,
  request_hash text not null check (length(request_hash) = 64),
  total_cents bigint not null check (total_cents between 1 and 10000000),
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  live_mode boolean not null,
  status text not null default 'pending' check (status in ('pending','paid','partially_refunded','refunded','charged_back','review','rejected','cancelled')),
  preference_id text unique,
  checkout_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_key)
);
create index vexon_orders_user_created on public.vexon_orders(user_id, created_at);
create table public.vexon_payments (
  payment_id text primary key,
  order_id uuid not null references public.vexon_orders(id),
  status text not null,
  amount_cents bigint not null check (amount_cents > 0),
  refunded_cents bigint not null check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  provider_updated_at timestamptz not null
);
create index vexon_payments_order on public.vexon_payments(order_id);
alter table public.vexon_orders enable row level security;
alter table public.vexon_payments enable row level security;
revoke all on public.vexon_orders, public.vexon_payments from public, anon, authenticated;
-- Buyers may only read their own order and never mark a sale as paid.
grant select(id,user_id,total_cents,status,live_mode,created_at,updated_at) on public.vexon_orders to authenticated;
create policy vexon_orders_owner on public.vexon_orders for select to authenticated using ((select auth.uid()) = user_id);
grant all on public.vexon_orders, public.vexon_payments to service_role;

create function public.vexon_claim_checkout(p_user uuid, p_key uuid, p_hash text, p_total bigint, p_items jsonb, p_live boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.vexon_orders; n integer;
begin
  -- Serializes claims per user across Edge Function instances.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  select * into o from public.vexon_orders where user_id=p_user and request_key=p_key;
  if found then
    if o.request_hash <> p_hash then return jsonb_build_object('error','conflict'); end if;
    if o.status <> 'pending' or o.created_at < now()-interval '55 minutes' then return jsonb_build_object('error','closed'); end if;
    if o.checkout_url is null then return jsonb_build_object('error','processing'); end if;
    return jsonb_build_object('id',o.id,'checkout_url',o.checkout_url);
  end if;
  select count(*) into n from public.vexon_orders where user_id=p_user and created_at>now()-interval '10 minutes';
  if n >= 5 then return jsonb_build_object('error','rate_limit'); end if;
  insert into public.vexon_orders(user_id,request_key,request_hash,total_cents,items,live_mode)
    values(p_user,p_key,p_hash,p_total,p_items,p_live) returning * into o;
  return jsonb_build_object('id',o.id);
end;
$$;
revoke all on function public.vexon_claim_checkout(uuid,uuid,text,bigint,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.vexon_claim_checkout(uuid,uuid,text,bigint,jsonb,boolean) to service_role;

create function public.vexon_apply_payment(p_order uuid,p_payment text,p_status text,p_updated timestamptz,p_amount bigint,p_refunded bigint,p_live boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.vexon_orders; old_payment public.vexon_payments; next_status text;
begin
  select * into o from public.vexon_orders where id=p_order for update;
  if not found then raise exception 'unknown order'; end if;
  if o.total_cents <> p_amount or o.live_mode <> p_live then raise exception 'payment mismatch'; end if;
  if p_status not in ('pending','in_process','authorized','approved','rejected','cancelled','refunded','charged_back','in_mediation') then raise exception 'invalid status'; end if;
  select * into old_payment from public.vexon_payments where payment_id=p_payment;
  if found then
    if old_payment.order_id <> p_order then raise exception 'payment already assigned'; end if;
    if old_payment.provider_updated_at >= p_updated then return jsonb_build_object('duplicate',true); end if;
  end if;
  insert into public.vexon_payments(payment_id,order_id,status,amount_cents,refunded_cents,provider_updated_at)
    values(p_payment,p_order,p_status,p_amount,p_refunded,p_updated)
    on conflict(payment_id) do update set status=excluded.status,refunded_cents=excluded.refunded_cents,provider_updated_at=excluded.provider_updated_at;
  -- Multiple payment attempts cannot downgrade an approved payment to pending.
  -- Disputes and multiple successful charges require manual review.
  if exists(select 1 from public.vexon_payments where order_id=p_order and status='charged_back') then next_status:='charged_back';
  elsif exists(select 1 from public.vexon_payments where order_id=p_order and status='in_mediation') then next_status:='review';
  elsif (select count(*) from public.vexon_payments where order_id=p_order and status='approved' and refunded_cents<amount_cents)>1 then next_status:='review';
  elsif exists(select 1 from public.vexon_payments where order_id=p_order and status='approved' and refunded_cents=0) then next_status:='paid';
  elsif exists(select 1 from public.vexon_payments where order_id=p_order and status='approved' and refunded_cents<amount_cents) then next_status:='partially_refunded';
  elsif exists(select 1 from public.vexon_payments where order_id=p_order and (status='refunded' or refunded_cents=amount_cents)) then next_status:='refunded';
  elsif exists(select 1 from public.vexon_payments where order_id=p_order and status in ('pending','authorized','in_process')) then next_status:='pending';
  elsif p_status='cancelled' then next_status:='cancelled';
  else next_status:='rejected'; end if;
  update public.vexon_orders set status=next_status,updated_at=now() where id=p_order;
  return jsonb_build_object('status',next_status);
end;
$$;
revoke all on function public.vexon_apply_payment(uuid,text,text,timestamptz,bigint,bigint,boolean) from public,anon,authenticated;
grant execute on function public.vexon_apply_payment(uuid,text,text,timestamptz,bigint,bigint,boolean) to service_role;
commit;
