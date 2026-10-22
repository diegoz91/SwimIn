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
 async listRows({tableId,queries}){let rows=Object.values(col(tableId));let lim=25;for(const raw of queries){const q=JSON.parse(raw);if(q.method==='equal')rows=rows.filter(d=>q.values.includes(d[q.attribute]));if(q.method==='limit')lim=q.values[0]}return {total:rows.length,rows:rows.slice(0,lim).map(d=>structuredClone(d))}},
 async createRow({tableId,rowId,data,permissions}){const d={$id:rowId,$permissions:permissions||[],...data};col(tableId)[rowId]=d;return d},
 async updateRow({tableId,rowId,data}){Object.assign(col(tableId)[rowId],data);return structuredClone(col(tableId)[rowId])},
 async deleteRow({tableId,rowId}){delete col(tableId)[rowId]}};
const api=createApi(db);
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
});
