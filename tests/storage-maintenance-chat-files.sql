-- Executed inside the full release fixture. All IDs and file contents are synthetic.
do $$
declare
 wid uuid=current_setting('fixture.workspace')::uuid; uid uuid=current_setting('fixture.owner')::uuid;
 actor jsonb=jsonb_build_object('userId',uid,'sessionId',current_setting('fixture.session'));
 live uuid=gen_random_uuid(); closed uuid=gen_random_uuid();
 room_photo uuid=gen_random_uuid(); wallpaper_photo uuid=gen_random_uuid(); profile uuid=gen_random_uuid();
 shared_photo uuid=gen_random_uuid(); expired uuid=gen_random_uuid(); closed_asset uuid=gen_random_uuid();
 stale_chat uuid=gen_random_uuid(); fresh_chat uuid=gen_random_uuid(); draft_chat uuid=gen_random_uuid();
 spec jsonb=jsonb_build_object('name','private-test.txt','kind','document','mime','text/plain','bytes',20,'originalBytes',20,'digest',repeat('a',64));
 stale_request uuid=gen_random_uuid(); retry_request uuid=gen_random_uuid(); stale_file uuid; retry_file uuid; archived_file uuid; trash_file uuid;
 stale_chat_request uuid=gen_random_uuid(); retry_chat_request uuid=gen_random_uuid(); retry_chat uuid;
 batch jsonb; handle jsonb; answer jsonb; n integer;
