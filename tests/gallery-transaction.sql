-- Local or management gate. Synthetic records are always rolled back.
begin;
do $$
declare
 wid uuid=gen_random_uuid();owner_id uuid=gen_random_uuid();buyer uuid=gen_random_uuid();other_id uuid=gen_random_uuid();
 owner_session uuid=gen_random_uuid();buyer_session uuid=gen_random_uuid();other_session uuid=gen_random_uuid();
 owner_actor jsonb;buyer_actor jsonb;other_actor jsonb;cmd jsonb;res jsonb;oid uuid;sale_id uuid;result_id uuid;
begin
 if has_function_privilege('authenticated','public.wow_gallery_service(text,jsonb)','execute') or
    has_table_privilege('anon','public.wow_gallery_sales','select') then raise exception 'TEST_PUBLIC_PRIVILEGE'; end if;
 insert into auth.users(id) values(owner_id),(buyer),(other_id);
 insert into public.wow_workspaces(id,name) values(wid,'Gallery test');
 insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions)
 values(owner_id,wid,'gallery-'||owner_id||'@wow.invalid','gallery.owner','Owner','owner','{}'),
 (buyer,wid,'gallery-'||buyer||'@wow.invalid','gallery.buyer','Buyer','custom',array['gallery.view','myorders.view','myorders.edit']),
 (other_id,wid,'gallery-'||other_id||'@wow.invalid','gallery.other','Other','custom',array['gallery.view','myorders.view','myorders.edit']);
 insert into auth.sessions(id,user_id,created_at,updated_at,aal) values(owner_session,owner_id,now(),now(),'aal1'),
  (buyer_session,buyer,now(),now(),'aal1'),(other_session,other_id,now(),now(),'aal1');
 insert into public.wow_sessions(session_id,account_id,session_version) values(owner_session,owner_id,1),(buyer_session,buyer,1),(other_session,other_id,1);
 owner_actor=jsonb_build_object('userId',owner_id,'sessionId',owner_session);
 buyer_actor=jsonb_build_object('userId',buyer,'sessionId',buyer_session);
 other_actor=jsonb_build_object('userId',other_id,'sessionId',other_session);
 insert into public.wow_records(workspace_id,store,record_id,payload,revision,updated_by)
 values(wid,'products','1','{"id":1,"name":"Console","type":"console","priceA":30.24,"costs":"private","dims":[{"l":120,"w":40,"h":80,"private":"private"}]}',1,owner_id),
 (wid,'products','"1"','{"id":"1","name":"Draft","priceA":12}',1,owner_id);
 res=public.wow_gallery_service('gallery.snapshot',buyer_actor);
 if jsonb_array_length(res->'items')<>0 then raise exception 'TEST_UNPUBLISHED';end if;
 cmd=jsonb_build_object('rows','[{"productId":1,"version":0,"stock":4,"published":true,"currency":"USD","collection":"","badge":"","specs":{"hidden":"private"}}]'::jsonb,'commandId',gen_random_uuid());
 perform public.wow_gallery_service('gallery.stock',owner_actor||cmd);
 perform public.wow_gallery_service('gallery.stock',owner_actor||cmd);
 res=public.wow_gallery_service('gallery.snapshot',buyer_actor);
 if jsonb_array_length(res->'items')<>1 or res::text like '%private%' or res->'items'->0->>'priceMinor'<>'3024' then raise exception 'TEST_CATALOG_PROJECTION';end if;
 begin perform public.wow_gallery_service('gallery.snapshot',buyer_actor||'{"manage":true}');raise exception 'FAIL';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 cmd=jsonb_build_object('commandId',gen_random_uuid(),'accepted',true,'note','Buyer note','items','[{"productId":1,"quantity":2,"priceMinor":3024,"currency":"USD"}]'::jsonb);
 res=public.wow_gallery_service('gallery.order.place',buyer_actor||cmd);oid=(res->>'orderId')::uuid;
 if (public.wow_gallery_service('gallery.order.place',buyer_actor||cmd)->>'orderId')::uuid<>oid then raise exception 'TEST_REPLAY';end if;
 begin perform public.wow_gallery_service('gallery.order.place',buyer_actor||cmd||'{"note":"changed"}');raise exception 'FAIL';
 exception when others then if sqlerrm<>'IDEMPOTENCY_MISMATCH' then raise;end if;end;
 begin perform public.wow_gallery_service('gallery.order.place',buyer_actor||cmd||jsonb_build_object('commandId',gen_random_uuid(),
  'items','[{"productId":1,"quantity":3,"priceMinor":3024,"currency":"USD"}]'::jsonb));raise exception 'FAIL';
 exception when others then if sqlerrm<>'INVALID_STOCK_QUANTITY' then raise;end if;end;
 if (select count(*) from public.wow_gallery_orders where workspace_id=wid)<>1 then raise exception 'TEST_PARTIAL_ORDER';end if;
 begin perform public.wow_gallery_service('gallery.order.place',buyer_actor||cmd||jsonb_build_object('commandId',gen_random_uuid(),
  'items','[{"productId":1,"quantity":1,"priceMinor":20,"currency":"USD"}]'::jsonb));raise exception 'FAIL';
 exception when others then if sqlerrm<>'CONFLICT' then raise;end if;end;
 perform public.wow_gallery_service('gallery.order.update',owner_actor||jsonb_build_object('commandId',gen_random_uuid(),'version',1,'orderId',oid,'status','ready','adminNote','internal'));
 res=public.wow_gallery_service('gallery.orders',buyer_actor);
 if res::text like '%internal%' or res->'items'->0->>'status'<>'ready' then raise exception 'TEST_ORDER_VISIBILITY';end if;
 res=public.wow_gallery_service('gallery.personal',other_actor);
 if jsonb_array_length(res->'items')<>0 then raise exception 'TEST_PRIVATE_ORDER';end if;
 cmd=jsonb_build_object('commandId',gen_random_uuid(),'orderId',oid,'productId',1,'quantity',1,'priceMinor',4000,'buyer','Personal buyer','phone','555','note','');
 sale_id=(public.wow_gallery_service('gallery.sale',buyer_actor||cmd)->>'saleId')::uuid;
 begin perform public.wow_gallery_service('gallery.sales',other_actor||jsonb_build_object('orderId',oid,'productId',1));raise exception 'FAIL';
 exception when others then if sqlerrm<>'ACCESS_DENIED' then raise;end if;end;
 begin perform public.wow_gallery_service('gallery.order.update',owner_actor||jsonb_build_object('commandId',gen_random_uuid(),'version',2,'orderId',oid,'status','cancelled'));raise exception 'FAIL';
 exception when others then if sqlerrm<>'INVALID_SOLD_QUANTITY' then raise;end if;end;
 perform public.wow_gallery_service('gallery.sale.reverse',buyer_actor||jsonb_build_object('commandId',gen_random_uuid(),'saleId',sale_id));
 perform public.wow_gallery_service('gallery.order.update',owner_actor||jsonb_build_object('commandId',gen_random_uuid(),'version',2,'orderId',oid,'status','cancelled'));
 res=public.wow_gallery_service('gallery.snapshot',buyer_actor);
 if res->'items'->0->>'stock'<>'4' then raise exception 'TEST_STOCK_RESTORE';end if;
 perform public.wow_gallery_service('gallery.presentation',owner_actor||jsonb_build_object('commandId',gen_random_uuid(),'version',0,'value',
  '{"cards":[{"id":"a","title":"Listed","visible":true},{"id":"b","title":"private","visible":false}],"slides":[],"fields":[]}'::jsonb));
 res=public.wow_gallery_service('gallery.snapshot',buyer_actor);
 if res::text like '%private%' or jsonb_array_length(res->'presentation'->'cards')<>1 then raise exception 'TEST_STUDIO_PROJECTION';end if;

 -- Worker output is generic, tenant-scoped and checked again after session or order changes.
 if (select count(*) from public.wow_gallery_notification_outbox n where n.workspace_id=wid and n.kind='order.created'
   and n.order_id=oid and n.recipient_id=owner_id)<>1 then raise exception 'TEST_NOTICE_DEDUPE';end if;
 select n.id into result_id from public.wow_gallery_notification_outbox n where n.order_id=oid and n.kind='order.updated'
  and n.recipient_id=buyer order by n.event_version desc limit 1;
 res=public.wow_gallery_notice_payload(result_id,buyer);
 if res is null or res->>'route'<>'my-orders' or res::text like '%Personal buyer%' or res::text like '%price%' then raise exception 'TEST_NOTICE_SCOPE';end if;
 if public.wow_gallery_notice_payload(result_id,other_id) is not null then raise exception 'TEST_NOTICE_RECIPIENT';end if;
 update public.wow_accounts set status='suspended' where id=buyer;
 if public.wow_gallery_notice_payload(result_id,buyer) is not null then raise exception 'TEST_NOTICE_REVOKED';end if;
 -- An amended draft cannot race the old unknown transport request into a duplicate.
 result_id=gen_random_uuid();
 res=public.wow_gallery_service('gallery.command.review',owner_actor||jsonb_build_object('priorAction','gallery.stock','priorId',result_id));
 if res->>'completed'<>'false' then raise exception 'TEST_ABANDON';end if;
 begin perform public.wow_gallery_service('gallery.stock',owner_actor||jsonb_build_object('commandId',result_id,'rows','[]'::jsonb));raise exception 'FAIL';
 exception when others then if sqlerrm<>'IDEMPOTENCY_MISMATCH' then raise;end if;end;
end $$;
rollback;
