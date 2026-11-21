-- Apply after wow-schema.sql, finance.sql and chat.sql. All reads enter through verified Edge actors.
begin;
create schema if not exists wow_assist;
revoke all on schema wow_assist from public, anon, authenticated;
insert into public.wow_permission_catalog(permission) values ('assistant.view') on conflict do nothing;

-- Durable request tombstones prevent duplicate provider charges, including after answer expiry.
-- No prompt, search term, message body, name, record content or model prose is stored here.
create table if not exists wow_assist.requests (
  workspace uuid not null references public.wow_workspaces(id),
  actor uuid not null references public.wow_accounts(id),
  request_id uuid not null, session_id uuid not null, epoch bigint not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  mode text not null check (mode in ('search','checks','report','chat')),
  model text not null check (length(model) between 1 and 128),
  state text not null check (state in ('pending','done','failed')),
  lease uuid not null default gen_random_uuid(),
  started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
  input_tokens integer check (input_tokens >= 0), output_tokens integer check (output_tokens >= 0),
  error_code text,
  primary key(workspace,actor,request_id)
);
create index if not exists wow_ai_daily on wow_assist.requests(workspace,started_at);
create index if not exists wow_ai_failures on wow_assist.requests(workspace,finished_at) where state='failed';
create index if not exists wow_ai_pending on wow_assist.requests(started_at) where state='pending';
create table if not exists wow_assist.answers (
  workspace uuid not null, actor uuid not null, request_id uuid not null,
  sealed text not null check (length(sealed) between 36 and 24000),
  expires_at timestamptz not null,
  primary key(workspace,actor,request_id),
  foreign key(workspace,actor,request_id) references wow_assist.requests
);
create index if not exists wow_ai_expiry on wow_assist.answers(expires_at);
alter table wow_assist.requests enable row level security;
alter table wow_assist.answers enable row level security;
revoke all on wow_assist.requests,wow_assist.answers from public,anon,authenticated;

-- Scalar allowlist is applied BEFORE searching or grouping. Arbitrary nested JSON cannot become a match.
create or replace function wow_assist.field(doc jsonb,k text,lim integer) returns text
language sql immutable set search_path='' as $$
  select case when jsonb_typeof(doc->k) in ('string','number')
    then left(btrim(regexp_replace(doc->>k,'[[:cntrl:]]+',' ','g')),lim) else '' end
