begin;
do $$ declare
 w uuid=gen_random_uuid();u uuid=gen_random_uuid();staff uuid=gen_random_uuid();sid uuid=gen_random_uuid();ss uuid=gen_random_uuid();
 actor jsonb;viewer jsonb;cmd jsonb;r jsonb;sample jsonb;items jsonb;other_w uuid=gen_random_uuid();income uuid=gen_random_uuid();quote uuid=gen_random_uuid();transfer uuid=gen_random_uuid();
 worker uuid=gen_random_uuid();worker2 uuid=gen_random_uuid();att uuid=gen_random_uuid();metal_quote uuid=gen_random_uuid();trade uuid=gen_random_uuid();pay uuid=gen_random_uuid();
 vend uuid=gen_random_uuid();salary uuid;
begin
 if has_function_privilege('anon','public.wow_finance_service(text,jsonb)','execute') or has_table_privilege('authenticated','wow_fin.attendance','select')
 or has_schema_privilege('authenticated','wow_fin','usage') then raise exception 'BROWSER_ACCESS';end if;
 insert into auth.users(id) values(u),(staff);
 insert into public.wow_workspaces(id,name) values(w,'Financial'),(other_w,'Other tenant');
 insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values
 (u,w,u||'@wow.invalid','finance.owner','Owner','owner','{}'),(staff,w,staff||'@wow.invalid','finance.read','Viewer','custom',array['finance.view']);
 insert into auth.sessions(id,user_id) values(sid,u),(ss,staff);
 insert into public.wow_sessions(session_id,account_id,session_version) values(sid,u,1),(ss,staff,1);
 actor=jsonb_build_object('userId',u,'sessionId',sid);viewer=jsonb_build_object('userId',staff,'sessionId',ss);
 insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by) values
 (w,'companies','1','{"id":1,"name":"Canonical buyer"}',1,u),
 (w,'invoices','1','{"id":1,"invNo":"A1","companyId":1,"grandTotal":100,"dueDate":"2020-01-01","payments":[{"id":"p1","amount":"10.10","currency":"USD","receiptType":"cash"}]}',1,u),
 (w,'payments','"p1"','{"id":"p1","invoiceId":1,"amount":"10.10","currency":"USD","receiptType":"cash"}',1,u),
 (w,'settings','"cashbox-entry/old"','{"id":"cashbox-entry/old","legs":[{"currency":"USD","units":320}],"type":"income","date":"2025-01-01"}',1,u);
 if wow_fin.balance(w,'main:USD')<>13.30 then raise exception 'CANONICAL_DOUBLE_COUNT';end if;
 r=public.wow_finance_service('finance.list',actor||'{"tab":"invoices"}');
 if r->'items'->0->>'status'<>'overdue' or (r->'items'->0->>'remaining')::numeric<>89.90 then raise exception 'INVOICE_OUTSTANDING %',r;end if;
 cmd=jsonb_build_object('commandId',income,'kind','income','amount','1000.01','currency','USD','box','main:USD','day','2025-01-01','description','cash receipt','party',jsonb_build_object('type','customer','id',1));
 perform public.wow_finance_service('finance.transaction',actor||cmd);
 perform public.wow_finance_service('finance.transaction',actor||cmd);
 if wow_fin.balance(w,'main:USD')<>1013.31 then raise exception 'POST_OR_REPLAY';end if;
 begin perform public.wow_finance_service('finance.transaction',actor||cmd||'{"description":"different"}');raise exception 'FAIL';
 exception when others then if sqlerrm<>'IDEMPOTENCY_MISMATCH' then raise;end if;end;
 begin perform public.wow_finance_service('finance.transaction',viewer||cmd);raise exception 'FAIL';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 begin perform public.wow_finance_service('payroll.list',viewer||'{"tab":"slips"}');raise exception 'FAIL';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 perform public.wow_finance_service('finance.quote.manual',actor||jsonb_build_object('commandId',quote,'base','USD','counter','TRY','at','2025-01-01T00:00:00Z','source','desk','rate','31.005'));
 cmd=jsonb_build_object('commandId',transfer,'day','2025-01-02','fromBox','main:USD','toBox','main:TRY','amount','10.10','quote',quote);
 perform public.wow_finance_service('finance.transfer',actor||cmd);
 if wow_fin.balance(w,'main:TRY')<>313.15 or wow_fin.balance(w,'main:USD')<>1003.21 then raise exception 'FX_ROUNDING';end if;
 perform public.wow_finance_service('finance.reverse',actor||jsonb_build_object('commandId',gen_random_uuid(),'id',transfer,'day','2025-01-03','reason','return'));
 if wow_fin.balance(w,'main:TRY')<>0 or wow_fin.balance(w,'main:USD')<>1013.31 then raise exception 'REVERSAL';end if;
 begin perform public.wow_finance_service('finance.reverse',actor||jsonb_build_object('commandId',gen_random_uuid(),'id',transfer,'day','2025-01-03','reason','double'));raise exception 'FAIL';
 exception when others then if sqlerrm<>'INVALID_REVERSAL' then raise;end if;end;
 begin update public.wow_records set payload=payload||'{"note":"overwrite"}' where record_id=to_jsonb('cashbox-entry/finance/'||income);raise exception 'FAIL';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 perform public.wow_finance_service('metals.quote.manual',actor||jsonb_build_object('commandId',metal_quote,'base','gold','counter','USD','at','2025-01-01T00:00:00Z','source','assayer','rate','25.12345678'));
 cmd=jsonb_build_object('commandId',trade,'metal','gold','kind','buy','grams','2.5000','box','main:USD','quote',metal_quote,'day','2025-01-04');
 perform public.wow_finance_service('metals.trade',actor||cmd);
 begin perform public.wow_finance_service('metals.trade',actor||cmd||jsonb_build_object('commandId',gen_random_uuid(),'kind','sell','grams','2.5001'));raise exception 'FAIL';
 exception when others then if sqlerrm<>'INVALID_METAL_HOLDINGS' then raise;end if;end;
 perform public.wow_finance_service('metals.reverse',actor||jsonb_build_object('commandId',gen_random_uuid(),'id',trade,'day','2025-01-05','reason','cancel'));
 if wow_fin.balance(w,'main:USD')<>1013.31 then raise exception 'METAL_COMPENSATION';end if;
 sample='{"name":"Private name","currency":"USD","active":true,"status":"active","model":"monthly","rate":"260","days":26,"hours":"8","absence":"10","lateRate":"2","overtimeRate":"0","multiplier":"1.5","box":"main:USD"}';
 perform public.wow_finance_service('payroll.employee',actor||jsonb_build_object('commandId',gen_random_uuid(),'kind','employee','id',worker,'version',0,'profile',sample));
 perform public.wow_finance_service('payroll.employee',actor||jsonb_build_object('commandId',gen_random_uuid(),'kind','employee','id',worker2,'version',0,'profile',sample||'{"rate":"10000"}'));
 cmd=jsonb_build_object('commandId',gen_random_uuid(),'rows',jsonb_build_array(
 jsonb_build_object('id',att,'version',0,'employee',worker,'day','2025-01-04','kind','advance','amount','20','hours','0','lateHours','0','quantity','0'),
 jsonb_build_object('id',gen_random_uuid(),'version',0,'employee',worker,'day','2025-01-04','kind','overtime','hours','2','lateHours','0','quantity','0'),
 jsonb_build_object('id',gen_random_uuid(),'version',0,'employee',worker,'day','2025-01-08','kind','absent','hours','0','lateHours','0','quantity','0')));
 perform public.wow_finance_service('payroll.attendance',actor||cmd);
 declare val numeric;begin val=(wow_fin.salary(w,worker,'2025-01-01')->>'net')::numeric;if val<>233.75 then raise exception 'SALARY_CALC %',val;end if;end;
 cmd=jsonb_build_object('commandId',pay,'period','2025-01','day','2025-01-31','employees',jsonb_build_array(jsonb_build_object('employee',worker,'box','main:USD','expected','233.75')));
 begin perform public.wow_finance_service('payroll.pay',actor||cmd||jsonb_build_object('employees',(cmd->'employees')||jsonb_build_array(jsonb_build_object('employee',worker2,'box','main:USD','expected','10000'))));raise exception 'FAIL';
 exception when others then if sqlerrm<>'INVALID_INSUFFICIENT_BALANCE' then raise;end if;end;
 if exists(select from wow_fin.slips where workspace=w) or wow_fin.balance(w,'main:USD')<>993.31 then raise exception 'PARTIAL_BULK';end if;
 r=public.wow_finance_service('payroll.pay',actor||cmd);salary=(r->'payments'->>0)::uuid;
 perform public.wow_finance_service('payroll.pay',actor||cmd);
 begin perform public.wow_finance_service('payroll.pay',actor||cmd||jsonb_build_object('commandId',gen_random_uuid()));raise exception 'FAIL';
 exception when others then if sqlerrm<>'INVALID_PAID_PERIOD' then raise;end if;end;
 begin perform public.wow_finance_service('payroll.remove',actor||jsonb_build_object('commandId',gen_random_uuid(),'id',att,'version',1));raise exception 'FAIL';
 exception when others then if sqlerrm<>'INVALID_PAID_PERIOD' then raise;end if;end;
 r=public.wow_finance_service('finance.list',viewer||'{"tab":"ledger"}');
 if r::text like '%Private name%' or r::text like '%'||worker::text||'%' then raise exception 'PRIVATE_EMPLOYEE_LEAK';end if;
 perform public.wow_finance_service('payroll.reverse',actor||jsonb_build_object('commandId',gen_random_uuid(),'id',salary,'day','2025-02-01','reason','reopened'));
 if wow_fin.balance(w,'main:USD')<>993.31 or (wow_fin.salary(w,worker,'2025-01-01')->>'paid')::boolean then raise exception 'REOPEN_PERIOD';end if;
 cmd=jsonb_build_object('commandId',gen_random_uuid(),'period','2025-01','day','2025-02-01','employees',jsonb_build_array(jsonb_build_object('employee',worker,'box','main:USD','expected','233.75','amount','50.00')));
 r=public.wow_finance_service('payroll.pay',actor||cmd);salary=(r->'payments'->>0)::uuid;
 r=wow_fin.salary(w,worker,'2025-01-01');
 if not (r->>'frozen')::boolean or (r->>'paid')::boolean or (r->>'remaining')::numeric<>183.75 then raise exception 'PARTIAL_SALARY %',r;end if;
 perform public.wow_finance_service('payroll.pay',actor||cmd||jsonb_build_object('commandId',gen_random_uuid(),'employees',jsonb_build_array(jsonb_build_object('employee',worker,'box','main:USD','expected','183.75'))));
 perform public.wow_finance_service('payroll.reverse',actor||jsonb_build_object('commandId',gen_random_uuid(),'id',salary,'day','2025-02-02','reason','undo first installment'));
 r=wow_fin.salary(w,worker,'2025-01-01');
 if (r->>'paidAmount')::numeric<>183.75 or (r->>'remaining')::numeric<>50.00 or not (r->>'frozen')::boolean then raise exception 'PARTIAL_REVERSAL %',r;end if;
 perform public.wow_finance_service('finance.transfer',actor||jsonb_build_object('commandId',gen_random_uuid(),'day','2025-01-04','fromBox','main:USD','toBox','main:TRY','amount','100.00','quote',quote));
 cmd=jsonb_build_object('commandId',gen_random_uuid(),'metal','gold','kind','buy','grams','1.25','box','main:TRY','quote',metal_quote,'fxQuote',quote,'day','2025-01-04');
 r=public.wow_finance_service('metals.trade',actor||cmd);
 if (r->>'total')::numeric<>round(1.25*25.12345678*31.005,2) then raise exception 'METAL_FX %',r;end if;
 cmd=jsonb_build_object('commandId',gen_random_uuid(),'kind','vendor','id',vend,'version',0,'profile','{"name":"Vendor","active":true}'::jsonb);
 sample=jsonb_build_object('scope','finance','workspace',w,'commandId',gen_random_uuid(),'preview',true,'commands',jsonb_build_array(jsonb_build_object('action','finance.resource','data',cmd)));
 r=public.wow_finance_service('finance.restore',actor||sample);
 if exists(select from wow_fin.resources where id=vend) or (r->>'new')::int<>1 then raise exception 'RESTORE_PREVIEW';end if;
 r=public.wow_finance_service('finance.restore',actor||sample||'{"preview":false}');
 perform public.wow_finance_service('finance.restore',actor||sample||'{"preview":false}');
 if not exists(select from wow_fin.resources where id=vend) then raise exception 'RESTORE_COMMIT';end if;
 sample=jsonb_build_object('scope','finance','workspace',w,'stage',gen_random_uuid(),'start',0,'total',1,'commands',
 jsonb_build_array(jsonb_build_object('action','finance.resource','data',cmd||jsonb_build_object('commandId',gen_random_uuid(),'id',gen_random_uuid()))));
 perform public.wow_finance_service('finance.restore.stage',actor||sample);
 perform public.wow_finance_service('finance.restore.stage',actor||sample);
 r=public.wow_finance_service('finance.restore',actor||jsonb_build_object('scope','finance','workspace',w,'stage',sample->'stage','commandId',gen_random_uuid(),'preview',true));
 if (r->>'new')::int<>1 then raise exception 'STAGE_PREVIEW';end if;
 r=public.wow_finance_service('finance.restore',actor||jsonb_build_object('scope','finance','workspace',w,'stage',sample->'stage','commandId',gen_random_uuid(),'preview',false));
 if exists(select from wow_fin.imports i where i.workspace=w and i.id=(sample->>'stage')::uuid) then raise exception 'STAGE_CLEANUP';end if;
 -- Every wage model calculates from actual attendance or production.
 declare e uuid;mode text;shiftId uuid;kind text;expected numeric;profile jsonb;begin
  foreach mode in array array['daily','hourly','piece'] loop
   e=gen_random_uuid();shiftId=gen_random_uuid();profile=jsonb_build_object('name',mode,'status','active','active',true,'currency','USD','model',mode,'rate','12.50','hours','8','days',26,
    'overtimeRate','0','multiplier','1.5','lateRate','0','absence','0','box','main:USD');
   perform public.wow_finance_service('payroll.employee',actor||jsonb_build_object('commandId',gen_random_uuid(),'id',e,'kind','employee','version',0,'profile',profile));
   kind=case mode when 'piece' then 'piece' else 'half' end;
   perform public.wow_finance_service('payroll.attendance',actor||jsonb_build_object('commandId',gen_random_uuid(),'rows',jsonb_build_array(jsonb_build_object('id',shiftId,'version',0,'employee',e,
    'day','2025-01-05','kind',kind,'hours','4','lateHours','0','quantity',case when mode='piece' then '3' else '0' end))));
   expected=case mode when 'daily' then 6.25 when 'hourly' then 50 else 37.50 end;
   if (wow_fin.salary(w,e,'2025-01-01')->>'net')::numeric<>expected then raise exception 'WAGE_MODEL %',mode;end if;
  end loop;
 end;
 declare hid uuid=gen_random_uuid();person uuid=gen_random_uuid();v jsonb;begin
  perform public.wow_finance_service('finance.legacy.record',actor||jsonb_build_object('commandId',hid,'table','suppliers','sourceId',17,'record',jsonb_build_object('id',17,'name','Legacy supplier')));
  perform public.wow_finance_service('finance.resource',actor||jsonb_build_object('commandId',gen_random_uuid(),'id',person,'kind','vendor','version',0,'legacy',hid,'profile',jsonb_build_object('name','Legacy supplier','active',true)));
  v=public.wow_finance_service('finance.legacy.detail',actor||jsonb_build_object('id',hid));
  if v->'record'->>'name'<>'Legacy supplier' or not exists(select from wow_fin.legacy_rows where workspace=w and id=hid and target=to_jsonb(person)) then raise exception 'HISTORICAL_LINK';end if;
  begin perform public.wow_finance_service('finance.list',viewer||'{"tab":"legacy"}');raise exception 'FAIL';
  exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
  cmd=jsonb_build_object('commandId',gen_random_uuid(),'kind','expense','amount','1.00','currency','USD','box','main:TRY','day','2025-01-10','fxQuote',quote,'description','Supplier charges','party',jsonb_build_object('type','vendor','id',person));
  perform public.wow_finance_service('finance.transaction',actor||cmd);
  v=public.wow_finance_service('finance.list',actor||jsonb_build_object('tab','statement','from','2025-01-11','party',jsonb_build_object('type','vendor','id',person)));
  if jsonb_array_length(v->'items')<>1 or v->'items'->0->>'kind'<>'openingBalance' or (v->'items'->0->>'balance')::numeric<>-31.01 then raise exception 'SUPPLIER_STATEMENT %',v;end if;
  v=public.wow_finance_service('finance.archive',actor||'{"scope":"all","limit":100}');
  if not exists(select from jsonb_array_elements(v->'commands') a where a->>'action'='metals.trade') or
     not exists(select from jsonb_array_elements(v->'commands') a where a->>'action'='payroll.pay') or
     not exists(select from jsonb_array_elements(v->'commands') a where a->>'action'='finance.legacy.record') then raise exception 'FULL_ARCHIVE';end if;
  v=public.wow_finance_service('finance.restore',actor||jsonb_build_object('scope','all','workspace',w,'commandId',gen_random_uuid(),'preview',true,'commands',v->'commands'));
  if (v->>'new')::int<>0 or (v->>'existing')::int<10 then raise exception 'FULL_REPLAY %',v;end if;
 end;
 declare initial uuid=gen_random_uuid();before_balance numeric=wow_fin.balance(w,'main:USD');begin
  perform public.wow_finance_service('metals.opening',actor||jsonb_build_object('commandId',initial,'metal','silver','grams','4.9999','day','2025-01-01','reference','cutover'));
  if (select sum(grams) from wow_fin.journal where workspace=w and metal='silver')<>4.9999 or wow_fin.balance(w,'main:USD')<>before_balance then raise exception 'OPENING_METAL';end if;
  begin insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by)
   values(w,'settings',to_jsonb('cashbox-entry/finance/'||initial),jsonb_build_object('id','cashbox-entry/finance/'||initial,'legs','[]'::jsonb),1,u);raise exception 'FAIL';
   exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
  perform public.wow_finance_service('metals.reverse',actor||jsonb_build_object('commandId',gen_random_uuid(),'id',initial,'day','2025-01-02','reason','cutover correction'));
  if (select sum(grams) from wow_fin.journal where workspace=w and metal='silver')<>0 then raise exception 'UNDO_OPENING_METAL';end if;
 end;
 r=public.wow_finance_service('payroll.list',actor||'{"tab":"attendance","limit":1,"offset":0}');
 sample=public.wow_finance_service('payroll.list',actor||'{"tab":"attendance","limit":1,"offset":1}');
 if jsonb_array_length(r->'items')<>1 or (r->>'more')::boolean is not true or r->'items'->0->'id'=sample->'items'->0->'id' then raise exception 'PAGINATION';end if;
 update public.wow_sessions set closed_at=now() where session_id=sid;
 begin perform public.wow_finance_service('finance.list',actor||'{"tab":"ledger"}');raise exception 'FAIL';
 exception when others then if sqlerrm<>'SESSION_REVOKED' then raise;end if;end;
end $$;
rollback;
