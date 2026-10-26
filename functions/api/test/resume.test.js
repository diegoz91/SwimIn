/** CV personale: caricamento, privacy e copia allegata alle candidature. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/main.js';

const makeDb = () => {
  const store = {};
  const col = (c) => (store[c] ??= {});
  const db = {
    async getRow({ tableId, rowId }) { const d = col(tableId)[rowId]; if (!d) { const e = new Error('nf'); e.code = 404; throw e; } return structuredClone(d); },
    async listRows({ tableId, queries }) {
      let rows = Object.values(col(tableId)); let lim = 25;
      for (const raw of queries) {
        const q = JSON.parse(raw);
        if (q.method === 'equal') rows = rows.filter((d) => q.values.includes(d[q.attribute]));
        if (q.method === 'contains') rows = rows.filter((d) => (d[q.attribute] || []).some((v) => q.values.includes(v)));
        if (q.method === 'limit') lim = q.values[0];
      }
      return { total: rows.length, rows: rows.slice(0, lim).map((d) => structuredClone(d)) };
    },
    async createRow({ tableId, rowId, data, permissions }) { const d = { $id: rowId, $createdAt: new Date().toISOString(), $permissions: permissions || [], ...data }; col(tableId)[rowId] = d; return structuredClone(d); },
    async updateRow({ tableId, rowId, data }) { Object.assign(col(tableId)[rowId], data); return structuredClone(col(tableId)[rowId]); },
    async deleteRow({ tableId, rowId }) { delete col(tableId)[rowId]; },
  };
  return { db, col };
};


const makeStorage = () => {
  const files = {};
  let n = 0;
  return {
    files,
    upload(owner, { name = 'cv.pdf', mimeType = 'application/pdf', size = 200_000 } = {}) {
      const id = `f${++n}`;
      files[id] = { $id: id, name, mimeType, sizeOriginal: size, $permissions: [`read("user:${owner}")`, `delete("user:${owner}")`] };
      return id;
    },
    async getFile({ fileId }) { if (!files[fileId]) throw new Error('nf'); return structuredClone(files[fileId]); },
    async updateFile({ fileId, permissions }) { files[fileId].$permissions = permissions; return files[fileId]; },
    async deleteFile({ fileId }) { delete files[fileId]; },
    async copyFile(_bucket, fileId, name, permissions) {
      const id = `c${++n}`;
      files[id] = { ...files[fileId], $id: id, name, $permissions: permissions };
      return id;
    },
  };
};

test('CV: solo PDF propri, privato, sostituito e copiato nelle candidature', async () => {
  const { db, col } = makeDb();
  const storage = makeStorage();
  const api = createApi(db, { storage, copyFile: storage.copyFile, users: { get: async () => ({ labels: [] }), delete: async () => {} } });
  const P = (id, extra) => (col('profiles')[id] = { $id: id, userId: id, userType: 'professional', firstName: id, connections: [], ...extra });
  P('lido', { userType: 'structure', structureName: 'Lido' });
  P('anna'); P('bob');

  // File di un altro, formato sbagliato o troppo grande: rifiutati.
  await assert.rejects(api.setMyResume('anna', { fileId: storage.upload('bob') }), /File non valido/);
  const doc = storage.upload('anna', { name: 'cv.docx', mimeType: 'application/msword' });
  await assert.rejects(api.setMyResume('anna', { fileId: doc }), /PDF/);
  assert.equal(storage.files[doc], undefined, 'il file non valido viene eliminato');
  await assert.rejects(api.setMyResume('anna', { fileId: storage.upload('anna', { size: 6 * 1024 * 1024 }) }), /5 MB/);
  await assert.rejects(api.setMyResume('lido', { fileId: storage.upload('lido') }), /persone/);

  // Caricamento: solo lettura per la proprietaria, dati in private_info (non sul profilo).
  const first = storage.upload('anna', { name: 'Anna CV.pdf' });
  const meta = await api.setMyResume('anna', { fileId: first });
  assert.equal(meta.name, 'Anna CV.pdf');
  assert.deepEqual(storage.files[first].$permissions, ['read("user:anna")']);
  assert.equal(col('profiles').anna.resumeFileId, undefined);
  assert.equal((await api.getMyResume('anna')).fileId, first);
  assert.equal(await api.getMyResume('bob'), null);

  // Sostituzione: il vecchio file sparisce.
  const second = storage.upload('anna', { name: 'CV 2026.pdf' });
  await api.setMyResume('anna', { fileId: second });
  assert.equal(storage.files[first], undefined);

  // Candidatura con CV: copia leggibile da candidata e struttura; senza CV non si può allegare.
  const job = await api.createJob('lido', { structureId: 'lido', title: 'Istruttore corsi bambini', description: 'Corsi di nuoto pomeridiani per bambini dai 4 ai 10 anni.', role: 'istruttore', city: 'Milano' });
  await assert.rejects(api.applyForJob('bob', { jobId: job.$id, attachResume: true }), /CV/);
  const app = await api.applyForJob('anna', { jobId: job.$id, attachResume: true });
  assert.ok(app.resumeFileId && app.resumeFileId !== second, 'la struttura riceve una copia');
  assert.equal(app.resumeName, 'CV 2026.pdf');
  assert.deepEqual(storage.files[app.resumeFileId].$permissions.sort(), ['read("user:anna")', 'read("user:lido")']);

  // Il CV cambia o viene eliminato: la copia inviata resta; ritirando la candidatura sparisce.
  await api.deleteMyResume('anna');
  assert.equal(storage.files[second], undefined);
  assert.equal(await api.getMyResume('anna'), null);
  assert.ok(storage.files[app.resumeFileId]);
  await api.withdrawApplication('anna', { applicationId: app.$id });
  assert.equal(storage.files[app.resumeFileId], undefined);
});
