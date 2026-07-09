// ============================================================
//  ProjectOS — Main Application
// ============================================================

/* ---- STATE ---- */
let STATE = { user:null, userData:null, currentProject:null, view:'dashboard', users:[], projects:[] };

/* ============================================================
   INIT TheProcess
   ============================================================ */
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  STATE.user = user;
  const snap = await ensureUserDoc(user);
  STATE.userData = snap.data();
  STATE.users = await DB.getUsers();
  updateSidebarUser();
  router();
});

function updateSidebarUser() {
  const u = STATE.userData, fw = STATE.user;
  const init = getInitials(u?.name || fw.email);
  const photo = fw.photoURL;
  setEl('sidebar-avatar', photo ? `<img src="${photo}" alt="">` : init);
  setEl('sidebar-name', u?.name || fw.email.split('@')[0]);
  setEl('sidebar-role', formatRole(u?.role || 'member'));
  setEl('header-avatar', photo ? `<img src="${photo}" alt="">` : init);
  setEl('header-name', (u?.name || fw.email.split('@')[0]).split(' ')[0]);
}

/* ============================================================
   ROUTER
   ============================================================ */
window.addEventListener('hashchange', router);

function navigate(hash) { window.location.hash = hash; }

function router() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const [view, param] = hash.split('/');
  STATE.view = view;
  updateNav(hash);
  closeDropdowns();

  switch(view) {
    case 'dashboard':     setTitle('Dashboard');         renderDashboard(); break;
    case 'projects':
      if (param) { setTitle(typeLabel(param));           renderProjects(param); }
      else       { setTitle('All Projects');             renderProjects(); }
      break;
    case 'project':       if(param) renderProjectDetail(param); break;
    case 'tasks':         setTitle('Tasks');             renderTasksView(); break;
    case 'users':         setTitle('Users');             renderUsers(); break;
    case 'credentials':   setTitle('Credentials');       renderCredentials(); break;
    case 'settings':      setTitle('Settings');          renderSettings(); break;
    default:              setTitle('Dashboard');         renderDashboard();
  }
}

function updateNav(hash) {
  document.querySelectorAll('.nav-item[data-route]').forEach(el => {
    el.classList.remove('active');
    if (hash === el.dataset.route || hash.startsWith(el.dataset.route+'/')) el.classList.add('active');
  });
}

function setTitle(t) {
  document.getElementById('page-title').textContent = t;
  document.title = `${t} — ProjectOS`;
}

/* ============================================================
   VIEW: DASHBOARD
   ============================================================ */
STATE.dashFilter = STATE.dashFilter || 'all';

async function renderDashboard() {
  html('content-area', skelGrid());
  const [stats, projects, users] = await Promise.all([DB.getStats(), DB.getProjects(), DB.getUsers()]);
  STATE.projects  = projects;
  STATE.users     = users;
  STATE.lastStats = stats;
  checkReportingNotifications(projects);   // check & fire browser notifications
  renderDashboardContent(stats, projects);
}

/* ─── Reporting helper ─────────────────────────────── */
function isReportingToday(p) {
  if (!p.reportingDate) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  const base  = new Date(p.reportingDate); base.setHours(0,0,0,0);
  if (isNaN(base)) return false;
  const freq = p.reportingFrequency || 'none';
  if (freq === 'none')      return today.getTime() === base.getTime();
  if (today < base)         return false;
  const diffDays = Math.round((today - base) / 86400000);
  if (freq === 'weekly')    return diffDays % 7  === 0;
  if (freq === 'biweekly')  return diffDays % 14 === 0;
  if (freq === 'monthly')   return today.getDate() === base.getDate();
  if (freq === 'quarterly') {
    const mDiff = (today.getFullYear()-base.getFullYear())*12 + (today.getMonth()-base.getMonth());
    return mDiff % 3 === 0 && today.getDate() === base.getDate();
  }
  return false;
}

/* ─── Browser notification for reporting dates ─────── */
async function checkReportingNotifications(projects) {
  const due = (projects || STATE.projects || []).filter(p => isReportingToday(p));
  if (!due.length) return;
  // Request permission once
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    due.forEach(p => {
      new Notification('📊 Report Due Today', {
        body: `${p.name}${p.clientName ? ' · ' + p.clientName : ''} — reporting due today`,
        icon: '/favicon.ico',
        tag:  'report-' + p.id,
      });
    });
  }
}

