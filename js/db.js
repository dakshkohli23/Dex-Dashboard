// ============================================================
//  ProjectOS — Firestore Database Operations
// ============================================================

const DB = {

  /* ---- PROJECTS ---- */
  async getProjects(typeFilter) {
    try {
      let q = db.collection('projects').orderBy('createdAt','desc');
      if (typeFilter && typeFilter !== 'all') q = db.collection('projects').where('type','==',typeFilter).orderBy('createdAt','desc');
      const s = await q.get();
      return s.docs.map(d => ({id:d.id,...d.data()}));
    } catch(e) { console.error(e); return []; }
  },

  async getProject(id) {
    try {
      const d = await db.collection('projects').doc(id).get();
      return d.exists ? {id:d.id,...d.data()} : null;
    } catch(e) { console.error(e); return null; }
  },

  async createProject(data) {
    const ref = await db.collection('projects').add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: getCurrentUser()?.uid || null,
    });
    return ref.id;
  },

  async updateProject(id, data) {
    await db.collection('projects').doc(id).update({
      ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async deleteProject(id) {
    // delete sub-collections
    for (const col of ['tasks','credentials_local']) {
      const s = await db.collection('projects').doc(id).collection(col).get();
      const b = db.batch();
      s.docs.forEach(d => b.delete(d.ref));
      await b.commit();
    }
    await db.collection('projects').doc(id).delete();
  },

  async getStats() {
    try {
      const s = await db.collection('projects').get();
      const ps = s.docs.map(d => d.data());
      return {
        total:      ps.length,
        notStarted: ps.filter(p=>p.status==='not_started').length,
        inProgress: ps.filter(p=>p.status==='in_progress').length,
        onHold:     ps.filter(p=>p.status==='on_hold').length,
        completed:  ps.filter(p=>p.status==='completed').length,
        seo:        ps.filter(p=>p.type==='seo').length,
        googleAds:  ps.filter(p=>p.type==='google_ads' || !!p.hasGoogleAds).length,
        metaAds:    ps.filter(p=>p.type==='meta_ads'   || !!p.hasMetaAds).length,
        general:    ps.filter(p=>p.type==='general').length,
      };
    } catch(e) { return {}; }
  },

  /* ---- TASKS ---- */
  async getTasks(projectId) {
    try {
      const s = await db.collection('projects').doc(projectId).collection('tasks').orderBy('createdAt','desc').get();
      return s.docs.map(d => ({id:d.id,...d.data()}));
    } catch(e) { return []; }
  },

  async createTask(projectId, data) {
    const ref = await db.collection('projects').doc(projectId).collection('tasks').add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async updateTask(projectId, taskId, data) {
    await db.collection('projects').doc(projectId).collection('tasks').doc(taskId).update({
      ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async deleteTask(projectId, taskId) {
    await db.collection('projects').doc(projectId).collection('tasks').doc(taskId).delete();
  },

  /* ---- USERS ---- */
  async getUsers() {
    try {
      const s = await db.collection('users').get();
      return s.docs.map(d => ({id:d.id,...d.data()}));
    } catch(e) { return []; }
  },

  async getUser(uid) {
    const d = await db.collection('users').doc(uid).get();
    return d.exists ? {id:d.id,...d.data()} : null;
  },

  async updateUser(uid, data) {
    await db.collection('users').doc(uid).update(data);
  },

  /* ---- CREDENTIALS ---- */
  async getCredentials(projectId) {
    try {
      let q = db.collection('credentials').orderBy('createdAt','desc');
      if (projectId) q = db.collection('credentials').where('projectId','==',projectId).orderBy('createdAt','desc');
      const s = await q.get();
      return s.docs.map(d => ({id:d.id,...d.data()}));
    } catch(e) { return []; }
  },

  async createCredential(data) {
    const ref = await db.collection('credentials').add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: getCurrentUser()?.uid || null,
    });
    return ref.id;
  },

  async updateCredential(id, data) {
    await db.collection('credentials').doc(id).update(data);
  },

  async deleteCredential(id) {
    await db.collection('credentials').doc(id).delete();
  },

  /* ---- TOOLS ---- */
  async getTools(projectId) {
    try {
      let q = db.collection('tools').orderBy('createdAt','desc');
      if (projectId) q = db.collection('tools').where('projectId','==',projectId).orderBy('createdAt','desc');
      const s = await q.get();
      return s.docs.map(d => ({id:d.id,...d.data()}));
    } catch(e) { return []; }
  },

  async createTool(data) {
    const ref = await db.collection('tools').add({
      ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return ref.id;
  },

  async updateTool(id, data) {
    await db.collection('tools').doc(id).update(data);
  },

  async deleteTool(id) {
    await db.collection('tools').doc(id).delete();
  },
};
