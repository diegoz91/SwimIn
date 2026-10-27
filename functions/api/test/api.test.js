/**
 * Test della Function "api" con un database finto in memoria.
 * Lancia con: cd functions/api && npm install && npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ownersOf } from '../src/main.js';

test('permessi e regole della Function api', async () => {
const store={};
const col=c=>(store[c]??={});
// Finto TablesDB in memoria con la stessa interfaccia usata dalla Function.
const db={
 async getRow({tableId,rowId}){const d=col(tableId)[rowId]; if(!d){const e=new Error('nf');e.code=404;throw e} return structuredClone(d)},
 async listRows({tableId,queries}){let rows=Object.values(col(tableId));let lim=25;let after=null;for(const raw of queries){const q=JSON.parse(raw);if(q.method==='equal')rows=rows.filter(d=>q.values.includes(d[q.attribute]));if(q.method==='contains')rows=rows.filter(d=>(d[q.attribute]||[]).some(v=>q.values.includes(v)));if(q.method==='limit')lim=q.values[0];if(q.method==='cursorAfter')after=q.values[0]}const total=rows.length;if(after){const i=rows.findIndex(r=>r.$id===after);rows=rows.slice(i+1)}return {total,rows:rows.slice(0,lim).map(d=>structuredClone(d))}},
 async createRow({tableId,rowId,data,permissions}){const d={$id:rowId,$permissions:permissions||[],...data};col(tableId)[rowId]=d;return d},
 async updateRow({tableId,rowId,data}){Object.assign(col(tableId)[rowId],data);return structuredClone(col(tableId)[rowId])},
 async deleteRow({tableId,rowId}){delete col(tableId)[rowId]}};
const deletedUsers=[]; const deletedFiles=[]; const statusChanges=[]; const storedFiles={};
const api=createApi(db,{endpoint:'https://cloud.appwrite.io/v1',users:{delete:async({userId})=>deletedUsers.push(userId),get:async({userId})=>({email:`${userId}@esempio.it`,labels:userId==='boss'?['admin']:[]}),updateStatus:async({userId,status})=>statusChanges.push([userId,status])},storage:{deleteFile:async(f)=>deletedFiles.push(f.fileId),getFile:async({fileId})=>storedFiles[fileId]??(()=>{throw new Error('nf')})(),getFileView:async()=>new Uint8Array([104,105]).buffer}});
const P=(id,extra)=>col('profiles')[id]={$id:id,userId:id,userType:'professional',firstName:id,connections:[],$permissions:[`update("user:${id}")`],...extra};
const FUTURE=new Date(Date.now()+30*86400000).toISOString();
P('anna',{premiumUntil:FUTURE});P('bob');P('piscina',{userType:'structure',structureName:'Piscina Blu'});P('eve');
const rejects=async(p,status)=>{try{await p;assert.fail('doveva fallire')}catch(e){assert.equal(e.status,status,e.message)}};
const notifs=(u,type)=>Object.values(col('notifications')).filter(n=>n.userId===u&&(!type||n.type===type));

// Messaggi
const m=await api.sendMessage('anna',{receiverId:'bob',content:'ciao'});
assert.equal(m.conversationId,'anna_bob'); assert.deepEqual(m.$permissions,['read("user:anna")','read("user:bob")']);
await rejects(api.sendMessage('anna',{receiverId:'anna',content:'x'}),400);
assert.equal((await api.markConversationRead('anna',{conversationId:'anna_bob'})).updated,0);
assert.equal((await api.markConversationRead('bob',{conversationId:'anna_bob'})).updated,1);

// Collegamenti
const c=await api.sendConnectionRequest('anna',{receiverId:'bob'});
await rejects(api.sendConnectionRequest('bob',{receiverId:'anna'}),409);
await rejects(api.respondConnectionRequest('anna',{connectionId:c.$id,accept:true}),403);
await rejects(api.respondConnectionRequest('eve',{connectionId:c.$id,accept:true}),403);
await api.respondConnectionRequest('bob',{connectionId:c.$id,accept:true});
assert.deepEqual(col('profiles').anna.connections,['bob']); assert.deepEqual(col('profiles').bob.connections,['anna']);
await rejects(api.respondConnectionRequest('bob',{connectionId:c.$id,accept:true}),409);
await rejects(api.sendConnectionRequest('anna',{receiverId:'bob'}),409);
await api.removeConnection('bob',{userId:'anna'});
assert.deepEqual(col('profiles').anna.connections,[]);
assert.ok(Object.values(col('notifications')).every(n=>n.$permissions.every(p=>p.includes(`user:${n.userId}`))));

// Like e commenti
col('posts').p1={$id:'p1',authorId:'eve',likesCount:99,commentsCount:0,$permissions:['update("user:eve")']};
const pick=({liked,likesCount})=>({liked,likesCount});
assert.deepEqual(pick(await api.toggleLike('anna',{postId:'p1'})),{liked:true,likesCount:1});
assert.deepEqual(pick(await api.toggleLike('bob',{postId:'p1'})),{liked:true,likesCount:2});
assert.deepEqual(pick(await api.toggleLike('anna',{postId:'p1'})),{liked:false,likesCount:1});
// Reazioni: cambiare tipo non duplica, la stessa reazione la toglie
let rx=await api.react('anna',{postId:'p1',reaction:'applauso'});
assert.equal(rx.reaction,'applauso'); assert.equal(rx.likesCount,2); assert.deepEqual(rx.reactionCounts,{applauso:1,consiglio:1});
rx=await api.react('anna',{postId:'p1',reaction:'adoro'}); assert.equal(rx.likesCount,2); assert.deepEqual(rx.reactionCounts,{adoro:1,consiglio:1});
rx=await api.react('anna',{postId:'p1',reaction:'adoro'}); assert.equal(rx.reaction,null); assert.equal(rx.likesCount,1);
await rejects(api.react('anna',{postId:'p1',reaction:'odio'}),400);
assert.equal(JSON.parse(col('posts').p1.reactionCounts).consiglio,1);
const cm=await api.createComment('bob',{postId:'p1',content:' bello '});
assert.equal(cm.content,'bello'); assert.equal(col('posts').p1.commentsCount,1);
await api.createComment('anna',{postId:'p1',content:'risposta',parentCommentId:cm.$id});
assert.equal(col('posts').p1.commentsCount,2);
await rejects(api.createComment('anna',{postId:'nope',content:'x'}),404);

// Eliminazione commenti e post
const c2=await api.createComment('anna',{postId:'p1',content:'da cancellare'});
await rejects(api.deleteComment('bob',{commentId:c2.$id}),403);
await api.deleteComment('anna',{commentId:c2.$id});
assert.equal(col('posts').p1.commentsCount,2);
await api.deleteComment('eve',{commentId:cm.$id}); // autore del post: elimina anche la risposta
assert.equal(col('posts').p1.commentsCount,0);
col('posts').p2={$id:'p2',authorId:'anna',likesCount:0,commentsCount:0,$permissions:['update("user:anna")']};
await rejects(api.updatePost('bob',{postId:'p2',content:'hack'}),403);
const edited=await api.updatePost('anna',{postId:'p2',content:' nuovo testo ',category:'pensiero',likesCount:999});
assert.equal(edited.content,'nuovo testo'); assert.equal(edited.category,'pensiero'); assert.equal(edited.likesCount,0); assert.ok(edited.editedAt);
await api.toggleLike('bob',{postId:'p2'}); await api.createComment('bob',{postId:'p2',content:'ok'});
await rejects(api.deletePost('bob',{postId:'p2'}),403);
assert.deepEqual(await api.deletePost('anna',{postId:'p2'}),{deleted:true});
assert.equal(col('posts').p2,undefined);
assert.equal(Object.values(col('likes')).filter(l=>l.postId==='p2').length,0);
assert.equal(Object.values(col('comments')).filter(c=>c.postId==='p2').length,0);

// Lavoro: job pubblicato dalla struttura "piscina"
col('jobs').j1={$id:'j1',structureId:'piscina',title:'Bagnino',isActive:true,candidates:[],$permissions:['update("user:piscina")']};
assert.deepEqual(ownersOf(col('jobs').j1),['piscina']);
const app=await api.applyForJob('anna',{jobId:'j1',coverLetter:'ciao'});
assert.ok(app.$permissions.includes('read("user:piscina")')); assert.ok(!app.$permissions.some(p=>p.startsWith('update')));
await rejects(api.applyForJob('anna',{jobId:'j1'}),409);
{ col('jobs').jw={$id:'jw',structureId:'piscina',title:'Bagnino',isActive:true,candidates:[],$permissions:['update("user:piscina")']};
  const aw=await api.applyForJob('bob',{jobId:'jw'}); assert.deepEqual(col('jobs').jw.candidates,['bob']);
  await rejects(api.withdrawApplication('anna',{applicationId:aw.$id}),403);
  assert.deepEqual(await api.withdrawApplication('bob',{applicationId:aw.$id}),{withdrawn:true});
  assert.deepEqual(col('jobs').jw.candidates,[]); assert.equal(col('applications')[aw.$id],undefined); delete col('jobs').jw; }
await rejects(api.applyForJob('piscina',{jobId:'j1'}),403);
await rejects(api.updateApplicationStatus('eve',{applicationId:app.$id,status:'rejected'}),403);
await rejects(api.updateApplicationStatus('anna',{applicationId:app.$id,status:'accepted'}),403);
await rejects(api.updateApplicationStatus('piscina',{applicationId:app.$id,status:'hired'}),400);
await api.updateApplicationStatus('piscina',{applicationId:app.$id,status:'reviewed'});
await rejects(api.hireCandidate('anna',{applicationId:app.$id}),403);
assert.deepEqual(await api.hireCandidate('piscina',{applicationId:app.$id}),{hired:true});
assert.equal(col('jobs').j1.isActive,false); assert.ok(col('profiles').piscina.connections.includes('anna'));
await rejects(api.applyForJob('bob',{jobId:'j1'}),409);

// Struttura gestita anche da un co-amministratore (eve), live, meet
P('f1',{userType:'structure',structureName:'Centro',staff:['eve'],coAdmins:['eve']});
col('jobs').j2={$id:'j2',structureId:'f1',title:'Istruttore',isActive:true,$permissions:['update("user:eve")']};
const a2=await api.applyForJob('bob',{jobId:'j2'}); assert.ok(a2.$permissions.includes('read("user:eve")'));
await api.hireCandidate('eve',{applicationId:a2.$id}); assert.deepEqual(col('profiles').f1.staff,['eve','bob']);

// Area staff: solo amministratori e staff, non i semplici collegamenti
assert.deepEqual(col('profiles').piscina.staff,['anna']);
col('profiles').piscina.connections=[...col('profiles').piscina.connections,'eve'];
await rejects(api.getTeamBoard('eve',{structureId:'piscina'}),403); // collegata ma non staff
await rejects(api.getTeamBoard('anna',{structureId:'nessuna'}),404);
assert.equal((await api.getTeamBoard('anna',{structureId:'piscina'})).role,'staff');
assert.equal((await api.getTeamBoard('piscina',{structureId:'piscina'})).role,'admin');
await rejects(api.createAnnouncement('anna',{structureId:'piscina',content:'Riunione lunedì'}),403);
const ann=await api.createAnnouncement('piscina',{structureId:'piscina',content:'Riunione lunedì',isImportant:true});
assert.deepEqual(ann.$permissions,[]); assert.ok(notifs('anna').some(n=>n.content.includes('comunicazione importante')));
assert.equal((await api.markAnnouncementsRead('anna',{structureId:'piscina'})).updated,1);
await rejects(api.deleteAnnouncement('anna',{announcementId:ann.$id}),403);
const shiftDay=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
await rejects(api.createShift('piscina',{structureId:'piscina',userId:'eve',date:shiftDay,shiftTime:'08:00–12:00'}),400); // non è staff
await rejects(api.createShift('piscina',{structureId:'piscina',userId:'anna',date:shiftDay,shiftTime:'12:00–08:00'}),400);
await rejects(api.createShift('anna',{structureId:'piscina',userId:'anna',date:shiftDay,shiftTime:'08:00–12:00'}),403);
const sh=await api.createShift('piscina',{structureId:'piscina',userId:'anna',date:shiftDay,shiftTime:'08:00–12:00'});
assert.equal(sh.userName,'anna'); assert.equal((await api.getTeamBoard('anna',{structureId:'piscina'})).shifts.length,1);
const mine=await api.listMyShifts('anna'); assert.equal(mine.length,1); assert.equal(mine[0].structureName,'Piscina Blu'); assert.equal((await api.listMyShifts('eve')).length,0);
await rejects(api.respondShift('piscina',{shiftId:sh.$id,status:'confirmed'}),403);
assert.equal((await api.respondShift('anna',{shiftId:sh.$id,status:'declined'})).status,'declined');
assert.ok(notifs('piscina').some(n=>n.content.includes('non può coprire')));
await rejects(api.removeStaffMember('eve',{structureId:'piscina',staffId:'anna'}),403);
assert.deepEqual(await api.removeStaffMember('anna',{structureId:'piscina',staffId:'anna'}),{removed:true}); // lascia il team
assert.deepEqual(col('profiles').piscina.staff,[]); assert.equal(Object.keys(col('shifts')).length,0);
await rejects(api.getTeamBoard('anna',{structureId:'piscina'}),403);
await rejects(api.removeStaffMember('anna',{structureId:'f1',staffId:'bob'}),403);
assert.deepEqual(await api.removeStaffMember('eve',{structureId:'f1',staffId:'bob'}),{removed:true});
col('profiles').f1.staff=['eve','bob'];
col('live_rooms').r1={$id:'r1',hostId:'eve',status:'active',speakers:['eve'],listeners:[]};
let r=await api.joinLiveRoom('bob',{roomId:'r1',role:'speaker'}); assert.deepEqual(r.speakers,['eve']); assert.deepEqual(r.listeners,['bob']);
r=await api.leaveLiveRoom('bob',{roomId:'r1'}); assert.deepEqual(r.listeners,[]);
col('swim_meets').s1={$id:'s1',creatorId:'eve',status:'upcoming',participants:['eve'],maxParticipants:2};
await api.joinSwimMeet('bob',{meetId:'s1'}); assert.equal((await api.joinSwimMeet('anna',{meetId:'s1'})).myStatus,'waitlist');
await rejects(api.leaveSwimMeet('eve',{meetId:'s1'}),400);
// Swim-meet creato dal server: l'organizzatore è chi chiama
const meetDay=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
await rejects(api.createSwimMeet('bob',{title:'Allenamento',description:'Ripetute in vasca lunga',date:'2020-01-01',time:'18:00',city:'Milano'}),400);
await rejects(api.createSwimMeet('bob',{title:'Allenamento',description:'Ripetute in vasca lunga',date:meetDay,time:'25:00',city:'Milano'}),400);
await rejects(api.createSwimMeet('bob',{title:'Allenamento',description:'Ripetute in vasca lunga',date:meetDay,time:'18:00',city:'Milano',maxParticipants:1}),400);
const meet=await api.createSwimMeet('bob',{title:'Allenamento',description:'Ripetute in vasca lunga',date:meetDay,time:'18:00',city:'Milano',creatorId:'anna'});
assert.equal(meet.creatorId,'bob'); assert.deepEqual(meet.participants,['bob']); assert.deepEqual(meet.$permissions,['read("users")']);
await api.joinSwimMeet('eve',{meetId:meet.$id});
await rejects(api.cancelSwimMeet('eve',{meetId:meet.$id}),403);
assert.equal((await api.cancelSwimMeet('bob',{meetId:meet.$id})).status,'cancelled');
assert.ok(notifs('eve').some(n=>n.content.includes('annullato')));
await api.leaveSwimMeet('bob',{meetId:'s1'}); assert.deepEqual(col('swim_meets').s1.participants,['eve','anna']); // il primo in attesa entra

// Notifiche di consigli e commenti
col('posts').p3={$id:'p3',authorId:'eve',likesCount:0,commentsCount:0,$permissions:['update("user:eve")']};
const likeN=notifs('eve','like').length, commentN=notifs('eve','comment').length, bobN=notifs('bob','comment').length;
await api.toggleLike('anna',{postId:'p3'});
assert.equal(notifs('eve','like').length,likeN+1);
await api.toggleLike('eve',{postId:'p3'}); // like al proprio post: nessuna notifica
assert.equal(notifs('eve','like').length,likeN+1);
const c3=await api.createComment('bob',{postId:'p3',content:'bel post'});
assert.equal(notifs('eve','comment').length,commentN+1);
await api.createComment('anna',{postId:'p3',content:'concordo',parentCommentId:c3.$id});
assert.equal(notifs('bob','comment').length,bobN+1);
assert.ok(notifs('eve').length>=3);
const before=notifs('eve').filter(n=>!n.isRead).length; assert.ok(before>0);
await api.markAllNotificationsRead('eve');
assert.equal(notifs('eve').filter(n=>!n.isRead).length,0);

// Segnalazioni
await rejects(api.reportContent('bob',{targetType:'post',targetId:'p3',reason:'boh'}),400);
assert.deepEqual(await api.reportContent('bob',{targetType:'post',targetId:'p3',reason:'spam'}),{reported:true});
assert.deepEqual(await api.reportContent('bob',{targetType:'post',targetId:'p3',reason:'spam'}),{reported:true,duplicate:true});
assert.deepEqual(Object.values(col('reports'))[0].$permissions,[]);

// Competenze ed endorsement
col('profiles').eve.skills=['Salvamento','Aquagym']; col('profiles').eve.connections=['bob'];
col('profiles').bob.connections=[...(col('profiles').bob.connections||[]),'eve'];
await rejects(api.toggleEndorsement('eve',{profileId:'eve',skill:'Salvamento'}),400);
await rejects(api.toggleEndorsement('bob',{profileId:'eve',skill:'Pallanuoto'}),404);
P('anna2'); // utente non collegato a eve
await rejects(api.toggleEndorsement('anna2',{profileId:'eve',skill:'Salvamento'}),403);
assert.deepEqual(await api.toggleEndorsement('bob',{profileId:'eve',skill:'Salvamento'}),{endorsed:true});
assert.equal(notifs('eve','endorsement').length,1);
assert.deepEqual(await api.toggleEndorsement('bob',{profileId:'eve',skill:'Salvamento'}),{endorsed:false});
assert.equal(Object.values(col('endorsements')).length,0);
await api.toggleEndorsement('bob',{profileId:'eve',skill:'Aquagym'});

// Endorsement: l'elenco dei collegamenti dell'endorser da solo non basta
col('profiles').anna2.connections=['eve']; // anna2 si "aggiunge" eve da sola
await rejects(api.toggleEndorsement('anna2',{profileId:'eve',skill:'Salvamento'}),403);

// Creazione post e annunci lato server
const pp=await api.createPost('bob',{content:' ciao ',authorId:'eve',media:[JSON.stringify({type:'image',url:'https://cloud.appwrite.io/v1/storage/buckets/post_media/files/f1/view'})],postType:'image',category:'boh'});
assert.equal(pp.authorId,'bob'); assert.equal(pp.content,'ciao'); assert.equal(pp.category,'generale');
assert.deepEqual(pp.$permissions,['read("users")']); // modifiche solo tramite la Function
await rejects(api.createPost('bob',{content:'',media:[]}),400);
await rejects(api.createPost('bob',{content:'x',media:[{type:'image',url:'https://evil.example/x.jpg'}]}),400);
const jobBase={title:'Istruttore',description:'Corsi bambini',role:'istruttore',city:'Milano',salaryMin:'1200'};
await rejects(api.createJob('bob',{...jobBase,structureId:'bob'}),403); // bob è un professionista
await rejects(api.createJob('bob',{...jobBase,structureId:'piscina'}),403); // struttura altrui
const jp=await api.createJob('piscina',{...jobBase,structureId:'piscina',structureName:'Falso Nome'});
assert.equal(jp.structureName,'Piscina Blu'); assert.equal(jp.salaryMin,1200); assert.equal(jp.isActive,true);
const jf=await api.createJob('eve',{...jobBase,structureId:'f1'});
assert.equal(jf.structureName,'Centro');
assert.match(jp.expiresAt,/^\d{4}-\d{2}-\d{2}$/); // scadenza predefinita a 30 giorni
const day=(n)=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
assert.equal((await api.createJob('piscina',{...jobBase,structureId:'piscina',expiryDays:7})).expiresAt,day(7));
await rejects(api.createJob('piscina',{...jobBase,structureId:'piscina',salaryMin:2000,salaryMax:1000}),400);
await rejects(api.createJob('piscina',{...jobBase,structureId:'piscina',isSOS:true,sosDate:'Oggi'}),400);
await rejects(api.createJob('piscina',{...jobBase,structureId:'piscina',isSOS:true,sosDate:day(90)}),400);
await rejects(api.createJob('piscina',{...jobBase,structureId:'piscina',isSOS:true,sosDate:day(2),sosShift:'pomeriggio'}),400);
const sos=await api.createJob('piscina',{...jobBase,structureId:'piscina',isSOS:true,sosDate:day(2),sosShift:'15:00–19:00'});
assert.equal(sos.expiresAt,day(2)); assert.equal(sos.isSOS,true);

// Profili: scritture solo dal server, con validazione
{
const nuovo=await api.initProfile('zoe',{userType:'professional',personType:'enthusiast',firstName:'Zoe',lastName:"D'Angelo"});
assert.equal(nuovo.email,undefined); assert.equal(nuovo.personType,'enthusiast'); assert.deepEqual(nuovo.$permissions,['read("users")']);
assert.equal((await api.initProfile('zoe',{userType:'structure',structureName:'X'})).userType,'professional'); // idempotente
await rejects(api.initProfile('yan',{userType:'admin'}),400);
await rejects(api.initProfile('yan',{userType:'professional',firstName:'Y4n',lastName:'Ok'}),400);
const up=await api.updateMyProfile('zoe',{city:'segrate',province:'mi',phone:'333 123 4567',website:'zoe.it',connections:['anna'],userType:'structure',bio:' ciao '});
assert.equal(up.city,'Segrate'); assert.equal(up.province,'MI'); assert.equal(up.phone,null); assert.equal(col('private_info').zoe.phone,'3331234567'); assert.deepEqual(col('private_info').zoe.$permissions,[]);
// Profilo pubblico: strutture sempre, persone solo se lo scelgono; nessun dato privato
await rejects(api.publicProfile(null,{id:'zoe'}),403);
await api.updateMyProfile('zoe',{publicProfile:true});
const pub=await api.publicProfile(null,{id:'zoe'});
assert.equal(pub.kind,'person'); assert.equal(pub.name,"Zoe D'Angelo"); assert.equal(pub.phone,undefined); assert.equal(pub.email,undefined);
assert.equal((await api.publicProfile(null,{id:'piscina'})).kind,'structure');
await rejects(api.publicProfile(null,{id:'nessuno'}),404);
await rejects(api.publicProfile(null,{id:'../x'}),400);
assert.ok((await api.publicSitemap(null)).some((r)=>r.id==='zoe'));
await api.updateMyProfile('zoe',{publicProfile:false});
// Mi piace ai commenti
{ col('posts').ps={$id:'ps',authorId:'anna',content:'Allenamento',likesCount:0,commentsCount:0};
  const cs=await api.createComment('bob',{postId:'ps',content:'Grande!'});
  assert.deepEqual(await api.toggleCommentLike('anna',{commentId:cs.$id}),{liked:true,likesCount:1});
  assert.ok(notifs('bob').some(n=>n.content.includes('apprezzato il tuo commento')));
  assert.deepEqual(await api.toggleCommentLike('anna',{commentId:cs.$id}),{liked:false,likesCount:0});
  await api.toggleCommentLike('eve',{commentId:cs.$id});
  await api.deleteComment('bob',{commentId:cs.$id}); assert.equal(Object.values(col('comment_likes')).length,0);
// Ripubblicazione: sempre dell'originale, una sola senza pensiero, conteggio aggiornato
  const r1=await api.repost('bob',{postId:'ps'});
  assert.equal(r1.repostOf,'ps'); assert.equal(r1.authorId,'bob'); assert.equal(col('posts').ps.repostsCount,1);
  assert.ok(notifs('anna').some(n=>n.type==='repost'));
  await rejects(api.repost('bob',{postId:'ps'}),409);
  const r2=await api.repost('eve',{postId:r1.$id,content:'Da leggere'}); assert.equal(r2.repostOf,'ps'); assert.equal(col('posts').ps.repostsCount,2);
  assert.deepEqual(await api.undoRepost('bob',{postId:'ps'}),{removed:1,repostsCount:1});
  await api.deletePost('eve',{postId:r2.$id}); assert.equal(col('posts').ps.repostsCount,0);
  delete col('posts').ps; }

// Visite al profilo: notifica una volta al giorno, anonime se scelto, mai a se stessi
{ const before=notifs('bob','profile_view').length;
  assert.deepEqual(await api.recordProfileView('anna',{profileId:'anna'}),{recorded:false});
  assert.equal((await api.recordProfileView('anna',{profileId:'bob'})).notified,true);
  assert.equal((await api.recordProfileView('anna',{profileId:'bob'})).notified,false);
  assert.equal(notifs('bob','profile_view').length,before+1);
  assert.ok(notifs('bob','profile_view').at(-1).content.startsWith('anna'));
  col('profiles').eve.hideProfileViews=true;
  await api.recordProfileView('eve',{profileId:'piscina'}); // Base: la visita anonima non è disponibile
  assert.equal(notifs('piscina','profile_view').at(-1).content,'eve ha visualizzato il tuo profilo.');
  col('profiles').eve.premiumUntil=FUTURE;
  await api.recordProfileView('eve',{profileId:'bob'}); // Premium verso un profilo Base: anonima
  assert.equal(notifs('bob','profile_view').at(-1).content,'Qualcuno ha visualizzato il tuo profilo.');
  await api.recordProfileView('eve',{profileId:'anna'}); // verso un profilo Premium: sempre con il nome
  assert.ok(notifs('anna','profile_view').at(-1).content.startsWith('eve'));
  const views=await api.listProfileViews('bob'); assert.equal(views.viewers.length,2);
  assert.ok(views.viewers.some(v=>v.id===null)); assert.ok(views.viewers.some(v=>v.id==='anna'));
  // Base: si vedono solo gli ultimi visitatori, il resto è riservato a Premium
  for (const v of ['v1','v2','v3','v4']) { P(v); await api.recordProfileView(v,{profileId:'bob'}); }
  const locked=await api.listProfileViews('bob'); assert.equal(locked.viewers.length,3); assert.equal(locked.locked,3); assert.equal(locked.premium,false);
  await rejects(api.getMyStats('bob'),402);
  const stats=await api.getMyStats('anna'); assert.equal(stats.viewsPerDay.length,30);
  delete col('profiles').eve.hideProfileViews; delete col('profiles').eve.premiumUntil; }

// Contatti privati: solo la persona, i collegamenti reciproci e chi valuta una sua candidatura
assert.deepEqual(await api.getContactInfo('zoe',{profileId:'zoe'}),{phone:'3331234567',email:'zoe@esempio.it',allowed:true});
assert.deepEqual(await api.getContactInfo('eve',{profileId:'zoe'}),{phone:'',email:'',allowed:false});
col('profiles').zoe.connections=['eve']; // scritto solo da zoe: non basta
assert.equal((await api.getContactInfo('eve',{profileId:'zoe'})).allowed,false);
col('profiles').eve.connections=['zoe'];
assert.equal((await api.getContactInfo('eve',{profileId:'zoe'})).phone,'3331234567');
col('profiles').zoe.connections=[]; col('profiles').eve.connections=[];
col('jobs').jz={$id:'jz',structureId:'piscina',title:'Istruttore',isActive:true};
col('applications').az={$id:'az',jobId:'jz',applicantId:'zoe',status:'pending'};
assert.equal((await api.getContactInfo('piscina',{profileId:'zoe'})).allowed,true);
assert.equal((await api.getContactInfo('eve',{profileId:'piscina'})).allowed,false);
delete col('jobs').jz; delete col('applications').az; assert.equal(up.website,'https://zoe.it/');
assert.equal(up.bio,'ciao'); assert.deepEqual(up.connections,[]); assert.equal(up.userType,'professional'); // campi protetti ignorati
await rejects(api.updateMyProfile('zoe',{city:'Roma',province:'MI'}),400); // comune fuori provincia
await rejects(api.updateMyProfile('zoe',{avatar:'https://evil.example/pixel.gif'}),400);
await api.updateMyProfile('zoe',{avatar:'https://fra.cloud.appwrite.io/v1/storage/buckets/avatars/files/abc/view?project=p'});
await rejects(api.updateMyProfile('zoe',{experienceList:[JSON.stringify({role:'Istruttrice',facility:'Lido',startDate:'2099-01'})]}),400);
const exp=await api.updateMyProfile('zoe',{experienceList:[{role:'Istruttrice',facility:'Lido',startDate:'2020-01',endDate:'2021-02',extra:'x'}]});
assert.deepEqual(JSON.parse(exp.experienceList[0]),{role:'Istruttrice',facility:'Lido',startDate:'2020-01',endDate:'2021-02'});
const c1=await api.updateMyProfile('zoe',{certificationsList:[{name:'BLSD esecutore',issuer:'IRC',category:'primo_soccorso',expiry:'2030-01-01',verified:true}]});
const cert=JSON.parse(c1.certificationsList[0]); assert.equal(cert.verified,undefined); assert.ok(cert.id); // il client non può verificarsi da solo
col('profiles').zoe.certificationsList=[JSON.stringify({...cert,verified:true,verifiedBy:'admin'})];
const c2=await api.updateMyProfile('zoe',{certificationsList:[{...cert}]});
assert.equal(JSON.parse(c2.certificationsList[0]).verified,true); // invariato: la verifica resta
const c3=await api.updateMyProfile('zoe',{certificationsList:[{...cert,expiry:'2035-01-01'}]});
assert.equal(JSON.parse(c3.certificationsList[0]).verified,undefined); // modificato: verifica persa
assert.deepEqual((await api.updateMyProfile('zoe',{availability:['lun-sera','xx','lun-sera']})).availability,['lun-sera']);
await api.setPresence('zoe',{isOnline:false,typingTo:'anna'}); assert.equal(col('profiles').zoe.isOnline,false); assert.equal(col('profiles').zoe.typingTo,undefined); // non più sul profilo pubblico
assert.deepEqual([col('typing').zoe.targetId,col('typing').zoe.$permissions],['anna',['read("user:anna")']]);
await api.setPresence('zoe',{typingTo:null}); assert.equal(col('typing').zoe,undefined);
// Co-amministratori: li sceglie solo il titolare, tra lo staff
await rejects(api.setCoAdmin('eve',{structureId:'f1',userId:'bob',admin:true}),403);
await rejects(api.setCoAdmin('f1',{structureId:'f1',userId:'zoe',admin:true}),400);
assert.deepEqual((await api.setCoAdmin('f1',{structureId:'f1',userId:'bob',admin:true})).coAdmins,['eve','bob']);
assert.ok(notifs('bob').some(n=>n.content.includes('co-amministratore')));
const coJob=await api.createJob('bob',{structureId:'f1',title:'Assistente bagnanti',description:'Turni serali in vasca grande, brevetto richiesto.',role:'assistente',city:'Milano'});
assert.equal(coJob.structureName,'Centro');
await rejects(api.createJob('zoe',{structureId:'f1',title:'Finto',description:'Annuncio non autorizzato per la struttura.',role:'x',city:'Milano'}),403);
for (const j of Object.values(col('jobs'))) j.$createdAt ??= new Date(0).toISOString(); // il finto DB non lo mette
assert.ok((await api.listStructureJobs('bob',{structureId:'f1'})).some(j=>j.$id===coJob.$id));
await rejects(api.removeStaffMember('eve',{structureId:'f1',staffId:'bob'}),403); // un co-amministratore lo toglie solo il titolare
assert.deepEqual((await api.setCoAdmin('f1',{structureId:'f1',userId:'bob',admin:false})).coAdmins,['eve']);
await rejects(api.createJob('bob',{structureId:'f1',title:'Ancora',description:'Non più co-amministratore della struttura.',role:'x',city:'Milano'}),403);
assert.equal((await api.listMyTeams('eve')).find(t=>t.structureId==='f1').role,'admin');
assert.equal((await api.listMyTeams('bob')).find(t=>t.structureId==='f1').role,'staff');
}

// Recensioni delle strutture
{
await rejects(api.upsertReview('anna',{structureId:'bob',rating:5,content:'Bellissima esperienza in vasca, staff gentile.'}),400); // non è una struttura
await rejects(api.upsertReview('piscina',{structureId:'piscina',rating:5,content:'Bellissima esperienza in vasca, staff gentile.'}),403);
await rejects(api.upsertReview('anna',{structureId:'piscina',rating:6,content:'Bellissima esperienza in vasca, staff gentile.'}),400);
await rejects(api.upsertReview('anna',{structureId:'piscina',rating:4,content:'corta'}),400);
const r1=await api.upsertReview('anna',{structureId:'piscina',rating:4,content:'Acqua pulita e corsie ben organizzate, spogliatoi da migliorare.',visitedAt:'2026-09'});
assert.equal(r1.ratingCount,1); assert.equal(r1.ratingSum,4); assert.deepEqual(r1.review.$permissions,['read("users")']);
const r2=await api.upsertReview('anna',{structureId:'piscina',rating:2,content:'Ripensandoci: spogliatoi davvero trascurati e docce fredde.'});
assert.equal(r2.ratingCount,1); assert.equal(r2.ratingSum,2); assert.equal(r2.review.$id,r1.review.$id); // stessa recensione aggiornata
await api.upsertReview('bob',{structureId:'piscina',rating:5,content:'Ottimi corsi master, allenatori preparati e puntuali.'});
assert.equal(col('profiles').piscina.ratingCount,2); assert.equal(col('profiles').piscina.ratingSum,7);
await rejects(api.replyReview('bob',{reviewId:r1.review.$id,reply:'Grazie'}),403);
assert.equal((await api.replyReview('piscina',{reviewId:r1.review.$id,reply:'Grazie, stiamo rinnovando gli spogliatoi.'})).reply,'Grazie, stiamo rinnovando gli spogliatoi.');
await rejects(api.deleteReview('bob',{reviewId:r1.review.$id}),403);
assert.equal((await api.deleteReview('anna',{reviewId:r1.review.$id})).ratingCount,1);
// struttura: chi la co-amministra non può recensirla
await rejects(api.upsertReview('eve',{structureId:'f1',rating:5,content:'La mia piscina è la migliore di tutte, venite!'}),403);
assert.equal((await api.upsertReview('anna',{structureId:'f1',rating:3,content:'Nella media, vasca un po\' affollata la sera.'})).ratingCount,1);
}

// Blocco, silenziamento e moderazione
{
P('boss'); P('troll',{premiumUntil:FUTURE});
col('profiles').anna.connections=['troll']; col('profiles').troll.connections=['anna'];
await api.blockUser('anna',{userId:'troll'});
assert.deepEqual(col('profiles').anna.connections,[]); assert.deepEqual(col('profiles').troll.connections,[]);
await rejects(api.sendMessage('troll',{receiverId:'anna',content:'ciao'}),403);
await rejects(api.sendMessage('anna',{receiverId:'troll',content:'ciao'}),403);
await rejects(api.sendConnectionRequest('troll',{receiverId:'anna'}),403);
const rel=await api.listBlockRelations('troll'); assert.deepEqual(rel.blockedBy,['anna']); assert.equal(rel.isAdmin,false);
await api.blockUser('anna',{userId:'bob',kind:'mute'});
assert.deepEqual((await api.listBlockRelations('anna')).muted,['bob']);
await api.unblockUser('anna',{userId:'troll'});
await api.sendMessage('troll',{receiverId:'anna',content:'scusa'});
assert.ok(Object.values(col('blocks')).every(b=>b.$permissions.length===1&&b.$permissions[0]===`read("user:${b.blockerId}")`));
// pannello admin
await rejects(api.adminOverview('anna'),403);
assert.equal((await api.listBlockRelations('boss')).isAdmin,true);
col('posts').pt={$id:'pt',authorId:'troll',content:'spam spam',likesCount:0,commentsCount:0,$permissions:['update("user:troll")']};
await api.reportContent('anna',{targetType:'post',targetId:'pt',reason:'spam'});
await api.reportContent('bob',{targetType:'post',targetId:'pt',reason:'spam'});
const reps=await api.adminListReports('boss',{status:'open'});
const rp=reps.find(r=>r.targetId==='pt'); assert.equal(rp.target.authorId,'troll'); assert.equal(rp.target.text,'spam spam');
assert.equal((await api.adminResolveReport('boss',{reportId:rp.$id,decision:'remove'})).closed,2);
assert.equal(col('posts').pt,undefined);
await rejects(api.adminSetSuspended('boss',{userId:'boss',suspended:true}),400);
await api.adminSetSuspended('boss',{userId:'troll',suspended:true});
assert.deepEqual(statusChanges.at(-1),['troll',false]); assert.equal(col('profiles').troll.suspended,true);
await rejects(api.adminSetSuspended('anna',{userId:'troll',suspended:false}),403);
await api.logClientError('anna',{message:'TypeError: x is undefined',url:'/home'});
assert.equal((await api.adminListErrors('boss')).length,1);
assert.ok((await api.adminOverview('boss')).openReports>=0);
}

// Verifica dei brevetti
{
P('vera');
const withCert=await api.updateMyProfile('vera',{certificationsList:[{name:'Brevetto Assistente Bagnanti',issuer:'SNS',category:'salvamento',expiry:'2030-05-01'}]});
const certId=JSON.parse(withCert.certificationsList[0]).id;
storedFiles.f1={$id:'f1',mimeType:'image/jpeg',name:'brevetto.jpg',$permissions:['read("user:vera")','delete("user:vera")']};
storedFiles.f2={$id:'f2',mimeType:'image/jpeg',name:'altrui.jpg',$permissions:['read("user:anna")']};
await rejects(api.requestCertVerification('vera',{certId,fileId:'f2'}),403); // file di un altro utente
await rejects(api.requestCertVerification('vera',{certId:'nope',fileId:'f1'}),404);
const pending=await api.requestCertVerification('vera',{certId,fileId:'f1'});
assert.equal(pending.verificationStatus,'pending'); assert.equal(col('profiles').vera.pendingVerification,true);
await rejects(api.adminListPendingCerts('vera'),403);
const queue=await api.adminListPendingCerts('boss'); assert.equal(queue.find(q=>q.profileId==='vera').cert.id,certId);
assert.equal((await api.adminGetCertDocument('boss',{profileId:'vera',certId})).dataUrl,'data:image/jpeg;base64,aGk=');
await rejects(api.adminVerifyCert('boss',{profileId:'vera',certId,approve:false}),400); // serve il motivo
const ok=await api.adminVerifyCert('boss',{profileId:'vera',certId,approve:true});
assert.equal(ok.verified,true); assert.equal(col('profiles').vera.pendingVerification,false);
// l'utente può modificare altri campi senza perdere la verifica, ma non può cambiare il brevetto verificato
const same=JSON.parse(col('profiles').vera.certificationsList[0]);
assert.equal(JSON.parse((await api.updateMyProfile('vera',{certificationsList:[same]})).certificationsList[0]).verified,true);
const changed=JSON.parse((await api.updateMyProfile('vera',{certificationsList:[{...same,expiry:'2031-01-01'}]})).certificationsList[0]);
assert.equal(changed.verified,undefined); assert.equal(changed.documentFileId,'f1');
}

// Bordo Vasca Live
const room=await api.createLiveRoom('piscina',{title:'Didattica vasca piccola',hostId:'bob'});
assert.equal(room.hostId,'piscina'); assert.deepEqual(room.speakers,['piscina']);
await rejects(api.createLiveRoom('piscina',{title:'Seconda'}),409);
await rejects(api.sendLiveMessage('bob',{roomId:room.$id,content:'ciao'}),403);
await api.joinLiveRoom('bob',{roomId:room.$id,role:'listener'});
const lm=await api.sendLiveMessage('bob',{roomId:room.$id,content:'Domanda sui 4 anni',kind:'question'});
assert.equal(lm.authorId,'bob'); assert.equal(lm.kind,'question');
assert.equal((await api.sendLiveMessage('bob',{roomId:room.$id,kind:'hand'})).content,'✋');
await rejects(api.setLiveSpeaker('bob',{roomId:room.$id,userId:'bob',onStage:true}),403);
const staged=await api.setLiveSpeaker('piscina',{roomId:room.$id,userId:'bob',onStage:true});
assert.deepEqual(staged.speakers,['piscina','bob']); assert.deepEqual(staged.listeners,[]);

// Eliminazione account di anna
col('profiles').anna.avatar='https://cloud.appwrite.io/v1/storage/buckets/avatars/files/avatarAnna/view?project=x';
col('profiles').anna.connections=['bob']; col('profiles').bob.connections=['anna','eve'];
col('posts').pa={$id:'pa',authorId:'anna',likesCount:0,commentsCount:0,media:[JSON.stringify({type:'image',url:'https://cloud.appwrite.io/v1/storage/buckets/post_media/files/fotoAnna/view'})],$permissions:['update("user:anna")']};
await api.toggleLike('bob',{postId:'pa'});
// anna ha già consigliato p3 più sopra
const likesP3=col('posts').p3.likesCount;
col('profiles').f1.staff=[...col('profiles').f1.staff,'anna']; col('profiles').f1.coAdmins=['eve','anna'];
col('swim_meets').sa={$id:'sa',creatorId:'anna',status:'upcoming',participants:['anna','bob']};
await rejects(api.deleteAccount('anna',{confirmation:'si'}),400);
assert.deepEqual(await api.deleteAccount('anna',{confirmation:'ELIMINA'}),{deleted:true});
assert.deepEqual(deletedUsers,['anna']);
assert.equal(col('profiles').anna,undefined);
assert.equal(col('posts').pa,undefined);
assert.equal(Object.values(col('likes')).filter(l=>l.userId==='anna'||l.postId==='pa').length,0);
assert.equal(col('posts').p3.likesCount,likesP3-1);
assert.equal(Object.values(col('comments')).filter(c=>c.authorId==='anna').length,0);
assert.deepEqual(col('profiles').bob.connections,['eve']);
assert.equal(Object.values(col('applications')).filter(a=>a.applicantId==='anna').length,0);
assert.ok(!col('profiles').f1.staff.includes('anna')); assert.deepEqual(col('profiles').f1.coAdmins,['eve']);
assert.equal(col('swim_meets').sa.status,'cancelled');
assert.equal(notifs('anna').length,0);
assert.ok(deletedFiles.includes('avatarAnna') && deletedFiles.includes('fotoAnna'));
assert.ok(col('profiles').anna2);
});