$$;
create or replace function wow_assist.documents(w uuid,ctx jsonb,mode text,source text,term text)
returns jsonb language sql stable set search_path='' as $$
  with allowed as (
    select case r.store when 'companies' then 'customers' else r.store end kind,r.record_id,
      case r.store when 'invoices' then wow_assist.field(r.payload,'invNo',140)
           else wow_assist.field(r.payload,'name',140) end title,
      case r.store when 'companies' then wow_assist.field(r.payload,'type',80)
        when 'products' then wow_assist.field(r.payload,'type',80)
        when 'invoices' then coalesce(nullif(wow_assist.field(r.payload,'companyName',120),''),wow_assist.field(r.payload,'buyerName',120)) end detail,
      case when r.store='products' and length(r.payload->>'barcode') between 1 and 96
        then wow_assist.field(r.payload,'barcode',96) else '' end barcode
    from public.wow_records r
    where r.workspace_id=w and r.deleted_at is null and r.store in ('companies','products','invoices')
      and (r.payload->'deleted' is distinct from 'true'::jsonb and r.payload->'isDeleted' is distinct from 'true'::jsonb)
      and (source='all' or r.store=case source when 'customers' then 'companies' else source end)
      and wow_fin.can(ctx,(case r.store when 'companies' then 'customers' else r.store end)||'.view')
  ), marked as (
    select d.*, case when mode='checks' and barcode<>'' then count(*) over(partition by kind,barcode) else 0 end shared_code
    from allowed d
  ), candidates as (
    select d.*,item.reason,
      jsonb_build_object('source',d.kind,'record',left(d.record_id#>>'{}',180),'recordType',jsonb_typeof(d.record_id),
        'title',d.title,'detail',d.detail,'barcode',d.barcode,'finding',item.reason) as row
    from marked d cross join lateral unnest(case when mode='search' then array['match']::text[] else array_remove(array[
      case when d.title='' and d.kind='invoices' then 'missingReference' when d.title='' then 'missingName' end,
      case when d.kind='invoices' and d.detail='' then 'missingCustomer' end,
      case when d.kind='products' and d.detail='' then 'missingType' end,
      case when d.shared_code>1 then 'duplicateBarcode' end
    ],null) end) item(reason)
    where mode='checks' or strpos(lower(d.title||' '||d.detail||' '||d.barcode||' '||left(d.record_id#>>'{}',180)),lower(term))>0
  ), page as (
    select row,row_number() over(order by (reason='duplicateBarcode') desc,(lower(title)=lower(term)) desc,kind,title,record_id,reason) n
    from candidates order by (reason='duplicateBarcode') desc,(lower(title)=lower(term)) desc,kind,title,record_id,reason limit 13
  )
  select jsonb_build_object('rows',coalesce(jsonb_agg(row order by n) filter(where n<=12),'[]'::jsonb),'more',count(*)>12) from page
$$;

create or replace function wow_assist.evidence(ctx jsonb,uid uuid,sid uuid,spec jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare
  w uuid=(ctx->>'workspaceId')::uuid; mode text=spec->>'mode'; source text=spec->>'source';
  term text=spec->>'query'; month_start date; feed jsonb; evidence jsonb;
begin
  if mode in ('search','checks') then
    if source is null or source not in ('all','products','invoices','customers') or
       (mode='search' and (term is null or length(btrim(term)) not between 2 and 80)) then
      raise exception using message='INVALID_ASSISTANT_INPUT'; end if;
    if (source<>'all' and not wow_fin.can(ctx,source||'.view')) or
       not (wow_fin.can(ctx,'products.view') or wow_fin.can(ctx,'customers.view') or wow_fin.can(ctx,'invoices.view')) then
      raise exception using message='ACCESS_DENIED'; end if;
    evidence=wow_assist.documents(w,ctx,mode,source,coalesce(term,''));
  elsif mode='report' then
    if not wow_fin.can(ctx,'finance.view') then raise exception using message='ACCESS_DENIED'; end if;
    if coalesce(spec->>'month','') !~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])$' then raise exception using message='INVALID_ASSISTANT_INPUT'; end if;
    month_start=((spec->>'month')||'-01')::date;
    -- Aggregate the authoritative cash projection before pagination. A UI page
    -- of category/box groups is never the total for a whole month.
    select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('source','finance','month',spec->>'month',
      'currency',g.currency,'inflow',g.inflow::text,'outflow',g.outflow::text,'net',g.net::text,
      'entries',g.n::text,'finding',case sign(g.net) when 1 then 'netIn' when -1 then 'netOut' else 'netEven' end) order by g.currency),'[]'::jsonb),'more',false)
      into evidence from (
        select c.currency,coalesce(sum(c.amount) filter(where c.amount>0),0) inflow,
          coalesce(-sum(c.amount) filter(where c.amount<0),0) outflow,sum(c.amount) net,count(*) n
        from wow_fin.cash c where c.workspace=w and c.day>=month_start and c.day<month_start+interval '1 month'
        group by c.currency) g;
  elsif mode='chat' then
    if not wow_fin.can(ctx,'chat.view') then raise exception using message='ACCESS_DENIED'; end if;
    if spec->>'roomId' is null then raise exception using message='INVALID_ASSISTANT_INPUT'; end if;
    -- chat.feed verifies active room membership, per-viewer hide/clear, deletion and expiry.
    feed=public.wow_chat_service('feed',jsonb_build_object('userId',uid,'sessionId',sid,'roomId',spec->>'roomId'));
    with eligible as (
      select m,ord from jsonb_array_elements(feed->'messages') with ordinality msg(m,ord)
      where m->>'event' is null and btrim(coalesce(m->>'text',''))<>''
      order by ord desc limit 13
    ), recent as (select m,ord from eligible order by ord desc limit 12)
    select jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object('source','chat','record',m->>'id',
      'title',wow_assist.field(m,'author',100),'text',wow_assist.field(m,'text',360),'at',m->>'createdAt',
      'expiresAt',m->>'expiresAt','truncated',length(m->>'text')>360,'finding','message') order by ord),'[]'::jsonb),
      'more',(feed->>'more')::boolean or (select count(*)>12 from eligible)) into evidence from recent;
  else raise exception using message='INVALID_ASSISTANT_INPUT'; end if;
  return evidence;
end $$;

create or replace function wow_assist.prune() returns void language plpgsql set search_path='' as $$
begin
  delete from wow_assist.answers a where (a.workspace,a.actor,a.request_id) in
    (select e.workspace,e.actor,e.request_id from wow_assist.answers e where e.expires_at<=clock_timestamp() order by e.expires_at limit 1000 for update skip locked);
  update wow_assist.requests r set state='failed',finished_at=clock_timestamp(),error_code='AI_RESULT_UNAVAILABLE'
    where (r.workspace,r.actor,r.request_id) in (select e.workspace,e.actor,e.request_id from wow_assist.requests e
      where e.state='pending' and e.started_at<=clock_timestamp()-interval '1 minute' order by e.started_at limit 1000 for update skip locked);
