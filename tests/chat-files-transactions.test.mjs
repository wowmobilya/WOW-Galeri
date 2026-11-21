import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createProviderTestDatabase} from '../supabase/testing/provider-fixtures.mjs';
import {createChatActions} from '../supabase/functions/wow-cloud/modules/chat.mjs';
import {createFilesActions} from '../supabase/functions/wow-cloud/modules/files.mjs';

test('PostgreSQL enforces private files, membership, moderated writes, retries, receipts and message expiration',async()=>{
  const db=await createProviderTestDatabase();
  const paths=new Map(),uu=randomUUID;
  try{
    for(const module of ['files','chat'])await db.exec(await readFile(new URL('../supabase/modules/'+module+'.sql',import.meta.url),'utf8'));
    const moduleRpc=async(fn,action,data)=>{
      const result=await db.query('select public.'+fn+'($1,$2::jsonb) as result',[action,JSON.stringify(data)]);
      return result.rows[0].result;
    };
    const deps={moduleRpc,storage:{async put(path,bytes,mime){paths.set(path,{bytes,mime});},async sign(path,ttl){assert(paths.has(path));return 'https://local.invalid/'+ttl+'/'+path;},async remove(path){paths.delete(path);}}};
    const act={...createChatActions(deps),...createFilesActions(deps)};
    const [w,w2]=[uu(),uu()];
    await db.query('insert into public.wow_workspaces(id,name) values ($1,$2),($3,$4)',[w,'Studio',w2,'Other studio']);
    async function account(name,wid=w,role='custom'){
      const userId=uu(),sessionId=uu();await db.query('insert into auth.users(id) values($1)',[userId]);
      await db.query("insert into public.wow_accounts(id,workspace_id,login_email,username,name,role,permissions) values ($1,$2,$3,$4,$5,$6,ARRAY['chat.view','chat.edit','chat.delete','files.view','files.edit','files.delete'])",[userId,wid,name+'@test.invalid',name,name,role]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
      await db.query('insert into public.wow_sessions(session_id,account_id,session_version) values ($1,$2,1)',[sessionId,userId]);
      const call=(action,body={})=>act[action]({actor:{userId,sessionId},body});return {userId,sessionId,call};
    }
    const owner=await account('owner',w,'owner'),member=await account('member'),outsider=await account('outsider'),other=await account('other',w2,'owner');
    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/WZkAAAAASUVORK5CYII=';
    const blob=(requestId=uu())=>({requestId,name:'lamp.png',mime:'image/png',data:png});
    const access=promise=>assert.rejects(promise,e=>e.message==='ACCESS_DENIED');
    const [init,peerInit]=await Promise.all([owner.call('chat.init'),member.call('chat.init')]);assert.equal(init.me.id,owner.userId);assert.equal(peerInit.me.id,member.userId);
    assert((await member.call('chat.rooms')).rooms.some(r=>r.kind==='direct'&&r.peer.owner));
    const folder=await owner.call('files.folder.create',{name:'Receipts'});
    const input={...blob(),folderId:folder.id};
    const {file}=await owner.call('files.upload',input);assert.equal((await owner.call('files.upload',input)).file.id,file.id);
    const fullFiles=await owner.call('files.list');assert.equal(fullFiles.count,1);
    assert((await owner.call('files.list',{_known:fullFiles._deltaState}))._delta.unchanged);
    await owner.call('files.rename',{fileId:file.id,name:'lamp-new.png'});
    assert.equal((await owner.call('files.list',{_known:fullFiles._deltaState}))._delta.upsert[0].name,'lamp-new.png');
    for(const user of [member,other]){
      assert.equal((await user.call('files.list')).count,0);
      await access(user.call('files.open',{fileId:file.id,userId:owner.userId}));
      await access(user.call('files.delete',{ids:[file.id]}));
      await access(user.call('files.upload',{...blob(),folderId:folder.id}));
    }
    assert.match((await owner.call('files.share',{fileId:file.id})).url,/\/300\//);
    await owner.call('files.folder.delete',{folderId:folder.id});assert.equal((await owner.call('files.list')).files[0].folderId,null);
    await owner.call('files.archive',{ids:[file.id],archived:true});assert.equal((await owner.call('files.list')).count,0);assert.equal((await owner.call('files.list',{archived:true})).count,1);
    const {roomId}=await owner.call('chat.group',{name:'Bench',members:[member.userId]});
    await access(outsider.call('chat.feed',{roomId}));
    await access(outsider.call('chat.upload',{...blob(),roomId}));
    await access(member.call('chat.member',{roomId,targetId:outsider.userId,operation:'add'}));
    const upload={...blob(),roomId};const {asset}=await member.call('chat.upload',upload);
    const first={roomId,text:'Photo @owner',assetId:asset.id,requestId:uu()};
    const {id}=await member.call('chat.send',first);assert.equal((await member.call('chat.send',first)).id,id);
    await assert.rejects(member.call('chat.send',{...first,text:'changed'}),/IDEMPOTENCY_MISMATCH/);
    assert((await owner.call('chat.feed',{roomId,mentioned:true})).messages.some(m=>m.id===id));
    await access(outsider.call('chat.asset',{roomId,messageId:id}));
    assert.match((await owner.call('chat.asset',{roomId,messageId:id})).url,/\/60\/chat/);
    const notifications=await db.query('select recipient_id from wow_collab.chat_notifications where message_id=$1',[id]);assert.deepEqual(notifications.rows,[{recipient_id:owner.userId}]);
    await owner.call('chat.read',{roomId,messageId:id});assert.equal((await member.call('chat.info',{roomId,messageId:id})).readers[0].name,'owner');
    await owner.call('chat.react',{roomId,messageId:id,emoji:'❤️'});await owner.call('chat.star',{roomId,messageId:id,active:true});
    assert.equal((await owner.call('chat.feed',{roomId,starred:true})).messages[0].reactions['❤️'],1);
    assert.equal((await member.call('chat.feed',{roomId,starred:true})).messages.length,0);
    await member.call('chat.edit',{roomId,messageId:id,text:'Edited photo'});await access(owner.call('chat.edit',{roomId,messageId:id,text:'no'}));
    const {id:reply}=await owner.call('chat.send',{roomId,replyId:id,text:'Thanks',requestId:uu()});
    await member.call('chat.typing',{roomId,typing:true});assert.equal((await owner.call('chat.feed',{roomId})).typing[0].id,member.userId);
    await member.call('chat.draft',{roomId,text:'private draft'});assert.equal((await owner.call('chat.feed',{roomId})).prefs.draft,'');
    const hidden=await owner.call('chat.send',{roomId,text:'Hide this',requestId:uu()});
    const previousFeed=await member.call('chat.feed',{roomId});await member.call('chat.hide',{roomId,messageId:hidden.id});
    const hiddenDelta=await member.call('chat.feed',{roomId,_known:previousFeed._deltaState});assert(hiddenDelta._delta.removed.includes(hidden.id));
    await access(member.call('chat.info',{roomId,messageId:hidden.id}));
    assert((await owner.call('chat.feed',{roomId})).messages.some(m=>m.id===hidden.id));
    const withFile={...blob(),roomId,text:'One-step queued voice or photo'};
    const firstFile=await member.call('chat.sendFile',withFile);assert.equal((await member.call('chat.sendFile',withFile)).id,firstFile.id);
    await db.query("update wow_collab.messages set created_at=now()-interval '2 hours' where id=$1",[firstFile.id]);
    await access(member.call('chat.edit',{roomId,messageId:firstFile.id,text:'late'}));await access(member.call('chat.delete',{roomId,messageId:firstFile.id}));
    await owner.call('chat.delete',{roomId,messageId:firstFile.id});
    const dm=(await member.call('chat.rooms')).rooms.find(r=>r.kind==='direct').id;
    await access(outsider.call('chat.forward',{roomId:(await outsider.call('chat.direct',{targetId:owner.userId})).roomId,sourceRoomId:roomId,messageId:id,requestId:uu()}));
    const {id:forwarded}=await member.call('chat.forward',{roomId:dm,sourceRoomId:roomId,messageId:id,requestId:uu()});assert.match((await owner.call('chat.asset',{roomId:dm,messageId:forwarded})).url,/chat/);
    await access(member.call('chat.send',{roomId:dm,replyId:reply,text:'Cross-room reply',requestId:uu()}));
    const allowed=async mid=>(await db.query('select public.wow_chat_push_allowed($1,$2,$3,$4) as allowed',[w,member.userId,roomId,mid])).rows[0].allowed;
    assert.equal(await allowed(reply),true);await member.call('chat.prefs',{roomId,muted:true});assert.equal(await allowed(reply),false);
    const quiet=await owner.call('chat.send',{roomId,text:'quiet',requestId:uu()});assert.equal((await db.query('select count(*)::integer n from wow_collab.chat_notifications where message_id=$1',[quiet.id])).rows[0].n,0);
    await owner.call('chat.prefs',{roomId,disappearing:'24h'});const {id:expired}=await owner.call('chat.send',{roomId,text:'Temporary',requestId:uu()});
    await db.query("update wow_collab.messages set expires_at=now()-interval '1 second' where id=$1",[expired]);
    assert.equal((await member.call('chat.feed',{roomId,query:'Temporary'})).messages.length,0);
    await access(member.call('chat.info',{roomId,messageId:expired}));await member.call('chat.clear',{roomId});
    assert.equal((await member.call('chat.feed',{roomId})).messages.length,0);await access(member.call('chat.asset',{roomId,messageId:id}));
    await owner.call('chat.member',{roomId,targetId:member.userId,operation:'ban'});
    await access(member.call('chat.feed',{roomId}));await access(member.call('chat.asset',{roomId,messageId:id}));
    await member.call('chat.init');assert(!(await member.call('chat.rooms')).rooms.some(r=>r.id===roomId));
    await access(member.call('chat.feed',{roomId,_known:previousFeed._deltaState}));
    await owner.call('chat.member',{roomId,targetId:member.userId,operation:'unban'});assert((await member.call('chat.rooms')).rooms.some(r=>r.id===roomId));
    await owner.call('chat.room.delete',{roomId});await access(owner.call('chat.feed',{roomId}));
    const noRights=await db.query("select has_function_privilege('anon','public.wow_files_service(text,jsonb)','execute') f,has_function_privilege('authenticated','public.wow_chat_service(text,jsonb)','execute') c,has_table_privilege('anon','wow_collab.messages','select') m");
    assert.deepEqual(noRights.rows[0],{f:false,c:false,m:false});
    await owner.call('files.delete',{ids:[file.id]});await access(owner.call('files.open',{fileId:file.id}));assert(![...paths.keys()].some(k=>k.startsWith('files/')));
    await db.query("update public.wow_accounts set permissions=ARRAY['chat.view'] where id=$1",[member.userId]);
    await assert.rejects(member.call('chat.rooms'),/SESSION_REVOKED/);
  }catch(e){throw new Error([e.message,e.where,e.internalQuery,e.stack].filter(Boolean).join('\n'));}
  finally{await db.close();}
});