begin
 stale_file=(public.wow_files_service('reserve',actor||spec||jsonb_build_object('requestId',stale_request))->>'id')::uuid;
 retry_file=(public.wow_files_service('reserve',actor||spec||jsonb_build_object('requestId',retry_request))->>'id')::uuid;
 archived_file=(public.wow_files_service('reserve',actor||spec||jsonb_build_object('requestId',gen_random_uuid()))->>'id')::uuid;
 trash_file=(public.wow_files_service('reserve',actor||spec||jsonb_build_object('requestId',gen_random_uuid()))->>'id')::uuid;
 perform public.wow_files_service('finish',actor||jsonb_build_object('fileId',archived_file));
 perform public.wow_files_service('finish',actor||jsonb_build_object('fileId',trash_file));
 perform public.wow_files_service('archive',actor||jsonb_build_object('ids',array[archived_file],'archived',true));
 perform public.wow_files_service('delete',actor||jsonb_build_object('ids',array[trash_file]));
 update wow_collab.files set created_at=now()-interval '23 hours 59 minutes' where id=retry_file;
 perform public.wow_files_service('reserve',actor||spec||jsonb_build_object('requestId',retry_request));
 update wow_collab.files set created_at=now()-interval '2 days' where workspace_id=wid;
 begin
  perform public.wow_files_service('reserve',actor||spec||jsonb_build_object('requestId',stale_request));
  raise exception 'FAILED_STALE_FILE_RESERVE';
 exception when others then if sqlerrm<>'IDEMPOTENCY_MISMATCH' then raise;end if;end;

 insert into wow_collab.rooms(id,workspace_id,kind,title,creator,active) values
  (live,wid,'group','active',uid,true),(closed,wid,'group','closed',uid,false);
 insert into wow_collab.members(room_id,account_id,role) values(live,uid,'owner');
 insert into wow_collab.chat_assets(id,workspace_id,owner_id,room_id,request_id,purpose,name,kind,mime,bytes,digest,state,linked,created_at)
 select v.id,wid,uid,v.room_id,v.request_id,v.purpose,'private-test.png','image','image/png',20,repeat('a',64),v.state,v.linked,now()-v.age
 from (values
  (room_photo,live,gen_random_uuid(),'room','ready',true,interval '2 days'),
  (wallpaper_photo,live,gen_random_uuid(),'wallpaper','ready',true,interval '2 days'),
  (profile,null::uuid,gen_random_uuid(),'profile','ready',true,interval '2 days'),
  (shared_photo,closed,gen_random_uuid(),'message','ready',true,interval '2 days'),
  (expired,live,gen_random_uuid(),'message','ready',true,interval '2 days'),
  (closed_asset,closed,gen_random_uuid(),'message','ready',true,interval '2 days'),
  (stale_chat,live,stale_chat_request,'message','pending',false,interval '2 days'),
  (fresh_chat,live,gen_random_uuid(),'message','pending',false,interval '2 hours'),
  (draft_chat,live,gen_random_uuid(),'message','ready',false,interval '2 days')
 ) v(id,room_id,request_id,purpose,state,linked,age);
 update wow_collab.rooms set avatar=room_photo where id=live;
 update wow_collab.members set wallpaper='custom',wallpaper_asset=wallpaper_photo where room_id=live;
 insert into wow_collab.profiles(account_id,avatar) values(uid,profile);
 insert into wow_collab.messages(room_id,author_id,text_body,asset_id,expires_at,forwarded) values
  (closed,uid,'original',shared_photo,null,false),(live,uid,'retained forward',shared_photo,null,true),
  (live,uid,'expired',expired,now()-interval '1 hour',false),(closed,uid,'closed',closed_asset,null,false);
 insert into wow_collab.messages(room_id,author_id,text_body,expires_at)
 select live,uid,'expired fixture',now()-interval '1 hour' from generate_series(1,251);
 spec=jsonb_build_object('purpose','message','roomId',live,'kind','image','mime','image/png','name','private-test.png','bytes',20,'digest',repeat('a',64));
 begin
  perform public.wow_chat_service('reserve',actor||spec||jsonb_build_object('requestId',stale_chat_request));
  raise exception 'FAILED_STALE_CHAT_RESERVE';
 exception when others then if sqlerrm<>'IDEMPOTENCY_MISMATCH' then raise;end if;end;
 retry_chat=(public.wow_chat_service('reserve',actor||spec||jsonb_build_object('requestId',retry_chat_request))->>'id')::uuid;
 update wow_collab.chat_assets set created_at=now()-interval '23 hours 59 minutes' where id=retry_chat;
 perform public.wow_chat_service('reserve',actor||spec||jsonb_build_object('requestId',retry_chat_request));
 update wow_collab.chat_assets set created_at=now()-interval '2 days' where id=retry_chat;

 batch=public.wow_storage_maintenance('claim','{}');
 if jsonb_array_length(batch->'jobs')<>6 then raise exception 'FAILED_JOB_COUNT %',batch;end if;
 if (select count(*) from wow_collab.messages where room_id in(live,closed) and deleted)<>250 then raise exception 'FAILED_EXPIRY_BOUND';end if;
 if exists(select from wow_collab.messages where deleted and (text_body<>'' or asset_id is not null)) then raise exception 'FAILED_EXPIRY_SCRUB';end if;
 if exists(select from wow_collab.chat_assets where id in(room_photo,wallpaper_photo,profile,shared_photo) and state<>'ready')
  or exists(select from wow_collab.chat_assets where id in(expired,closed_asset,stale_chat,draft_chat) and state<>'trash')
  or exists(select from wow_collab.chat_assets where id in(fresh_chat,retry_chat) and state<>'pending') then raise exception 'FAILED_CHAT_REFERENCES';end if;
 if exists(select from wow_collab.files where id in(stale_file,trash_file) and state<>'trash')
  or not exists(select from wow_collab.files where id=archived_file and state='ready' and archived)
  or not exists(select from wow_collab.files where id=retry_file and state='pending') then raise exception 'FAILED_PERSONAL_FILES';end if;
 -- Both foreground GC and the worker may own a copy of the same exact name.
 select jsonb_build_object('id',id,'lease',lease_token) into handle from wow_ops.storage_jobs where object_id=trash_file and source='files';
 answer=public.wow_storage_maintenance('prepare',handle);
 if answer->>'path' is distinct from (select wow_collab.file_path(f) from wow_collab.files f where id=trash_file) then raise exception 'FAILED_FILE_PATH';end if;
 perform public.wow_files_service('gcAck',actor||jsonb_build_object('fileId',trash_file));
 if public.wow_storage_maintenance('prepare',handle)->>'status'<>'gone' or not exists(select from wow_collab.files where id=trash_file and state='removed')
  then raise exception 'FAILED_COMPETING_ACK';end if;
 update wow_ops.settings set storage_last_scan_at=now()-interval '11 minutes' where workspace_id=wid;
 perform public.wow_storage_maintenance('claim','{}');
 select count(*) into n from wow_collab.messages where room_id in(live,closed) and not deleted;
 if n<>1 or not exists(select from wow_collab.messages where room_id=live and not deleted and asset_id=shared_photo and text_body='retained forward') then raise exception 'FAILED_SECOND_PAGE';end if;
end $$;