function renderDashboardContent(stats, projects) {
  if (stats) STATE.lastStats = stats;
  stats = STATE.lastStats || { total:0, notStarted:0, inProgress:0, onHold:0, completed:0, seo:0, googleAds:0, metaAds:0 };
  if (!projects || !projects.length) projects = STATE.projects || [];

  // Apply user filter
  const uid = STATE.dashUserFilter || '';
  let filteredProjects = projects;
  if (uid) {
    filteredProjects = projects.filter(p =>
      (p.assigneeIds||[]).includes(uid) || p.ownerId === uid
    );
  }

  const liveProjects   = filteredProjects.filter(p => p.status === 'in_progress' || p.status === 'not_started');
  const pausedProjects = filteredProjects.filter(p => p.status === 'on_hold' || p.status === 'completed');

  // Reporting due today
  const reportingDue = projects.filter(p => isReportingToday(p));

  const tableHeader = `<thead><tr>
    <th style="width:64px;text-align:center">Active</th>
    <th>Project</th><th>Type</th><th>Priority</th>
    <th>Assigned To</th><th>Location</th><th>Keywords</th><th>Reporting Date</th>
    <th></th>
  </tr></thead>`;

  const projTableHTML = (list) => list.length
    ? `<div class="table-wrap"><table class="data-table">${tableHeader}
        <tbody>${list.map(p => projRow(p)).join('')}</tbody></table></div>`
    : `<div style="padding:28px;text-align:center;color:var(--text3);font-size:.875rem">
        <i class="fas fa-inbox" style="font-size:1.5rem;margin-bottom:8px;display:block"></i>
        No projects in this category
      </div>`;

  const sectionBadge = (count, color, bg) =>
    `<span style="background:${bg};color:${color};padding:3px 10px;border-radius:var(--r-full);
      font-size:.72rem;font-weight:700;margin-left:8px">${count}</span>`;

  // User filter options
  const userFilterOpts = `<option value="">All Team Members</option>
    ${STATE.users.map(u => `<option value="${u.id}" ${uid===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}`;

  // Notice board HTML
  const noticeBoardHTML = reportingDue.length ? `
    <div class="notice-board mb-5">
      <div class="notice-board-header">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="notice-bell"><i class="fas fa-bell"></i></div>
          <div>
            <div style="font-weight:700;font-size:.95rem;color:#7c3aed">📊 Reports Due Today</div>
            <div style="font-size:.75rem;color:#8b5cf6;margin-top:1px">
              ${reportingDue.length} project${reportingDue.length>1?'s':''} need${reportingDue.length===1?'s':''} a report today
            </div>
          </div>
        </div>
        <button class="btn btn-sm" style="background:#ede9fe;color:#7c3aed;border:none;font-weight:600"
          onclick="this.closest('.notice-board').style.display='none'">
          <i class="fas fa-times"></i> Dismiss
        </button>
      </div>
      <div class="notice-items">
        ${reportingDue.map(p => {
          const assignees = (p.assigneeIds||[p.ownerId]).filter(Boolean)
            .map(id => STATE.users.find(u=>u.id===id)).filter(Boolean);
          const freq = p.reportingFrequency || 'none';
          const freqLabel = {none:'One-time',weekly:'Weekly',biweekly:'Bi-Weekly',monthly:'Monthly',quarterly:'Quarterly'}[freq]||'';
          return `<div class="notice-item" onclick="navigate('project/${p.id}')" style="cursor:pointer">
            <div class="notice-item-dot" style="background:${typeColor(p.type)}"></div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:.88rem;color:var(--text)">${esc(p.name)}</div>
              <div style="font-size:.75rem;color:var(--text3);margin-top:2px">
                ${p.clientName?`<span><i class="fas fa-building"></i> ${esc(p.clientName)}</span> · `:''}
                <span class="badge no-dot ${typeBadge(p.type)}" style="font-size:.65rem">${typeLabel(p.type)}</span>
                ${freqLabel ? `<span style="margin-left:6px;background:#ede9fe;color:#7c3aed;padding:2px 7px;border-radius:var(--r-full);font-size:.65rem;font-weight:700">${freqLabel}</span>` : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:-4px">
              ${assignees.slice(0,3).map(u=>`<div style="width:26px;height:26px;border-radius:50%;background:var(--grad-purple);
                border:2px solid white;display:flex;align-items:center;justify-content:center;
                color:white;font-size:.55rem;font-weight:700;margin-left:-5px;flex-shrink:0"
                title="${esc(u.name)}">${getInitials(u.name)}</div>`).join('')}
            </div>
            <i class="fas fa-chevron-right" style="color:var(--text3);font-size:.78rem;margin-left:8px"></i>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  html('content-area', `
    <div class="page-header">
      <div><h1 class="page-title">Dashboard</h1><p class="page-subtitle">Project overview &amp; quick stats</p></div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openProjectModal()"><i class="fas fa-plus"></i> New Project</button>
      </div>
    </div>

    ${noticeBoardHTML}

    <div class="stats-grid">
      ${gradSc('folder','Total Projects', stats.total||0,'grad-purple')}
      ${gradSc('circle-dot','Live / Active', stats.inProgress||0,'grad-blue')}
      ${gradSc('pause-circle','On Hold', stats.onHold||0,'grad-orange')}
      ${gradSc('check-circle','Completed', stats.completed||0,'grad-green')}
    </div>

    <div class="grid-3" style="margin-bottom:28px">
      ${tcNew('search','SEO',stats.seo||0,'projects/seo','#059669','#d1fae5')}
      ${tcNew('fab fa-google','Google Ads',stats.googleAds||0,'projects/google_ads','#1a73e8','#e8f0fe')}
      ${tcNew('fab fa-meta','Meta Ads',stats.metaAds||0,'projects/meta_ads','#1877f2','#e7f0fd')}
    </div>

    <!-- USER FILTER BAR -->
    <div class="dash-filter-row mb-3">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;background:var(--surface);
          border:1.5px solid var(--border);border-radius:var(--r-md);padding:6px 12px">
          <i class="fas fa-user-filter" style="color:var(--text3);font-size:.82rem"></i>
          <select style="border:none;background:transparent;font-family:var(--font);
            font-size:.875rem;color:var(--text);font-weight:500;outline:none;cursor:pointer"
            onchange="setDashUserFilter(this.value)">
            ${userFilterOpts}
          </select>
        </div>
        ${uid ? `<button class="btn btn-sm btn-outline" onclick="setDashUserFilter('')">
          <i class="fas fa-times"></i> Clear Filter
        </button>
        <span style="font-size:.8rem;color:var(--primary);font-weight:600">
          Showing ${filteredProjects.length} project${filteredProjects.length!==1?'s':''} for ${esc(STATE.users.find(u=>u.id===uid)?.name||'')}
        </span>` : ''}
        ${reportingDue.length ? `<div style="margin-left:auto;display:flex;align-items:center;gap:6px;
          background:#ede9fe;padding:6px 14px;border-radius:var(--r-full);cursor:pointer"
          onclick="document.querySelector('.notice-board')?.scrollIntoView({behavior:'smooth'})">
          <span style="width:8px;height:8px;border-radius:50%;background:#7c3aed;
            box-shadow:0 0 0 2px rgba(124,58,237,.25);display:inline-block;animation:pulse 1.5s infinite"></span>
          <span style="font-size:.8rem;font-weight:700;color:#7c3aed">
            ${reportingDue.length} report${reportingDue.length>1?'s':''} due today
          </span>
        </div>` : ''}
      </div>
    </div>

    <!-- LIVE PROJECTS -->
    <div class="section-card mb-4" style="margin-top:8px">
      <div class="section-header">
        <span class="section-title" style="display:flex;align-items:center">
          <span style="width:9px;height:9px;border-radius:50%;background:#10b981;
            display:inline-block;margin-right:9px;
            box-shadow:0 0 0 3px rgba(16,185,129,.18)"></span>
          Live Projects ${sectionBadge(liveProjects.length,'#059669','#d1fae5')}
        </span>
        <a class="section-link" onclick="navigate('projects')">View All <i class="fas fa-arrow-right"></i></a>
      </div>
      ${projTableHTML(liveProjects)}
    </div>

    <!-- PAUSED / STOPPED / ENDED -->
    <div class="section-card mb-2" style="margin-top:24px">
      <div class="section-header">
        <span class="section-title" style="display:flex;align-items:center">
          <span style="width:9px;height:9px;border-radius:50%;background:#f59e0b;
            display:inline-block;margin-right:9px"></span>
          Paused, Stopped &amp; Ended ${sectionBadge(pausedProjects.length,'#92400e','#fef3c7')}
        </span>
      </div>
      ${projTableHTML(pausedProjects)}
    </div>
  `);
}

function setDashUserFilter(uid) {
  STATE.dashUserFilter = uid;
  renderDashboardContent(STATE.lastStats, STATE.projects);
}

/* ============================================================
   VIEW: PROJECTS LIST
   ============================================================ */
async function renderProjects(filter) {
  html('content-area', skelGrid());
  // Fetch all and filter client-side so Google Ads & Meta Ads tabs show
  // projects that have those services enabled, regardless of type
  const [allProjects, users] = await Promise.all([DB.getProjects(), DB.getUsers()]);
  STATE.users = users;
  let projects = allProjects;
  if (filter === 'seo')        projects = allProjects.filter(p => p.type === 'seo');
  else if (filter === 'google_ads') projects = allProjects.filter(p => p.type === 'google_ads' || p.hasGoogleAds);
  else if (filter === 'meta_ads')   projects = allProjects.filter(p => p.type === 'meta_ads'   || p.hasMetaAds);
  STATE.projects = projects;

  html('content-area', `
    <div class="page-header">
      <div><h1 class="page-title">${typeLabel(filter||'all')}</h1><p class="page-subtitle">${projects.length} project${projects.length!==1?'s':''}</p></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openProjectModal(null,'${filter||''}')"><i class="fas fa-plus"></i> New Project</button></div>
    </div>
    <div class="filters-bar">
      <select class="filter-select" id="f-status" onchange="applyFilters()">
        <option value="">All Statuses</option>
        <option value="not_started">Not Started</option><option value="in_progress">In Progress</option>
        <option value="on_hold">On Hold</option><option value="completed">Completed</option>
      </select>
      <select class="filter-select" id="f-priority" onchange="applyFilters()">
        <option value="">All Priorities</option>
        <option value="low">Low</option><option value="medium">Medium</option>
        <option value="high">High</option><option value="critical">Critical</option>
      </select>
      <select class="filter-select" id="f-user" onchange="applyFilters()">
        <option value="">All Members</option>
        ${STATE.users.map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}
      </select>
      <input class="filter-input" id="f-search" placeholder="Search projects…" oninput="applyFilters()">
      <div class="view-toggle">
        <button class="view-btn active" id="vb-grid" onclick="setView('grid',this)"><i class="fas fa-th-large"></i></button>
        <button class="view-btn" id="vb-list" onclick="setView('list',this)"><i class="fas fa-list"></i></button>
      </div>
    </div>
    <div id="proj-container" class="projects-grid">
      ${projects.length ? projects.map(p=>projCard(p)).join('') : emptyState('folder-open','No projects found','Try a different filter')}
    </div>`);
}

function applyFilters() {
  const status   = val('f-status');
  const priority = val('f-priority');
  const userId   = val('f-user');
  const search   = (val('f-search')||'').toLowerCase();
  let list = STATE.projects;
  if (status)   list = list.filter(p => p.status === status);
  if (priority) list = list.filter(p => p.priority === priority);
  if (userId)   list = list.filter(p => (p.assigneeIds||[]).includes(userId) || p.ownerId === userId);
  if (search)   list = list.filter(p =>
    (p.name||'').toLowerCase().includes(search) ||
    (p.description||'').toLowerCase().includes(search) ||
    (p.clientName||'').toLowerCase().includes(search) ||
    (p.projectLocation||'').toLowerCase().includes(search)
  );
  const c = document.getElementById('proj-container');
  if (!c) return;
  if (!list.length) { c.innerHTML = emptyState('search','No results','Adjust your filters'); return; }
  c.innerHTML = c.classList.contains('projects-grid') ? list.map(p=>projCard(p)).join('') : listTable(list);
}

function setView(v, btn) {
  document.querySelectorAll('.view-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const c = document.getElementById('proj-container');
  if (!c) return;
  if (v==='grid') { c.className='projects-grid'; c.innerHTML=STATE.projects.map(p=>projCard(p)).join(''); }
  else            { c.className=''; c.innerHTML=listTable(STATE.projects); }
}

/* ============================================================
   VIEW: PROJECT DETAIL
   ============================================================ */
async function renderProjectDetail(id) {
  html('content-area', `<div style="display:flex;align-items:center;justify-content:center;padding:80px"><div class="spinner"></div></div>`);
  const [project, credentials] = await Promise.all([DB.getProject(id), DB.getCredentials(id)]);
  if (!project) { html('content-area', emptyState('exclamation-triangle','Project not found','','navigate(\'projects\')','Back to Projects')); return; }
  STATE.currentProject = project;
  setTitle(project.name);

  const owner = STATE.users.find(u=>u.id===project.ownerId);
  const members = (project.teamMembers||[]).map(id=>STATE.users.find(u=>u.id===id)).filter(Boolean);

  html('content-area', `
    <button class="detail-back" onclick="history.back()"><i class="fas fa-arrow-left"></i> Back</button>

    <div class="proj-hero">
      <div class="proj-hero-top">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="badge no-dot ${typeBadge(project.type)}">${typeLabel(project.type)}</span>
            <span class="badge ${statusBadge(project.status)}">${fmtStatus(project.status)}</span>
            <span class="badge no-dot ${priorityBadge(project.priority)}">${fmtPriority(project.priority)}</span>
          </div>
          <h1 class="proj-detail-name">${esc(project.name)}</h1>
          <p class="proj-detail-desc">${esc(project.description||'No description.')}</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-outline" onclick="openProjectModal('${project.id}')"><i class="fas fa-edit"></i> Edit</button>
          <div class="dropdown" id="dd-detail">
            <button class="btn btn-outline btn-icon" onclick="toggleDD('dd-detail')"><i class="fas fa-ellipsis-v"></i></button>
            <div class="dropdown-menu" style="display:none">
              ${project.status!=='on_hold'
                ?`<div class="dropdown-item" onclick="chStatus('${project.id}','on_hold')"><i class="fas fa-pause"></i> Pause Project</div>`
                :`<div class="dropdown-item" onclick="chStatus('${project.id}','in_progress')"><i class="fas fa-play"></i> Resume Project</div>`}
              ${project.status!=='completed'
                ?`<div class="dropdown-item" onclick="chStatus('${project.id}','completed')"><i class="fas fa-check"></i> Mark Completed</div>`:''}
              <div class="dropdown-div"></div>
              <div class="dropdown-item danger" onclick="confirmDeleteProject('${project.id}')"><i class="fas fa-trash"></i> Delete Project</div>
            </div>
          </div>
        </div>
      </div>
      <div class="proj-hero-meta">
        ${metaItem('calendar-alt','Start', fmtDate(project.startDate)||'—')}
        ${metaItem('flag-checkered','End', fmtDate(project.endDate)||'—')}
        ${metaItem('user','Owner', owner?.name||'Unassigned')}
        <div class="meta-item">
          <i class="fas fa-users" style="color:var(--text-muted);font-size:.82rem"></i>
          <div>
            <div class="meta-label">Team</div>
            <div class="member-stack mt-1">
              ${members.slice(0,4).map(m=>`<div class="m-avatar" title="${m.name}">${getInitials(m.name)}</div>`).join('')}
              ${members.length>4?`<div class="m-avatar m-more">+${members.length-4}</div>`:''}
              ${!members.length?`<span class="meta-val">None</span>`:''}
            </div>
          </div>
        </div>
        ${project.pausedAt?metaItem('pause-circle','Paused', fmtDate(project.pausedAt)):''}
        ${project.closedAt?metaItem('times-circle','Closed', fmtDate(project.closedAt)):''}
      </div>
    </div>

    <div class="proj-detail-tabs">
      <div class="tabs-header" id="detail-tabs">
        ${['overview','tasks','team','credentials','tools','analytics','notes'].map((t,i)=>
          `<button class="tab-btn${i===0?' active':''}" data-tab="${t}" onclick="switchTab('${t}',this)">${tabIcon(t)} ${cap(t)}</button>`
        ).join('')}
      </div>
      <div class="tab-content" id="tab-body">
        ${renderOverviewTab(project, members, owner)}
      </div>
    </div>`);
}

function switchTab(tab, btn) {
  document.querySelectorAll('#detail-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const p = STATE.currentProject;
  switch(tab) {
    case 'overview':    html('tab-body', renderOverviewTab(p)); break;
    case 'tasks':       loadTasksTab(p); break;
    case 'team':        renderTeamTab(p); break;
    case 'credentials': loadCredsTab(p); break;
    case 'tools':       loadToolsTab(p); break;
    case 'analytics':   renderAnalyticsTab(p); break;
    case 'notes':       renderNotesTab(p); break;
  }
}

function renderOverviewTab(p, members, owner) {
  const m = members || (p.teamMembers||[]).map(id=>STATE.users.find(u=>u.id===id)).filter(Boolean);
  const o = owner || STATE.users.find(u=>u.id===p.ownerId);
  return `
    <div class="form-grid-2">
      <div class="flex-1">
        <div class="form-section-title mb-4">Project Details</div>
        <div class="flex flex-col gap-3">
          ${row2('Type',    `<span class="badge no-dot ${typeBadge(p.type)}">${typeLabel(p.type)}</span>`)}
          ${row2('Status',  `<span class="badge ${statusBadge(p.status)}">${fmtStatus(p.status)}</span>`)}
          ${row2('Priority',`<span class="badge no-dot ${priorityBadge(p.priority)}">${fmtPriority(p.priority)}</span>`)}
          ${row2('Start Date', fmtDate(p.startDate)||'—')}
          ${row2('End Date',   fmtDate(p.endDate)||'—')}
          ${row2('Owner',  o?.name||'Unassigned')}
          ${row2('Team Members', m.length||0)}
          ${row2('Created', fmtDate(p.createdAt)||'—')}
        </div>
      </div>
      <div class="flex-1">
        <div class="form-section-title mb-4">Services & Tracking</div>
        <div class="flex flex-col gap-3">
          ${svcRow('Google Analytics',      'chart-line', p.hasAnalytics)}
          ${svcRow('Search Console',        'search',     p.hasSearchConsole)}
          ${svcRow('Google Ads',            'fab fa-google', p.hasGoogleAds)}
          ${svcRow('Meta Ads Manager',      'fab fa-meta',   p.hasMetaAds)}
          ${svcRow('SEMrush',               'chart-bar', p.hasSemrush)}
          ${svcRow('Ahrefs',                'link',      p.hasAhrefs)}
        </div>
      </div>
    </div>
    ${p.notes?`<div class="mt-6"><div class="form-section-title mb-3">Notes</div>
      <div class="card card-p" style="background:var(--g50)"><p class="text-sm" style="white-space:pre-wrap;line-height:1.7">${esc(p.notes)}</p></div></div>`:''}`;
}

async function loadTasksTab(p) {
  html('tab-body','<div style="padding:30px;display:flex;align-items:center;justify-content:center"><div class="spinner"></div></div>');
  const tasks = await DB.getTasks(p.id);
  const grouped = { todo:[], in_progress:[], review:[], done:[] };
  tasks.forEach(t => { if(grouped[t.status]) grouped[t.status].push(t); else grouped.todo.push(t); });
  html('tab-body',`
    <div class="flex justify-between items-center mb-4">
      <span class="font-semibold">${tasks.length} Tasks</span>
      <button class="btn btn-primary btn-sm" onclick="openTaskModal('${p.id}')"><i class="fas fa-plus"></i> Add Task</button>
    </div>
    <div class="kanban-board">
      ${kanbanCol('todo','To Do',grouped.todo,p.id,'#6b7280')}
      ${kanbanCol('in_progress','In Progress',grouped.in_progress,p.id,'#3b82f6')}
      ${kanbanCol('review','In Review',grouped.review,p.id,'#8b5cf6')}
      ${kanbanCol('done','Done',grouped.done,p.id,'#10b981')}
    </div>`);
}

function renderTeamTab(p) {
  const members = (p.teamMembers||[]).map(id=>STATE.users.find(u=>u.id===id)).filter(Boolean);
  const owner = STATE.users.find(u=>u.id===p.ownerId);
  html('tab-body',`
    <div class="flex justify-between items-center mb-4">
      <span class="font-semibold">Team Members</span>
      <button class="btn btn-primary btn-sm" onclick="openAddMemberModal('${p.id}')"><i class="fas fa-user-plus"></i> Add Member</button>
    </div>
    ${owner?`<div class="mb-4">
      <div class="form-section-title mb-2">Owner</div>
      <div class="card card-p flex items-center gap-3">
        <div class="s-avatar" style="width:38px;height:38px;font-size:.78rem">${owner.photoURL?`<img src="${owner.photoURL}" alt="">`:getInitials(owner.name)}</div>
        <div class="u-info"><div class="u-name">${esc(owner.name)}</div><div class="u-email">${esc(owner.email)}</div></div>
        <span class="role-badge ${roleBadge(owner.role)}">${formatRole(owner.role)}</span>
        <span class="badge no-dot b-seo">Owner</span>
      </div></div>`:''}
    ${members.length?`<div class="form-section-title mb-2">Members (${members.length})</div>
      <div class="section-card">${members.map(m=>`
      <div class="user-row">
        <div class="s-avatar" style="width:34px;height:34px;font-size:.7rem">${m.photoURL?`<img src="${m.photoURL}" alt="">`:getInitials(m.name)}</div>
        <div class="u-info"><div class="u-name">${esc(m.name)}</div><div class="u-email">${esc(m.email)}</div></div>
        <span class="role-badge ${roleBadge(m.role)}">${formatRole(m.role)}</span>
        <button class="t-btn del" onclick="removeMember('${p.id}','${m.id}')" title="Remove"><i class="fas fa-times"></i></button>
      </div>`).join('')}</div>`:
      emptyState('user-plus','No team members','Add people to collaborate','openAddMemberModal(\''+p.id+'\')', 'Add Member')}
  `);
}

async function loadCredsTab(p) {
  html('tab-body','<div style="padding:30px;display:flex;align-items:center;justify-content:center"><div class="spinner"></div></div>');
  const creds = await DB.getCredentials(p.id);
  html('tab-body',`
    <div class="flex justify-between items-center mb-4">
      <span class="font-semibold">${creds.length} Credentials</span>
      <button class="btn btn-primary btn-sm" onclick="openCredModal('${p.id}')"><i class="fas fa-plus"></i> Add</button>
    </div>
    ${creds.length?`<div class="grid-2">${creds.map(c=>credCard(c)).join('')}</div>`:
      emptyState('key','No credentials','Store logins and access info here','openCredModal(\''+p.id+'\')', 'Add Credential')}`);
}

async function loadToolsTab(p) {
  html('tab-body','<div style="padding:30px;display:flex;align-items:center;justify-content:center"><div class="spinner"></div></div>');
  const tools = await DB.getTools(p.id);
  html('tab-body',`
    <div class="flex justify-between items-center mb-4">
      <span class="font-semibold">${tools.length} Tools</span>
      <button class="btn btn-primary btn-sm" onclick="openToolModal('${p.id}')"><i class="fas fa-plus"></i> Add Tool</button>
    </div>
    ${tools.length?`<div class="grid-2">${tools.map(t=>`
    <div class="cred-card">
      <div class="cred-icon" style="background:var(--primary-light);color:var(--primary)"><i class="fas fa-tools"></i></div>
      <div class="cred-info">
        <div class="cred-name">${esc(t.name)}</div>
        <div class="cred-user">${t.category||'Tool'}${t.url?` · <a href="${t.url}" target="_blank" class="text-brand">${t.url}</a>`:''}</div>
        ${t.notes?`<div class="text-sm text-muted mt-1">${esc(t.notes)}</div>`:''}
      </div>
      <div class="cred-actions">
        <button class="t-btn" onclick="openToolModal('${p.id}','${t.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="t-btn del" onclick="deleteTool('${t.id}','${p.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('')}</div>`:
    emptyState('tools','No tools added','Track software used in this project','openToolModal(\''+p.id+'\')', 'Add Tool')}`);
}

function renderAnalyticsTab(p) {
  const svcs = [
    {name:'Google Analytics', key:'hasAnalytics', ico:'fas fa-chart-line', color:'#E97514', urlKey:'analyticsUrl'},
    {name:'Search Console',   key:'hasSearchConsole', ico:'fas fa-search', color:'#4285F4', urlKey:'searchConsoleUrl'},
    {name:'Google Ads',       key:'hasGoogleAds', ico:'fab fa-google', color:'#1A73E8', urlKey:'googleAdsUrl'},
    {name:'Meta Ads',         key:'hasMetaAds', ico:'fab fa-meta', color:'#1877F2', urlKey:'metaAdsUrl'},
    {name:'SEMrush',          key:'hasSemrush', ico:'fas fa-chart-bar', color:'#FF642D', urlKey:'semrushUrl'},
    {name:'Ahrefs',           key:'hasAhrefs', ico:'fas fa-link', color:'#2F81F7', urlKey:'ahrefsUrl'},
  ];
  html('tab-body',`
    <div class="flex justify-between items-center mb-4">
      <span class="font-semibold">Analytics & Tracking</span>
      <button class="btn btn-outline btn-sm" onclick="openProjectModal('${p.id}')"><i class="fas fa-edit"></i> Edit</button>
    </div>
    <div class="grid-2">${svcs.map(s=>`
    <div class="cred-card ${!p[s.key]?'opacity-50':''}">
      <div class="cred-icon" style="background:${s.color}18;color:${s.color}"><i class="${s.ico}"></i></div>
      <div class="cred-info">
        <div class="cred-name">${s.name}</div>
        <div class="cred-user" style="color:${p[s.key]?'var(--success)':'var(--text-muted)'}">
          ${p[s.key]?'<i class="fas fa-check-circle"></i> Active':'Not configured'}
        </div>
        ${p[s.key]&&p[s.urlKey]?`<a href="${p[s.urlKey]}" target="_blank" class="text-brand text-xs">${p[s.urlKey]}</a>`:''}
      </div>
    </div>`).join('')}</div>`);
}

function renderNotesTab(p) {
  html('tab-body',`
    <div class="flex justify-between items-center mb-4">
      <span class="font-semibold">Project Notes</span>
      <button class="btn btn-primary btn-sm" onclick="saveNotes('${p.id}')"><i class="fas fa-save"></i> Save</button>
    </div>
    <textarea id="notes-input" class="form-input form-textarea" style="min-height:280px;width:100%"
      placeholder="Add notes, client requirements, important info…">${esc(p.notes||'')}</textarea>`);
}

async function saveNotes(pid) {
  const notes = document.getElementById('notes-input')?.value;
  try { await DB.updateProject(pid,{notes}); if(STATE.currentProject) STATE.currentProject.notes=notes; showToast('Notes saved!','success'); }
  catch(e) { showToast('Failed to save','error'); }
}

/* ============================================================
   VIEW: TASKS (Project Picker)
   ============================================================ */
async function renderTasksView() {
  html('content-area', skelGrid());
  const projects = await DB.getProjects();
  html('content-area', `
    <div class="page-header">
      <div><h1 class="page-title">Tasks</h1><p class="page-subtitle">Select a project to manage its tasks</p></div>
    </div>
    ${projects.length?`<div class="section-card"><div class="section-header"><span class="section-title">Select Project</span></div>
    <div class="p-5"><div class="projects-grid">${projects.map(p=>`
    <div class="proj-card type-${p.type||'general'}" onclick="navigate('project/${p.id}')">
      <div class="proj-card-body">
        <div class="proj-card-header"><div class="proj-card-meta">
          <span class="badge no-dot ${typeBadge(p.type)}">${typeLabel(p.type)}</span>
          <span class="badge ${statusBadge(p.status)}">${fmtStatus(p.status)}</span>
        </div></div>
        <div class="proj-card-name">${esc(p.name)}</div>
        <div class="proj-card-desc">${esc(p.description||'')}</div>
      </div>
    </div>`).join('')}</div></div></div>`:
    emptyState('tasks','No projects yet','Create a project first','openProjectModal()','New Project')}`);
}

/* ============================================================
   VIEW: USERS
   ============================================================ */
async function renderUsers() {
  html('content-area', skelGrid());
  const users = await DB.getUsers();
  STATE.users = users;
  html('content-area',`
    <div class="page-header">
      <div><h1 class="page-title">Users</h1><p class="page-subtitle">${users.length} team member${users.length!==1?'s':''}</p></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openUserModal()"><i class="fas fa-user-plus"></i> Invite User</button></div>
    </div>
    <div class="section-card">
      ${users.length?`<div class="table-wrap"><table class="data-table"><thead><tr>
        <th>User</th><th>Email</th><th>Role</th><th>Joined</th><th>Last Login</th><th></th>
      </tr></thead><tbody>${users.map(u=>`
      <tr>
        <td><div class="flex items-center gap-3">
          <div class="s-avatar" style="width:32px;height:32px;font-size:.68rem">${u.photoURL?`<img src="${u.photoURL}" alt="">`:getInitials(u.name)}</div>
          <span class="font-semibold">${esc(u.name)}</span>
        </div></td>
        <td class="text-secondary">${esc(u.email)}</td>
        <td><span class="role-badge ${roleBadge(u.role)}">${formatRole(u.role)}</span></td>
        <td class="text-secondary">${fmtDate(u.createdAt)||'—'}</td>
        <td class="text-secondary">${fmtDate(u.lastLogin)||'—'}</td>
        <td><div class="t-actions"><button class="t-btn" onclick="openUserModal('${u.id}')" title="Edit Role"><i class="fas fa-edit"></i></button></div></td>
      </tr>`).join('')}</tbody></table></div>`:
      emptyState('users','No users','Users appear when they log in for the first time')}`);
}

/* ============================================================
   VIEW: CREDENTIALS (Global)
   ============================================================ */
async function renderCredentials() {
  html('content-area', skelGrid());
  const [creds, projects] = await Promise.all([DB.getCredentials(), DB.getProjects()]);
  const grouped = {};
  creds.forEach(c=>{ const k=c.projectId||'__none'; if(!grouped[k]) grouped[k]=[]; grouped[k].push(c); });

  html('content-area',`
    <div class="page-header">
      <div><h1 class="page-title">Credentials</h1><p class="page-subtitle">${creds.length} saved credential${creds.length!==1?'s':''}</p></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openCredModal()"><i class="fas fa-plus"></i> Add Credential</button></div>
    </div>
    ${Object.keys(grouped).length?Object.keys(grouped).map(k=>{
      const proj = projects.find(p=>p.id===k);
      return `<div class="section-card mb-4">
        <div class="section-header">
          <span class="section-title">${proj?esc(proj.name):'General'} <span class="text-muted font-medium">(${grouped[k].length})</span></span>
          ${proj?`<a href="#project/${proj.id}" class="section-link">View Project</a>`:''}
        </div>
        <div class="p-4 grid-2">${grouped[k].map(c=>credCard(c)).join('')}</div>
      </div>`;
    }).join(''):emptyState('key','No credentials stored','Save login info here','openCredModal()','Add Credential')}`);
}

/* ============================================================
   VIEW: SETTINGS
   ============================================================ */
function renderSettings() {
  const u = STATE.user, ud = STATE.userData;
  html('content-area',`
    <div class="page-header"><h1 class="page-title">Settings</h1></div>
    <div class="form-grid-2">
      <div class="section-card">
        <div class="section-header"><span class="section-title">Profile</span></div>
        <div class="p-5">
          <div class="flex items-center gap-4 mb-5">
            <div class="s-avatar" style="width:52px;height:52px;font-size:.9rem">${u.photoURL?`<img src="${u.photoURL}" alt="">`:getInitials(ud?.name||u.email)}</div>
            <div>
              <div class="font-semibold">${esc(ud?.name||u.email)}</div>
              <div class="text-secondary text-sm">${u.email}</div>
              <span class="role-badge ${roleBadge(ud?.role)} mt-2">${formatRole(ud?.role||'member')}</span>
            </div>
          </div>
          <div class="form-section">
            <div class="form-group">
              <label class="form-label">Display Name</label>
              <input type="text" class="form-input" id="s-name" value="${esc(ud?.name||'')}">
            </div>
            <button class="btn btn-primary" onclick="saveProfile()"><i class="fas fa-save"></i> Save Changes</button>
          </div>
        </div>
      </div>
      <div class="section-card">
        <div class="section-header"><span class="section-title">App Info</span></div>
        <div class="p-5">
          <div class="flex flex-col gap-3 mb-5">
            ${row2('App Name','ProjectOS')}
            ${row2('Version','1.0.0')}
            ${row2('User ID',`<span class="text-muted text-xs font-mono">${u.uid.slice(0,12)}…</span>`)}
            ${row2('Email', esc(u.email))}
          </div>
          <button class="btn btn-danger btn-full" onclick="handleSignOut()"><i class="fas fa-sign-out-alt"></i> Sign Out</button>
        </div>
      </div>
    </div>`);
}

async function saveProfile() {
  const name = document.getElementById('s-name')?.value?.trim();
  if (!name) return;
  try { await DB.updateUser(STATE.user.uid,{name}); STATE.userData.name=name; updateSidebarUser(); showToast('Profile updated!','success'); }
  catch(e) { showToast('Failed to update','error'); }
}

async function handleSignOut() {
  await signOut(); window.location.href = 'index.html';
}

/* ============================================================
   SEARCH
   ============================================================ */
async function handleGlobalSearch(q) {
  if (!q || q.length < 2) return;
  const all = await DB.getProjects();
  const found = all.filter(p=>(p.name||'').toLowerCase().includes(q.toLowerCase())||(p.description||'').toLowerCase().includes(q.toLowerCase()));
  // Could show a dropdown — for now navigate to projects with search pre-filled
}

/* ============================================================
   MODALS — PROJECT
   ============================================================ */
async function openProjectModal(projectId, preType) {
  if (STATE.users.length === 0) STATE.users = await DB.getUsers();
  let project = projectId ? await DB.getProject(projectId) : null;
  const isEdit = !!project;
  const defType = preType || project?.type || 'general';

  const uOptions = STATE.users.map(u=>`<option value="${u.id}" ${project?.ownerId===u.id?'selected':''}>${esc(u.name)}</option>`).join('');
  const memberChecks = STATE.users.map(u=>`
    <label class="flex items-center gap-3" style="cursor:pointer;padding:6px 4px;border-radius:var(--r-md)">
      <input type="checkbox" value="${u.id}" class="proj-member-cb" ${(project?.teamMembers||[]).includes(u.id)?'checked':''}
        style="width:15px;height:15px;accent-color:var(--primary)">
      <div class="s-avatar" style="width:26px;height:26px;font-size:.62rem">${getInitials(u.name)}</div>
      <div><div class="font-medium text-sm">${esc(u.name)}</div><div class="text-muted" style="font-size:.7rem">${u.email}</div></div>
    </label>`).join('');

  const analyticsFields = [
    ['hasAnalytics','Google Analytics','chart-line'],['hasSearchConsole','Search Console','search'],
    ['hasGoogleAds','Google Ads','fab fa-google'],['hasMetaAds','Meta Ads','fab fa-meta'],
    ['hasSemrush','SEMrush','chart-bar'],['hasAhrefs','Ahrefs','link'],
  ];

  showModal(`<div class="modal modal-lg">
    <div class="modal-header" style="padding:20px 26px;border-bottom:2px solid var(--border-light)">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;border-radius:var(--r-md);background:var(--primary-light);
          display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:.9rem">
          <i class="fas fa-${isEdit?'edit':'plus-circle'}"></i>
        </div>
        <div>
          <h2 class="modal-title">${isEdit?'Edit Project':'New Project'}</h2>
          <p style="font-size:.75rem;color:var(--text3);margin-top:1px">
            ${isEdit?'Update project information':'Fill in the details to create a new project'}
          </p>
        </div>
      </div>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>

    <!-- TABS -->
    <div style="display:flex;border-bottom:2px solid var(--border-light);background:var(--bg);padding:0 26px" id="m-tabs">
      ${[
        ['basic','layer-group','Details'],
        ['dates','calendar-alt','Timeline'],
        ['team','users','Team'],
        ['analytics','chart-line','Services'],
      ].map(([t,ico,lbl],i)=>`
        <button class="m-tab-btn${i===0?' m-tab-active':''}" data-tab="${t}" onclick="switchMTab('${t}',this)"
          style="display:flex;align-items:center;gap:7px;padding:14px 18px;font-size:.84rem;font-weight:600;
          border:none;background:none;cursor:pointer;color:${i===0?'var(--primary)':'var(--text3)'};
          border-bottom:2px solid ${i===0?'var(--primary)':'transparent'};margin-bottom:-2px;transition:all .15s ease">
          <i class="fas fa-${ico}" style="font-size:.8rem"></i>${lbl}
        </button>`).join('')}
    </div>

    <div class="modal-body" style="padding:24px 26px;max-height:62vh;overflow-y:auto">

      <!-- ══ BASIC TAB ══════════════════════════════════ -->
      <div id="mt-basic" class="form-section">

        <!-- Project Name -->
        <div class="form-group">
          <label class="form-label" style="font-size:.8rem">
            Project Name <span class="form-req">*</span>
          </label>
          <input type="text" class="form-input" id="p-name"
            placeholder="e.g. Bestway Courier SEO Campaign"
            value="${esc(project?.name||'')}"
            style="font-size:.95rem;font-weight:600;padding:11px 14px">
        </div>

        <!-- Type Selector (visual pill buttons) -->
        <div class="form-group">
          <label class="form-label" style="font-size:.8rem">Project Type <span class="form-req">*</span></label>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px" id="type-btns">
            ${[
              ['general','briefcase','General','var(--primary)','var(--primary-light)'],
              ['seo','search','SEO','#059669','#d1fae5'],
              ['google_ads','fab fa-google','Google Ads','#1a73e8','#e8f0fe'],
              ['meta_ads','fab fa-meta','Meta Ads','#1877f2','#e7f0fd'],
            ].map(([val,ico,lbl,color,bg])=>`
              <label style="cursor:pointer">
                <input type="radio" name="p-type-r" value="${val}" class="p-type-radio"
                  ${defType===val?'checked':''} style="display:none"
                  onchange="updateTypeBtn()">
                <div class="type-pill ${defType===val?'type-pill-active':''}"
                  data-val="${val}" data-color="${color}" data-bg="${bg}"
                  style="display:flex;flex-direction:column;align-items:center;gap:5px;
                    padding:10px 8px;border-radius:var(--r-lg);border:2px solid ${defType===val?color:'var(--border)'};
                    background:${defType===val?bg:'var(--surface)'};transition:all .15s ease;text-align:center">
                  <i class="${ico.startsWith('fab')?ico:'fas fa-'+ico}"
                    style="font-size:1.1rem;color:${defType===val?color:'var(--text3)'}"></i>
                  <span style="font-size:.75rem;font-weight:700;color:${defType===val?color:'var(--text3)'}">${lbl}</span>
                </div>
              </label>`).join('')}
          </div>
          <input type="hidden" id="p-type" value="${defType}">
        </div>

        <!-- Client + Priority -->
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" style="font-size:.8rem">Client / Owner Name <span class="form-req">*</span></label>
            <div class="input-wrap">
              <i class="fas fa-building input-ico"></i>
              <input type="text" class="form-input has-ico" id="p-client"
                placeholder="e.g. Acme Corp" value="${esc(project?.clientName||'')}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size:.8rem">Priority</label>
            <div style="display:flex;gap:6px" id="priority-btns">
              ${[
                ['low','Low','#059669','#d1fae5'],
                ['medium','Med','#d97706','#fef3c7'],
                ['high','High','#ea580c','#ffedd5'],
                ['critical','Crit','#dc2626','#fee2e2'],
              ].map(([val,lbl,color,bg])=>`
                <label style="cursor:pointer;flex:1">
                  <input type="radio" name="p-priority-r" value="${val}" class="p-priority-radio"
                    ${(project?.priority||'medium')===val?'checked':''} style="display:none"
                    onchange="updatePriorityBtn()">
                  <div class="priority-pill"
                    style="text-align:center;padding:7px 4px;border-radius:var(--r-md);border:2px solid ${(project?.priority||'medium')===val?color:'var(--border)'};
                    background:${(project?.priority||'medium')===val?bg:'var(--surface)'};
                    font-size:.72rem;font-weight:700;color:${(project?.priority||'medium')===val?color:'var(--text3)'};
                    transition:all .15s ease;cursor:pointer">
                    ${lbl}
                  </div>
                </label>`).join('')}
            </div>
            <input type="hidden" id="p-priority" value="${project?.priority||'medium'}">
          </div>
        </div>

        <!-- Location + Keywords -->
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label" style="font-size:.8rem">Project Location</label>
            <div class="input-wrap">
              <i class="fas fa-map-marker-alt input-ico" style="color:var(--danger)"></i>
              <input type="text" class="form-input has-ico" id="p-location"
                placeholder="e.g. Mumbai, India"
                value="${esc(project?.projectLocation||'')}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size:.8rem">No. of Keywords / Keywords</label>
            <div class="input-wrap">
              <i class="fas fa-hashtag input-ico" style="color:var(--primary)"></i>
              <input type="text" class="form-input has-ico" id="p-keywords"
                placeholder="150  or  seo, backlinks, gmb…"
                value="${esc(project?.targetKeywords||'')}">
            </div>
          </div>
        </div>

        <!-- Description -->
        <div class="form-group">
          <label class="form-label" style="font-size:.8rem">Description</label>
          <textarea class="form-input form-textarea" id="p-desc"
            placeholder="Brief project description, goals, scope…"
            style="min-height:80px">${esc(project?.description||'')}</textarea>
        </div>

        <!-- Assign To -->
        <div class="form-group">
          <label class="form-label" style="font-size:.8rem">Assign To
            <span style="font-weight:500;color:var(--primary);margin-left:6px;font-size:.72rem">
              ${STATE.users.filter(u=>(project?.assigneeIds||[]).includes(u.id)||project?.ownerId===u.id).length
                ? STATE.users.filter(u=>(project?.assigneeIds||[]).includes(u.id)||project?.ownerId===u.id).length+' selected'
                : 'Select team members'}
            </span>
          </label>
          <!-- Search -->
          <div class="input-wrap" style="margin-bottom:6px">
            <i class="fas fa-search input-ico"></i>
            <input type="text" class="form-input has-ico" placeholder="Search members…"
              oninput="filterAssigneeList(this.value)"
              style="border-radius:var(--r-md) var(--r-md) 0 0;border-bottom:none">
          </div>
          <div id="assignee-list"
            style="border:1.5px solid var(--border);border-radius:0 0 var(--r-md) var(--r-md);
            max-height:180px;overflow-y:auto;background:var(--surface)">
            ${STATE.users.map(u=>{
              const checked = (project?.assigneeIds||[]).includes(u.id) || project?.ownerId===u.id;
              return `<label class="assignee-row ${checked?'assignee-checked':''}" data-name="${esc(u.name.toLowerCase())}" data-email="${esc(u.email.toLowerCase())}"
                style="display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;
                border-bottom:1px solid var(--border-light);transition:background .1s;
                background:${checked?'var(--primary-light)':'transparent'}"
                onmouseover="if(!this.querySelector('input').checked)this.style.background='var(--bg)'"
                onmouseout="if(!this.querySelector('input').checked)this.style.background='transparent'">
                <input type="checkbox" value="${u.id}" class="p-assignee-cb"
                  ${checked?'checked':''}
                  style="display:none"
                  onchange="this.closest('label').style.background=this.checked?'var(--primary-light)':'transparent'">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--grad-purple);
                  display:flex;align-items:center;justify-content:center;color:white;
                  font-size:.62rem;font-weight:700;flex-shrink:0">${getInitials(u.name)}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:.84rem;font-weight:600;color:var(--text)">${esc(u.name)}</div>
                  <div style="font-size:.72rem;color:var(--text3)">${esc(u.email)}</div>
                </div>
                <div style="width:20px;height:20px;border-radius:50%;border:2px solid ${checked?'var(--primary)':'var(--border)'};
                  display:flex;align-items:center;justify-content:center;flex-shrink:0;
                  background:${checked?'var(--primary)':'transparent'};transition:all .15s">
                  ${checked?'<i class="fas fa-check" style="font-size:.5rem;color:white"></i>':''}
                </div>
              </label>`;
            }).join('')||'<p style="padding:16px;text-align:center;color:var(--text3);font-size:.84rem">No users found</p>'}
          </div>
        </div>
      </div>

      <!-- ══ DATES TAB ══════════════════════════════════ -->
      <div id="mt-dates" class="form-section" style="display:none">

        <!-- Status visual selector -->
        <div class="form-group">
          <label class="form-label" style="font-size:.8rem">Project Status</label>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
            ${[
              ['not_started','circle-dot','Not Started','#64748b','#f1f5f9'],
              ['in_progress','spinner','In Progress','#1d4ed8','#dbeafe'],
              ['on_hold','pause-circle','On Hold','#b45309','#fef3c7'],
              ['completed','check-circle','Completed','#065f46','#d1fae5'],
            ].map(([val,ico,lbl,color,bg])=>`
              <label style="cursor:pointer">
                <input type="radio" name="p-status-r" value="${val}"
                  ${(project?.status||'not_started')===val?'checked':''} style="display:none"
                  onchange="updateStatusBtn()">
                <div style="text-align:center;padding:10px 6px;border-radius:var(--r-lg);
                  border:2px solid ${(project?.status||'not_started')===val?color:'var(--border)'};
                  background:${(project?.status||'not_started')===val?bg:'var(--surface)'};
                  transition:all .15s;cursor:pointer">
                  <i class="fas fa-${ico}" style="font-size:1.1rem;color:${(project?.status||'not_started')===val?color:'var(--text3)'}"></i>
                  <div style="font-size:.7rem;font-weight:700;color:${(project?.status||'not_started')===val?color:'var(--text3)'};margin-top:5px">${lbl}</div>
                </div>
              </label>`).join('')}
          </div>
          <input type="hidden" id="p-status" value="${project?.status||'not_started'}">
        </div>

        <!-- Date timeline -->
        <div style="background:var(--bg);border-radius:var(--r-lg);padding:18px;position:relative">
          <div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:14px;
            text-transform:uppercase;letter-spacing:.5px">
            <i class="fas fa-calendar-alt" style="color:var(--primary);margin-right:6px"></i>Project Timeline
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px">
            <div class="form-group">
              <label class="form-label" style="font-size:.75rem;color:var(--success)">
                <i class="fas fa-play-circle"></i> Start Date
              </label>
              <input type="date" class="form-input" id="p-start" value="${project?.startDate||''}"
                style="border-color:#a7f3d0">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:.75rem;color:var(--warn)">
                <i class="fas fa-flag-checkered"></i> End Date
              </label>
              <input type="date" class="form-input" id="p-end" value="${project?.endDate||''}"
                style="border-color:#fde68a">
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:.75rem;color:var(--danger)">
                <i class="fas fa-times-circle"></i> Close Date
              </label>
              <input type="date" class="form-input" id="p-close" value="${project?.closedAt||''}"
                style="border-color:#fecaca">
            </div>
          </div>
        </div>

        <!-- Reporting date + frequency -->
        <div style="background:var(--bg);border-radius:var(--r-lg);padding:16px 18px">
          <div style="font-size:.8rem;font-weight:700;color:var(--text2);margin-bottom:14px;
            text-transform:uppercase;letter-spacing:.5px">
            <i class="fas fa-calendar-check" style="color:var(--primary);margin-right:6px"></i>Reporting Schedule
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label class="form-label" style="font-size:.75rem">Reporting Date</label>
              <input type="date" class="form-input" id="p-reporting"
                value="${project?.reportingDate||''}">
              <span class="form-hint">First report date or one-time date</span>
            </div>
            <div class="form-group">
              <label class="form-label" style="font-size:.75rem">Repeat Frequency</label>
              <select class="form-input form-select" id="p-freq">
                ${[
                  ['none','One-time only'],
                  ['weekly','Every Week'],
                  ['biweekly','Every 2 Weeks'],
                  ['monthly','Every Month (same date)'],
                  ['quarterly','Every Quarter'],
                ].map(([v,l])=>`<option value="${v}" ${(project?.reportingFrequency||'none')===v?'selected':''}>${l}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="margin-top:10px;padding:9px 12px;background:white;border-radius:var(--r-md);
            border:1px solid var(--border);display:flex;align-items:center;gap:8px;font-size:.8rem;color:var(--text2)">
            <i class="fas fa-bell" style="color:#7c3aed"></i>
            <span>Team members assigned to the project will receive a browser notification on each reporting date.</span>
          </div>
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label class="form-label" style="font-size:.8rem">
            <i class="fas fa-sticky-note" style="color:var(--warn)"></i> Project Notes
          </label>
          <textarea class="form-input form-textarea" id="p-notes"
            placeholder="Client requirements, project scope, important notes, goals…"
            style="min-height:110px">${esc(project?.notes||'')}</textarea>
        </div>
      </div>

      <!-- ══ TEAM TAB ═══════════════════════════════════ -->
      <div id="mt-team" class="form-section" style="display:none">
        <div class="form-group">
          <label class="form-label" style="font-size:.8rem">Additional Team Members
            <span style="font-weight:500;color:var(--text3);font-size:.75rem">(for project access)</span>
          </label>
          <div class="input-wrap" style="margin-bottom:8px">
            <i class="fas fa-search input-ico"></i>
            <input type="text" class="form-input has-ico" placeholder="Search team members…"
              oninput="filterMemberList(this.value)">
          </div>
          <div id="member-list"
            style="border:1.5px solid var(--border);border-radius:var(--r-lg);overflow:hidden">
            ${STATE.users.map(u=>{
              const checked = (project?.teamMembers||[]).includes(u.id);
              return `<label class="member-row" data-name="${esc(u.name.toLowerCase())}" data-email="${esc(u.email.toLowerCase())}"
                style="display:flex;align-items:center;gap:12px;padding:11px 14px;cursor:pointer;
                border-bottom:1px solid var(--border-light);background:${checked?'var(--bg)':'var(--surface)'};
                transition:background .1s"
                onmouseover="this.style.background='var(--bg)'"
                onmouseout="this.style.background=this.querySelector('input').checked?'var(--bg)':'var(--surface)'">
                <input type="checkbox" value="${u.id}" class="proj-member-cb"
                  ${checked?'checked':''}
                  style="width:16px;height:16px;accent-color:var(--primary);flex-shrink:0">
                <div style="width:36px;height:36px;border-radius:50%;background:var(--grad-purple);
                  display:flex;align-items:center;justify-content:center;color:white;
                  font-size:.65rem;font-weight:700;flex-shrink:0">${getInitials(u.name)}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:.875rem;font-weight:600;color:var(--text)">${esc(u.name)}</div>
                  <div style="font-size:.75rem;color:var(--text3)">${esc(u.email)}</div>
                </div>
                <span style="font-size:.7rem;font-weight:700;padding:3px 8px;border-radius:var(--r-full);
                  background:${u.role==='super_admin'?'var(--primary-light)':u.role==='admin'?'#dbeafe':'var(--g100)'};
                  color:${u.role==='super_admin'?'var(--primary)':u.role==='admin'?'#1e40af':'var(--g500)'}">
                  ${formatRole(u.role)}
                </span>
              </label>`;
            }).join('')||'<p style="padding:20px;text-align:center;color:var(--text3)">No users found</p>'}
          </div>
        </div>
      </div>

      <!-- ══ ANALYTICS TAB ══════════════════════════════ -->
      <div id="mt-analytics" class="form-section" style="display:none">
        <div style="background:var(--bg);border-radius:var(--r-lg);padding:14px 16px;margin-bottom:18px;
          display:flex;align-items:center;gap:10px;font-size:.84rem;color:var(--text2)">
          <i class="fas fa-info-circle" style="color:var(--primary)"></i>
          Enable the platforms being used for this project. Enabled services appear on the project analytics page.
        </div>
        ${[
          ['hasAnalytics','Google Analytics','chart-line','#E97514','#fff3e0','analyticsUrl','Tracking ID (G-XXXXXXX)'],
          ['hasSearchConsole','Search Console','search','#4285F4','#e8f0fe','searchConsoleUrl','Property URL'],
          ['hasGoogleAds','Google Ads','fab fa-google','#1A73E8','#e8f0fe','googleAdsUrl','Ads Account ID'],
          ['hasMetaAds','Meta Ads','fab fa-meta','#1877F2','#e7f0fd','metaAdsUrl','Ad Account ID'],
          ['hasSemrush','SEMrush','chart-bar','#FF642D','#fff0eb','semrushUrl','Project URL'],
          ['hasAhrefs','Ahrefs','link','#2F81F7','#e8f0fe','ahrefsUrl','Project URL'],
        ].map(([key,name,ico,color,bg,urlKey,placeholder])=>{
          const enabled = project?.[key];
          const url = project?.[urlKey]||'';
          return `<div class="analytics-service-card" id="card-${key}"
            style="border:2px solid ${enabled?color:'var(--border)'};border-radius:var(--r-lg);
            margin-bottom:10px;overflow:hidden;transition:border-color .2s">
            <div style="display:flex;align-items:center;gap:12px;padding:13px 16px;
              background:${enabled?bg:'var(--surface)'};transition:background .2s;cursor:pointer"
              onclick="toggleAnalyticsCard('${key}','${color}','${bg}')">
              <div style="width:38px;height:38px;border-radius:var(--r-md);
                background:${enabled?color+'30':'var(--g100)'};
                display:flex;align-items:center;justify-content:center;
                font-size:.95rem;color:${enabled?color:'var(--text3)'}">
                <i class="${ico.startsWith('fab')?ico:'fas fa-'+ico}"></i>
              </div>
              <div style="flex:1">
                <div style="font-size:.88rem;font-weight:700;color:${enabled?color:'var(--text)'}">${name}</div>
                <div style="font-size:.72rem;color:var(--text3);margin-top:1px">
                  ${enabled?'Active — click to disable':'Click to enable'}
                </div>
              </div>
              <div style="width:22px;height:22px;border-radius:50%;
                border:2px solid ${enabled?color:'var(--border)'};
                background:${enabled?color:'transparent'};
                display:flex;align-items:center;justify-content:center;transition:all .2s;flex-shrink:0">
                ${enabled?'<i class="fas fa-check" style="font-size:.52rem;color:white"></i>':''}
              </div>
              <input type="checkbox" id="an-${key}" ${enabled?'checked':''} style="display:none">
            </div>
            <div class="analytics-url-field" style="display:${enabled?'block':'none'};
              padding:10px 14px;border-top:1px solid ${color}30;background:${bg}">
              <div class="input-wrap">
                <i class="fas fa-link input-ico" style="color:${color}"></i>
                <input type="text" class="form-input has-ico" id="${urlKey}"
                  placeholder="${placeholder}"
                  value="${esc(url)}"
                  style="border-color:${color}50;font-size:.84rem;background:white">
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>

    </div>

    <!-- FOOTER -->
    <div class="modal-footer" style="padding:16px 26px">
      <button class="btn btn-outline" onclick="closeModal()">
        <i class="fas fa-times"></i> Cancel
      </button>
      <button class="btn btn-primary" onclick="saveProject(${projectId?`'${projectId}'`:'null'})"
        style="padding:10px 24px;font-size:.9rem">
        <i class="fas fa-${isEdit?'save':'rocket'}"></i> ${isEdit?'Save Changes':'Create Project'}
      </button>
    </div>
  </div>`);
}

function switchMTab(tab, btn) {
  // New tab styling
  document.querySelectorAll('#m-tabs .m-tab-btn').forEach(b=>{
    b.style.color = 'var(--text3)';
    b.style.borderBottomColor = 'transparent';
  });
  btn.style.color = 'var(--primary)';
  btn.style.borderBottomColor = 'var(--primary)';
  ['basic','dates','team','analytics'].forEach(t=>{
    const el = document.getElementById(`mt-${t}`);
    if (el) el.style.display = t===tab ? 'flex' : 'none';
  });
}

// Type pill selector
function updateTypeBtn() {
  const radios = document.querySelectorAll('.p-type-radio');
  radios.forEach(r => {
    const div  = r.closest('label').querySelector('.type-pill');
    const val  = r.value;
    const active = r.checked;
    const color = div.dataset.color;
    const bg    = div.dataset.bg;
    div.style.borderColor  = active ? color : 'var(--border)';
    div.style.background   = active ? bg    : 'var(--surface)';
    div.querySelector('i').style.color  = active ? color : 'var(--text3)';
    div.querySelector('span').style.color = active ? color : 'var(--text3)';
    if (active) document.getElementById('p-type').value = val;
  });
}

// Priority pill selector
function updatePriorityBtn() {
  const colors = { low:'#059669',medium:'#d97706',high:'#ea580c',critical:'#dc2626' };
  const bgs    = { low:'#d1fae5',medium:'#fef3c7',high:'#ffedd5',critical:'#fee2e2' };
  document.querySelectorAll('.p-priority-radio').forEach(r => {
    const div = r.closest('label').querySelector('.priority-pill');
    const active = r.checked;
    const c = colors[r.value]; const b = bgs[r.value];
    div.style.borderColor = active ? c : 'var(--border)';
    div.style.background  = active ? b : 'var(--surface)';
    div.style.color       = active ? c : 'var(--text3)';
    if (active) document.getElementById('p-priority').value = r.value;
  });
}

// Status visual selector
function updateStatusBtn() {
  const colors = { not_started:'#64748b',in_progress:'#1d4ed8',on_hold:'#b45309',completed:'#065f46' };
  const bgs    = { not_started:'#f1f5f9',in_progress:'#dbeafe',on_hold:'#fef3c7',completed:'#d1fae5' };
  document.querySelectorAll('[name="p-status-r"]').forEach(r => {
    const div = r.closest('label').querySelector('div');
    const active = r.checked;
    const c = colors[r.value]; const b = bgs[r.value];
    div.style.borderColor = active ? c : 'var(--border)';
    div.style.background  = active ? b : 'var(--surface)';
    div.querySelector('i').style.color  = active ? c : 'var(--text3)';
    div.querySelector('div').style.color = active ? c : 'var(--text3)';
    if (active) document.getElementById('p-status').value = r.value;
  });
}

// Analytics service card toggle
function toggleAnalyticsCard(key, color, bg) {
  const cb   = document.getElementById(`an-${key}`);
  const card = document.getElementById(`card-${key}`);
  if (!cb || !card) return;
  cb.checked = !cb.checked;
  const enabled = cb.checked;
  const header   = card.querySelector(':scope > div:first-child');
  const urlField = card.querySelector('.analytics-url-field');
  const checkEl  = header.querySelector(':scope > div:last-child');
  card.style.borderColor     = enabled ? color : 'var(--border)';
  header.style.background    = enabled ? bg    : 'var(--surface)';
  header.querySelector('div:nth-child(2) > div:first-child').style.color = enabled ? color : 'var(--text)';
  header.querySelector('div:nth-child(2) > div:last-child').textContent = enabled ? 'Active — click to disable' : 'Click to enable';
  if (urlField) urlField.style.display = enabled ? 'block' : 'none';
  checkEl.style.borderColor = enabled ? color : 'var(--border)';
  checkEl.style.background  = enabled ? color : 'transparent';
  checkEl.innerHTML = enabled ? '<i class="fas fa-check" style="font-size:.52rem;color:white"></i>' : '';
}

// Assignee list search filter
function filterAssigneeList(q) {
  document.querySelectorAll('#assignee-list .assignee-row').forEach(row => {
    const match = !q || row.dataset.name.includes(q.toLowerCase()) || row.dataset.email.includes(q.toLowerCase());
    row.style.display = match ? 'flex' : 'none';
  });
}

// Team member list search filter
function filterMemberList(q) {
  document.querySelectorAll('#member-list .member-row').forEach(row => {
    const match = !q || row.dataset.name.includes(q.toLowerCase()) || row.dataset.email.includes(q.toLowerCase());
    row.style.display = match ? 'flex' : 'none';
  });
}

async function saveProject(projectId) {
  const name = document.getElementById('p-name')?.value?.trim();
  if (!name) { showToast('Project name is required','error'); return; }

  const members    = Array.from(document.querySelectorAll('.proj-member-cb:checked')).map(e=>e.value);
  const assigneeIds = Array.from(document.querySelectorAll('.p-assignee-cb:checked')).map(e=>e.value);
  const anKeys = ['hasAnalytics','hasSearchConsole','hasGoogleAds','hasMetaAds','hasSemrush','hasAhrefs'];
  const analytics = {};
  anKeys.forEach(k => {
    analytics[k] = document.getElementById(`an-${k}`)?.checked || false;
  });
  // Save analytics URL/ID fields
  const urlKeys = ['analyticsUrl','searchConsoleUrl','googleAdsUrl','metaAdsUrl','semrushUrl','ahrefsUrl'];
  urlKeys.forEach(k => {
    const el = document.getElementById(k);
    if (el) analytics[k] = el.value.trim() || null;
  });

  const data = {
    name,
    clientName:      val('p-client')    || null,
    targetKeywords:  val('p-keywords')  || null,
    projectLocation: val('p-location')  || null,
    reportingDate:      val('p-reporting')  || null,
    reportingFrequency: val('p-freq')       || 'none',
    description:     val('p-desc')      || null,
    type:            val('p-type')      || 'general',
    priority:        val('p-priority')  || 'medium',
    status:          val('p-status')    || 'not_started',
    ownerId:         assigneeIds[0]     || null,   // keep first as primary for compatibility
    assigneeIds,
    teamMembers:     members,
    notes:           val('p-notes')     || null,
    startDate:       val('p-start')     || null,
    endDate:         val('p-end')       || null,
    closedAt:        val('p-close')     || null,
    ...analytics,
  };

  try {
    setModalLoading(true);
    if (projectId) { await DB.updateProject(projectId,data); showToast('Project updated!','success'); closeModal(); navigate(`project/${projectId}`); }
    else { const id=await DB.createProject(data); showToast('Project created!','success'); closeModal(); navigate(`project/${id}`); }
  } catch(e) { showToast('Failed: '+e.message,'error'); setModalLoading(false); }
}

/* ============================================================
   MODALS — TASK
   ============================================================ */
async function openTaskModal(projectId, taskId, preStatus) {
  if (STATE.users.length===0) STATE.users = await DB.getUsers();
  let task = null;
  if (taskId) { const tasks=await DB.getTasks(projectId); task=tasks.find(t=>t.id===taskId); }
  const isEdit = !!task;
  const defStatus = task?.status || preStatus || 'todo';

  showModal(`<div class="modal modal-md">
    <div class="modal-header">
      <h2 class="modal-title">${isEdit?'Edit Task':'New Task'}</h2>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body"><div class="form-section">
      <div class="form-group">
        <label class="form-label">Title <span class="form-req">*</span></label>
        <input type="text" class="form-input" id="t-title" placeholder="What needs to be done?" value="${esc(task?.title||'')}">
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <textarea class="form-input form-textarea" id="t-desc" placeholder="Details…">${esc(task?.description||'')}</textarea>
      </div>
      <div class="form-grid-2">
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-input form-select" id="t-status">
            ${[['todo','To Do'],['in_progress','In Progress'],['review','In Review'],['done','Done']].map(([v,l])=>
              `<option value="${v}" ${defStatus===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Priority</label>
          <select class="form-input form-select" id="t-priority">
            ${['low','medium','high','critical'].map(p=>`<option value="${p}" ${(task?.priority||'medium')===p?'selected':''}>${cap(p)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-group"><label class="form-label">Assigned To</label>
          <select class="form-input form-select" id="t-assignee">
            <option value="">Unassigned</option>
            ${STATE.users.map(u=>`<option value="${u.id}" ${task?.assigneeId===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Due Date</label>
          <input type="date" class="form-input" id="t-due" value="${task?.dueDate||''}">
        </div>
      </div>
    </div></div>
    <div class="modal-footer">
      ${isEdit?`<button class="btn btn-danger mr-auto" onclick="deleteTask('${projectId}','${taskId}')"><i class="fas fa-trash"></i></button>`:''}
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTask('${projectId}','${taskId||''}')">
        <i class="fas fa-save"></i> ${isEdit?'Update':'Add Task'}
      </button>
    </div>
  </div>`);
}

async function saveTask(projectId, taskId) {
  const title = val('t-title')?.trim();
  if (!title) { showToast('Title required','error'); return; }
  const data = { title, description:val('t-desc')||'', status:val('t-status')||'todo',
    priority:val('t-priority')||'medium', assigneeId:val('t-assignee')||null, dueDate:val('t-due')||null };
  try {
    if (taskId) { await DB.updateTask(projectId,taskId,data); showToast('Task updated!','success'); }
    else { await DB.createTask(projectId,data); showToast('Task added!','success'); }
    closeModal();
    if (STATE.currentProject?.id===projectId) loadTasksTab(STATE.currentProject);
  } catch(e) { showToast('Failed','error'); }
}

async function deleteTask(projectId, taskId) {
  if (!confirm('Delete this task?')) return;
  await DB.deleteTask(projectId,taskId);
  showToast('Task deleted','success'); closeModal();
  if (STATE.currentProject?.id===projectId) loadTasksTab(STATE.currentProject);
}

/* ============================================================
   MODALS — CREDENTIAL
   ============================================================ */
async function openCredModal(projectId, credId) {
  const projects = await DB.getProjects();
  let cred = null;
  if (credId) {
    const all = await DB.getCredentials();
    cred = all.find(c=>c.id===credId);
  }

  const types = ['Website CMS','Google Account','Social Media','Hosting','FTP/SSH','Database','Email','Analytics','Ads Account','API Key','Other'];

  showModal(`<div class="modal modal-md">
    <div class="modal-header">
      <h2 class="modal-title">${cred?'Edit Credential':'Add Credential'}</h2>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body"><div class="form-section">
      <div class="form-group">
        <label class="form-label">Name <span class="form-req">*</span></label>
        <input type="text" class="form-input" id="c-name" placeholder="e.g. WordPress Admin" value="${esc(cred?.name||'')}">
      </div>
      <div class="form-grid-2">
        <div class="form-group"><label class="form-label">Type</label>
          <select class="form-input form-select" id="c-type">
            ${types.map(t=>`<option ${cred?.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Project</label>
          <select class="form-input form-select" id="c-project">
            <option value="">No Project</option>
            ${projects.map(p=>`<option value="${p.id}" ${(cred?.projectId||projectId)===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">URL / Website</label>
        <input type="url" class="form-input" id="c-url" placeholder="https://…" value="${esc(cred?.url||'')}">
      </div>
      <div class="form-grid-2">
        <div class="form-group"><label class="form-label">Username / Email</label>
          <input type="text" class="form-input" id="c-user" placeholder="Username" value="${esc(cred?.username||'')}">
        </div>
        <div class="form-group"><label class="form-label">Password</label>
          <div class="input-wrap">
            <input type="password" class="form-input" id="c-pass" placeholder="Password" value="${esc(cred?.password||'')}">
            <button type="button" class="pwd-toggle" onclick="togglePwd('c-pass')"><i class="fas fa-eye"></i></button>
          </div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-input" id="c-notes" placeholder="Additional notes…">${esc(cred?.notes||'')}</textarea>
      </div>
      <div class="alert alert-warning"><i class="fas fa-shield-alt"></i> <span>Credentials are stored in Firestore. Keep your project permissions secure.</span></div>
    </div></div>
    <div class="modal-footer">
      ${cred?`<button class="btn btn-danger mr-auto" onclick="deleteCred('${cred.id}')"><i class="fas fa-trash"></i></button>`:''}
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveCred('${cred?.id||''}','${projectId||''}')"><i class="fas fa-save"></i> Save</button>
    </div>
  </div>`);
}

async function saveCred(credId, projectId) {
  const name = val('c-name')?.trim();
  if (!name) { showToast('Name required','error'); return; }
  const data = { name, type:val('c-type')||'Other', projectId:val('c-project')||projectId||null,
    url:val('c-url')||'', username:val('c-user')||'', password:val('c-pass')||'', notes:val('c-notes')||'' };
  try {
    if (credId) { await DB.updateCredential(credId,data); showToast('Updated!','success'); }
    else        { await DB.createCredential(data); showToast('Saved!','success'); }
    closeModal();
    if (STATE.view==='credentials') renderCredentials();
    else if (STATE.currentProject) loadCredsTab(STATE.currentProject);
  } catch(e) { showToast('Failed','error'); }
}

async function deleteCred(id) {
  if (!confirm('Delete credential?')) return;
  await DB.deleteCredential(id); showToast('Deleted','success'); closeModal();
  if (STATE.view==='credentials') renderCredentials();
  else if (STATE.currentProject) loadCredsTab(STATE.currentProject);
}

/* ============================================================
   MODALS — TOOL
   ============================================================ */
async function openToolModal(projectId, toolId) {
  const projects = await DB.getProjects();
  let tool = null;
  if (toolId) { const all=await DB.getTools(); tool=all.find(t=>t.id===toolId); }

  showModal(`<div class="modal modal-md">
    <div class="modal-header">
      <h2 class="modal-title">${tool?'Edit Tool':'Add Tool'}</h2>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body"><div class="form-section">
      <div class="form-group">
        <label class="form-label">Tool Name <span class="form-req">*</span></label>
        <input type="text" class="form-input" id="tl-name" placeholder="e.g. SEMrush, Screaming Frog…" value="${esc(tool?.name||'')}">
      </div>
      <div class="form-grid-2">
        <div class="form-group"><label class="form-label">Category</label>
          <select class="form-input form-select" id="tl-cat">
            ${['SEO','Analytics','Ads','Design','Dev','CMS','Email','Social','Other'].map(c=>`<option ${tool?.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Project</label>
          <select class="form-input form-select" id="tl-project">
            <option value="">No Project</option>
            ${projects.map(p=>`<option value="${p.id}" ${(tool?.projectId||projectId)===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">URL</label>
        <input type="url" class="form-input" id="tl-url" placeholder="https://…" value="${esc(tool?.url||'')}">
      </div>
      <div class="form-group">
        <label class="form-label">Notes / Credentials Reference</label>
        <textarea class="form-input" id="tl-notes" placeholder="Notes, license info, linked credentials…">${esc(tool?.notes||'')}</textarea>
      </div>
    </div></div>
    <div class="modal-footer">
      ${tool?`<button class="btn btn-danger mr-auto" onclick="deleteTool('${tool.id}','${projectId||''}')"><i class="fas fa-trash"></i></button>`:''}
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveTool('${tool?.id||''}','${projectId||''}')"><i class="fas fa-save"></i> Save</button>
    </div>
  </div>`);
}

async function saveTool(toolId, projectId) {
  const name = val('tl-name')?.trim();
  if (!name) { showToast('Name required','error'); return; }
  const data = { name, category:val('tl-cat')||'Other', projectId:val('tl-project')||projectId||null, url:val('tl-url')||'', notes:val('tl-notes')||'' };
  try {
    if (toolId) { await DB.updateTool(toolId,data); showToast('Updated!','success'); }
    else        { await DB.createTool(data); showToast('Saved!','success'); }
    closeModal();
    if (STATE.currentProject) loadToolsTab(STATE.currentProject);
  } catch(e) { showToast('Failed','error'); }
}

async function deleteTool(id, projectId) {
  if (!confirm('Delete tool?')) return;
  await DB.deleteTool(id); showToast('Deleted','success'); closeModal();
  if (STATE.currentProject) loadToolsTab(STATE.currentProject);
}

/* ============================================================
   MODALS — USER
   ============================================================ */
async function openUserModal(userId) {
  let user = userId ? STATE.users.find(u=>u.id===userId) : null;
  showModal(`<div class="modal modal-md">
    <div class="modal-header">
      <h2 class="modal-title">${user ? 'Edit User' : 'Create New User'}</h2>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body"><div class="form-section">
      ${user ? `
        <div class="flex items-center gap-3 p-3 card mb-4">
          <div class="s-avatar" style="width:42px;height:42px;font-size:.85rem">${getInitials(user.name)}</div>
          <div>
            <div class="font-semibold">${esc(user.name)}</div>
            <div class="text-secondary text-sm">${esc(user.email)}</div>
          </div>
          <span class="role-badge ${roleBadge(user.role)} ml-auto">${formatRole(user.role)}</span>
        </div>
        <div class="form-group">
          <label class="form-label">Change Role</label>
          <select class="form-input form-select" id="u-role">
            <option value="member" ${user.role==='member'?'selected':''}>Member</option>
            <option value="admin" ${user.role==='admin'?'selected':''}>Admin</option>
            <option value="super_admin" ${user.role==='super_admin'?'selected':''}>Super Admin</option>
          </select>
        </div>
        <div class="alert alert-info mt-3">
          <i class="fas fa-info-circle"></i>
          <span>Clicking <strong>Reset Password</strong> sends a reset email to <strong>${esc(user.email)}</strong>.</span>
        </div>
      ` : `
        <div class="form-group">
          <label class="form-label">Full Name <span class="form-req">*</span></label>
          <input type="text" class="form-input" id="u-name" placeholder="John Smith">
        </div>
        <div class="form-group">
          <label class="form-label">Email Address <span class="form-req">*</span></label>
          <input type="email" class="form-input" id="u-email" placeholder="john@company.com">
        </div>
        <div class="form-group">
          <label class="form-label">Password <span class="form-req">*</span></label>
          <div class="input-wrap">
            <input type="password" class="form-input" id="u-password" placeholder="Minimum 6 characters">
            <button type="button" class="pwd-toggle" onclick="togglePwd('u-password')"><i class="fas fa-eye"></i></button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Role</label>
          <select class="form-input form-select" id="u-role">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
        </div>
      `}
    </div></div>
    <div class="modal-footer">
      ${user ? `
        <button class="btn btn-outline mr-auto" onclick="resetUserPassword('${esc(user.email)}')">
          <i class="fas fa-key"></i> Reset Password
        </button>
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUserRole('${userId}')">
          <i class="fas fa-save"></i> Save Role
        </button>
      ` : `
        <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="createUser()">
          <i class="fas fa-user-plus"></i> Create User
        </button>
      `}
    </div>
  </div>`);
}

async function createUser() {
  const name     = val('u-name')?.trim();
  const email    = val('u-email')?.trim();
  const password = document.getElementById('u-password')?.value;
  const role     = val('u-role') || 'member';

  if (!name)     { showToast('Full name is required', 'error'); return; }
  if (!email)    { showToast('Email is required', 'error'); return; }
  if (!password) { showToast('Password is required', 'error'); return; }
  if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }

  const btn = document.querySelector('.modal-footer .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…'; }

  try {
    // Use a secondary Firebase app so current user stays logged in
    let secondaryApp;
    try { secondaryApp = firebase.app('user-creator'); }
    catch(e) { secondaryApp = firebase.initializeApp(firebaseConfig, 'user-creator'); }

    const secondaryAuth = secondaryApp.auth();
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const newUid = cred.user.uid;
    await secondaryAuth.signOut();

    // Save user profile in Firestore
    await db.collection('users').doc(newUid).set({
      uid:      newUid,
      name,
      email,
      photoURL: null,
      role,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastLogin: null,
    });

    STATE.users = await DB.getUsers();
    showToast(`User "${name}" created successfully!`, 'success');
    closeModal();
    renderUsers();
  } catch(e) {
    const msg = getAuthErrorMessage(e.code);
    showToast(msg, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Create User'; }
  }
}

async function resetUserPassword(email) {
  if (!confirm(`Send password reset email to ${email}?`)) return;
  try {
    await auth.sendPasswordResetEmail(email);
    showToast(`Reset email sent to ${email}`, 'success');
  } catch(e) {
    showToast('Failed to send reset email: ' + e.message, 'error');
  }
}

async function saveUserRole(uid) {
  const role = val('u-role');
  try {
    await DB.updateUser(uid, { role });
    STATE.users = await DB.getUsers();
    showToast('Role updated!', 'success');
    closeModal();
    renderUsers();
  } catch(e) { showToast('Failed to update role', 'error'); }
}

/* ============================================================
   MODALS — ADD MEMBER
   ============================================================ */
async function openAddMemberModal(projectId) {
  const project = await DB.getProject(projectId);
  const available = STATE.users.filter(u=>!(project.teamMembers||[]).includes(u.id) && u.id!==project.ownerId);

  showModal(`<div class="modal modal-sm">
    <div class="modal-header"><h2 class="modal-title">Add Team Member</h2>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body">
      ${available.length?`<div class="form-section">
        <div class="form-group"><label class="form-label">Select User</label>
          <select class="form-input form-select" id="new-member">
            <option value="">Choose…</option>
            ${available.map(u=>`<option value="${u.id}">${esc(u.name)} (${u.email})</option>`).join('')}
          </select>
        </div></div>` : '<p class="text-secondary text-center p-4">All users are already team members.</p>'}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      ${available.length?`<button class="btn btn-primary" onclick="addMember('${projectId}')"><i class="fas fa-plus"></i> Add</button>`:''}
    </div>
  </div>`);
}

async function addMember(projectId) {
  const uid = val('new-member');
  if (!uid) { showToast('Select a user','error'); return; }
  const project = await DB.getProject(projectId);
  const members = [...(project.teamMembers||[]), uid];
  await DB.updateProject(projectId,{teamMembers:members});
  showToast('Member added!','success'); closeModal();
  STATE.currentProject = await DB.getProject(projectId);
  renderTeamTab(STATE.currentProject);
}

async function removeMember(projectId, uid) {
  if (!confirm('Remove this member?')) return;
  const project = await DB.getProject(projectId);
  const members = (project.teamMembers||[]).filter(id=>id!==uid);
  await DB.updateProject(projectId,{teamMembers:members});
  showToast('Member removed','success');
  STATE.currentProject = await DB.getProject(projectId);
  renderTeamTab(STATE.currentProject);
}

/* ============================================================
   PROJECT ACTIONS
   ============================================================ */
async function chStatus(projectId, status) {
  const update = { status };
  if (status==='on_hold') update.pausedAt = new Date().toISOString().split('T')[0];
  if (status==='in_progress' && STATE.currentProject?.status==='on_hold') update.pausedAt = null;
  if (status==='completed') update.closedAt = new Date().toISOString().split('T')[0];
  await DB.updateProject(projectId, update);
  showToast(`Status updated to ${fmtStatus(status)}`, 'success');
  closeDropdowns();
  renderProjectDetail(projectId);
}

async function confirmDeleteProject(projectId) {
  closeDropdowns();
  const project = STATE.projects.find(p=>p.id===projectId) || await DB.getProject(projectId);
  if (!project) return;
  // STEP 1 — Are you sure?
  showModal(`<div class="modal modal-sm">
    <div class="modal-header">
      <h2 class="modal-title" style="color:var(--danger)"><i class="fas fa-triangle-exclamation"></i> Delete Project</h2>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body">
      <div class="alert alert-danger mb-4">
        <i class="fas fa-exclamation-triangle"></i>
        <div>You are about to delete <strong>"${esc(project.name)}"</strong>.
          This will permanently remove the project and <strong>all its tasks</strong>. This cannot be undone.</div>
      </div>
      <div style="background:var(--bg);border-radius:var(--r-md);padding:12px 14px;font-size:.875rem;color:var(--text2)">
        <i class="fas fa-info-circle text-brand"></i>
        You will be asked to type the project name to confirm.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="deleteStep2('${projectId}','${esc(project.name).replace(/'/g,"\\'")}')" >
        <i class="fas fa-chevron-right"></i> Continue
      </button>
    </div>
  </div>`);
}

function deleteStep2(projectId, projectName) {
  // STEP 2 — Type project name to confirm
  showModal(`<div class="modal modal-sm">
    <div class="modal-header">
      <h2 class="modal-title" style="color:var(--danger)"><i class="fas fa-triangle-exclamation"></i> Confirm Deletion</h2>
      <button class="modal-close" onclick="closeModal()"><i class="fas fa-times"></i></button>
    </div>
    <div class="modal-body">
      <div class="alert alert-danger mb-4">
        <i class="fas fa-exclamation-triangle"></i>
        <span>Type the project name exactly to confirm:</span>
      </div>
      <div style="background:var(--bg);padding:10px 14px;border-radius:var(--r-md);font-weight:700;
        font-size:.95rem;color:var(--text);margin-bottom:14px;border-left:3px solid var(--danger)">
        ${esc(projectName)}
      </div>
      <div class="form-group">
        <label class="form-label">Type project name to confirm</label>
        <input type="text" id="del-confirm-input" class="form-input"
          placeholder="${esc(projectName)}"
          oninput="checkDeleteName('${esc(projectName).replace(/'/g,"\\'")}')"
          autocomplete="off">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline" onclick="confirmDeleteProject('${projectId}')">
        <i class="fas fa-chevron-left"></i> Back
      </button>
      <button class="btn btn-danger" id="final-del-btn" disabled onclick="doDeleteProject('${projectId}')">
        <i class="fas fa-trash"></i> Delete Forever
      </button>
    </div>
  </div>`);
}

function checkDeleteName(projectName) {
  const input = document.getElementById('del-confirm-input');
  const btn   = document.getElementById('final-del-btn');
  if (!input || !btn) return;
  const match = input.value.trim() === projectName.trim();
  btn.disabled = !match;
  btn.style.opacity = match ? '1' : '0.5';
}

async function doDeleteProject(id) {
  const btn = document.getElementById('final-del-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…'; }
  try {
    await DB.deleteProject(id);
    showToast('Project deleted successfully', 'success');
    closeModal();
    STATE.projects = STATE.projects.filter(p => p.id !== id);
    navigate('projects');
  } catch(e) {
    showToast('Failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Delete Forever'; }
  }
}

async function toggleProjectActive(projectId, currentStatus, wrapEl) {
  const isLive = currentStatus === 'in_progress' || currentStatus === 'not_started';
  // Toggle: if live → on_hold, if paused/done → in_progress
  const newStatus = isLive ? 'on_hold' : 'in_progress';

  // Optimistic UI update
  const toggle = wrapEl.querySelector('.proj-toggle');
  const label  = wrapEl.querySelector('.proj-toggle-label');
  if (toggle && label) {
    toggle.classList.toggle('on', !isLive);
    toggle.classList.toggle('off', isLive);
    label.textContent = isLive ? 'Off' : 'Live';
    wrapEl.title = isLive ? 'Click to activate project' : 'Click to pause project';
  }

  // Update in Firestore
  try {
    const update = { status: newStatus };
    if (newStatus === 'on_hold') update.pausedAt = new Date().toISOString().split('T')[0];
    if (newStatus === 'in_progress') update.pausedAt = null;
    await DB.updateProject(projectId, update);

    // Update STATE.projects so re-renders are consistent
    const proj = STATE.projects.find(p => p.id === projectId);
    if (proj) {
      proj.status = newStatus;
      if (newStatus === 'on_hold') proj.pausedAt = update.pausedAt;
      if (newStatus === 'in_progress') proj.pausedAt = null;
    }

    showToast(
      newStatus === 'on_hold' ? 'Project paused' : 'Project activated',
      newStatus === 'on_hold' ? 'warning' : 'success'
    );

    // Re-render both sections without full page reload
    const stats = await DB.getStats();
    renderDashboardContent(stats, STATE.projects);
  } catch(e) {
    // Revert optimistic update on error
    if (toggle && label) {
      toggle.classList.toggle('on', isLive);
      toggle.classList.toggle('off', !isLive);
      label.textContent = isLive ? 'Live' : 'Off';
    }
    showToast('Failed to update project', 'error');
  }
}

/* ============================================================
   MODAL SYSTEM
   ============================================================ */
function showModal(content) {
  const c = document.getElementById('modal-container');
  c.innerHTML = `<div class="modal-overlay" id="modal-overlay" onclick="onOverlayClick(event)">${content}</div>`;
}

function closeModal() {
  document.getElementById('modal-container').innerHTML = '';
}

function onOverlayClick(e) {
  if (e.target.id==='modal-overlay') closeModal();
}

function setModalLoading(loading) {
  const btn = document.querySelector('.modal-footer .btn-primary');
  if (btn) { btn.disabled = loading; btn.innerHTML = loading ? '<i class="fas fa-spinner fa-spin"></i> Saving…' : '<i class="fas fa-save"></i> Save'; }
}

/* ============================================================
   TOAST SYSTEM
   ============================================================ */
function showToast(msg, type='info') {
  const icons = { success:'check-circle', error:'exclamation-circle', warning:'exclamation-triangle', info:'info-circle' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fas fa-${icons[type]} toast-icon"></i><span class="toast-msg">${msg}</span>`;
  document.getElementById('toast-wrap').appendChild(t);
  setTimeout(()=>t.remove(), 3500);
}

/* ============================================================
   DROPDOWN SYSTEM
   ============================================================ */
function toggleDD(id) {
  const dd = document.getElementById(id);
  const menu = dd?.querySelector('.dropdown-menu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  closeDropdowns();
  if (!isOpen) menu.style.display = 'block';
}

function closeDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(m=>m.style.display='none');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown')) closeDropdowns();
});

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function togglePwd(id) {
  const inp = document.getElementById(id);
  const ico = inp?.nextElementSibling?.querySelector('i');
  if (!inp) return;
  inp.type = inp.type==='password' ? 'text' : 'password';
  if (ico) ico.className = inp.type==='password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

/* ============================================================
   RENDER HELPERS
   ============================================================ */
function projCard(p) {
  const members = (p.teamMembers||[]).slice(0,3).map(id=>{ const u=STATE.users.find(u=>u.id===id); return u?getInitials(u.name):'?'; });
  const owner = STATE.users.find(u=>u.id===p.ownerId);
  return `
  <div class="proj-card type-${p.type||'general'}" onclick="navigate('project/${p.id}')">
    <div class="proj-card-body">
      <div class="proj-card-header">
        <div class="proj-card-meta">
          <span class="badge no-dot ${typeBadge(p.type)}">${typeLabel(p.type)}</span>
          <span class="badge ${statusBadge(p.status)}">${fmtStatus(p.status)}</span>
          <span class="badge no-dot ${priorityBadge(p.priority)}">${fmtPriority(p.priority)}</span>
        </div>
        <div class="proj-card-menu" onclick="event.stopPropagation();toggleDD('dd-${p.id}')">
          <div class="dropdown" id="dd-${p.id}">
            <i class="fas fa-ellipsis-h"></i>
            <div class="dropdown-menu" style="display:none">
              <div class="dropdown-item" onclick="event.stopPropagation();openProjectModal('${p.id}')"><i class="fas fa-edit"></i> Edit</div>
              <div class="dropdown-item danger" onclick="event.stopPropagation();confirmDeleteProject('${p.id}')"><i class="fas fa-trash"></i> Delete</div>
            </div>
          </div>
        </div>
      </div>
      <div class="proj-card-name">${esc(p.name)}</div>
      ${p.clientName ? `<div class="proj-card-client"><i class="fas fa-building" style="color:var(--text3)"></i>${esc(p.clientName)}</div>` : ''}
      <div class="proj-card-desc">${esc(p.description||'No description.')}</div>
      <div class="proj-card-foot">
        <div class="proj-dates"><i class="fas fa-calendar-alt"></i>${fmtDate(p.endDate)||'No deadline'}</div>
        <div class="member-stack">
          ${members.map(m=>`<div class="m-avatar">${m}</div>`).join('')}
          ${(p.teamMembers||[]).length>3?`<div class="m-avatar m-more">+${(p.teamMembers||[]).length-3}</div>`:''}
          ${owner&&!members.length?`<div class="m-avatar" title="${owner.name}">${getInitials(owner.name)}</div>`:''}
        </div>
      </div>
    </div>
  </div>`;
}

function projRow(p) {
  const isLive = p.status === 'in_progress' || p.status === 'not_started';

  // Multiple assignees support
  const assigneeIds = p.assigneeIds && p.assigneeIds.length ? p.assigneeIds
    : (p.ownerId ? [p.ownerId] : []);
  const assignees = assigneeIds.map(id => STATE.users.find(u => u.id === id)).filter(Boolean);
  const assigneeHTML = assignees.length
    ? `<div class="multi-assign-stack">
        ${assignees.slice(0,3).map(u =>
          `<div class="owner-chip" title="${esc(u.name)}">
            <div class="oc-av">${getInitials(u.name)}</div>
            <span class="oc-name">${esc(u.name.split(' ')[0])}</span>
          </div>`
        ).join('')}
        ${assignees.length > 3 ? `<div class="oc-more">+${assignees.length - 3}</div>` : ''}
      </div>`
    : '<span class="text-muted text-sm">—</span>';

  // Keywords
  let kwDisplay = '<span class="text-muted text-sm">—</span>';
  if (p.targetKeywords) {
    const raw = String(p.targetKeywords).trim();
    const isPlainNumber = /^\d+$/.test(raw);
    kwDisplay = isPlainNumber
      ? `<span class="kw-pill" title="${raw} keywords">${raw}</span>`
      : `<span class="kw-pill" title="${esc(raw)}">${raw.split(',').filter(k=>k.trim()).length}</span>`;
  }

  // Location
  const loc = p.projectLocation
    ? `<div style="display:flex;align-items:center;gap:4px;font-size:.82rem;color:var(--text2)">
        <i class="fas fa-map-marker-alt" style="color:var(--danger);font-size:.7rem"></i>${esc(p.projectLocation)}
      </div>`
    : '<span class="text-muted text-sm">—</span>';

  // Reporting date
  const rptDate = p.reportingDate
    ? `<div style="font-size:.82rem;color:var(--text2);display:flex;align-items:center;gap:4px">
        <i class="fas fa-calendar-check" style="color:var(--primary);font-size:.72rem"></i>${fmtDate(p.reportingDate)||p.reportingDate}
      </div>`
    : '<span class="text-muted text-sm">—</span>';

  const nav = `onclick="navigate('project/${p.id}')" style="cursor:pointer"`;

  return `<tr>
    <td style="text-align:center;width:64px">
      <div class="proj-toggle-wrap" title="${isLive ? 'Pause project' : 'Activate project'}"
        onclick="toggleProjectActive('${p.id}','${p.status}',this)">
        <div class="proj-toggle ${isLive ? 'on' : 'off'}">
          <div class="proj-toggle-thumb"></div>
        </div>
        <span class="proj-toggle-label">${isLive ? 'Live' : 'Off'}</span>
      </div>
    </td>
    <td ${nav}>
      <div class="proj-name-cell">
        <div class="proj-favicon" style="background:${typeColor(p.type)}">${typeLabel(p.type).slice(0,2).toUpperCase()}</div>
        <div>
          <div class="font-medium" style="font-size:.88rem">${esc(p.name)}</div>
          ${p.clientName ? `<div style="font-size:.72rem;color:var(--text3);margin-top:1px">
            <i class="fas fa-building" style="margin-right:3px"></i>${esc(p.clientName)}</div>` : ''}
        </div>
      </div>
    </td>
    <td ${nav}><span class="badge no-dot ${typeBadge(p.type)}">${typeLabel(p.type)}</span></td>
    <td ${nav}><span class="badge no-dot ${priorityBadge(p.priority)}">${fmtPriority(p.priority)}</span></td>
    <td ${nav}>${assigneeHTML}</td>
    <td ${nav}>${loc}</td>
    <td ${nav}>${kwDisplay}</td>
    <td ${nav}>${rptDate}</td>
    <td>
      <div class="t-actions">
        <button class="t-btn" onclick="openProjectModal('${p.id}')" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="t-btn del" onclick="confirmDeleteProject('${p.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div>
    </td>
  </tr>`;
}

function listTable(projects) {
  return `<div class="section-card"><div class="table-wrap"><table class="data-table">
    <thead><tr>
      <th style="width:64px;text-align:center">Active</th>
      <th>Project</th><th>Type</th><th>Priority</th>
      <th>Assigned To</th><th>Location</th><th>Keywords</th><th>Reporting Date</th><th></th>
    </tr></thead>
    <tbody>${projects.map(p=>projRow(p)).join('')}</tbody>
  </table></div></div>`;
}

function credCard(c) {
  const typeColors = {'Google Account':'#4285F4','WordPress':'#21759b','Hosting':'#f97316','FTP/SSH':'#64748b','Analytics':'#E97514','Ads Account':'#1A73E8','Social Media':'#1877f2'};
  const color = typeColors[c.type] || 'var(--primary)';
  return `<div class="cred-card">
    <div class="cred-icon" style="background:${color}15;color:${color}"><i class="fas fa-key"></i></div>
    <div class="cred-info">
      <div class="cred-name">${esc(c.name)}</div>
      <div class="cred-user">${esc(c.type)} ${c.username?'· '+esc(c.username):''}</div>
      ${c.password?`<div class="cred-pass">••••••••</div>`:''}
      ${c.url?`<a href="${c.url}" target="_blank" class="text-brand text-xs">${c.url}</a>`:''}
    </div>
    <div class="cred-actions">
      <button class="t-btn" onclick="copyToClipboard('${esc(c.password||'')}','Password copied!')" title="Copy Password"><i class="fas fa-copy"></i></button>
      <button class="t-btn" onclick="openCredModal('${c.projectId||''}','${c.id}')" title="Edit"><i class="fas fa-edit"></i></button>
      <button class="t-btn del" onclick="deleteCred('${c.id}')" title="Delete"><i class="fas fa-trash"></i></button>
    </div>
  </div>`;
}

function kanbanCol(status, title, tasks, projectId, color) {
  return `<div class="kanban-col">
    <div class="kanban-col-head">
      <div class="kanban-col-title"><span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></span>${title}</div>
      <span class="kanban-col-count">${tasks.length}</span>
    </div>
    <div class="kanban-cards">
      ${tasks.map(t=>{
        const a = STATE.users.find(u=>u.id===t.assigneeId);
        return `<div class="k-card" onclick="openTaskModal('${projectId}','${t.id}')">
          ${t.priority?`<span class="badge no-dot ${priorityBadge(t.priority)} mb-2" style="font-size:.62rem">${fmtPriority(t.priority)}</span>`:''}
          <div class="k-card-title">${esc(t.title)}</div>
          <div class="k-card-meta">
            <div class="k-card-due">${t.dueDate?`<i class="fas fa-calendar"></i> ${fmtDate(t.dueDate)}`:'&nbsp;'}</div>
            ${a?`<div class="m-avatar" style="width:22px;height:22px;font-size:.5rem" title="${a.name}">${getInitials(a.name)}</div>`:''}
          </div>
        </div>`;
      }).join('')}
      <button class="k-add" onclick="openTaskModal('${projectId}',null,'${status}')"><i class="fas fa-plus"></i> Add task</button>
    </div>
  </div>`;
}

function sc(ico, lbl, v, cls) {
  return `<div class="stat-card"><div class="stat-ico ${cls}"><i class="fas fa-${ico}"></i></div>
    <div class="stat-info"><span class="stat-val">${v}</span><span class="stat-lbl">${lbl}</span></div></div>`;
}

function gradSc(ico, lbl, v, grad) {
  return `<div class="stat-card ${grad}">
    <div class="stat-ico"><i class="fas fa-${ico}"></i></div>
    <div class="stat-info"><span class="stat-val">${v}</span><span class="stat-lbl">${lbl}</span></div>
  </div>`;
}

function tc(ico, lbl, count, href, badgeCls, color) {
  return tcNew(ico, lbl, count, href.replace('#',''), color, color+'20');
}

function tcNew(ico, lbl, count, route, color, bg) {
  const icoHtml = ico.startsWith('fab') ? `<i class="${ico}" style="color:${color}"></i>` : `<i class="fas fa-${ico}" style="color:${color}"></i>`;
  return `<div class="type-card" style="background:${bg};border:1.5px solid ${color}20" onclick="navigate('${route}')">
    <div class="tc-ico" style="background:white;box-shadow:0 2px 8px ${color}30">${icoHtml}</div>
    <div><span class="tc-val" style="color:${color}">${count}</span><span class="tc-lbl" style="color:${color}">${lbl}</span></div>
    <i class="fas fa-arrow-right tc-arrow" style="color:${color}"></i>
  </div>`;
}

function metaItem(ico, label, value) {
  return `<div class="meta-item"><i class="fas fa-${ico}" style="color:var(--text-muted);font-size:.82rem"></i>
    <div><div class="meta-label">${label}</div><div class="meta-val">${value}</div></div></div>`;
}

function row2(label, value) {
  return `<div class="flex justify-between items-center">
    <span class="text-secondary text-sm">${label}</span>
    <span class="font-medium text-sm">${value}</span>
  </div>`;
}

function svcRow(name, ico, active) {
  return `<div class="flex justify-between items-center">
    <div class="flex items-center gap-2">
      <i class="${ico.startsWith('fab')?ico:'fas fa-'+ico}" style="color:${active?'var(--primary)':'var(--text-muted)'};width:16px;text-align:center"></i>
      <span class="text-sm ${active?'':'text-muted'}">${name}</span>
    </div>
    <span style="color:${active?'var(--success)':'var(--text-muted)'};font-size:.7rem;font-weight:600">
      ${active?'<i class="fas fa-check-circle"></i> Active':'Not set'}
    </span>
  </div>`;
}

function emptyState(ico, title, desc, action, actionLabel) {
  return `<div class="empty-state">
    <div class="empty-icon"><i class="fas fa-${ico}"></i></div>
    <div class="empty-title">${title}</div>
    <div class="empty-desc">${desc}</div>
    ${action&&actionLabel?`<button class="btn btn-primary" onclick="${action}"><i class="fas fa-plus"></i> ${actionLabel}</button>`:''}
  </div>`;
}

function skelGrid() {
  return `<div class="loading-grid">${Array(6).fill('<div class="skel skel-card"></div>').join('')}</div>`;
}

function tabIcon(t) {
  const icons={overview:'chart-pie',tasks:'tasks',team:'users',credentials:'key',tools:'tools',analytics:'chart-bar',notes:'sticky-note'};
  return `<i class="fas fa-${icons[t]||'circle'}"></i>`;
}

/* ============================================================
   UTILS
   ============================================================ */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
}

function fmtDate(v) {
  if (!v) return null;
  try {
    if (v?.toDate) return v.toDate().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
    if (typeof v==='string') return new Date(v).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  } catch(e) {}
  return null;
}

function fmtStatus(s) {
  const m={not_started:'Not Started',in_progress:'In Progress',on_hold:'On Hold',completed:'Completed'};
  return m[s]||s;
}

function fmtPriority(p) {
  const m={low:'Low',medium:'Medium',high:'High',critical:'Critical'};
  return m[p]||p;
}

function formatRole(r) {
  const m={super_admin:'Super Admin',admin:'Admin',member:'Member'};
  return m[r]||'Member';
}

function typeLabel(t) {
  const m={all:'All Projects',seo:'SEO Projects',google_ads:'Google Ads',meta_ads:'Meta Ads',general:'General'};
  return m[t]||'General';
}

function typeColor(t) {
  const m={seo:'var(--type-seo)',google_ads:'var(--type-gads)',meta_ads:'var(--type-mads)',general:'var(--type-gen)'};
  return m[t]||'var(--type-gen)';
}

function typeBadge(t)     { const m={seo:'b-seo',google_ads:'b-google-ads',meta_ads:'b-meta-ads',general:'b-general'}; return m[t]||'b-general'; }
function statusBadge(s)   { const m={not_started:'b-not-started',in_progress:'b-in-progress',on_hold:'b-on-hold',completed:'b-completed'}; return m[s]||'b-not-started'; }
function priorityBadge(p) { const m={low:'b-low',medium:'b-medium',high:'b-high',critical:'b-critical'}; return m[p]||'b-medium'; }
function roleBadge(r)     { const m={super_admin:'rb-super',admin:'rb-admin',member:'rb-member'}; return m[r]||'rb-member'; }

function cap(s) { return s ? s.charAt(0).toUpperCase()+s.slice(1) : ''; }

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function val(id) { return document.getElementById(id)?.value || ''; }

function html(id, content) { const el=document.getElementById(id); if(el) el.innerHTML=content; }

function setEl(id, content) { const el=document.getElementById(id); if(el) el.innerHTML=content; }

function copyToClipboard(text, msg) {
  navigator.clipboard.writeText(text).then(()=>showToast(msg||'Copied!','success')).catch(()=>showToast('Copy failed','error'));
}