end $$;

create or replace function public.wow_assistant_service(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  uid uuid=(p_data->>'userId')::uuid; sid uuid=(p_data->>'sessionId')::uuid; w uuid; ctx jsonb; spec jsonb=p_data->'spec';
  rid uuid=(p_data->>'requestId')::uuid; existing wow_assist.requests;
  h text=p_data->>'requestHash'; eh text; evidence jsonb; packet jsonb; cached text;
  utc_start timestamptz=date_trunc('day',clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  model_id text=p_data->>'model'; tok_in integer=(p_data->>'inputTokens')::integer; tok_out integer=(p_data->>'outputTokens')::integer;
  err text=p_data->>'code'; rooms jsonb;
begin
  if p_action='settle' then
    -- A non-browser action uses the opaque, one-use reservation to meter a provider
    -- attempt even if the user signed out while the upstream request was running.
    -- This bookkeeping path can never return content or authorize an AI read.
    select * into existing from wow_assist.requests r where r.actor=uid and r.session_id=sid and r.request_id=rid
      and r.lease=(p_data->>'lease')::uuid for update;
    if not found then raise exception using message='ACCESS_DENIED'; end if;
    if existing.state<>'pending' then return jsonb_build_object('recorded',existing.state='done'); end if;
    if clock_timestamp()>=existing.started_at+interval '1 minute' then err='AI_RESULT_UNAVAILABLE'; end if;
    if (tok_in is not null and tok_in not between 0 and 2000000) or (tok_out is not null and tok_out not between 0 and 2000000)
      or (err is not null and err not in ('AI_PROVIDER_TIMEOUT','AI_PROVIDER_UNAVAILABLE','AI_PROVIDER_OUTPUT','AI_RESULT_UNAVAILABLE','AI_PROVIDER_REFUSAL')) then
      raise exception using message='INVALID_ASSISTANT_INPUT'; end if;
    if err is null then
      insert into wow_assist.answers values(existing.workspace,uid,rid,p_data->>'sealed',clock_timestamp()+interval '15 minutes');
    end if;
    update wow_assist.requests set state=case when err is null then 'done' else 'failed' end,finished_at=clock_timestamp(),
      input_tokens=tok_in,output_tokens=tok_out,error_code=err
      where workspace=existing.workspace and actor=uid and request_id=rid;
    return jsonb_build_object('recorded',err is null);
  end if;

  if p_action not in ('status','rooms','inspect','reserve','release') then raise exception using message='INVALID_ASSISTANT_INPUT'; end if;
  ctx=public.wow_actor(uid,sid,null,true,false);
  w=(ctx->>'workspaceId')::uuid;
  if not wow_fin.can(ctx,'assistant.view') then raise exception using message='ACCESS_DENIED'; end if;
  if p_action='status' then
    return jsonb_build_object('sources',jsonb_build_object('products',wow_fin.can(ctx,'products.view'),'customers',wow_fin.can(ctx,'customers.view'),
      'invoices',wow_fin.can(ctx,'invoices.view'),'finance',wow_fin.can(ctx,'finance.view'),'chat',wow_fin.can(ctx,'chat.view')),
      'dailyLimit',12,'usedToday',(select count(*) from wow_assist.requests r where r.workspace=w and r.actor=uid and r.started_at>=utc_start),
      'lastSuccessAt',(select max(r.finished_at) from wow_assist.requests r where r.workspace=w and r.actor=uid and r.model=model_id and r.state='done'));
  elsif p_action='rooms' then
    if not wow_fin.can(ctx,'chat.view') then raise exception using message='ACCESS_DENIED'; end if;
    rooms=public.wow_chat_service('rooms',jsonb_build_object('userId',uid,'sessionId',sid));
    return jsonb_build_object('rooms',(select coalesce(jsonb_agg(jsonb_build_object('id',r->>'id','name',wow_assist.field(r,'name',100),'kind',r->>'kind') order by ord),'[]'::jsonb)
      from jsonb_array_elements(rooms->'rooms') with ordinality e(r,ord)));
  end if;

  -- Serialize competing admissions without taking an exclusive business-workspace lock.
  if p_action='reserve' then perform pg_advisory_xact_lock(hashtextextended('wow-assistant/'||w::text,0)); end if;
  if p_action<>'inspect' then
    if rid is null or h is null or h !~ '^[0-9a-f]{64}$' then raise exception using message='INVALID_ASSISTANT_INPUT'; end if;
    select * into existing from wow_assist.requests r where r.workspace=w and r.actor=uid and r.request_id=rid;
    if found then
      if existing.session_id<>sid or existing.epoch<>(ctx#>>'{account,sessionVersion}')::bigint then raise exception using message='ACCESS_DENIED'; end if;
      if h<>existing.request_hash then raise exception using message='IDEMPOTENCY_MISMATCH'; end if;
    end if;
  end if;
  evidence=wow_assist.evidence(ctx,uid,sid,spec);
  eh=encode(extensions.digest(convert_to(evidence::text,'UTF8'),'sha256'),'hex');
  packet=jsonb_build_object('evidence',evidence,'fingerprint',eh);
  if p_action='inspect' then return packet; end if;
  if eh is distinct from p_data->>'fingerprint' or (existing.request_id is not null and eh<>existing.evidence_hash) then
    raise exception using message='AI_EVIDENCE_CHANGED'; end if;

  if jsonb_typeof(p_data->'selected') is distinct from 'array' then raise exception using message='INVALID_ASSISTANT_INPUT'; end if;
  if jsonb_array_length(p_data->'selected') not between 1 and 12 or exists(
    select from jsonb_array_elements_text(p_data->'selected') x where x !~ '^[1-9][0-9]?$' or x::integer>jsonb_array_length(evidence->'rows')
  ) then raise exception using message='INVALID_ASSISTANT_INPUT'; end if;

  if existing.request_id is not null then
    if existing.state='failed' then return jsonb_build_object('state','failed','code',existing.error_code); end if;
    if existing.state='pending' then return jsonb_build_object('state','failed','code',case when
      existing.started_at+interval '1 minute'>clock_timestamp() then 'AI_IN_PROGRESS' else 'AI_RESULT_UNAVAILABLE' end); end if;
    select a.sealed into cached from wow_assist.answers a where a.workspace=w and a.actor=uid and a.request_id=rid and a.expires_at>clock_timestamp();
    if cached is null then return jsonb_build_object('state','failed','code','AI_RECEIPT_EXPIRED'); end if;
    if p_action='release' then return packet||jsonb_build_object('state','cached','sealed',cached); end if;
    return jsonb_build_object('state','cached');
  end if;
  if p_action='release' then raise exception using message='ACCESS_DENIED'; end if;
  if coalesce(model_id,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' or
     jsonb_array_length(evidence->'rows')=0 then raise exception using message='INVALID_ASSISTANT_INPUT'; end if;
  if (select count(*) from wow_assist.requests r where r.workspace=w and r.started_at>=utc_start)>=60 or
     (select count(*) from wow_assist.requests r where r.workspace=w and r.actor=uid and r.started_at>=utc_start)>=12 then
    raise exception using message='AI_DAILY_LIMIT'; end if;
  if exists(select from wow_assist.requests r where r.workspace=w and r.actor=uid and r.state='pending' and r.started_at>clock_timestamp()-interval '1 minute')
    or (select count(*) from wow_assist.requests r where r.workspace=w and r.state='pending' and r.started_at>clock_timestamp()-interval '1 minute')>=3 then
    raise exception using message='AI_BUSY'; end if;
  if (select count(*) from wow_assist.requests r where r.workspace=w and r.state='failed' and r.finished_at>clock_timestamp()-interval '5 minutes'
    and r.error_code in ('AI_PROVIDER_TIMEOUT','AI_PROVIDER_UNAVAILABLE','AI_PROVIDER_OUTPUT','AI_RESULT_UNAVAILABLE'))>=3 then raise exception using message='AI_CIRCUIT_OPEN'; end if;
  insert into wow_assist.requests(workspace,actor,request_id,session_id,epoch,request_hash,evidence_hash,mode,model,state)
    values(w,uid,rid,sid,(ctx#>>'{account,sessionVersion}')::bigint,h,eh,spec->>'mode',model_id,'pending') returning * into existing;
  return packet||jsonb_build_object('state','reserved','lease',existing.lease);
end $$;

revoke all on all functions in schema wow_assist from public,anon,authenticated;
revoke all on function public.wow_assistant_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.wow_assistant_service(text,jsonb) to service_role;
select cron.schedule('wow-assistant-receipts','*/15 * * * *','select wow_assist.prune()');
commit;
