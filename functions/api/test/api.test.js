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
const deletedUsers=[]; const deletedFiles=[];
const api=createApi(db,{endpoint:'https://cloud.appwrite.io/v1',users:{delete:async({userId})=>deletedUsers.push(userId),get:async({userId})=>({email:`${userId}@esempio.it`})},storage:{deleteFile:async(f)=>deletedFiles.push(f.fileId)}});
const P=(id,extra)=>col('profiles')[id]={$id:id,userId:id,userType:'professional',firstName:id,connections:[],$permissions:[`update("user:${id}")`],...extra};
P('anna');P('bob');P('piscina',{userType:'structure',structureName:'Piscina Blu'});P('eve');
const rejects=async(p,status)=>{try{await p;assert.fail('doveva fallire')}catch(e){assert.equal(e.status,status,e.message)}};

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
assert.deepEqual(await api.toggleLike('anna',{postId:'p1'}),{liked:true,likesCount:1});
assert.deepEqual(await api.toggleLike('bob',{postId:'p1'}),{liked:true,likesCount:2});
assert.deepEqual(await api.toggleLike('anna',{postId:'p1'}),{liked:false,likesCount:1});
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
await rejects(api.applyForJob('piscina',{jobId:'j1'}),403);
await rejects(api.updateApplicationStatus('eve',{applicationId:app.$id,status:'rejected'}),403);
await rejects(api.updateApplicationStatus('anna',{applicationId:app.$id,status:'accepted'}),403);
await rejects(api.updateApplicationStatus('piscina',{applicationId:app.$id,status:'hired'}),400);
await api.updateApplicationStatus('piscina',{applicationId:app.$id,status:'reviewed'});
await rejects(api.hireCandidate('anna',{applicationId:app.$id}),403);
assert.deepEqual(await api.hireCandidate('piscina',{applicationId:app.$id}),{hired:true});
assert.equal(col('jobs').j1.isActive,false); assert.ok(col('profiles').piscina.connections.includes('anna'));
await rejects(api.applyForJob('bob',{jobId:'j1'}),409);

// Facility, live, meet
col('facilities').f1={$id:'f1',name:'Centro',followers:[],staff:[],admins:['eve']};
assert.deepEqual(await api.toggleFollowFacility('bob',{facilityId:'f1'}),{following:true});
assert.deepEqual(await api.toggleFollowFacility('bob',{facilityId:'f1'}),{following:false});
col('jobs').j2={$id:'j2',structureId:'f1',title:'Istruttore',isActive:true,$permissions:['update("user:eve")']};
const a2=await api.applyForJob('bob',{jobId:'j2'}); assert.ok(a2.$permissions.includes('read("user:eve")'));
await api.hireCandidate('eve',{applicationId:a2.$id}); assert.deepEqual(col('facilities').f1.staff,['bob']);
col('live_rooms').r1={$id:'r1',hostId:'eve',status:'active',speakers:['eve'],listeners:[]};
let r=await api.joinLiveRoom('bob',{roomId:'r1',role:'speaker'}); assert.deepEqual(r.speakers,['eve']); assert.deepEqual(r.listeners,['bob']);
r=await api.leaveLiveRoom('bob',{roomId:'r1'}); assert.deepEqual(r.listeners,[]);
col('swim_meets').s1={$id:'s1',creatorId:'eve',status:'upcoming',participants:['eve'],maxParticipants:2};
await api.joinSwimMeet('bob',{meetId:'s1'}); await rejects(api.joinSwimMeet('anna',{meetId:'s1'}),409);
await rejects(api.leaveSwimMeet('eve',{meetId:'s1'}),400);
await api.leaveSwimMeet('bob',{meetId:'s1'}); assert.deepEqual(col('swim_meets').s1.participants,['eve']);

// Notifiche di consigli e commenti
const notifs=(u,type)=>Object.values(col('notifications')).filter(n=>n.userId===u&&(!type||n.type===type));
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
assert.deepEqual(ownersOf(pp),['bob']);
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
assert.equal(nuovo.email,'zoe@esempio.it'); assert.equal(nuovo.personType,'enthusiast'); assert.deepEqual(nuovo.$permissions,['read("users")']);
assert.equal((await api.initProfile('zoe',{userType:'structure',structureName:'X'})).userType,'professional'); // idempotente
await rejects(api.initProfile('yan',{userType:'admin'}),400);
await rejects(api.initProfile('yan',{userType:'professional',firstName:'Y4n',lastName:'Ok'}),400);
const up=await api.updateMyProfile('zoe',{city:'segrate',province:'mi',phone:'333 123 4567',website:'zoe.it',connections:['anna'],userType:'structure',bio:' ciao '});
assert.equal(up.city,'Segrate'); assert.equal(up.province,'MI'); assert.equal(up.phone,'3331234567'); assert.equal(up.website,'https://zoe.it/');
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
await api.setPresence('zoe',{isOnline:false,typingTo:'anna'}); assert.equal(col('profiles').zoe.isOnline,false); assert.equal(col('profiles').zoe.typingTo,'anna');
// Pagine struttura
await rejects(api.createFacility('piscina',{name:'Doppia',city:'Milano',province:'MI'}),403);
const fac=await api.createFacility('zoe',{name:'Piscina Zoe',city:'Milano',province:'MI'});
assert.deepEqual(fac.admins,['zoe']); assert.ok(col('profiles').zoe.managedFacilities.includes(fac.$id));
await rejects(api.updateFacility('anna',{facilityId:fac.$id,name:'Mia'}),403);
assert.equal((await api.updateFacility('zoe',{facilityId:fac.$id,name:'Piscina Zoe 2',admins:['anna']})).name,'Piscina Zoe 2');
assert.deepEqual(col('facilities')[fac.$id].admins,['zoe']);
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
// pagina struttura: chi la amministra non può recensirla
col('facilities').fr={$id:'fr',name:'Centro Rev',admins:['eve'],staff:[],followers:[]};
await rejects(api.upsertReview('eve',{structureId:'fr',rating:5,content:'La mia piscina è la migliore di tutte, venite!'}),403);
assert.equal((await api.upsertReview('anna',{structureId:'fr',rating:3,content:'Nella media, vasca un po\' affollata la sera.'})).ratingCount,1);
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
col('facilities').fa={$id:'fa',name:'Sola',admins:['anna'],staff:[],followers:[]};
col('facilities').f1.followers=['anna','bob'];
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
assert.equal(col('facilities').fa,undefined);
assert.deepEqual(col('facilities').f1.followers,['bob']);
assert.equal(col('swim_meets').sa.status,'cancelled');
assert.equal(notifs('anna').length,0);
assert.ok(deletedFiles.includes('avatarAnna') && deletedFiles.includes('fotoAnna'));
assert.ok(col('profiles').anna2);
});
