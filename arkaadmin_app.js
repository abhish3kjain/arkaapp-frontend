/* ════════════════════════════════════════════════════════════════════════
   ARKA ADMIN CONTROL PANEL v2 — JavaScript
   Merges the full admin panel (v1) with the Club Reports engine (ArkaReports v4).

   Architecture:
     - Admin data (members, badges, timing) loaded eagerly on init via getAdminPanelData()
     - Reports data (pageLog, shelves, activityLog etc.) loaded lazily via getReportsData()
       on first visit to the Reports section
     - All logic wrapped in an IIFE; onclick= functions exposed via window.*
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Admin constants (mirror ArkaClubAppCode.gs) ──────────────────── */
  var APPROVAL_STATUS   = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' };
  var PERF_MS_FAST      = 3000;
  var PERF_MS_SLOW      = 6000;
  var ACTIVE_WINDOW_MS  = 30 * 24 * 60 * 60 * 1000;

  /* ── Admin state ──────────────────────────────────────────────────── */
  var admPayload           = null;
  /** Chart.js instance for the total load trend chart — destroyed and recreated on each render. */
  var admPerfChart         = null;
  /** Chart.js instance for the per-wave trend chart — destroyed and recreated on each render. */
  var admWaveTrendChart    = null;
  var admMemberMap         = {};
  var admBadgeMap          = {};
  var admApprovalFilter    = APPROVAL_STATUS.PENDING;
  var admBadgeSubTab       = 'award';
  var admAwardBrowseFilter = 'Active';
  var admMembersSort       = 'totalCp';
  var admMembersActivity   = 'all';
  var admPendingRevokeId        = null;
  var admPendingApprovalChange  = null; // { memberId, newStatus } — set by confirm modal
  var admToastTimer             = null;
  /** True once getReportsData() has returned successfully. */
  var admReportsDataLoaded = false;
  /** Book posts loaded from getReportsData() — used by content moderation section. */
  var admPostsDB          = [];
  var admPostsTypeFilter  = 'All';
  var admPostsShown       = 50;
  var admPendingPostDeleteId = null;
  /** Announcements — lazy-loaded on first visit to the section. */
  var admAnnouncementsDB      = [];
  var admAnnouncementsLoaded  = false;
  var admAnnSubTab            = 'active';
  var admAnnEditing           = null; // announcementId string, or null for create mode
  var admAnnSelectedMemberIds = [];
  var admPendingArchiveAnnId  = null;
  /** Events — lazy-loaded on first visit to the section. */
  var admEventsDB             = [];
  var admEventsLoaded         = false;
  var admEvtSubTab            = 'list';
  var admEvtEditing           = null; // eventId string, or null for create mode
  var admEvtHostMemberId      = '';
  var admPendingEvtStatusChange = null; // { eventId, newStatus, title }
  /** Email queue — lazy-loaded on first visit to the section. */
  var admEmailQueueDB         = [];
  var admEmailQueueLoaded     = false;
  var admEmailQueueFilter     = 'All';
  /** Approvals card view toggle. */
  var admApprovalsCardView    = false;
  /** Member Stats card view toggle. */
  var admMembersCardView      = false;
  /** Bulk approval — set of selected member IDs when in Pending filter. */
  var admBulkSelectedIds      = [];

  /* ══════════════════════════════════════════════════════════════════
     ADMIN INIT
     ══════════════════════════════════════════════════════════════════ */

  function admInit() {
    _admShowState('admLoadingState');
    google.script.run
      .withSuccessHandler(admOnDataLoaded)
      .withFailureHandler(admOnLoadFailed)
      .getAdminPanelData();
  }

  function admRefresh() { admPayload = null; admInit(); }

  function admOnDataLoaded(payload) {
    if (!payload || payload.status === 'admin_required') { _admShowState('admAccessDenied'); return; }
    if (payload.status === 'error') {
      var e = document.getElementById('admErrorMsg');
      if (e) e.textContent = payload.message || 'An unexpected server error occurred.';
      _admShowState('admErrorState');
      return;
    }
    admPayload = payload;
    admMemberMap = {};
    (payload.memberList || []).forEach(function (m) { admMemberMap[m.memberId] = m; });
    admBadgeMap = {};
    (payload.badgeList  || []).forEach(function (b) { admBadgeMap[b.badgeId]  = b; });

    var lbl = document.getElementById('admTopbarAdminLabel');
    if (lbl) {
      var ar = admMemberMap[payload.currentAdminId] || {};
      lbl.textContent = ar.displayName ? ar.displayName + '  (' + payload.currentAdminId + ')' : payload.currentAdminId;
    }
    _admUpdatePendingBubble(payload.pendingCount || 0);

    admRenderOverview();
    admRenderApprovals();
    admPopulateBadgeFormDatasets();
    admRenderBadgeAwardsList();
    admRenderPerformance();
    admRenderMemberStats();

    _admShowState('admShell');
  }

  function admOnLoadFailed(err) {
    var e = document.getElementById('admErrorMsg');
    if (e) e.textContent = (err && err.message) ? err.message : 'Network or server error. Please retry.';
    _admShowState('admErrorState');
  }

  /* ══════════════════════════════════════════════════════════════════
     NAVIGATION
     ══════════════════════════════════════════════════════════════════ */

  function admSwitchSection(name) {
    var capName = name.charAt(0).toUpperCase() + name.slice(1);
    document.querySelectorAll('.adm-section').forEach(function (el) {
      el.classList.toggle('active', el.id === 'admSection' + capName);
    });
    document.querySelectorAll('.adm-nav-item[data-section]').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.section === name);
    });
    // Close drawer on mobile after nav tap
    admCloseDrawer();
    // Lazy-load reports data on first visit to reports or content section
    if ((name === 'reports' || name === 'content') && !admReportsDataLoaded) {
      admLoadReportsData();
    }
    if (name === 'content' && admReportsDataLoaded) {
      admRenderContent();
    }
    // Lazy-load announcements on first visit
    if (name === 'announcements' && !admAnnouncementsLoaded) {
      admLoadAnnouncements();
    }
    // Lazy-load events on first visit
    if (name === 'events' && !admEventsLoaded) {
      admLoadEvents();
    }
    // Lazy-load email queue on first visit
    if (name === 'emailqueue' && !admEmailQueueLoaded) {
      admLoadEmailQueue();
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     MOBILE DRAWER
     ══════════════════════════════════════════════════════════════════ */

  function admOpenDrawer() {
    var sidebar  = document.getElementById('admSidebar');
    var backdrop = document.getElementById('admDrawerBackdrop');
    if (sidebar)  sidebar.classList.add('drawer-open');
    if (backdrop) backdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function admCloseDrawer() {
    var sidebar  = document.getElementById('admSidebar');
    var backdrop = document.getElementById('admDrawerBackdrop');
    if (sidebar)  sidebar.classList.remove('drawer-open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ══════════════════════════════════════════════════════════════════
     OVERVIEW
     ══════════════════════════════════════════════════════════════════ */

  function admRenderOverview() {
    if (!admPayload) return;
    var members     = admPayload.memberList    || [];
    var awards      = admPayload.badgeAwardList || [];
    var tsPayload   = admPayload.timingStats    || {};
    // totalTrend is sorted ASC (oldest first); last entry is the newest version
    var totalTrend  = tsPayload.totalTrend || [];
    var latestTotal = totalTrend[totalTrend.length - 1] || null;
    var now = Date.now();
    var cards = [
      { label:'Total Members',       value: members.length,                                                          icon:'fa-users',       cls:'' },
      { label:'Approved',            value: members.filter(function(m){return m.approvalStatus===APPROVAL_STATUS.APPROVED;}).length, icon:'fa-user-check', cls:'c-ok' },
      { label:'Pending Approval',    value: admPayload.pendingCount||0,                                              icon:'fa-user-clock',  cls:(admPayload.pendingCount>0)?'c-danger':'' },
      { label:'Active (last 30d)',   value: members.filter(function(m){return m.lastAccessedTs>(now-ACTIVE_WINDOW_MS);}).length,     icon:'fa-bolt',       cls:'c-accent' },
      { label:'Active Badge Awards', value: awards.filter(function(a){return a.status==='Active';}).length,          icon:'fa-medal',       cls:'' },
      { label:'Latest App Version',  value: latestTotal ? latestTotal.version : '—',                                     icon:'fa-code-branch', cls:'' },
      { label:'Avg Load (latest)',   value: (latestTotal && latestTotal.avgTotalMs > 0) ? _fmtMs(latestTotal.avgTotalMs) : '—', icon:'fa-gauge-high', cls: latestTotal ? _perfColorClass(latestTotal.avgTotalMs) : '' }
    ];
    var g = document.getElementById('admStatGrid');
    if (g) g.innerHTML = cards.map(function(c){ return '<div class="adm-stat-card '+c.cls+'"><div class="adm-stat-icon"><i class="fa-solid '+c.icon+'"></i></div><div class="adm-stat-value">'+_esc(String(c.value))+'</div><div class="adm-stat-label">'+_esc(c.label)+'</div></div>'; }).join('');
    var ts = document.getElementById('admOverviewTs');
    if (ts) ts.textContent = 'Loaded ' + new Date().toLocaleTimeString();
    var pending = (admPayload.memberList||[]).filter(function(m){return m.approvalStatus===APPROVAL_STATUS.PENDING;});
    var pc = document.getElementById('admPendingPreviewCard');
    var pl = document.getElementById('admPendingPreviewList');
    if (!pl) return;
    if (!pending.length) { if (pc) pc.style.display='none'; return; }
    if (pc) pc.style.display='block';
    pl.innerHTML = pending.slice(0,5).map(function(m){
      return '<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border-soft)">'+
        '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:0.88rem">'+_esc(m.displayName)+'</div>'+
        '<div style="font-size:0.75rem;color:var(--text-faint)">'+_esc(m.email)+' · Joined '+_esc(m.joinDate)+'</div></div>'+
        '<button class="adm-btn adm-btn-ok adm-btn-sm" onclick="admSetApproval(\''+m.memberId+'\',\'Approved\')"><i class="fa-solid fa-check"></i> Approve</button>'+
        '<button class="adm-btn adm-btn-danger adm-btn-sm" onclick="admOpenApprovalConfirmModal(\''+m.memberId+'\',\'Rejected\')"><i class="fa-solid fa-xmark"></i> Reject</button></div>';
    }).join('') + (pending.length>5?'<div style="padding:10px 0;font-size:0.78rem;color:var(--text-faint)">…and '+(pending.length-5)+' more. <a href="#" onclick="admSwitchSection(\'approvals\');return false">View all →</a></div>':'');
  }

  /* ══════════════════════════════════════════════════════════════════
     APPROVALS
     ══════════════════════════════════════════════════════════════════ */

  function admFilterApprovals(filter) {
    admApprovalFilter = filter;
    document.querySelectorAll('[data-appr-filter]').forEach(function(b){ b.classList.toggle('active', b.dataset.apprFilter===filter); });
    admRenderApprovals();
  }

  function admRenderApprovals() {
    if (!admPayload) return;
    var search = ((document.getElementById('admApprovalSearch')||{}).value||'').toLowerCase().trim();
    var filtered = (admPayload.memberList||[]).filter(function(m) {
      var ok = admApprovalFilter==='All' || m.approvalStatus===admApprovalFilter;
      if (!ok) return false;
      if (!search) return true;
      return (m.displayName||'').toLowerCase().includes(search)||(m.fullName||'').toLowerCase().includes(search)||(m.email||'').toLowerCase().includes(search)||(m.memberId||'').toLowerCase().includes(search);
    });
    var pc = (admPayload.memberList||[]).filter(function(m){return m.approvalStatus===APPROVAL_STATUS.PENDING;}).length;
    var pcEl = document.getElementById('admPendingCountLabel'); if (pcEl) pcEl.textContent = pc>0?'('+pc+')':'';
    var tbody = document.getElementById('admApprovalTbody'); if (!tbody) return;

    var showCb = admApprovalFilter === APPROVAL_STATUS.PENDING;
    // Sync thead checkbox column
    var thead = document.getElementById('admApprovalThead');
    if (thead) {
      thead.innerHTML = (showCb ? '<th style="width:36px"><input type="checkbox" id="admSelectAllPending" onchange="admToggleSelectAllPending(this.checked)" title="Select all pending"></th>' : '')
        + '<th>Member ID</th><th>Display Name</th><th>Full Name</th><th>Email</th><th>Join Date</th><th>Status</th><th>Actions</th>';
    }
    if (!showCb) { admBulkSelectedIds = []; _admUpdateBulkBar(); }

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="'+(showCb?8:7)+'"><div class="adm-empty"><i class="fa-solid fa-magnifying-glass"></i><p>No members match the current filter.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map(function(m) {
      var pill=_approvalPill(m.approvalStatus), actions='';
      if (m.approvalStatus===APPROVAL_STATUS.PENDING) {
        actions = '<button class="adm-btn adm-btn-ok adm-btn-sm" onclick="admSetApproval(\''+_esc(m.memberId)+'\',\'Approved\')"><i class="fa-solid fa-check"></i> Approve</button> '
          + '<button class="adm-btn adm-btn-danger adm-btn-sm" onclick="admOpenApprovalConfirmModal(\''+_esc(m.memberId)+'\',\'Rejected\')"><i class="fa-solid fa-xmark"></i> Reject</button>';
      } else if (m.approvalStatus===APPROVAL_STATUS.APPROVED) {
        actions = '<button class="adm-btn adm-btn-light adm-btn-sm" onclick="admOpenApprovalConfirmModal(\''+_esc(m.memberId)+'\',\'Rejected\')">Revoke Access</button>';
      } else if (m.approvalStatus===APPROVAL_STATUS.REJECTED) {
        actions = '<button class="adm-btn adm-btn-ok adm-btn-sm" onclick="admSetApproval(\''+_esc(m.memberId)+'\',\'Approved\')">Re-Approve</button>';
      }
      var cbCell = showCb
        ? '<td data-label=""><input type="checkbox" onchange="admToggleApprovalRow(\''+_esc(m.memberId)+'\',this.checked)" '+(admBulkSelectedIds.indexOf(m.memberId)>-1?'checked':'')+' class="adm-bulk-cb"></td>'
        : '';
      return '<tr>'
        + cbCell
        + '<td data-label="ID" class="adm-td-mono">'+_esc(m.memberId)+'</td>'
        + '<td data-label="Name"><strong>'+_esc(m.displayName)+'</strong></td>'
        + '<td data-label="Full Name">'+_esc(m.fullName)+'</td>'
        + '<td data-label="Email" style="font-size:0.78rem;color:var(--text-faint)">'+_esc(m.email)+'</td>'
        + '<td data-label="Joined" style="white-space:nowrap">'+_esc(m.joinDate)+'</td>'
        + '<td data-label="Status">'+pill+'</td>'
        + '<td data-label="" style="white-space:nowrap">'+actions+'</td>'
        + '</tr>';
    }).join('');
  }

  /* ── Bulk approval helpers ─────────────────────────────────────── */

  function _admUpdateBulkBar() {
    var bar   = document.getElementById('admBulkApproveBar');
    var label = document.getElementById('admBulkCountLabel');
    var count = admBulkSelectedIds.length;
    if (bar)   bar.style.display = count > 0 ? 'flex' : 'none';
    if (label) label.textContent = count + ' selected';
  }

  function admToggleApprovalRow(memberId, checked) {
    var idx = admBulkSelectedIds.indexOf(memberId);
    if (checked && idx === -1) admBulkSelectedIds.push(memberId);
    if (!checked && idx > -1) admBulkSelectedIds.splice(idx, 1);
    _admUpdateBulkBar();
  }

  function admToggleSelectAllPending(checked) {
    if (checked) {
      var search = ((document.getElementById('admApprovalSearch')||{}).value||'').toLowerCase().trim();
      admBulkSelectedIds = (admPayload.memberList||[]).filter(function(m) {
        if (m.approvalStatus !== APPROVAL_STATUS.PENDING) return false;
        if (!search) return true;
        return (m.displayName||'').toLowerCase().includes(search)
          || (m.fullName||'').toLowerCase().includes(search)
          || (m.email||'').toLowerCase().includes(search)
          || (m.memberId||'').toLowerCase().includes(search);
      }).map(function(m) { return m.memberId; });
    } else {
      admBulkSelectedIds = [];
    }
    document.querySelectorAll('.adm-bulk-cb').forEach(function(cb) { cb.checked = checked; });
    _admUpdateBulkBar();
  }

  function admBulkApproveSelected() {
    if (!admBulkSelectedIds.length) return;
    var btn = document.getElementById('admBulkApproveBtn');
    if (btn) btn.disabled = true;
    var ids = admBulkSelectedIds.slice();
    google.script.run
      .withSuccessHandler(function(result) {
        if (btn) btn.disabled = false;
        if (result.status !== 'success') {
          admShowToast('Bulk approve error: ' + (result.message || 'Unknown error'), 'err');
          return;
        }
        var approved = result.approvedIds || [];
        approved.forEach(function(id) {
          var m = admMemberMap[id]; if (m) m.approvalStatus = APPROVAL_STATUS.APPROVED;
        });
        admPayload.pendingCount = (admPayload.memberList||[]).filter(function(m) {
          return m.approvalStatus === APPROVAL_STATUS.PENDING;
        }).length;
        _admUpdatePendingBubble(admPayload.pendingCount);
        admBulkSelectedIds = [];
        _admUpdateBulkBar();
        admShowToast(result.count + ' member' + (result.count !== 1 ? 's' : '') + ' approved', 'ok');
        admRenderApprovals();
        admRenderOverview();
      })
      .withFailureHandler(function(err) {
        if (btn) btn.disabled = false;
        admShowToast('Server error: ' + ((err && err.message) || 'Please retry.'), 'err');
      })
      .bulkApproveMembers(ids);
  }

  function admClearBulkSelection() {
    admBulkSelectedIds = [];
    _admUpdateBulkBar();
    admRenderApprovals();
  }

  function admSetApproval(memberId, newStatus) {
    document.querySelectorAll('button[onclick*="'+memberId+'"]').forEach(function(b){ b.disabled=true; });
    google.script.run
      .withSuccessHandler(function(result){
        if (result.status!=='success'){ admShowToast('Error: '+(result.message||'Could not update.'),'err'); document.querySelectorAll('button[onclick*="'+memberId+'"]').forEach(function(b){b.disabled=false;}); return; }
        var m=admMemberMap[memberId]; if (m) m.approvalStatus=newStatus;
        admPayload.pendingCount=(admPayload.memberList||[]).filter(function(m){return m.approvalStatus===APPROVAL_STATUS.PENDING;}).length;
        _admUpdatePendingBubble(admPayload.pendingCount);
        admShowToast(memberId+' → '+newStatus,'ok');
        admRenderApprovals(); admRenderOverview();
      })
      .withFailureHandler(function(err){ admShowToast('Server error: '+((err&&err.message)||'Please retry.'),'err'); document.querySelectorAll('button[onclick*="'+memberId+'"]').forEach(function(b){b.disabled=false;}); })
      .setMemberApprovalStatus(memberId, newStatus);
  }

  /* ══════════════════════════════════════════════════════════════════
     APPROVAL CONFIRMATION MODAL
     ══════════════════════════════════════════════════════════════════ */

  function admOpenApprovalConfirmModal(memberId, newStatus) {
    admPendingApprovalChange = { memberId: memberId, newStatus: newStatus };
    var m = admMemberMap[memberId] || {};
    var name = m.displayName || memberId;
    var titleEl = document.getElementById('admApprovalConfirmTitle');
    var bodyEl  = document.getElementById('admApprovalConfirmBody');
    var btnEl   = document.getElementById('admApprovalConfirmBtn');
    if (newStatus === APPROVAL_STATUS.REJECTED) {
      if (m.approvalStatus === APPROVAL_STATUS.APPROVED) {
        if (titleEl) titleEl.textContent = 'Revoke Access?';
        if (bodyEl)  bodyEl.innerHTML = 'This will immediately block <strong>' + _esc(name) + '</strong> from accessing the app. Their data and history are preserved. You can re-approve them at any time.';
        if (btnEl)  { btnEl.className = 'adm-btn adm-btn-danger'; btnEl.innerHTML = '<i class="fa-solid fa-user-xmark"></i> Revoke Access'; }
      } else {
        if (titleEl) titleEl.textContent = 'Reject Member?';
        if (bodyEl)  bodyEl.innerHTML = 'This will prevent <strong>' + _esc(name) + '</strong> from accessing the app. The record is kept for the audit trail and can be re-approved later.';
        if (btnEl)  { btnEl.className = 'adm-btn adm-btn-danger'; btnEl.innerHTML = '<i class="fa-solid fa-xmark"></i> Reject'; }
      }
    }
    if (btnEl) { btnEl.disabled = false; }
    document.getElementById('admApprovalConfirmModal').classList.add('open');
  }

  function admCloseApprovalConfirmModal() {
    document.getElementById('admApprovalConfirmModal').classList.remove('open');
    admPendingApprovalChange = null;
  }

  function admConfirmApprovalChange() {
    if (!admPendingApprovalChange) return;
    var memberId  = admPendingApprovalChange.memberId;
    var newStatus = admPendingApprovalChange.newStatus;
    var btnEl = document.getElementById('admApprovalConfirmBtn');
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Processing…'; }
    admCloseApprovalConfirmModal();
    admSetApproval(memberId, newStatus);
  }

  /* ══════════════════════════════════════════════════════════════════
     BADGES
     ══════════════════════════════════════════════════════════════════ */

  function admSwitchBadgeSubTab(tab) {
    admBadgeSubTab=tab;
    document.getElementById('admBadgePanelAward').style.display  = tab==='award'  ? 'block':'none';
    document.getElementById('admBadgePanelBrowse').style.display = tab==='browse' ? 'block':'none';
    document.getElementById('admSubTabAward').classList.toggle('active',  tab==='award');
    document.getElementById('admSubTabBrowse').classList.toggle('active', tab==='browse');
  }

  function admPopulateBadgeFormDatasets() {
    if (!admPayload) return;
    var mdl = document.getElementById('admAwardMemberDatalist');
    if (mdl) mdl.innerHTML = (admPayload.memberList||[]).filter(function(m){return m.approvalStatus===APPROVAL_STATUS.APPROVED;}).map(function(m){ return '<option value="'+_esc(m.displayName+' ('+m.memberId+')')+'">'; }).join('');
    var bdl = document.getElementById('admAwardBadgeDatalist');
    if (bdl) bdl.innerHTML = (admPayload.badgeList||[]).map(function(b){ return '<option value="'+_esc(b.caption+' — '+b.badgeCategory+' ['+b.badgeId+']')+'">'; }).join('');
  }

  function admOnMemberInputChange() {
    var val=(document.getElementById('admAwardMemberInput').value||'').trim();
    var hintEl=document.getElementById('admAwardMemberHint'), idEl=document.getElementById('admAwardMemberId');
    var match=val.match(/\(ARKA_MEMBER_(\d+)\)$/);
    if (match){ var id='ARKA_MEMBER_'+match[1], m=admMemberMap[id]; if(m){ idEl.value=id; hintEl.textContent='✓ '+m.displayName+' — '+m.email; hintEl.style.color='var(--adm-ok)'; return; } }
    idEl.value=''; hintEl.textContent='';
  }

  function admOnBadgeInputChange() {
    var val=(document.getElementById('admAwardBadgeInput').value||'').trim();
    var hintEl=document.getElementById('admAwardBadgeHint'), idEl=document.getElementById('admAwardBadgeId');
    var match=val.match(/\[ARKA_BADGE_(\d+)\]$/);
    if (match){ var id='ARKA_BADGE_'+match[1], b=admBadgeMap[id]; if(b){ idEl.value=id; hintEl.textContent='✓ '+b.caption+' — '+b.badgeCategory+' ('+b.badgePoints+' CP)'; hintEl.style.color='var(--adm-ok)'; return; } }
    idEl.value=''; hintEl.textContent='';
  }

  function admSubmitBadgeAward() {
    var memberId=(document.getElementById('admAwardMemberId').value||'').trim();
    var badgeId=(document.getElementById('admAwardBadgeId').value||'').trim();
    var notes=(document.getElementById('admAwardNotesInput').value||'').trim();
    if (!memberId){ admShowToast('Select a valid member first.','err'); return; }
    if (!badgeId) { admShowToast('Select a valid badge first.', 'err'); return; }
    var btn=document.getElementById('admAwardSubmitBtn'); if (btn){btn.disabled=true; btn.textContent='Awarding…';}
    google.script.run
      .withSuccessHandler(function(r){
        if (btn){btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-medal"></i> Award Badge';}
        if (r.status!=='success'){ admShowToast('Error: '+(r.message||'Could not award.'),'err'); return; }
        if (r.newAward&&admPayload.badgeAwardList) admPayload.badgeAwardList.unshift(r.newAward);
        ['admAwardMemberInput','admAwardBadgeInput','admAwardNotesInput'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
        ['admAwardMemberId','admAwardBadgeId'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
        ['admAwardMemberHint','admAwardBadgeHint'].forEach(function(id){var e=document.getElementById(id);if(e)e.textContent='';});
        admShowToast('Badge awarded!','ok'); admRenderBadgeAwardsList();
      })
      .withFailureHandler(function(err){
        if (btn){btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-medal"></i> Award Badge';}
        admShowToast('Server error: '+((err&&err.message)||'Please retry.'),'err');
      })
      .awardBadgeToMember({badgeId:badgeId, memberId:memberId, notes:notes});
  }

  function admSetAwardFilter(filter) {
    admAwardBrowseFilter=filter;
    document.querySelectorAll('[data-award-filter]').forEach(function(b){b.classList.toggle('active',b.dataset.awardFilter===filter);});
    admRenderBadgeAwardsList();
  }

  function admRenderBadgeAwardsList() {
    if (!admPayload) return;
    var search=((document.getElementById('admAwardBrowseSearch')||{}).value||'').toLowerCase().trim();
    var filtered=(admPayload.badgeAwardList||[]).filter(function(a){
      var ok=admAwardBrowseFilter==='All'||a.status===admAwardBrowseFilter; if (!ok) return false;
      if (!search) return true;
      var m=admMemberMap[a.memberId]||{}, b=admBadgeMap[a.badgeId]||{};
      return (m.displayName||'').toLowerCase().includes(search)||(b.caption||'').toLowerCase().includes(search)||(a.memberId||'').toLowerCase().includes(search)||(a.badgeId||'').toLowerCase().includes(search);
    });
    var tbody=document.getElementById('admBadgeAwardTbody'); if (!tbody) return;
    if (!filtered.length){ tbody.innerHTML='<tr><td colspan="8"><div class="adm-empty"><i class="fa-solid fa-medal"></i><p>No badge awards match the filter.</p></div></td></tr>'; return; }
    tbody.innerHTML=filtered.map(function(a){
      var b=admBadgeMap[a.badgeId]||{caption:a.badgeId}, m=admMemberMap[a.memberId]||{displayName:a.memberId};
      var stPill=a.status==='Active'?'<span class="adm-pill adm-pill-active">Active</span>':'<span class="adm-pill adm-pill-revoked">Revoked</span>';
      var aBy=a.awardedBy==='MasterEngine'?'<span class="adm-pill adm-pill-system">System</span>':_esc(a.awardedBy);
      var revBtn=a.status==='Active'?'<button class="adm-btn adm-btn-danger adm-btn-sm" onclick="admOpenRevokeModal(\''+a.awardId+'\')"><i class="fa-solid fa-ban"></i> Revoke</button>':'—';
      return '<tr><td class="adm-td-mono">'+_esc(a.awardId)+'</td><td><strong>'+_esc(b.caption)+'</strong>'+(b.badgeCategory?'<br><span style="font-size:0.7rem;color:var(--text-faint)">'+_esc(b.badgeCategory)+'</span>':'')+'</td><td>'+_esc(m.displayName)+'<br><span class="adm-td-mono" style="font-size:0.7rem">'+_esc(a.memberId)+'</span></td><td>'+aBy+'</td><td style="white-space:nowrap">'+_esc(a.awardedDate)+'</td><td>'+stPill+'</td><td style="font-size:0.78rem;max-width:160px;color:var(--text-muted)">'+_esc(a.notes||'—')+'</td><td>'+revBtn+'</td></tr>';
    }).join('');
  }

  function admOpenRevokeModal(awardId) {
    admPendingRevokeId=awardId;
    var a=(admPayload.badgeAwardList||[]).filter(function(x){return x.awardId===awardId;})[0]||{};
    var b=admBadgeMap[a.badgeId]||{caption:a.badgeId,badgePoints:0}, m=admMemberMap[a.memberId]||{displayName:a.memberId};
    var bodyEl=document.getElementById('admRevokeModalBody');
    if (bodyEl) bodyEl.innerHTML='Revoke <strong>'+_esc(b.caption)+'</strong> from <strong>'+_esc(m.displayName)+'</strong>?<br><br>This reverses <strong>'+b.badgePoints+' Club Points</strong>. The award record is kept as Revoked.';
    var btn=document.getElementById('admRevokeConfirmBtn'); if (btn){btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-ban"></i> Revoke';}
    document.getElementById('admRevokeModal').classList.add('open');
  }

  function admCloseRevokeModal() { document.getElementById('admRevokeModal').classList.remove('open'); admPendingRevokeId=null; }

  function admConfirmRevoke() {
    if (!admPendingRevokeId) return;
    var btn=document.getElementById('admRevokeConfirmBtn'); var awardId=admPendingRevokeId;
    if (btn){btn.disabled=true; btn.textContent='Revoking…';}
    google.script.run
      .withSuccessHandler(function(r){ admCloseRevokeModal(); if (r.status!=='success'){ admShowToast('Error: '+(r.message||'Could not revoke.'),'err'); return; } var a=(admPayload.badgeAwardList||[]).filter(function(x){return x.awardId===awardId;})[0]; if(a)a.status='Revoked'; admShowToast('Badge award revoked.','ok'); admRenderBadgeAwardsList(); })
      .withFailureHandler(function(err){ admCloseRevokeModal(); admShowToast('Server error: '+((err&&err.message)||'Please retry.'),'err'); })
      .revokeBadgeAward(awardId);
  }

  /* ══════════════════════════════════════════════════════════════════
     PERFORMANCE
     ══════════════════════════════════════════════════════════════════ */

  /**
   * admRenderPerformance — renders the performance trend charts.
   *
   * Chart A: Total load trend using _ALL rows (end-to-end perceived load).
   *          Datasets: Avg Total (hero), P90, BigGulp, Render + threshold refs.
   *
   * Chart B: Per-wave GAS timing trend.
   *          One line per wave label (init, w1, w2, w3b…).
   *          Y = avg BigGulpMs (elapsed from T0 to wave GAS response).
   *          spanGaps:false so missing waves show as gaps, not interpolation.
   *
   * Wave breakdown cards: latest version's per-wave avg BigGulpMs as stat cards.
   *
   * Both charts use ASC-sorted data (oldest → newest = left → right).
   * admPayload.timingStats is now { totalTrend, waveTrend, allWaveLabels }
   * from the updated _computeAdminTimingStats_() backend helper.
   */
  function admRenderPerformance() {
    if (!admPayload) return;

    var tsPayload      = admPayload.timingStats    || {};
    var totalTrend     = tsPayload.totalTrend      || [];   // ASC, _ALL rows
    var waveTrend      = tsPayload.waveTrend       || [];   // ASC, wave rows
    var allWaveLabels  = tsPayload.allWaveLabels   || [];   // ordered wave keys

    var summaryGrid    = document.getElementById('admPerfSummaryGrid');
    var wrapEl         = document.getElementById('admPerfChartWrap');
    var emptyEl        = document.getElementById('admPerfEmptyState');
    var waveCard       = document.getElementById('admWaveChartCard');
    var waveBreakCard  = document.getElementById('admWaveBreakdownCard');

    // ── Empty state ────────────────────────────────────────────────────────
    if (!totalTrend.length) {
      if (wrapEl)       wrapEl.style.display       = 'none';
      if (emptyEl)      emptyEl.style.display      = '';
      if (summaryGrid)  summaryGrid.innerHTML       = '';
      if (waveCard)     waveCard.style.display      = 'none';
      if (waveBreakCard) waveBreakCard.style.display = 'none';
      return;
    }
    if (wrapEl)  wrapEl.style.display  = '';
    if (emptyEl) emptyEl.style.display = 'none';

    // totalTrend is ASC — latest = last element
    var latest   = totalTrend[totalTrend.length - 1];
    var previous = totalTrend.length > 1 ? totalTrend[totalTrend.length - 2] : null;

    // ── Summary stat cards ─────────────────────────────────────────────────
    if (summaryGrid) {
      var deltaMs   = previous ? (latest.avgTotalMs - previous.avgTotalMs) : null;
      var deltaAbs  = deltaMs !== null ? Math.abs(deltaMs) : 0;
      var NOISE     = 200; // ms changes smaller than this = "flat"
      var deltaIcon, deltaColor, deltaLabel;
      if      (deltaMs === null)     { deltaIcon = '—';  deltaColor = '';        deltaLabel = 'Only 1 version recorded'; }
      else if (deltaAbs < NOISE)     { deltaIcon = '→';  deltaColor = '';        deltaLabel = '≈ same as ' + previous.version; }
      else if (deltaMs < 0)          { deltaIcon = '↓';  deltaColor = 'c-ok';    deltaLabel = _fmtMs(deltaAbs) + ' faster than ' + previous.version; }
      else                           { deltaIcon = '↑';  deltaColor = 'c-danger'; deltaLabel = _fmtMs(deltaAbs) + ' slower than ' + previous.version; }

      var bestStat = totalTrend.reduce(function(b, s) {
        return (!b || s.avgTotalMs > 0 && s.avgTotalMs < b.avgTotalMs) ? s : b;
      }, null);

      var cards = [
        { label: 'Latest Version',     value: latest.version,               icon: 'fa-code-branch', cls: 'c-accent' },
        { label: 'Avg Load (latest)',  value: _fmtMs(latest.avgTotalMs),    icon: 'fa-gauge-high',  cls: _perfColorClass(latest.avgTotalMs) },
        { label: 'vs Prev Version',    value: deltaIcon + ' ' + (deltaAbs > 0 ? _fmtMs(deltaAbs) : ''), icon: 'fa-arrow-trend-up', cls: deltaColor },
        { label: 'P90 (latest)',       value: _fmtMs(latest.p90TotalMs),    icon: 'fa-users',       cls: _perfColorClass(latest.p90TotalMs) },
        { label: 'BigGulp (latest)',   value: _fmtMs(latest.avgBigGulpMs),  icon: 'fa-server',      cls: '' },
        { label: 'Best Version',       value: bestStat ? bestStat.version + ' (' + _fmtMs(bestStat.avgTotalMs) + ')' : '—', icon: 'fa-trophy', cls: 'c-ok' }
      ];
      summaryGrid.innerHTML = cards.map(function(c) {
        return '<div class="adm-stat-card ' + c.cls + '">' +
          '<div class="adm-stat-icon"><i class="fa-solid ' + c.icon + '"></i></div>' +
          '<div class="adm-stat-value" style="font-size:1.3rem">' + _esc(String(c.value)) + '</div>' +
          '<div class="adm-stat-label">' + _esc(c.label) + '</div>' +
        '</div>';
      }).join('');
    }

    // ── Helpers ────────────────────────────────────────────────────────────
    var toS = function(ms) { return ms > 0 ? parseFloat((ms / 1000).toFixed(2)) : null; };

    // ══════════════════════════════════════════════════════════════════════
    // CHART A — Total load trend (_ALL rows)
    // ══════════════════════════════════════════════════════════════════════
    var labelsA     = totalTrend.map(function(s) { return s.version; });
    var avgTotalS   = totalTrend.map(function(s) { return toS(s.avgTotalMs); });
    var p90TotalS   = totalTrend.map(function(s) { return toS(s.p90TotalMs); });
    var avgBigGulpS = totalTrend.map(function(s) { return toS(s.avgBigGulpMs); });
    var avgRenderS  = totalTrend.map(function(s) { return toS(s.avgRenderMs); });
    var thresh3s    = labelsA.map(function() { return 3.0; });
    var thresh6s    = labelsA.map(function() { return 6.0; });

    if (admPerfChart) { admPerfChart.destroy(); admPerfChart = null; }

    var ctxA = document.getElementById('admPerfChartCanvas');
    if (ctxA) {
      admPerfChart = new Chart(ctxA, {
        type: 'line',
        data: {
          labels: labelsA,
          datasets: [
            { label:'3 s threshold', data:thresh3s, borderColor:'rgba(29,158,117,0.3)', borderDash:[6,5], borderWidth:1.2, pointRadius:0, fill:false, tension:0 },
            { label:'6 s threshold', data:thresh6s, borderColor:'rgba(231,76,60,0.3)',  borderDash:[6,5], borderWidth:1.2, pointRadius:0, fill:false, tension:0 },
            { label:'Avg BigGulp',   data:avgBigGulpS, borderColor:'#3498db', backgroundColor:'rgba(52,152,219,0.07)', fill:'origin', tension:0.3, borderWidth:1.5, pointRadius:3, pointHoverRadius:5 },
            { label:'Avg Render',    data:avgRenderS,  borderColor:'#1d9e75', backgroundColor:'rgba(29,158,117,0.07)', fill:'origin', tension:0.3, borderWidth:1.5, pointRadius:3, pointHoverRadius:5 },
            { label:'P90 Total',     data:p90TotalS,   borderColor:'#e74c3c', backgroundColor:'transparent',           fill:false,    tension:0.3, borderWidth:1.8, borderDash:[5,4], pointRadius:3, pointHoverRadius:5 },
            { label:'Avg Total',     data:avgTotalS,   borderColor:'#A984BA', backgroundColor:'rgba(169,132,186,0.1)', fill:'origin', tension:0.3, borderWidth:2.5, pointRadius:4, pointHoverRadius:7, pointBackgroundColor:'#A984BA' }
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          interaction:{ mode:'index', intersect:false },
          plugins:{
            legend:{ position:'top', align:'start', labels:{ font:{size:11}, usePointStyle:true, padding:14,
              filter: function(item) { return !item.text.includes('threshold'); }
            }},
            tooltip:{
              backgroundColor:'rgba(44,62,80,0.92)', titleFont:{size:12,weight:'bold'}, bodyFont:{size:11}, padding:10,
              callbacks:{
                label: function(item) { return item.dataset.label.includes('threshold') ? null : ' ' + item.dataset.label + ': ' + (item.raw !== null ? item.raw.toFixed(2) + ' s' : '—'); },
                afterBody: function(items) {
                  var s = totalTrend[items[0].dataIndex];
                  return s ? ['', '  Samples : ' + s.sampleCount, '  P50     : ' + _fmtMs(s.p50TotalMs), '  Min     : ' + _fmtMs(s.minTotalMs), '  Max     : ' + _fmtMs(s.maxTotalMs)] : [];
                }
              }
            }
          },
          scales:{
            x:{ grid:{color:'rgba(0,0,0,0.04)'}, ticks:{font:{size:11}, maxTicksLimit:20, maxRotation:45, minRotation:0} },
            y:{ grid:{color:'rgba(0,0,0,0.04)'}, min:0, ticks:{font:{size:11}, callback:function(v){return v+' s';}},
                title:{display:true, text:'Load time (seconds)', font:{size:11}, color:'#6a7878'} }
          }
        }
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // CHART B — Per-wave GAS timing trend
    // Only show if we have wave data
    // ══════════════════════════════════════════════════════════════════════
    if (!waveTrend.length || !allWaveLabels.length) {
      if (waveCard) waveCard.style.display = 'none';
      if (waveBreakCard) waveBreakCard.style.display = 'none';
    } else {
      if (waveCard) waveCard.style.display = '';

      // Colour palette — index matches wave label order
      var WAVE_PALETTE = ['#95a5a6','#3498db','#e74c3c','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#c0392b'];

      var labelsB = waveTrend.map(function(v) { return v.version; });

      var waveDatasetsB = allWaveLabels.map(function(wl, idx) {
        var color  = WAVE_PALETTE[idx % WAVE_PALETTE.length];
        var isInit = wl === 'init';
        return {
          label           : wl,
          data            : waveTrend.map(function(v) {
            var w = v.waves[wl];
            return w ? toS(w.avgBigGulpMs) : null;
          }),
          borderColor     : color,
          backgroundColor : 'transparent',
          fill            : false,
          tension         : 0.3,
          borderWidth     : isInit ? 1.2 : 2,
          borderDash      : isInit ? [4, 4] : [],
          pointRadius     : 3,
          pointHoverRadius: 6,
          spanGaps        : false   // gaps = wave didn't exist in that version
        };
      });

      if (admWaveTrendChart) { admWaveTrendChart.destroy(); admWaveTrendChart = null; }

      var ctxB = document.getElementById('admWaveTrendChartCanvas');
      if (ctxB) {
        admWaveTrendChart = new Chart(ctxB, {
          type: 'line',
          data: { labels: labelsB, datasets: waveDatasetsB },
          options: {
            responsive:true, maintainAspectRatio:false,
            interaction:{ mode:'index', intersect:false },
            plugins:{
              legend:{ position:'top', align:'start', labels:{ font:{size:11}, usePointStyle:true, padding:12 }},
              tooltip:{
                backgroundColor:'rgba(44,62,80,0.92)', titleFont:{size:12,weight:'bold'}, bodyFont:{size:11}, padding:10,
                callbacks:{
                  label: function(item) {
                    return item.raw !== null ? ' ' + item.dataset.label + ': ' + item.raw.toFixed(2) + ' s' : null;
                  },
                  afterBody: function(items) {
                    var idx = items[0].dataIndex;
                    var v   = waveTrend[idx];
                    if (!v) return [];
                    var lines = [''];
                    allWaveLabels.forEach(function(wl) {
                      var w = v.waves[wl];
                      if (w) lines.push('  ' + wl + ' samples: ' + w.sampleCount);
                    });
                    return lines;
                  }
                }
              }
            },
            scales:{
              x:{ grid:{color:'rgba(0,0,0,0.04)'}, ticks:{font:{size:11}, maxTicksLimit:20, maxRotation:45} },
              y:{ grid:{color:'rgba(0,0,0,0.04)'}, min:0, ticks:{font:{size:11}, callback:function(v){return v+' s';}},
                  title:{display:true, text:'Avg BigGulpMs from T0 (seconds)', font:{size:11}, color:'#6a7878'} }
            }
          }
        });
      }

      // ── Wave breakdown stat cards (latest version) ─────────────────────
      if (waveBreakCard) {
        waveBreakCard.style.display = '';
        var latestWave = waveTrend[waveTrend.length - 1];
        var titleEl    = document.getElementById('admWaveBreakdownTitle');
        if (titleEl) titleEl.textContent = latestWave.version + ' — Wave Breakdown (avg BigGulpMs from T0)';

        var gridEl = document.getElementById('admWaveBreakdownGrid');
        if (gridEl) {
          gridEl.innerHTML = allWaveLabels.map(function(wl, idx) {
            var w     = latestWave.waves[wl];
            var color = WAVE_PALETTE[idx % WAVE_PALETTE.length];
            var val   = w ? _fmtMs(w.avgBigGulpMs) : '—';
            var sub   = w ? w.sampleCount + ' samples' : 'not in this version';
            return '<div style="background:#fff;border-radius:8px;padding:12px;border:2px solid ' + color + '20;box-shadow:0 1px 3px rgba(0,0,0,0.06)">' +
              '<div style="font-size:0.7rem;font-weight:700;color:' + color + ';margin-bottom:4px">' + _esc(wl) + '</div>' +
              '<div style="font-size:1.3rem;font-weight:800;color:var(--text-strong)">' + val + '</div>' +
              '<div style="font-size:0.68rem;color:var(--text-faint);margin-top:2px">' + sub + '</div>' +
            '</div>';
          }).join('');
        }
      }
    }
  }

    /* ══════════════════════════════════════════════════════════════════
     MEMBER STATS
     ══════════════════════════════════════════════════════════════════ */

  function admSetMembersSort(key) { admMembersSort=key; document.querySelectorAll('[data-members-sort]').forEach(function(b){b.classList.toggle('active',b.dataset.membersSort===key);}); admRenderMemberStats(); }
  function admSetMembersActivity(filter) { admMembersActivity=filter; document.querySelectorAll('[data-members-activity]').forEach(function(b){b.classList.toggle('active',b.dataset.membersActivity===filter);}); admRenderMemberStats(); }

  function admRenderMemberStats() {
    if (!admPayload) return;
    var now=Date.now();
    var members=(admPayload.memberList||[]).filter(function(m){
      if (m.approvalStatus!==APPROVAL_STATUS.APPROVED) return false;
      if (admMembersActivity==='active')   return m.lastAccessedTs>(now-ACTIVE_WINDOW_MS);
      if (admMembersActivity==='inactive') return !m.lastAccessedTs||m.lastAccessedTs<=(now-ACTIVE_WINDOW_MS);
      return true;
    }).slice().sort(function(a,b){return (b[admMembersSort]||0)-(a[admMembersSort]||0);});
    var tbody=document.getElementById('admMembersTbody'); if (!tbody) return;
    if (!members.length){ tbody.innerHTML='<tr><td colspan="9"><div class="adm-empty"><i class="fa-solid fa-users"></i><p>No members match the current filter.</p></div></td></tr>'; return; }
    tbody.innerHTML=members.map(function(m,i){
      var rank=i+1, rcls=rank===1?'gold':rank===2?'silver':rank===3?'bronze':'', dot=m.lastAccessedTs>(now-ACTIVE_WINDOW_MS)?'<span class="adm-live-dot"></span>':'';
      return '<tr>'
        + '<td data-label="Rank"><span class="adm-rank '+rcls+'">'+rank+'</span></td>'
        + '<td data-label="Member"><div style="font-weight:700">'+dot+_esc(m.displayName)+'</div><div class="adm-td-mono" style="font-size:0.7rem">'+_esc(m.memberId)+'</div></td>'
        + '<td data-label="Country" style="font-size:0.78rem;color:var(--text-muted)">'+_esc(m.country||'—')+'</td>'
        + '<td data-label="CP"><strong>'+_numFmt(m.totalCp)+'</strong></td>'
        + '<td data-label="Pages">'+_numFmt(m.totalPages)+'</td>'
        + '<td data-label="Books">'+m.totalBooks+'</td>'
        + '<td data-label="Joined" style="font-size:0.78rem;white-space:nowrap">'+_esc(m.joinDate)+'</td>'
        + '<td data-label="Last Active" style="font-size:0.78rem;white-space:nowrap;color:var(--text-faint)">'+(m.lastAccessed||'—')+'</td>'
        + '<td data-label="Status">'+_approvalPill(m.approvalStatus)+'</td>'
        + '</tr>';
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════════════
     CARD VIEW TOGGLES — Approvals & Member Stats
     ══════════════════════════════════════════════════════════════════ */

  function admToggleApprovalsCardView() {
    admApprovalsCardView = !admApprovalsCardView;
    var wrap = document.getElementById('admApprovalTableWrap');
    if (wrap) wrap.classList.toggle('card-view', admApprovalsCardView);
    var btn = document.getElementById('admApprovalCardViewBtn');
    if (btn) btn.innerHTML = admApprovalsCardView
      ? '<i class="fa-solid fa-table"></i> Table View'
      : '<i class="fa-solid fa-table-cells-large"></i> Card View';
  }

  function admToggleMembersCardView() {
    admMembersCardView = !admMembersCardView;
    var wrap = document.getElementById('admMembersTableWrap');
    if (wrap) wrap.classList.toggle('card-view', admMembersCardView);
    var btn = document.getElementById('admMembersCardViewBtn');
    if (btn) btn.innerHTML = admMembersCardView
      ? '<i class="fa-solid fa-table"></i> Table View'
      : '<i class="fa-solid fa-table-cells-large"></i> Card View';
  }

  /* ══════════════════════════════════════════════════════════════════
     ANNOUNCEMENTS — create / edit / archive / pin
     ══════════════════════════════════════════════════════════════════ */

  function admLoadAnnouncements() {
    var activeTbody   = document.getElementById('admAnnActiveTbody');
    var archivedTbody = document.getElementById('admAnnArchivedTbody');
    var loadingRow    = '<tr><td colspan="7"><div class="adm-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading…</p></div></td></tr>';
    if (activeTbody)   activeTbody.innerHTML   = loadingRow;
    if (archivedTbody) archivedTbody.innerHTML = '<tr><td colspan="6"><div class="adm-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading…</p></div></td></tr>';

    google.script.run
      .withSuccessHandler(function (res) {
        if (res.status !== 'success') {
          var msg = '<tr><td colspan="7"><div class="adm-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>' + _esc(res.message || 'Failed to load.') + '</p></div></td></tr>';
          if (activeTbody) activeTbody.innerHTML = msg;
          return;
        }
        admAnnouncementsDB     = res.announcements || [];
        admAnnouncementsLoaded = true;
        admRenderAnnouncements();
      })
      .withFailureHandler(function (err) {
        var msg = '<tr><td colspan="7"><div class="adm-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>' + _esc((err && err.message) || 'Server error.') + '</p></div></td></tr>';
        if (activeTbody) activeTbody.innerHTML = msg;
      })
      .getAdminAnnouncementsData();
  }

  function admSwitchAnnSubTab(tab) {
    admAnnSubTab = tab;
    ['active','archived','compose'].forEach(function (t) {
      var btn   = document.getElementById('admAnnSubTab' + t.charAt(0).toUpperCase() + t.slice(1));
      var panel = document.getElementById('admAnnPanel'  + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn)   btn.classList.toggle('active', t === tab);
      if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
    });
    if (tab === 'compose' && !admAnnEditing) admResetAnnForm();
  }

  function admRenderAnnouncements() {
    var activeTbody   = document.getElementById('admAnnActiveTbody');
    var archivedTbody = document.getElementById('admAnnArchivedTbody');

    var active   = admAnnouncementsDB.filter(function (a) { return a.status !== 'Archived'; });
    var archived = admAnnouncementsDB.filter(function (a) { return a.status === 'Archived'; });

    if (activeTbody) {
      if (active.length === 0) {
        activeTbody.innerHTML = '<tr><td colspan="7"><div class="adm-empty"><i class="fa-solid fa-bullhorn"></i><p>No active announcements.</p><button class="adm-btn adm-btn-accent" onclick="admSwitchAnnSubTab(\'compose\')" style="margin-top:12px"><i class="fa-solid fa-plus"></i> New Announcement</button></div></td></tr>';
      } else {
        activeTbody.innerHTML = active.map(function (a) {
          var isWhatsNew = a.announcementType === 'WHATS_NEW';
          var typeLabel  = isWhatsNew ? '✦ What\'s New' : '📣 Club Notice';
          var audience   = a.targetMemberIds
            ? _admAnnAudienceLabel(a.targetMemberIds)
            : '<span style="color:var(--text-faint)">All members</span>';
          var pinIconCls = a.isPinned ? 'fa-solid fa-thumbtack' : 'fa-solid fa-thumbtack';
          var pinStyle   = a.isPinned ? 'color:var(--arka-accent)' : 'opacity:0.25';
          var pinTitle   = a.isPinned ? 'Pinned' : 'Not pinned';
          var expiryHtml = a.expiryDate
            ? _esc(a.expiryDate)
            : '<span style="color:var(--text-faint)">—</span>';
          var created    = (a.createdOn || '').substring(0, 10);

          // Mobile sub-line shown inside the Title cell below the title text
          var mobileSub  = '<div class="adm-ann-title-sub">'
            + '<span>' + typeLabel + '</span>'
            + (a.isPinned ? '<i class="fa-solid fa-thumbtack" style="color:var(--arka-accent);font-size:0.7rem" title="Pinned"></i>' : '')
            + (a.expiryDate ? '<span>Expires ' + _esc(a.expiryDate) + '</span>' : '')
            + '</div>';

          var editBtn = '<button class="adm-btn adm-btn-light adm-btn-icon" onclick="admOpenAnnEdit(\'' + _esc(a.announcementId) + '\')" title="Edit"><i class="fa-solid fa-pen"></i></button>';
          var pinBtn  = '<button class="adm-btn adm-btn-light adm-btn-icon" onclick="admToggleAnnPinRow(\'' + _esc(a.announcementId) + '\',' + (!a.isPinned) + ')" title="' + (a.isPinned ? 'Unpin' : 'Pin to top') + '" style="margin-left:4px"><i class="fa-solid fa-thumbtack" style="' + pinStyle + '"></i></button>';
          var archBtn = '<button class="adm-btn adm-btn-danger adm-btn-icon" onclick="admOpenAnnArchiveModal(\'' + _esc(a.announcementId) + '\')" title="Archive" style="margin-left:4px"><i class="fa-solid fa-box-archive"></i></button>';

          return '<tr>'
            + '<td style="white-space:normal;font-weight:600;font-size:0.85rem">' + _esc(a.title) + mobileSub + '</td>'
            + '<td class="adm-col-meta" style="font-size:0.82rem;white-space:nowrap">' + typeLabel + '</td>'
            + '<td style="font-size:0.82rem">' + audience + '</td>'
            + '<td class="adm-col-meta" style="text-align:center"><i class="' + pinIconCls + '" style="' + pinStyle + '" title="' + pinTitle + '"></i></td>'
            + '<td class="adm-col-meta" style="font-size:0.82rem;white-space:nowrap">' + expiryHtml + '</td>'
            + '<td class="adm-col-meta" style="font-size:0.82rem;white-space:nowrap">' + _esc(created) + '</td>'
            + '<td style="white-space:nowrap">' + editBtn + pinBtn + archBtn + '</td>'
            + '</tr>';
        }).join('');
      }
    }

    if (archivedTbody) {
      if (archived.length === 0) {
        archivedTbody.innerHTML = '<tr><td colspan="6"><div class="adm-empty"><i class="fa-solid fa-box-archive"></i><p>No archived announcements.</p></div></td></tr>';
      } else {
        archivedTbody.innerHTML = archived.map(function (a) {
          var typeLabel  = a.announcementType === 'WHATS_NEW' ? '✦ What\'s New' : '📣 Club Notice';
          var audience   = a.targetMemberIds ? _admAnnAudienceLabel(a.targetMemberIds) : '<span style="color:var(--text-faint)">All members</span>';
          var expiryHtml = a.expiryDate
            ? _esc(a.expiryDate)
            : '<span style="color:var(--text-faint)">—</span>';
          var created    = (a.createdOn || '').substring(0, 10);
          var mobileSub  = '<div class="adm-ann-title-sub"><span>' + typeLabel + '</span></div>';
          var editBtn    = '<button class="adm-btn adm-btn-light adm-btn-icon" onclick="admOpenAnnEdit(\'' + _esc(a.announcementId) + '\')" title="Edit"><i class="fa-solid fa-pen"></i></button>';
          return '<tr>'
            + '<td style="white-space:normal;font-weight:600;font-size:0.85rem;opacity:0.65">' + _esc(a.title) + mobileSub + '</td>'
            + '<td class="adm-col-meta" style="font-size:0.82rem;white-space:nowrap">' + typeLabel + '</td>'
            + '<td style="font-size:0.82rem">' + audience + '</td>'
            + '<td class="adm-col-meta" style="font-size:0.82rem;white-space:nowrap">' + expiryHtml + '</td>'
            + '<td class="adm-col-meta" style="font-size:0.82rem;white-space:nowrap">' + _esc(created) + '</td>'
            + '<td>' + editBtn + '</td>'
            + '</tr>';
        }).join('');
      }
    }
  }

  function _admAnnAudienceLabel(targetMemberIds) {
    if (!targetMemberIds) return '<span style="color:var(--text-faint)">All members</span>';
    var ids   = targetMemberIds.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var names = ids.map(function (id) {
      var m = admMemberMap[id];
      return m ? _esc(m.displayName) : _esc(id);
    });
    if (names.length <= 2) return names.join(', ');
    return names[0] + ', ' + names[1] + ' +' + (names.length - 2) + ' more';
  }

  /* ── Compose form ───────────────────────────────────────────────── */

  function admResetAnnForm() {
    admAnnEditing           = null;
    admAnnSelectedMemberIds = [];
    var titleEl = document.getElementById('admAnnFormTitle');
    if (titleEl) titleEl.textContent = 'New Announcement';
    var t = document.getElementById('admAnnTitleInput');  if (t) t.value = '';
    var b = document.getElementById('admAnnBodyInput');   if (b) b.value = '';
    var e = document.getElementById('admAnnExpiryInput'); if (e) e.value = '';
    var pin = document.getElementById('admAnnPinToggle'); if (pin) pin.classList.remove('on');
    var scope = document.getElementById('admAnnScopeToggle'); if (scope) scope.classList.remove('on');
    admAnnSelectType('CLUB_NOTICE');
    _admAnnSetPickerVisible(false);
    _admAnnRenderPills();
    var saveBtn = document.getElementById('admAnnSaveBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Save Announcement'; }
  }

  function admOpenAnnEdit(annId) {
    var ann = admAnnouncementsDB.filter(function (a) { return a.announcementId === annId; })[0];
    if (!ann) { admShowToast('Announcement not found.', 'err'); return; }

    admAnnEditing = annId;
    admAnnSelectedMemberIds = ann.targetMemberIds
      ? ann.targetMemberIds.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
      : [];

    var titleEl = document.getElementById('admAnnFormTitle');
    if (titleEl) titleEl.textContent = 'Edit Announcement';
    var t = document.getElementById('admAnnTitleInput');  if (t) t.value = ann.title;
    var b = document.getElementById('admAnnBodyInput');   if (b) b.value = ann.body;
    var e = document.getElementById('admAnnExpiryInput'); if (e) e.value = ann.expiryDate || '';

    var pin = document.getElementById('admAnnPinToggle');
    if (pin) pin.classList.toggle('on', !!ann.isPinned);

    admAnnSelectType(ann.announcementType || 'CLUB_NOTICE');

    var hasTargets = admAnnSelectedMemberIds.length > 0;
    var scope = document.getElementById('admAnnScopeToggle');
    if (scope) scope.classList.toggle('on', hasTargets);
    _admAnnSetPickerVisible(hasTargets);
    _admAnnRenderPills();

    var saveBtn = document.getElementById('admAnnSaveBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Announcement'; }

    admSwitchAnnSubTab('compose');
  }

  function admAnnSelectType(typeValue) {
    var isWhatsNew = (typeValue === 'WHATS_NEW');
    var selector   = document.getElementById('admAnnTypeSelector');
    var optClub    = document.getElementById('admAnnTypeOptClubNotice');
    var optNew     = document.getElementById('admAnnTypeOptWhatsNew');
    var hint       = document.getElementById('admAnnWhatsNewHint');
    var pinSection = document.getElementById('admAnnPinSection');
    var audSection = document.getElementById('admAnnAudienceSection');

    if (selector) selector.dataset.selectedType = typeValue;
    if (optClub)  optClub.classList.toggle('selected', !isWhatsNew);
    if (optNew)   optNew.classList.toggle('selected',   isWhatsNew);
    if (hint)     hint.style.display = isWhatsNew ? 'block' : 'none';
    if (pinSection) pinSection.style.display = isWhatsNew ? 'none' : 'block';
    if (audSection) audSection.style.display = isWhatsNew ? 'none' : 'block';

    // When switching back to CLUB_NOTICE, respect scope-driven pin visibility
    if (!isWhatsNew) {
      var isScopeSpecific = (document.getElementById('admAnnScopeToggle') || {}).classList
        && document.getElementById('admAnnScopeToggle').classList.contains('on');
      if (pinSection) pinSection.style.display = isScopeSpecific ? 'none' : 'block';
    }
  }

  function admAnnToggleScope() {
    var scopeToggle = document.getElementById('admAnnScopeToggle');
    var pinSection  = document.getElementById('admAnnPinSection');
    var scopeSub    = document.getElementById('admAnnScopeSub');

    var isNowSpecific = !scopeToggle.classList.contains('on');
    scopeToggle.classList.toggle('on', isNowSpecific);
    if (pinSection) pinSection.style.display = isNowSpecific ? 'none' : 'block';
    if (scopeSub)   scopeSub.textContent     = isNowSpecific ? 'Visible to selected members only' : 'Visible to all club members';
    _admAnnSetPickerVisible(isNowSpecific);
    if (!isNowSpecific) {
      admAnnSelectedMemberIds = [];
      _admAnnRenderPills();
    } else {
      setTimeout(function () {
        var inp = document.getElementById('admAnnMemberSearch');
        if (inp) inp.focus();
      }, 50);
    }
  }

  function admAnnTogglePin() {
    var toggle = document.getElementById('admAnnPinToggle');
    if (toggle) toggle.classList.toggle('on');
  }

  function _admAnnSetPickerVisible(visible) {
    var el = document.getElementById('admAnnMemberPickerSection');
    if (el) el.style.display = visible ? 'block' : 'none';
    var scopeSub = document.getElementById('admAnnScopeSub');
    if (scopeSub) scopeSub.textContent = visible ? 'Visible to selected members only' : 'Visible to all club members';
  }

  /* ── Member picker ──────────────────────────────────────────────── */

  function _admAnnRenderPills() {
    var container = document.getElementById('admAnnMemberPills');
    var inp       = document.getElementById('admAnnMemberSearch');
    if (!container) return;
    container.innerHTML = admAnnSelectedMemberIds.map(function (id) {
      var m    = admMemberMap[id] || {};
      var name = m.displayName || id;
      return '<span class="ann-member-pill">' + _esc(name)
        + '<button class="ann-member-pill-remove" onclick="admAnnRemoveMember(\'' + _esc(id) + '\')" type="button">✕</button>'
        + '</span>';
    }).join('');
    if (inp) inp.placeholder = admAnnSelectedMemberIds.length > 0 ? 'Add more…' : 'Search member…';
  }

  function admAnnRemoveMember(memberId) {
    admAnnSelectedMemberIds = admAnnSelectedMemberIds.filter(function (id) { return id !== memberId; });
    _admAnnRenderPills();
  }

  function admAnnFilterDropdown() {
    var query    = ((document.getElementById('admAnnMemberSearch') || {}).value || '').toLowerCase().trim();
    var dropdown = document.getElementById('admAnnMemberDropdown');
    if (!dropdown) return;

    var selected = new Set(admAnnSelectedMemberIds);
    var allMembers = Object.keys(admMemberMap).map(function (id) { return admMemberMap[id]; });

    var matches = allMembers.filter(function (m) {
      if (selected.has(m.memberId)) return false;
      if (!query) return true;
      return (m.displayName || '').toLowerCase().indexOf(query) !== -1
          || (m.fullName    || '').toLowerCase().indexOf(query) !== -1;
    }).slice(0, 8);

    if (matches.length === 0) {
      dropdown.innerHTML = '<div class="ann-member-option" style="color:var(--text-faint);pointer-events:none">No members found</div>';
    } else {
      dropdown.innerHTML = matches.map(function (m) {
        return '<div class="ann-member-option" onclick="admAnnSelectMember(\'' + _esc(m.memberId) + '\')">'
          + '<i class="fa-solid fa-user" style="font-size:0.8rem;color:var(--text-faint)"></i>'
          + '<span>' + _esc(m.displayName) + '</span>'
          + '</div>';
      }).join('');
    }
    dropdown.classList.add('open');
  }

  function admAnnOpenDropdown() {
    var inp = document.getElementById('admAnnMemberSearch');
    if (inp) inp.value = '';
    admAnnFilterDropdown();
  }

  function admAnnCloseDropdownDelayed() {
    setTimeout(function () {
      var dropdown = document.getElementById('admAnnMemberDropdown');
      if (dropdown) dropdown.classList.remove('open');
    }, 180);
  }

  function admAnnSelectMember(memberId) {
    if (admAnnSelectedMemberIds.indexOf(memberId) === -1) {
      admAnnSelectedMemberIds.push(memberId);
    }
    _admAnnRenderPills();
    var inp = document.getElementById('admAnnMemberSearch');
    if (inp) inp.value = '';
    var dropdown = document.getElementById('admAnnMemberDropdown');
    if (dropdown) dropdown.classList.remove('open');
  }

  /* ── Submit ─────────────────────────────────────────────────────── */

  function admSubmitAnn() {
    var rawTitle  = ((document.getElementById('admAnnTitleInput')  || {}).value || '').trim();
    var rawBody   = ((document.getElementById('admAnnBodyInput')   || {}).value || '').trim();
    var rawExpiry = ((document.getElementById('admAnnExpiryInput') || {}).value || '').trim();
    var isPinned  = !!(document.getElementById('admAnnPinToggle')  || {}).classList &&
                    document.getElementById('admAnnPinToggle').classList.contains('on');

    if (!rawTitle) { admShowToast('Title is required.', 'err'); return; }
    if (!rawBody)  { admShowToast('Body is required.', 'err');  return; }

    var isSpecific     = document.getElementById('admAnnScopeToggle').classList.contains('on');
    var targetMemberIds = isSpecific ? admAnnSelectedMemberIds.join(',') : '';
    if (isSpecific && !targetMemberIds) {
      admShowToast('Select at least one member, or switch to club-wide.', 'err');
      return;
    }

    var typeSelector     = document.getElementById('admAnnTypeSelector');
    var announcementType = (typeSelector && typeSelector.dataset.selectedType === 'WHATS_NEW')
      ? 'WHATS_NEW' : 'CLUB_NOTICE';

    var saveBtn = document.getElementById('admAnnSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

    var payload = {
      announcementId  : admAnnEditing || null,
      title           : rawTitle,
      body            : rawBody,
      isPinned        : isPinned,
      expiryDate      : rawExpiry,
      targetMemberIds : targetMemberIds,
      announcementType: announcementType
    };

    google.script.run
      .withSuccessHandler(function (res) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Save Announcement'; }
        if (res.status !== 'success') {
          admShowToast('Error: ' + (res.message || 'Could not save.'), 'err');
          return;
        }
        // Update local cache
        if (admAnnEditing) {
          var idx = admAnnouncementsDB.findIndex
            ? admAnnouncementsDB.findIndex(function (a) { return a.announcementId === admAnnEditing; })
            : (function () { for (var i = 0; i < admAnnouncementsDB.length; i++) { if (admAnnouncementsDB[i].announcementId === admAnnEditing) return i; } return -1; })();
          if (idx > -1 && res.announcement) admAnnouncementsDB[idx] = res.announcement;
        } else {
          if (res.announcement) admAnnouncementsDB.push(res.announcement);
        }
        admShowToast(admAnnEditing ? 'Announcement updated!' : 'Announcement created!', 'ok');
        admAnnEditing = null;
        admRenderAnnouncements();
        admSwitchAnnSubTab('active');
      })
      .withFailureHandler(function (err) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Save Announcement'; }
        admShowToast('Error: ' + ((err && err.message) || 'Server error.'), 'err');
      })
      .saveAnnouncement(payload);
  }

  /* ── Archive ────────────────────────────────────────────────────── */

  function admOpenAnnArchiveModal(annId) {
    admPendingArchiveAnnId = annId;
    var ann   = admAnnouncementsDB.filter(function (a) { return a.announcementId === annId; })[0] || {};
    var bodyEl = document.getElementById('admAnnArchiveModalBody');
    if (bodyEl) {
      bodyEl.innerHTML = 'Archive <strong>' + _esc(ann.title || annId) + '</strong>?'
        + '<p style="margin-top:8px;font-size:0.82rem;color:var(--text-faint)">The announcement will be removed from the member feed immediately. The record is kept for audit purposes.</p>';
    }
    var btnEl = document.getElementById('admAnnArchiveConfirmBtn');
    if (btnEl) btnEl.disabled = false;
    var overlay = document.getElementById('admAnnArchiveModal');
    if (overlay) overlay.classList.add('open');
  }

  function admCloseAnnArchiveModal() {
    var overlay = document.getElementById('admAnnArchiveModal');
    if (overlay) overlay.classList.remove('open');
    admPendingArchiveAnnId = null;
  }

  function admConfirmArchiveAnn() {
    if (!admPendingArchiveAnnId) return;
    var annId = admPendingArchiveAnnId;
    var btnEl = document.getElementById('admAnnArchiveConfirmBtn');
    if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Archiving…'; }

    google.script.run
      .withSuccessHandler(function (res) {
        admCloseAnnArchiveModal();
        if (res.status !== 'success') { admShowToast('Error: ' + (res.message || 'Could not archive.'), 'err'); return; }
        var ann = admAnnouncementsDB.filter(function (a) { return a.announcementId === annId; })[0];
        if (ann) ann.status = 'Archived';
        admShowToast('Announcement archived.', 'ok');
        admRenderAnnouncements();
      })
      .withFailureHandler(function (err) {
        admCloseAnnArchiveModal();
        admShowToast('Error: ' + ((err && err.message) || 'Server error.'), 'err');
      })
      .archiveAnnouncement(annId);
  }

  /* ── Pin toggle from list view ──────────────────────────────────── */

  function admToggleAnnPinRow(annId, newPinState) {
    google.script.run
      .withSuccessHandler(function (res) {
        if (res.status !== 'success') { admShowToast('Error: ' + (res.message || 'Could not update pin.'), 'err'); return; }
        var ann = admAnnouncementsDB.filter(function (a) { return a.announcementId === annId; })[0];
        if (ann) ann.isPinned = newPinState;
        admShowToast(newPinState ? 'Announcement pinned.' : 'Announcement unpinned.', 'ok');
        admRenderAnnouncements();
      })
      .withFailureHandler(function (err) {
        admShowToast('Error: ' + ((err && err.message) || 'Server error.'), 'err');
      })
      .setAnnouncementPin(annId, newPinState);
  }

  /* ══════════════════════════════════════════════════════════════════
     EVENTS — list / compose / status
     ══════════════════════════════════════════════════════════════════ */

  function admLoadEvents() {
    var tbody = document.getElementById('admEvtListTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6"><div class="adm-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading…</p></div></td></tr>';

    google.script.run
      .withSuccessHandler(function (res) {
        if (res.status !== 'success') {
          var msg = '<tr><td colspan="6"><div class="adm-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>' + _esc(res.message || 'Failed to load.') + '</p></div></td></tr>';
          if (tbody) tbody.innerHTML = msg;
          return;
        }
        admEventsDB     = res.eventsDB || [];
        admEventsLoaded = true;
        admRenderEvents();
      })
      .withFailureHandler(function (err) {
        var msg = '<tr><td colspan="6"><div class="adm-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>' + _esc((err && err.message) || 'Server error.') + '</p></div></td></tr>';
        if (tbody) tbody.innerHTML = msg;
      })
      .getEventsData();
  }

  function admSwitchEvtSubTab(tab) {
    admEvtSubTab = tab;
    ['list','compose'].forEach(function (t) {
      var btn   = document.getElementById('admEvtSubTab' + t.charAt(0).toUpperCase() + t.slice(1));
      var panel = document.getElementById('admEvtPanel'  + t.charAt(0).toUpperCase() + t.slice(1));
      if (btn)   btn.classList.toggle('active', t === tab);
      if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
    });
    if (tab === 'compose' && !admEvtEditing) admResetEvtForm();
  }

  function admRenderEvents() {
    var tbody = document.getElementById('admEvtListTbody');
    if (!tbody) return;

    if (admEventsDB.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="adm-empty"><i class="fa-solid fa-calendar-days"></i><p>No events yet.</p><button class="adm-btn adm-btn-accent" onclick="admSwitchEvtSubTab(\'compose\')" style="margin-top:12px"><i class="fa-solid fa-plus"></i> New Event</button></div></td></tr>';
      return;
    }

    var statusOrder = { Active: 0, Completed: 1, Cancelled: 2 };
    var sorted = admEventsDB.slice().sort(function (a, b) {
      var sa = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 9;
      var sb = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 9;
      if (sa !== sb) return sa - sb;
      return (b.startDate || '').localeCompare(a.startDate || '');
    });

    tbody.innerHTML = sorted.map(function (ev) {
      var hostM    = admMemberMap[ev.hostMemberId] || {};
      var hostName = ev.hostMemberId ? (hostM.displayName || ev.hostMemberId) : '—';
      var startStr = ev.startDate + (ev.startTime ? ' ' + ev.startTime : '');
      var mobileSub = '<div class="adm-ann-title-sub">'
        + '<span>' + _esc(ev.eventType) + '</span>'
        + '<span>' + _esc(startStr) + '</span>'
        + '</div>';

      var editBtn = '<button class="adm-btn adm-btn-light adm-btn-icon" onclick="admOpenEvtEdit(\'' + _esc(ev.eventId) + '\')" title="Edit"><i class="fa-solid fa-pen"></i></button>';
      var actionBtns = editBtn;
      if (ev.status === 'Active') {
        actionBtns += ' <button class="adm-btn adm-btn-light adm-btn-icon" onclick="admOpenEvtStatusModal(\'' + _esc(ev.eventId) + '\',\'Completed\')" title="Mark Complete" style="margin-left:4px"><i class="fa-solid fa-circle-check"></i></button>'
          + ' <button class="adm-btn adm-btn-danger adm-btn-icon" onclick="admOpenEvtStatusModal(\'' + _esc(ev.eventId) + '\',\'Cancelled\')" title="Cancel Event" style="margin-left:4px"><i class="fa-solid fa-ban"></i></button>';
      }

      return '<tr>'
        + '<td style="white-space:normal;font-weight:600;font-size:0.85rem">' + _esc(ev.title) + mobileSub + '</td>'
        + '<td class="adm-col-meta" style="font-size:0.82rem;white-space:nowrap">' + _esc(ev.eventType) + '</td>'
        + '<td class="adm-col-meta" style="font-size:0.82rem">' + _esc(hostName) + '</td>'
        + '<td class="adm-col-meta" style="font-size:0.82rem;white-space:nowrap">' + _esc(startStr) + '</td>'
        + '<td style="white-space:nowrap">' + _admEvtStatusBadge(ev.status) + '</td>'
        + '<td style="white-space:nowrap">' + actionBtns + '</td>'
        + '</tr>';
    }).join('');
  }

  function _admEvtStatusBadge(status) {
    if (status === 'Active')    return '<span class="adm-pill adm-pill-approved">Active</span>';
    if (status === 'Completed') return '<span class="adm-pill" style="background:var(--adm-info-bg,#e8f4fd);color:var(--adm-info,#1a73e8)">Done</span>';
    if (status === 'Cancelled') return '<span class="adm-pill adm-pill-rejected">Cancelled</span>';
    return '<span class="adm-pill">' + _esc(status || '—') + '</span>';
  }

  /* ── Compose form ───────────────────────────────────────────────── */

  function admResetEvtForm() {
    admEvtEditing      = null;
    admEvtHostMemberId = '';
    var titleEl = document.getElementById('admEvtFormTitle');
    if (titleEl) titleEl.textContent = 'New Event';
    var typeEl = document.getElementById('admEvtTypeInput'); if (typeEl) typeEl.value = 'BookBuddyRead';
    ['admEvtTitleInput','admEvtDescInput','admEvtStartDateInput','admEvtStartTimeInput',
     'admEvtEndDateInput','admEvtEndTimeInput','admEvtLinkInput'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = '';
    });
    var tz = document.getElementById('admEvtTimezoneInput'); if (tz) tz.value = 'IST';
    var pin = document.getElementById('admEvtPinToggle'); if (pin) pin.classList.remove('on');
    _admEvtRenderHostPill();
    var saveBtn = document.getElementById('admEvtSaveBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Save Event'; }
  }

  function admOpenEvtEdit(evtId) {
    var ev = admEventsDB.filter(function (e) { return e.eventId === evtId; })[0];
    if (!ev) { admShowToast('Event not found.', 'err'); return; }

    admEvtEditing      = evtId;
    admEvtHostMemberId = ev.hostMemberId || '';

    var titleEl = document.getElementById('admEvtFormTitle');
    if (titleEl) titleEl.textContent = 'Edit Event';

    var typeEl = document.getElementById('admEvtTypeInput'); if (typeEl) typeEl.value = ev.eventType || 'BookBuddyRead';
    var set = function (id, val) { var el = document.getElementById(id); if (el) el.value = val || ''; };
    set('admEvtTitleInput',     ev.title);
    set('admEvtDescInput',      ev.description);
    set('admEvtStartDateInput', ev.startDate);
    set('admEvtStartTimeInput', ev.startTime);
    set('admEvtEndDateInput',   ev.endDate);
    set('admEvtEndTimeInput',   ev.endTime);
    set('admEvtLinkInput',      ev.meetingLink);
    set('admEvtTimezoneInput',  ev.eventTimezone || 'IST');

    var pin = document.getElementById('admEvtPinToggle'); if (pin) pin.classList.toggle('on', !!ev.isPinned);
    _admEvtRenderHostPill();

    var saveBtn = document.getElementById('admEvtSaveBtn');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update Event'; }

    admSwitchEvtSubTab('compose');
  }

  /* ── Host member single-select picker ──────────────────────────── */

  function _admEvtRenderHostPill() {
    var pillsDiv = document.getElementById('admEvtHostPills');
    var searchEl = document.getElementById('admEvtHostSearch');
    if (!pillsDiv) return;
    if (admEvtHostMemberId) {
      var m = admMemberMap[admEvtHostMemberId] || {};
      pillsDiv.innerHTML = '<span class="ann-member-pill">' + _esc(m.displayName || admEvtHostMemberId)
        + '<button class="ann-member-pill-remove" onclick="admEvtRemoveHost()" type="button">✕</button></span>';
      if (searchEl) { searchEl.style.display = 'none'; searchEl.value = ''; }
    } else {
      pillsDiv.innerHTML = '';
      if (searchEl) searchEl.style.display = '';
    }
  }

  function admEvtRemoveHost() {
    admEvtHostMemberId = '';
    _admEvtRenderHostPill();
  }

  function admEvtFilterDropdown() {
    var query    = ((document.getElementById('admEvtHostSearch') || {}).value || '').toLowerCase().trim();
    var dropdown = document.getElementById('admEvtHostDropdown');
    if (!dropdown) return;
    var matches = Object.keys(admMemberMap).map(function (id) { return admMemberMap[id]; }).filter(function (m) {
      if (!query) return true;
      return (m.displayName || '').toLowerCase().indexOf(query) !== -1
          || (m.fullName    || '').toLowerCase().indexOf(query) !== -1;
    }).slice(0, 8);

    dropdown.innerHTML = matches.length === 0
      ? '<div class="ann-member-option" style="color:var(--text-faint);pointer-events:none">No members found</div>'
      : matches.map(function (m) {
          return '<div class="ann-member-option" onclick="admEvtSelectHost(\'' + _esc(m.memberId) + '\')">'
            + '<i class="fa-solid fa-user" style="font-size:0.8rem;color:var(--text-faint)"></i>'
            + '<span>' + _esc(m.displayName) + '</span></div>';
        }).join('');
    dropdown.classList.add('open');
  }

  function admEvtOpenHostDropdown() {
    var inp = document.getElementById('admEvtHostSearch');
    if (inp) inp.value = '';
    admEvtFilterDropdown();
  }

  function admEvtCloseDropdownDelayed() {
    setTimeout(function () {
      var dropdown = document.getElementById('admEvtHostDropdown');
      if (dropdown) dropdown.classList.remove('open');
    }, 180);
  }

  function admEvtSelectHost(memberId) {
    admEvtHostMemberId = memberId;
    _admEvtRenderHostPill();
    var dropdown = document.getElementById('admEvtHostDropdown');
    if (dropdown) dropdown.classList.remove('open');
  }

  function admEvtTogglePin() {
    var toggle = document.getElementById('admEvtPinToggle');
    if (toggle) toggle.classList.toggle('on');
  }

  /* ── Submit ─────────────────────────────────────────────────────── */

  function admSubmitEvt() {
    var title     = ((document.getElementById('admEvtTitleInput')     || {}).value || '').trim();
    var evtType   = ((document.getElementById('admEvtTypeInput')      || {}).value || '').trim();
    var startDate = ((document.getElementById('admEvtStartDateInput') || {}).value || '').trim();
    var isPinned  = !!(document.getElementById('admEvtPinToggle') || {}).classList &&
                    document.getElementById('admEvtPinToggle').classList.contains('on');

    if (!title)     { admShowToast('Event title is required.', 'err'); return; }
    if (!evtType)   { admShowToast('Event type is required.', 'err'); return; }
    if (!startDate) { admShowToast('Start date is required (dd-MMM-yyyy).', 'err'); return; }

    var payload = {
      eventId      : admEvtEditing || null,
      eventType    : evtType,
      title        : title,
      description  : ((document.getElementById('admEvtDescInput')      || {}).value || '').trim(),
      hostMemberId : admEvtHostMemberId,
      startDate    : startDate,
      startTime    : ((document.getElementById('admEvtStartTimeInput') || {}).value || '').trim(),
      endDate      : ((document.getElementById('admEvtEndDateInput')   || {}).value || '').trim(),
      endTime      : ((document.getElementById('admEvtEndTimeInput')   || {}).value || '').trim(),
      meetingLink  : ((document.getElementById('admEvtLinkInput')      || {}).value || '').trim(),
      eventTimezone: ((document.getElementById('admEvtTimezoneInput')  || {}).value || 'IST').trim(),
      isPinned     : isPinned
    };

    var saveBtn = document.getElementById('admEvtSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

    google.script.run
      .withSuccessHandler(function (res) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Save Event'; }
        if (res.status !== 'success') { admShowToast('Error: ' + (res.message || 'Could not save.'), 'err'); return; }
        if (admEvtEditing) {
          var idx = -1;
          for (var i = 0; i < admEventsDB.length; i++) { if (admEventsDB[i].eventId === admEvtEditing) { idx = i; break; } }
          if (idx > -1 && res.event) admEventsDB[idx] = res.event;
        } else {
          if (res.event) admEventsDB.push(res.event);
        }
        admShowToast(admEvtEditing ? 'Event updated!' : 'Event created!', 'ok');
        admEvtEditing = null;
        admRenderEvents();
        admSwitchEvtSubTab('list');
      })
      .withFailureHandler(function (err) {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Save Event'; }
        admShowToast('Error: ' + ((err && err.message) || 'Server error.'), 'err');
      })
      .saveEvent(payload);
  }

  /* ── Status change modal ────────────────────────────────────────── */

  function admOpenEvtStatusModal(evtId, newStatus) {
    var ev = admEventsDB.filter(function (e) { return e.eventId === evtId; })[0] || {};
    admPendingEvtStatusChange = { eventId: evtId, newStatus: newStatus };
    var bodyEl = document.getElementById('admEvtStatusModalBody');
    if (bodyEl) {
      var verb = newStatus === 'Cancelled' ? 'Cancel' : 'Mark as complete';
      bodyEl.innerHTML = verb + ' <strong>' + _esc(ev.title || evtId) + '</strong>?'
        + (newStatus === 'Cancelled'
          ? '<p style="margin-top:8px;font-size:0.82rem;color:var(--text-faint)">RSVPed members will be notified of the cancellation.</p>'
          : '<p style="margin-top:8px;font-size:0.82rem;color:var(--text-faint)">The event status will be updated to Completed.</p>');
    }
    var confirmBtn = document.getElementById('admEvtStatusConfirmBtn');
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.className = 'adm-btn ' + (newStatus === 'Cancelled' ? 'adm-btn-danger' : 'adm-btn-accent');
      confirmBtn.innerHTML = newStatus === 'Cancelled'
        ? '<i class="fa-solid fa-ban"></i> Cancel Event'
        : '<i class="fa-solid fa-circle-check"></i> Mark Complete';
    }
    var overlay = document.getElementById('admEvtStatusModal');
    if (overlay) overlay.classList.add('open');
  }

  function admCloseEvtStatusModal() {
    var overlay = document.getElementById('admEvtStatusModal');
    if (overlay) overlay.classList.remove('open');
    admPendingEvtStatusChange = null;
  }

  function admConfirmEvtStatus() {
    if (!admPendingEvtStatusChange) return;
    var evtId     = admPendingEvtStatusChange.eventId;
    var newStatus = admPendingEvtStatusChange.newStatus;
    var confirmBtn = document.getElementById('admEvtStatusConfirmBtn');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating…'; }

    google.script.run
      .withSuccessHandler(function (res) {
        admCloseEvtStatusModal();
        if (res.status !== 'success') { admShowToast('Error: ' + (res.message || 'Could not update.'), 'err'); return; }
        var ev = admEventsDB.filter(function (e) { return e.eventId === evtId; })[0];
        if (ev) ev.status = newStatus;
        admShowToast(newStatus === 'Cancelled' ? 'Event cancelled.' : 'Event marked complete.', 'ok');
        admRenderEvents();
      })
      .withFailureHandler(function (err) {
        admCloseEvtStatusModal();
        admShowToast('Error: ' + ((err && err.message) || 'Server error.'), 'err');
      })
      .updateEventStatus(evtId, newStatus);
  }

  /* ══════════════════════════════════════════════════════════════════
     CONTENT MODERATION — book post feed + delete
     ══════════════════════════════════════════════════════════════════ */

  function admFilterPostsType(type) {
    admPostsTypeFilter = type;
    admPostsShown = 50;
    document.querySelectorAll('[data-posts-type]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.postsType === type);
    });
    admRenderContent();
  }

  function admShowMorePosts() {
    admPostsShown += 50;
    admRenderContent();
  }

  function admRenderContent() {
    var tbody     = document.getElementById('admContentTbody');
    var showMore  = document.getElementById('admContentShowMore');
    if (!tbody) return;

    if (!admReportsDataLoaded) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="adm-empty">'
        + '<i class="fa-solid fa-circle-info"></i>'
        + '<p>Post data is loaded with Club Reports.</p>'
        + '<button class="adm-btn adm-btn-accent" onclick="admLoadReportsData()" style="margin-top:14px">'
        + '<i class="fa-solid fa-download"></i> Load Posts</button></div></td></tr>';
      if (showMore) showMore.style.display = 'none';
      return;
    }

    var searchRaw = (document.getElementById('admPostsSearch') || {}).value || '';
    var search    = searchRaw.toLowerCase().trim();

    var filtered = admPostsDB.filter(function (p) {
      if (admPostsTypeFilter !== 'All' && p.postType !== admPostsTypeFilter) return false;
      if (search) {
        var member = admMemberMap[p.memberId] || {};
        var name   = (member.displayName || p.memberId).toLowerCase();
        var text   = (p.reviewText || '').toLowerCase();
        if (name.indexOf(search) === -1 && text.indexOf(search) === -1) return false;
      }
      return true;
    });

    // Newest first
    filtered.sort(function (a, b) {
      return (b.timestamp || '').localeCompare(a.timestamp || '');
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="adm-empty">'
        + '<i class="fa-solid fa-comment-slash"></i>'
        + '<p>No posts match the current filter.</p></div></td></tr>';
      if (showMore) showMore.style.display = 'none';
      return;
    }

    var slice = filtered.slice(0, admPostsShown);
    tbody.innerHTML = slice.map(function (p) {
      var member  = admMemberMap[p.memberId] || {};
      var name    = _esc(member.displayName || p.memberId);
      var excerpt = (p.reviewText || '').length > 100
        ? _esc((p.reviewText || '').substring(0, 100)) + '…'
        : _esc(p.reviewText || '');
      var datePart = (p.timestamp || '').substring(0, 10);
      return '<tr>'
        + '<td>' + name + '</td>'
        + '<td><span class="adm-pill">' + _esc(p.postType) + '</span></td>'
        + '<td style="max-width:260px;white-space:normal;font-size:0.82rem;color:var(--text-body)">' + excerpt + '</td>'
        + '<td style="white-space:nowrap;font-size:0.82rem">' + _esc(datePart) + '</td>'
        + '<td style="text-align:center">' + (p.likeCount || 0) + '</td>'
        + '<td><button class="adm-btn adm-btn-danger adm-btn-sm" onclick="admOpenPostDeleteModal(\'' + _esc(p.postId) + '\')">'
        + '<i class="fa-solid fa-trash"></i></button></td>'
        + '</tr>';
    }).join('');

    if (showMore) showMore.style.display = filtered.length > admPostsShown ? 'block' : 'none';
  }

  function admOpenPostDeleteModal(postId) {
    admPendingPostDeleteId = postId;
    var p   = admPostsDB.filter(function (x) { return x.postId === postId; })[0] || {};
    var m   = admMemberMap[p.memberId] || {};
    var name    = m.displayName || p.memberId || postId;
    var excerpt = (p.reviewText || '').length > 80
      ? (p.reviewText || '').substring(0, 80) + '…'
      : (p.reviewText || '');
    var bodyEl = document.getElementById('admPostDeleteModalBody');
    if (bodyEl) {
      bodyEl.innerHTML = 'Delete this post by <strong>' + _esc(name) + '</strong>?'
        + '<blockquote style="margin:12px 0 0;padding:8px 12px;border-left:3px solid var(--border-soft);'
        + 'font-size:0.82rem;color:var(--text-faint);font-style:italic">' + _esc(excerpt) + '</blockquote>'
        + '<p style="margin-top:10px;font-size:0.82rem;color:var(--adm-danger)">This action cannot be undone.</p>';
    }
    var btnEl = document.getElementById('admPostDeleteConfirmBtn');
    if (btnEl) btnEl.disabled = false;
    var overlay = document.getElementById('admPostDeleteModal');
    if (overlay) overlay.classList.add('open');
  }

  function admClosePostDeleteModal() {
    var overlay = document.getElementById('admPostDeleteModal');
    if (overlay) overlay.classList.remove('open');
    admPendingPostDeleteId = null;
  }

  function admConfirmDeletePost() {
    if (!admPendingPostDeleteId) return;
    var postId = admPendingPostDeleteId;
    var btnEl  = document.getElementById('admPostDeleteConfirmBtn');
    if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting…'; }

    google.script.run
      .withSuccessHandler(function (r) {
        admClosePostDeleteModal();
        if (r.status !== 'success') {
          admShowToast('Error: ' + (r.message || 'Could not delete post.'), 'err');
          return;
        }
        // Remove from local cache so re-render reflects deletion immediately
        admPostsDB = admPostsDB.filter(function (p) { return p.postId !== postId; });
        admShowToast('Post deleted.', 'ok');
        admRenderContent();
      })
      .withFailureHandler(function (err) {
        admClosePostDeleteModal();
        admShowToast('Error: ' + ((err && err.message) || 'Server error.'), 'err');
      })
      .adminDeleteBookPost(postId);
  }

  /* ══════════════════════════════════════════════════════════════════
     REPORTS — lazy loader
     ══════════════════════════════════════════════════════════════════ */

  /**
   * Lazy-loads report data via getReportsData() on first visit to the
   * Reports section. Subsequent visits use the cached rpt*DB arrays.
   */
  function admLoadReportsData() {
    if (admReportsDataLoaded) {
      // Data already loaded — just re-initialise the view
      rptShowState_('main');
      _rptInitPage_();
      return;
    }
    rptShowState_('loading');
    var refreshBtn = document.getElementById('admRefreshReportsBtn');
    if (refreshBtn) refreshBtn.style.display = 'none';

    google.script.run
      .withSuccessHandler(function (res) {
        rptApplyData_(res);
        admReportsDataLoaded = (res && res.status === 'success');
        if (admReportsDataLoaded) {
          if (refreshBtn) refreshBtn.style.display = '';
          admPostsDB = res.bookPostsDB || [];
          // Re-render content section if it is currently active
          var contentSection = document.getElementById('admSectionContent');
          if (contentSection && contentSection.classList.contains('active')) {
            admRenderContent();
          }
        }
      })
      .withFailureHandler(function (err) {
        var errEl = document.getElementById('rptErrorMsg');
        if (errEl) errEl.textContent = 'Could not load report data: ' + ((err && err.message) || 'unknown error');
        rptShowState_('error');
      })
      .getReportsData();
  }

  /* ══════════════════════════════════════════════════════════════════
     TOAST
     ══════════════════════════════════════════════════════════════════ */

  function admShowToast(message, type) {
    var el=document.getElementById('admToast'); if (!el) return;
    if (admToastTimer) clearTimeout(admToastTimer);
    el.textContent=message;
    el.className='adm-toast-visible'+(type==='ok'?' adm-toast-ok':type==='err'?' adm-toast-err':'');
    admToastTimer=setTimeout(function(){ el.className=''; }, 3000);
  }

  /* ══════════════════════════════════════════════════════════════════
     EMAIL QUEUE MONITOR
     ══════════════════════════════════════════════════════════════════ */

  function admLoadEmailQueue() {
    var tbody = document.getElementById('admEqTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7"><div class="adm-empty"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading…</p></div></td></tr>';
    google.script.run
      .withSuccessHandler(function(res) {
        if (res.status !== 'success') {
          if (tbody) tbody.innerHTML = '<tr><td colspan="7"><div class="adm-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>' + _esc(res.message || 'Failed to load.') + '</p></div></td></tr>';
          return;
        }
        admEmailQueueDB     = res.queue || [];
        admEmailQueueLoaded = true;
        admRenderEmailQueue();
      })
      .withFailureHandler(function(err) {
        var tbody2 = document.getElementById('admEqTbody');
        if (tbody2) tbody2.innerHTML = '<tr><td colspan="7"><div class="adm-empty"><i class="fa-solid fa-triangle-exclamation"></i><p>' + _esc((err && err.message) || 'Server error.') + '</p></div></td></tr>';
      })
      .getAdminEmailQueueData();
  }

  function admSwitchEqFilter(filter) {
    admEmailQueueFilter = filter;
    document.querySelectorAll('[data-eq-filter]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.eqFilter === filter);
    });
    admRenderEmailQueue();
  }

  function admRenderEmailQueue() {
    var tbody = document.getElementById('admEqTbody');
    if (!tbody) return;
    var filtered = admEmailQueueDB.filter(function(e) {
      return admEmailQueueFilter === 'All' || e.status === admEmailQueueFilter;
    });
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7"><div class="adm-empty"><i class="fa-solid fa-envelope-circle-check"></i><p>No entries for this filter.</p></div></td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map(function(e) {
      var statusCls = 'adm-eq-badge-' + (e.status || '').toLowerCase();
      var badge     = '<span class="adm-eq-badge ' + statusCls + '">' + _esc(e.status) + '</span>';
      var actions   = e.status === 'PENDING'
        ? '<button class="adm-btn adm-btn-light adm-btn-sm adm-btn-icon" onclick="admSuppressEmailEntry(\'' + _esc(e.queueId) + '\')" title="Suppress"><i class="fa-solid fa-ban"></i></button>'
        : '<span style="color:var(--text-faint);font-size:0.75rem">—</span>';
      var scheduled = e.scheduledDate ? _esc(e.scheduledDate).substring(0, 16) : '—';
      var sentAt    = e.sentAt        ? _esc(e.sentAt).substring(0, 16)        : '—';
      var clicked   = e.clickedAt     ? _esc(e.clickedAt).substring(0, 16)     : '—';
      return '<tr>'
        + '<td data-label="Member"><strong>' + _esc(e.displayName) + '</strong><div class="adm-td-mono" style="font-size:0.7rem;color:var(--text-faint)">' + _esc(e.memberId) + '</div></td>'
        + '<td data-label="Type" class="adm-col-meta" style="font-size:0.78rem">' + _esc(e.emailType) + '</td>'
        + '<td data-label="Scheduled" class="adm-col-meta" style="font-size:0.78rem;white-space:nowrap">' + scheduled + '</td>'
        + '<td data-label="Status">' + badge + '</td>'
        + '<td data-label="Sent" class="adm-col-meta" style="font-size:0.78rem;white-space:nowrap">' + sentAt + '</td>'
        + '<td data-label="Clicked" class="adm-col-meta" style="font-size:0.78rem;white-space:nowrap">' + clicked + '</td>'
        + '<td data-label="">' + actions + '</td>'
        + '</tr>';
    }).join('');
  }

  function admSuppressEmailEntry(queueId) {
    var btn = document.querySelector('[onclick*="admSuppressEmailEntry(\'' + queueId + '\')"]');
    if (btn) btn.disabled = true;
    google.script.run
      .withSuccessHandler(function(result) {
        if (result.status !== 'success') {
          admShowToast('Suppress error: ' + (result.message || 'Unknown error'), 'err');
          if (btn) btn.disabled = false;
          return;
        }
        var entry = admEmailQueueDB.filter(function(e) { return e.queueId === queueId; })[0];
        if (entry) entry.status = 'SUPPRESSED';
        admShowToast('Entry suppressed', 'ok');
        admRenderEmailQueue();
      })
      .withFailureHandler(function(err) {
        admShowToast('Server error: ' + ((err && err.message) || 'Please retry.'), 'err');
        if (btn) btn.disabled = false;
      })
      .adminSuppressEmailEntry(queueId);
  }

  /* ══════════════════════════════════════════════════════════════════
     PRIVATE HELPERS
     ══════════════════════════════════════════════════════════════════ */

  function _admShowState(activeId) {
    var map={admLoadingState:'flex',admAccessDenied:'flex',admErrorState:'flex',admShell:'block'};
    Object.keys(map).forEach(function(id){ var el=document.getElementById(id); if(el) el.style.display=(id===activeId)?map[id]:'none'; });
  }
  function _admUpdatePendingBubble(count) {
    var b=document.getElementById('admNavPendingBubble'); if (!b) return;
    b.textContent=count; b.style.display=count>0?'inline-flex':'none';
  }
  function _esc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function _fmtMs(ms){ if (!ms||ms===0) return '—'; return ms>=1000?(ms/1000).toFixed(1)+'s':Math.round(ms)+'ms'; }
  function _numFmt(n){ return Number(n||0).toLocaleString(); }
  function _perfBarClass(ms){ if (!ms||ms<=PERF_MS_FAST) return 'adm-perf-fill-ok'; if (ms<=PERF_MS_SLOW) return 'adm-perf-fill-warn'; return 'adm-perf-fill-slow'; }
  function _perfColor(ms){ if (!ms||ms<=PERF_MS_FAST) return 'var(--adm-ok)'; if (ms<=PERF_MS_SLOW) return 'var(--adm-warn)'; return 'var(--adm-danger)'; }
  function _perfColorClass(ms){ if (!ms||ms<=PERF_MS_FAST) return 'c-ok'; if (ms<=PERF_MS_SLOW) return 'c-warn'; return 'c-danger'; }
  function _approvalPill(s){ if (s===APPROVAL_STATUS.APPROVED) return '<span class="adm-pill adm-pill-approved">Approved</span>'; if (s===APPROVAL_STATUS.PENDING) return '<span class="adm-pill adm-pill-pending">Pending</span>'; if (s===APPROVAL_STATUS.REJECTED) return '<span class="adm-pill adm-pill-rejected">Rejected</span>'; return '<span class="adm-pill">'+_esc(s)+'</span>'; }

  /* ══════════════════════════════════════════════════════════════════
     WINDOW EXPOSURES — admin functions called from onclick= attributes
     ══════════════════════════════════════════════════════════════════ */
  window.admInit                = admInit;
  window.admRefresh             = admRefresh;
  window.admSwitchSection       = admSwitchSection;
  window.admOpenDrawer          = admOpenDrawer;
  window.admCloseDrawer         = admCloseDrawer;
  window.admFilterApprovals             = admFilterApprovals;
  window.admRenderApprovals             = admRenderApprovals;
  window.admSetApproval                 = admSetApproval;
  window.admOpenApprovalConfirmModal    = admOpenApprovalConfirmModal;
  window.admCloseApprovalConfirmModal   = admCloseApprovalConfirmModal;
  window.admConfirmApprovalChange       = admConfirmApprovalChange;
  window.admSwitchBadgeSubTab   = admSwitchBadgeSubTab;
  window.admOnMemberInputChange = admOnMemberInputChange;
  window.admOnBadgeInputChange  = admOnBadgeInputChange;
  window.admSubmitBadgeAward    = admSubmitBadgeAward;
  window.admSetAwardFilter      = admSetAwardFilter;
  window.admRenderBadgeAwardsList = admRenderBadgeAwardsList;
  window.admOpenRevokeModal     = admOpenRevokeModal;
  window.admCloseRevokeModal    = admCloseRevokeModal;
  window.admConfirmRevoke       = admConfirmRevoke;
  window.admSetMembersSort      = admSetMembersSort;
  window.admSetMembersActivity  = admSetMembersActivity;
  window.admShowToast           = admShowToast;
  window.admLoadReportsData     = admLoadReportsData;
  window.admLoadAnnouncements       = admLoadAnnouncements;
  window.admSwitchAnnSubTab         = admSwitchAnnSubTab;
  window.admOpenAnnEdit             = admOpenAnnEdit;
  window.admAnnSelectType           = admAnnSelectType;
  window.admAnnToggleScope          = admAnnToggleScope;
  window.admAnnTogglePin            = admAnnTogglePin;
  window.admAnnFilterDropdown       = admAnnFilterDropdown;
  window.admAnnOpenDropdown         = admAnnOpenDropdown;
  window.admAnnCloseDropdownDelayed = admAnnCloseDropdownDelayed;
  window.admAnnSelectMember         = admAnnSelectMember;
  window.admAnnRemoveMember         = admAnnRemoveMember;
  window.admSubmitAnn               = admSubmitAnn;
  window.admOpenAnnArchiveModal     = admOpenAnnArchiveModal;
  window.admCloseAnnArchiveModal    = admCloseAnnArchiveModal;
  window.admConfirmArchiveAnn       = admConfirmArchiveAnn;
  window.admToggleAnnPinRow         = admToggleAnnPinRow;
  window.admFilterPostsType     = admFilterPostsType;
  window.admRenderContent       = admRenderContent;
  window.admShowMorePosts       = admShowMorePosts;
  window.admOpenPostDeleteModal = admOpenPostDeleteModal;
  window.admClosePostDeleteModal= admClosePostDeleteModal;
  window.admConfirmDeletePost   = admConfirmDeletePost;
  window.admLoadEvents              = admLoadEvents;
  window.admSwitchEvtSubTab         = admSwitchEvtSubTab;
  window.admOpenEvtEdit             = admOpenEvtEdit;
  window.admEvtFilterDropdown       = admEvtFilterDropdown;
  window.admEvtOpenHostDropdown     = admEvtOpenHostDropdown;
  window.admEvtCloseDropdownDelayed = admEvtCloseDropdownDelayed;
  window.admEvtSelectHost           = admEvtSelectHost;
  window.admEvtRemoveHost           = admEvtRemoveHost;
  window.admEvtTogglePin            = admEvtTogglePin;
  window.admSubmitEvt               = admSubmitEvt;
  window.admOpenEvtStatusModal      = admOpenEvtStatusModal;
  window.admCloseEvtStatusModal     = admCloseEvtStatusModal;
  window.admConfirmEvtStatus        = admConfirmEvtStatus;
  window.admToggleApprovalsCardView = admToggleApprovalsCardView;
  window.admToggleMembersCardView   = admToggleMembersCardView;
  window.admToggleApprovalRow       = admToggleApprovalRow;
  window.admToggleSelectAllPending  = admToggleSelectAllPending;
  window.admBulkApproveSelected     = admBulkApproveSelected;
  window.admClearBulkSelection      = admClearBulkSelection;
  window.admLoadEmailQueue          = admLoadEmailQueue;
  window.admSwitchEqFilter          = admSwitchEqFilter;
  window.admSuppressEmailEntry      = admSuppressEmailEntry;

  /* ── Bootstrap ─────────────────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', admInit);

  /* ══════════════════════════════════════════════════════════════════
     REPORTS ENGINE — integrated from ArkaReports v4
     Modifications applied:
       1. showToast() bridged to admShowToast() (no #rptToast element needed)
       2. rptShowState_() made null-safe + handles rptPromptState
       3. DOMContentLoaded bootstrap removed (lazy-loaded via admLoadReportsData)
     All rpt* variable names and function signatures are unchanged.
     ══════════════════════════════════════════════════════════════════ */

  /* WINDOW EXPOSURES for reports engine onclick= handlers */
  /* (set after the engine block defines the functions)    */

    /** @type {Array} All member records from MemberDB */
    let rptMembersDB = [];

    /** @type {Array} Page log entries — 90-day club-wide window */
    let rptPageLogDB = [];

    /** @type {Array} Activity log entries */
    let rptActivityLogDB = [];

    /** @type {Array} All member shelf entries */
    let rptShelvesDB = [];

    /** @type {Array} All badge award records */
    let rptBadgeAwardsDB = [];

    /** @type {Array} All active book posts */
    let rptBookPostsDB = [];

    /** @type {Array} All event records */
    let rptEventsDB = [];

    /** @type {Array} All badge definition records */
    let rptBadgesDB = [];

    // ── Lookup Maps (built after data arrives) ─────────────────────────────────
    /** @type {Map<string, Object>} memberId → member object */
    let rptMembersMap = new Map();

    /** @type {Map<string, Object>} badgeId → badge object */
    let rptBadgesMap = new Map();

    /** @type {Map<string, Object>} bookId → book object */
    let rptBooksMap = new Map();

    // ── Page-shell helpers ─────────────────────────────────────────────────────

    /**
     * showToast — standalone implementation matching the main app\'s API.
     * Displays a brief status message at the bottom of the screen.
     *
     * @param {string} msg - Message to display
     * @param {number} [durationMs=3000] - Auto-dismiss duration in ms
     */
    /**
     * showToast — bridged to admShowToast in the merged admin panel.
     * Keeps the reports engine calling showToast(msg) without modification.
     * @param {string} msg
     */
    function showToast(msg /*, durationMs — not used in merged panel */ ) {
      admShowToast(msg, '');
    }

    /**
     * rptShowState_ — toggles which state panel is visible.
     * Exactly one of loading / denied / error / main is shown at a time.
     *
     * @param {'loading'|'denied'|'error'|'main'} state
     */
    /**
     * rptShowState_ — adapted for the merged admin panel.
     * Manages sub-states within the Reports section; null-safe for missing elements.
     * 'prompt' shows the "Load Report Data" prompt on first visit.
     * 'denied' falls back to 'error' since doGet() already gates non-admins.
     *
     * @param {'prompt'|'loading'|'error'|'main'} state
     */
    function rptShowState_(state) {
      var promptEl = document.getElementById('rptPromptState');
      var loadEl   = document.getElementById('rptLoadingState');
      var errorEl  = document.getElementById('rptErrorState');
      var mainEl   = document.getElementById('rptMainUI');
      if (promptEl) promptEl.style.display = (state === 'prompt')  ? '' : 'none';
      if (loadEl)   loadEl.style.display   = (state === 'loading') ? '' : 'none';
      if (errorEl)  errorEl.style.display  = (state === 'error' || state === 'denied') ? '' : 'none';
      if (mainEl)   mainEl.style.display   = (state === 'main')    ? '' : 'none';
    }

    // ── Data loading ──────────────────────────────────────────────────────────

    /**
     * rptLoadData — entry point called on DOMContentLoaded.
     * Calls the GAS backend and hands the payload to rptApplyData_().
     */
    function rptLoadData() {
      rptShowState_('loading');
      google.script.run
        .withSuccessHandler(rptApplyData_)
        .withFailureHandler(function(err) {
          document.getElementById('rptErrorMsg').textContent =
            'Could not load data: ' + (err.message || err);
          rptShowState_('error');
        })
        .getReportsData();
    }

    /**
     * rptApplyData_ — success handler for getReportsData().
     * Populates all local DB arrays, builds lookup Maps, then starts the engine.
     *
     * @param {Object} res - Response from getReportsData() GAS function
     */
    function rptApplyData_(res) {
      if (!res || res.status !== 'success') {
        if (res && res.status === 'admin_required') {
          rptShowState_('denied');
          return;
        }
        document.getElementById('rptErrorMsg').textContent =
          res ? (res.message || 'Unknown error') : 'Empty response from server.';
        rptShowState_('error');
        return;
      }

      // Populate local DB arrays
      rptMembersDB     = res.membersDB     || [];
      rptPageLogDB     = res.pageLogDB     || [];
      rptActivityLogDB = res.activityLogDB || [];
      rptShelvesDB     = res.shelvesDB     || [];
      rptBadgeAwardsDB = res.badgeAwardsDB || [];
      rptBookPostsDB   = res.bookPostsDB   || [];
      rptEventsDB      = res.eventsDB      || [];
      rptBadgesDB      = res.badgesDB      || [];

      // Build O(1) lookup Maps used throughout the engine
      rptMembersMap = new Map(rptMembersDB.map(function(m) { return [m.id,        m]; }));
      rptBadgesMap  = new Map(rptBadgesDB.map(function(b)  { return [b.id,        b]; }));
      rptBooksMap   = new Map(
        (res.booksDB || []).map(function(b) { return [b.id, b]; })
      );

      // Show the main UI and start the engine
      rptShowState_('main');
      _rptInitPage_();
    }

    // ── On load ───────────────────────────────────────────────────────────────
    // DOMContentLoaded bootstrap removed — data is lazy-loaded on first
    // visit to the Reports section via admLoadReportsData().

    // ============================================================================
    //  SHARED FRONTEND HELPERS — constants and functions from the main app that
    //  the reports engine calls. Kept in sync with ArkaClubApp.html manually.
    // ============================================================================

    /**
     * Canonical genre names → lowercase alias arrays for free-text genre matching.
     * Mirrors MasterEngine GENRE_ALIAS_MAP and GENRE_ALIAS_MAP_FRONTEND in main app.
     */
    const GENRE_ALIAS_MAP_FRONTEND = {
      'Fiction'         : ['fiction', 'literary fiction', 'general fiction', 'contemporary fiction', "women's fiction"],
      'Fantasy'         : ['fantasy', 'epic fantasy', 'urban fantasy', 'dark fantasy', 'high fantasy', 'magical realism'],
      'Sci-Fi'          : ['sci-fi', 'science fiction', 'scifi', 'sf', 'speculative fiction', 'hard science fiction'],
      'Crime & Suspense': ['crime', 'thriller', 'mystery', 'suspense', 'detective', 'noir', 'psychological thriller', 'legal thriller'],
      'Non-Fiction'     : ['non-fiction', 'nonfiction', 'narrative nonfiction', 'general non-fiction'],
      'Self-Help'       : ['self-help', 'self help', 'personal development', 'personal growth', 'productivity', 'motivation'],
      'Philosophy'      : ['philosophy', 'ethics', 'metaphysics', 'political philosophy'],
      'Psychology'      : ['psychology', 'behavioral science', 'cognitive science', 'neuroscience', 'social psychology'],
      'Classics'        : ['classics', 'classic literature', 'literary classics', 'classic fiction'],
      'Religious'       : ['religious', 'spirituality', 'religion', 'faith', 'theology', 'spiritual'],
      'Horror'          : ['horror', 'gothic', 'supernatural fiction', 'gothic fiction'],
      'Business'        : ['business', 'leadership', 'management', 'economics', 'finance', 'entrepreneurship', 'strategy'],
      'Poetry'          : ['poetry', 'poems', 'verse', 'poetic']
    };

    /** Ordered list of all canonical genres — drives genre breakdown slide row order. */
    const CANONICAL_GENRE_LIST = [
      'Fiction', 'Fantasy', 'Sci-Fi', 'Crime & Suspense', 'Non-Fiction',
      'Self-Help', 'Philosophy', 'Psychology', 'Classics', 'Religious',
      'Horror', 'Business', 'Poetry'
    ];

    /**
     * Gallery display configuration per badge category.
     * Used by the reports engine to resolve badge category labels and accent colours.
     * Mirrors BADGE_CATEGORY_DISPLAY in the main app.
     */
    const BADGE_CATEGORY_DISPLAY = [
      { category: 'PAGE_MILESTONE',   label: 'Page Milestones',    icon: '📖', accent: '#3498db', metricKey: 'pageCount',        unit: 'pages'       },
      { category: 'BOOK_MILESTONE',   label: 'Book Milestones',    icon: '📚', accent: '#27ae60', metricKey: 'bookCount',        unit: 'books'       },
      { category: 'STREAK_MILESTONE', label: 'Reading Streak',     icon: '🔥', accent: '#e67e22', metricKey: 'bestStreak',       unit: 'weeks'       },
      { category: 'PLOGGER',          label: 'PLogger',            icon: '📅', accent: '#9b59b6', metricKey: 'totalWeeks',       unit: 'weeks'       },
      { category: 'REVIEW_MILESTONE', label: 'Review Milestones',  icon: '✍️', accent: '#e74c3c', metricKey: 'reviewCount',      unit: 'reviews'     },
      { category: 'FAT_READ',         label: 'Fat Reads',          icon: '🧱', accent: '#795548', metricKey: 'fatReadMax',       unit: 'page book'   },
      { category: 'GENRE_EXPLORER',   label: 'Genre Explorer',     icon: '🗺️', accent: '#00897b', metricKey: null,               unit: 'books'       },
      { category: 'GENRE_COLLECTOR',  label: 'Genre Collector',    icon: '🎭', accent: '#5c6bc0', metricKey: 'uniqueGenreCount', unit: 'genres'      },
      { category: 'ANNIVERSARY',      label: 'Member Anniversary', icon: '🎂', accent: '#f39c12', metricKey: 'yearsAsMember',    unit: 'years'       },
      { category: 'SOCIAL_BUTTERFLY', label: 'Social Butterfly',   icon: '🦋', accent: '#1abc9c', metricKey: 'eventsCount',      unit: 'events'      },
      { category: 'LIBRARIAN',        label: 'Librarian',          icon: '🏛️', accent: '#8e44ad', metricKey: 'libraryCount',     unit: 'books added' },
      { category: 'YEARLY',           label: 'Annual Awards',      icon: '🏆', accent: '#f1c40f', metricKey: null,               unit: null          },
      { category: 'SPECIAL',          label: 'Special Badges',     icon: '⭐', accent: '#A984BA', metricKey: null,               unit: null          }
    ];

    /**
     * Resolves a free-text genre string to matched canonical genre names.
     * Mirrors resolveCanonicalGenresFrontend_() in the main app.
     *
     * @param  {string} genreString - Raw comma-separated genre string from a book record.
     * @returns {string[]} Matched canonical genre names (may be empty).
     */
    function resolveCanonicalGenresFrontend_(genreString) {
      if (!genreString) return [];
      var matched = new Set();
      genreString.split(',').forEach(function(rawTag) {
        var tag = rawTag.trim().toLowerCase();
        if (!tag) return;
        for (var canonical in GENRE_ALIAS_MAP_FRONTEND) {
          if (GENRE_ALIAS_MAP_FRONTEND[canonical].includes(tag)) matched.add(canonical);
        }
      });
      return Array.from(matched);
    }

    /**
     * Returns ISO 8601 week string "YYYY-Www" for a given Date.
     * Mirrors getISOWeekStringFrontend_() in the main app.
     *
     * @param  {Date} date
     * @returns {string} e.g. "2024-W05"
     */
    function getISOWeekStringFrontend_(date) {
      var d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
      var yearStart = new Date(d.getFullYear(), 0, 4);
      var weekNum   = 1 + Math.round(
        ((d - yearStart) / 86400000 - 3 + (yearStart.getDay() + 6) % 7) / 7
      );
      return d.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
    }

    /**
     * Parses an Arka-formatted date string into a JS Date object.
     * Handles three formats used across the app:
     *   Z-format    : "dd-MM-yyyy HH:mm:ss +0000"  (PageLogDB, ActivityLogDB timestamps)
     *   Short-date  : "dd-MMM-yyyy"                 (ShelfDB dateFinished, dateAdded)
     *   Fallback    : anything new Date() can parse
     * Returns new Date(NaN) for blank/falsy input — never returns the current moment —
     * so callers can safely check isNaN(result.getTime()) for missing dates.
     * Mirrors parseGoogleDate() in the main app exactly.
     *
     * @param  {string|Date} dateStr
     * @returns {Date}
     */
    function parseGoogleDate(dateStr) {
      if (!dateStr) return new Date(NaN);
      if (dateStr instanceof Date) return dateStr;

      // Z-format: dd-MM-yyyy HH:mm:ss +0000
      var zMatch = dateStr.match(/(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([\+\-]\d{4})/);
      if (zMatch) {
        var isoString = zMatch[3] + '-' + zMatch[2] + '-' + zMatch[1] +
                        'T' + zMatch[4] + ':' + zMatch[5] + ':' + zMatch[6] + zMatch[7];
        return new Date(isoString);
      }

      // Short-date: dd-MMM-yyyy  e.g. "01-Mar-2026"
      var shortMatch = dateStr.match(/(\d{2})-([a-zA-Z]{3})-(\d{4})/);
      if (shortMatch) {
        return new Date(dateStr.replace(/-/g, ' '));
      }

      // Fallback
      return new Date(dateStr);
    }

    /**
     * Escapes a string for safe injection into HTML innerHTML.
     * Converts & < > " ' to their HTML entity equivalents.
     * Mirrors escapeHtml() in the main app exactly.
     *
     * @param  {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // ============================================================================
    //  REPORTS ENGINE — production code from ArkaClubApp.html
    //  (mechanical symbol substitution only — no logic changes)
    // ============================================================================

    // ============================================================================
      // CLUB REPORTS — Admin-only weekly and monthly slide reports
      // ============================================================================
      // Architecture:
      //   - Pure frontend: all data read from rptPageLogDB, rptShelvesDB,
      //     rptActivityLogDB, rptBadgeAwardsDB, rptBookPostsDB, rptEventsDB.
      //   - Slides rendered as HTML/CSS into #rptSlideCanvas (1200×675 px fixed).
      //   - #rptSlideScaleWrap uses CSS transform:scale() to fit phone screen.
      //   - html2canvas captures #rptSlideCanvas at 1200×675 for full-resolution export.
      //   - jsPDF chains PNG data-URIs into a landscape A4/16:9 PDF.
      //   - No GAS backend call required.
      //
      // Globals:
      //   rptMode         {string}  'weekly' | 'monthly'
      //   rptPeriodOffset {number}  0=current period, -1=previous, etc.
      //   rptCurrentSlide {number}  0-based index into rptSlides[]
      //   rptSlides       {Array}   Array of { html, caption } for the active period
      // ============================================================================

      /** Current report mode. */
      let rptMode = 'weekly';

      /**
       * Arka logo URL — same src as the app header img.
       * Used on cover slides in both weekly and monthly reports.
       * @type {string}
       */
      const RPT_LOGO_URL = 'https://lh3.googleusercontent.com/u/0/d/1O-PceFvQ9rAXZDzzSxSd-5VfA7lWqdp4';

      /**
       * Base64 PNG of the Arka logo, populated once by _rptPreloadLogo().
       * Null until loaded — cover slides fall back to styled circle if still null.
       * Using base64 instead of a URL ensures html2canvas can embed it with no CORS taint.
       * @type {string|null}
       */
      let RPT_LOGO_BASE64 = null;

      /**
       * Period offset from today.
       * 0 = current week/month, -1 = previous, -2 = two ago, etc.
       * @type {number}
       */
      let rptPeriodOffset = 0;

      /** Currently displayed slide index (0-based). */
      let rptCurrentSlide = 0;

      /**
       * Rendered slide array for the active period.
       * Each entry: { html: string, caption: string }
       * @type {Array<{html:string, caption:string}>}
       */
      let rptSlides = [];

      // ── Constants ─────────────────────────────────────────────────────────────

      /** Slide dimensions (px). Must match #rptSlideCanvas width/height in HTML. */
      const RPT_SLIDE_W = 1200;

      /**
       * Maps ActivityTypeDB IDs to human-readable category names for the
       * AP-by-activity breakdown on the weekly pulse slide.
       * Only positive-AP activities need to be listed — unknown IDs fall back to 'Other'.
       * @type {Object.<string, string>}
       */
      const RPT_AP_CATEGORY_DISPLAY = {
        'ARKA_ACTTYP_PAGEREAD'         : 'Page Reading',
        'ARKA_ACTTYP_BOOKREAD'         : 'Book Finished',
        'ARKA_ACTTYP_BOOKPOST'         : 'Book Post',
        'ARKA_ACTTYP_BOOKREVIEW'       : 'Review Written',
        'ARKA_ACTTYP_BOOKRATING'       : 'Book Rating',
        'ARKA_ACTTYP_BADGEAWARD'       : 'Badge Awarded',
        'ARKA_ACTTYP_EVENTATTENDED'    : 'Event Attended',
        'ARKA_ACTTYP_BOOKADDED'        : 'Book Added',
        'ARKA_ACTTYP_EVENTRSVP'        : 'Event RSVP',
        'ARKA_ACTTYP_CHALLENGE_WIN'    : 'Challenge Win',
        'ARKA_ACTTYP_CHALLENGE_FINISH' : 'Challenge Finish',
        'ARKA_ACTTYP_CHALLENGE_ENROLL' : 'Challenge Joined',
        'ARKA_ACTTYP_FEEDBACK'         : 'Bug/Feature Report',
        'ARKA_ACTTYP_PROFILENEW'       : 'New Member'
      };
      const RPT_SLIDE_H = 675;

      /** Arka colour palette used inside slides (must match app theme). */
      const RPT_COLORS = {
        dark   : '#1a252f',
        mid    : '#2c3e50',
        purple : '#A984BA',
        purpleL: '#f5eefa',
        gold   : '#f39c12',
        teal   : '#1D9E75',
        coral  : '#D85A30',
        muted  : '#95a5a6',
        white  : '#ffffff',
        offwht : '#f8f9fa'
      };

      // ── Logo preloader ────────────────────────────────────────────────────────

      /**
       * Preloads the Arka logo and converts it to a base64 PNG data-URI.
       * Must be called before building slides so covers can embed the real logo.
       *
       * Requests the image with crossOrigin='anonymous' so that drawing it
       * to a canvas does not taint the canvas (lh3.googleusercontent.com sends
       * Access-Control-Allow-Origin: * headers for direct image URLs).
       *
       * If the load or canvas conversion fails for any reason the function still
       * calls callback() — slides fall back to the styled circle with "A".
       *
       * @param {function} callback - Called when preload is done (success or fail)
       */
      function _rptPreloadLogo(callback) {
        if (RPT_LOGO_BASE64) { callback(); return; }

        var img        = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = function() {
          try {
            var cvs    = document.createElement('canvas');
            cvs.width  = img.naturalWidth  || 200;
            cvs.height = img.naturalHeight || 200;
            cvs.getContext('2d').drawImage(img, 0, 0);
            RPT_LOGO_BASE64 = cvs.toDataURL('image/png');
          } catch (corsErr) {
            // Canvas tainted — CORS headers not present; fallback to circle
            console.warn('_rptPreloadLogo: canvas taint, falling back to circle', corsErr);
            RPT_LOGO_BASE64 = null;
          }
          callback();
        };

        img.onerror = function() {
          // Network error — proceed without logo, circle fallback used
          callback();
        };

        // Cache-bust to force a fresh request with the CORS headers
        img.src = RPT_LOGO_URL + '?cb=' + Date.now();
      }

      // ── Entry point ───────────────────────────────────────────────────────────

      /**
       * Opens the Club Reports view.
       * Guard: returns silently if the caller is not an admin.
       * Called from the drawer admin item.
       */
      /**
       * Standalone page initialiser — called once getReportsData() returns successfully.
       * Replaces openClubReports() from the main app; navigation/auth guards are
       * handled by the page shell before this is ever invoked.
       */
      function _rptInitPage_() {
        rptMode         = 'weekly';
        rptPeriodOffset = 0;
        rptCurrentSlide = 0;
        // Defer so the browser lays out #rptSlideScaleWrap before we measure offsetWidth.
        setTimeout(function() {
          _rptScaleCanvas();
          _rptPreloadLogo(function() {
            _rptBuildAndRender();
          });
        }, 0);
      }

      // revealAdminDrawerItems_() — not applicable in standalone reports page

      // ── Mode & period controls ─────────────────────────────────────────────

      /**
       * Switches between weekly and monthly modes.
       * Resets the period offset to current and re-renders.
       *
       * @param {'weekly'|'monthly'} mode
       */
      function switchReportMode(mode) {
        rptMode         = mode;
        rptPeriodOffset = 0;
        rptCurrentSlide = 0;

        var wBtn = document.getElementById('rptWeeklyBtn');
        var mBtn = document.getElementById('rptMonthlyBtn');
        if (wBtn) {
          wBtn.style.background   = mode === 'weekly' ? '#2c3e50' : '#ecf0f1';
          wBtn.style.color        = mode === 'weekly' ? '#fff'    : '#2c3e50';
          wBtn.style.borderColor  = mode === 'weekly' ? '#2c3e50' : '#ecf0f1';
        }
        if (mBtn) {
          mBtn.style.background   = mode === 'monthly' ? '#2c3e50' : '#ecf0f1';
          mBtn.style.color        = mode === 'monthly' ? '#fff'    : '#2c3e50';
          mBtn.style.borderColor  = mode === 'monthly' ? '#2c3e50' : '#ecf0f1';
        }

        _rptBuildAndRender();
      }

      /**
       * Shifts the report period forward or backward.
       * Prevents shifting into the future (offset > 0).
       *
       * @param {number} delta - +1 (forward) or -1 (back)
       */
      function rptShiftPeriod(delta) {
        var next = rptPeriodOffset + delta;
        if (next > 0) return; // can't go into the future
        rptPeriodOffset = next;
        rptCurrentSlide = 0;
        _rptBuildAndRender();
      }

      // ── Slide navigation ──────────────────────────────────────────────────────

      /** Shows the previous slide (wraps around). */
      function rptPrevSlide() {
        if (!rptSlides.length) return;
        rptCurrentSlide = (rptCurrentSlide - 1 + rptSlides.length) % rptSlides.length;
        _rptRenderCurrentSlide();
      }

      /** Shows the next slide (wraps around). */
      function rptNextSlide() {
        if (!rptSlides.length) return;
        rptCurrentSlide = (rptCurrentSlide + 1) % rptSlides.length;
        _rptRenderCurrentSlide();
      }

      /**
       * Jumps directly to a specific slide index.
       * @param {number} idx - 0-based slide index
       */
      function rptGoToSlide(idx) {
        rptCurrentSlide = idx;
        _rptRenderCurrentSlide();
      }

      // ── Core render orchestrator ──────────────────────────────────────────────

      /**
       * Computes report data, builds slides array, and renders the first slide.
       * Called on mode/period change.
       */
      function _rptBuildAndRender() {
        var periodInfo = _rptGetPeriodInfo();
        var label      = document.getElementById('rptPeriodLabel');
        if (label) label.textContent = periodInfo.label;

        var data = rptMode === 'weekly'
          ? _rptComputeWeeklyData(periodInfo)
          : _rptComputeMonthlyData(periodInfo);

        rptSlides = rptMode === 'weekly'
          ? _rptBuildWeeklySlides(data, periodInfo)
          : _rptBuildMonthlySlides(data, periodInfo);

        var countLabel = document.getElementById('rptSlideCountLabel');
        if (countLabel) countLabel.textContent = rptSlides.length + ' slides';

        rptCurrentSlide = 0;
        _rptRenderCurrentSlide();
        _rptRenderDots();
        _rptRenderThumbnails();
      }

      /**
       * Injects the current slide's HTML into #rptSlideCanvas
       * and updates the dot navigation and caption.
       */
      function _rptRenderCurrentSlide() {
        var canvas = document.getElementById('rptSlideCanvas');
        var captionEl = document.getElementById('rptSlideCaption');
        if (!canvas || !rptSlides.length) return;

        canvas.innerHTML = rptSlides[rptCurrentSlide].html;

        if (captionEl) {
          captionEl.textContent = (rptCurrentSlide + 1) + ' / ' + rptSlides.length
            + '  ·  ' + (rptSlides[rptCurrentSlide].caption || '');
        }

        // Sync dot active state
        var dots = document.querySelectorAll('.rpt-dot');
        dots.forEach(function(d, i) {
          d.classList.toggle('active', i === rptCurrentSlide);
        });

        // Sync thumbnail active state
        var thumbs = document.querySelectorAll('.rpt-thumb');
        thumbs.forEach(function(t, i) {
          t.classList.toggle('active', i === rptCurrentSlide);
        });
      }

      /**
       * Renders the dot navigation bar into #rptDotRow.
       * Creates one dot per slide; clicking a dot jumps to that slide.
       */
      function _rptRenderDots() {
        var dotRow = document.getElementById('rptDotRow');
        if (!dotRow) return;
        dotRow.innerHTML = '';
        rptSlides.forEach(function(_, i) {
          var d = document.createElement('div');
          d.className = 'rpt-dot' + (i === rptCurrentSlide ? ' active' : '');
          d.onclick   = (function(idx) { return function() { rptGoToSlide(idx); }; })(i);
          dotRow.appendChild(d);
        });
      }

      /**
       * Renders miniature slide previews in #rptThumbnailStrip.
       * Each thumbnail is a scaled-down version of the slide HTML rendered
       * into a small container (html2canvas would be too slow here, so we
       * use CSS scale on a duplicate of the slide HTML as a static snapshot).
       *
       * Note: thumbnails are visual-only references, not interactive canvases.
       */
      function _rptRenderThumbnails() {
        var strip = document.getElementById('rptThumbnailStrip');
        if (!strip) return;

        var thumbW = 120; // px display width
        var thumbH = Math.round(thumbW * (RPT_SLIDE_H / RPT_SLIDE_W));
        var scale  = thumbW / RPT_SLIDE_W;

        strip.innerHTML = '';
        rptSlides.forEach(function(slide, i) {
          var wrap = document.createElement('div');
          wrap.className = 'rpt-thumb' + (i === rptCurrentSlide ? ' active' : '');
          wrap.style.cssText = 'width:' + thumbW + 'px; height:' + thumbH + 'px;'
            + 'position:relative; overflow:hidden; flex-shrink:0;'
            + 'border-radius:5px; border:2px solid transparent; cursor:pointer;';

          var inner = document.createElement('div');
          inner.style.cssText = 'width:' + RPT_SLIDE_W + 'px; height:' + RPT_SLIDE_H + 'px;'
            + 'transform:scale(' + scale + '); transform-origin:top left;'
            + 'position:absolute; top:0; left:0; pointer-events:none;'
            + 'background:#1a252f; overflow:hidden;'
            + 'font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;';
          inner.innerHTML = slide.html;

          wrap.appendChild(inner);
          wrap.onclick = (function(idx) { return function() { rptGoToSlide(idx); }; })(i);
          strip.appendChild(wrap);
        });
      }

      /**
       * Scales the #rptSlideCanvas to fill #rptSlideScaleWrap's current width.
       * Must be called on open and on window resize.
       */
      function _rptScaleCanvas() {
        var wrap   = document.getElementById('rptSlideScaleWrap');
        var canvas = document.getElementById('rptSlideCanvas');
        if (!wrap || !canvas) return;
        var containerW = wrap.offsetWidth;
        var scale      = containerW / RPT_SLIDE_W;
        canvas.style.transform = 'scale(' + scale + ')';
        // Height of the scaled canvas = RPT_SLIDE_H * scale
        // The spacer div (padding-top:56.25%) handles this automatically.
      }

      // Rescale on resize (debounced)
      (function() {
        var rptResizeTimer;
        window.addEventListener('resize', function() {
          clearTimeout(rptResizeTimer);
          rptResizeTimer = setTimeout(_rptScaleCanvas, 80);
        });
      })();

      // ── Period helpers ────────────────────────────────────────────────────────

      /**
       * Returns the period window (startMs, endMs) and a display label
       * for the current rptMode + rptPeriodOffset.
       *
       * Weekly  : ISO week boundaries (Mon 00:00 → Sun 23:59:59)
       * Monthly : calendar month boundaries (1st 00:00 → last day 23:59:59)
       *
       * @returns {{ startMs:number, endMs:number, label:string,
       *             year:number, weekOrMonth:number }}
       */
      function _rptGetPeriodInfo() {
        var now = new Date();

        if (rptMode === 'weekly') {
          // Find Monday of the current ISO week, then offset by rptPeriodOffset weeks
          var dayOfWeek   = (now.getDay() + 6) % 7; // 0=Mon … 6=Sun
          var monday      = new Date(now);
          monday.setDate(now.getDate() - dayOfWeek + (rptPeriodOffset * 7));
          monday.setHours(0, 0, 0, 0);

          var sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          sunday.setHours(23, 59, 59, 999);

          var weekNum = getISOWeekStringFrontend_(monday).split('-W')[1];

          return {
            startMs      : monday.getTime(),
            endMs        : sunday.getTime(),
            label        : _rptFormatDate(monday) + ' – ' + _rptFormatDate(sunday),
            year         : monday.getFullYear(),
            weekOrMonth  : parseInt(weekNum, 10),
            monday       : monday,
            sunday       : sunday
          };
        } else {
          // Monthly: shift by rptPeriodOffset months
          var targetDate = new Date(now.getFullYear(), now.getMonth() + rptPeriodOffset, 1);
          var firstDay   = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
          var lastDay    = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
          firstDay.setHours(0, 0, 0, 0);
          lastDay.setHours(23, 59, 59, 999);

          var monthNames = ['January','February','March','April','May','June',
                            'July','August','September','October','November','December'];

          return {
            startMs     : firstDay.getTime(),
            endMs       : lastDay.getTime(),
            label       : monthNames[firstDay.getMonth()] + ' ' + firstDay.getFullYear(),
            year        : firstDay.getFullYear(),
            weekOrMonth : firstDay.getMonth() + 1,
            firstDay    : firstDay,
            lastDay     : lastDay
          };
        }
      }

      /**
       * Formats a Date as "D Mon YYYY" (e.g. "31 Mar 2025").
       * @param {Date} d
       * @returns {string}
       */
      function _rptFormatDate(d) {
        var months = ['Jan','Feb','Mar','Apr','May','Jun',
                      'Jul','Aug','Sep','Oct','Nov','Dec'];
        return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
      }

      // ── Data computation — Weekly ─────────────────────────────────────────────

      /**
       * Parses a shelf date field (dd-MMM-yyyy or dd-MM-yyyy HH:mm:ss Z format)
       * to a Date object for period-window comparisons.
       *
       * Unlike parseGoogleDate(), which uses new Date(string) for short dates and
       * can silently return Invalid Date on non-standard strings, this function
       * uses the explicit new Date(year, month, day) constructor which is always
       * local-time and always valid when the parts are present.
       *
       * Returns null (not Invalid Date) on any failure so callers can use a
       * simple truthiness check.
       *
       * @param  {string} rawVal - e.g. "06-Apr-2026" or "06-04-2026 14:30:00 +0530" or ""
       * @returns {Date|null}
       */
      function _rptParseShelfDate_(rawVal) {
        if (!rawVal || rawVal === 'null') return null;

        var str = String(rawVal).trim();
        if (!str) return null;

        // Path 1: dd-MMM-yyyy  (e.g. "06-Apr-2026") — standard Arka shelf date format
        var SHORT_MONTHS = {
          Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
          Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
        };
        var shortMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
        if (shortMatch) {
          var day   = parseInt(shortMatch[1], 10);
          var month = SHORT_MONTHS[shortMatch[2]];
          var year  = parseInt(shortMatch[3], 10);
          if (month !== undefined && !isNaN(day) && !isNaN(year)) {
            return new Date(year, month, day, 0, 0, 0, 0); // always local time
          }
        }

        // Path 2: dd-MM-yyyy HH:mm:ss Z  (lastModifiedOn format, e.g. "06-04-2026 14:30:00 +0530")
        var zMatch = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+([\+\-]\d{4})$/);
        if (zMatch) {
          var isoStr = zMatch[3] + '-' + zMatch[2] + '-' + zMatch[1]
            + 'T' + zMatch[4] + ':' + zMatch[5] + ':' + zMatch[6] + zMatch[7];
          var d = new Date(isoStr);
          return isNaN(d.getTime()) ? null : d;
        }

        // Path 3: fall back to parseGoogleDate for anything else
        var fallback = parseGoogleDate(str);
        return isNaN(fallback.getTime()) ? null : fallback;
      }

      /**
       * Aggregates all report metrics for one ISO week from global in-memory DBs.
       *
       * @param {{ startMs:number, endMs:number }} periodInfo
       * @returns {WeeklyReportData}
       *
       * @typedef {Object} WeeklyReportData
       * @property {number}   totalPages
       * @property {number}   totalBooksFinished
       * @property {number}   activeMembers
       * @property {number}   totalAP
       * @property {number[]} pagesByDay         - [Mon…Sun] pages per day
       * @property {Array}    topReaders         - [{displayName, pages, pct}]
       * @property {Array}    booksFinished      - [{title, author, memberName, bookId}]
       * @property {Array}    badgesAwarded      - [{badgeName, memberName, tier, categoryIcon, accentColor}]
       * @property {Array}    bookPosts          - [{memberName, postText}]
       * @property {Object}   genreBreakdown     - { canonical: count }
       * @property {number}   prevWeekPages
       * @property {Array}    apCategoryList     - [{name, ap}] top 4, sorted desc
       */
      function _rptComputeWeeklyData(periodInfo) {
        var startMs = periodInfo.startMs;
        var endMs   = periodInfo.endMs;

        // ── Pages by member and by weekday ─────────────────────────────────────
        var memberPageMap = {};
        var pagesByDay    = [0, 0, 0, 0, 0, 0, 0]; // index 0=Mon … 6=Sun

        rptPageLogDB.forEach(function(log) {
          var pages = Number(log.pagesDelta) || 0;
          if (pages <= 0) return;
          var ts = _rptParseShelfDate_(log.timestamp);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms < startMs || ms > endMs) return;

          memberPageMap[log.memberId] = (memberPageMap[log.memberId] || 0) + pages;
          // JS getDay(): 0=Sun, convert to Mon=0 index
          var dayIdx = (ts.getDay() + 6) % 7;
          pagesByDay[dayIdx] += pages;
        });

        var totalPages    = Object.values(memberPageMap).reduce(function(s, v) { return s + v; }, 0);
        var activeMembers = Object.keys(memberPageMap).length;

        // ── Top 5 readers ───────────────────────────────────────────────────────
        var maxPages = Math.max(1, Math.max.apply(null, Object.values(memberPageMap).concat([0])));
        var topReaders = Object.keys(memberPageMap)
          .sort(function(a, b) { return memberPageMap[b] - memberPageMap[a]; })
          .slice(0, 5)
          .map(function(id) {
            var m = rptMembersMap ? rptMembersMap.get(id) : null;
            return {
              displayName: m ? m.displayName : id,
              pages      : memberPageMap[id],
              pct        : Math.round((memberPageMap[id] / maxPages) * 100)
            };
          });

        // ── Books finished in period ─────────────────────────────────────────────
        // 'null' string guard: dateFinished can be the literal string 'null' when
        // Col I is empty in GAS. 'null' is truthy so a plain || chain would use it,
        // causing parseGoogleDate('null') → Invalid Date and silently dropping all books.
        var booksFinished = [];
        rptShelvesDB.forEach(function(shelf) {
          if (shelf.status !== 'Finished') return;

          var rawFinish  = (shelf.dateFinished && shelf.dateFinished !== 'null')
            ? shelf.dateFinished : null;
          var finishDate = _rptParseShelfDate_(rawFinish)
            || _rptParseShelfDate_(shelf.dateUpdated)
            || _rptParseShelfDate_(shelf.lastModifiedOn);

          if (!finishDate) return;
          var ms = finishDate.getTime();
          if (ms < startMs || ms > endMs) return;

          var book   = rptBooksMap   ? rptBooksMap.get(shelf.bookId)     : null;
          var member = rptMembersMap ? rptMembersMap.get(shelf.memberId) : null;
          booksFinished.push({
            title     : book   ? book.title        : shelf.bookId,
            author    : book   ? book.author       : '—',
            memberName: member ? member.displayName : shelf.memberId,
            bookId    : shelf.bookId
          });
        });

        // ── Genre breakdown from finished books ──────────────────────────────────
        var genreBreakdown = {};
        booksFinished.forEach(function(bf) {
          var book = rptBooksMap ? rptBooksMap.get(bf.bookId) : null;
          if (!book || !book.genre) return;
          resolveCanonicalGenresFrontend_(book.genre).forEach(function(g) {
            genreBreakdown[g] = (genreBreakdown[g] || 0) + 1;
          });
        });

        // ── AP earned + category breakdown ──────────────────────────────────────
        // totalAP = net (includes any correction negatives).
        // apRawCategoryMap = positive AP only, grouped by display category.
        var totalAP          = 0;
        var apRawCategoryMap = {};

        rptActivityLogDB.forEach(function(a) {
          var ts = _rptParseShelfDate_(a.activityDate);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms < startMs || ms > endMs) return;

          var ap = Number(a.activityCPAwarded) || 0;
          totalAP += ap;

          if (ap > 0) {
            var typeId      = a.activityTypeID || '';
            var displayName = RPT_AP_CATEGORY_DISPLAY[typeId] || 'Other';
            apRawCategoryMap[displayName] = (apRawCategoryMap[displayName] || 0) + ap;
          }
        });

        // Sort descending, keep top 4 for the pulse slide bar chart
        var apCategoryList = Object.keys(apRawCategoryMap)
          .sort(function(a, b) { return apRawCategoryMap[b] - apRawCategoryMap[a]; })
          .slice(0, 4)
          .map(function(name) { return { name: name, ap: apRawCategoryMap[name] }; });

        // ── Badges awarded in period ─────────────────────────────────────────────
        var badgesAwarded = [];
        rptBadgeAwardsDB.forEach(function(award) {
          if (award.status !== 'Active') return;
          var ts = _rptParseShelfDate_(award.awardedDate);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms < startMs || ms > endMs) return;

          var badge  = rptBadgesMap   ? rptBadgesMap.get(award.badgeId)   : null;
          var member = rptMembersMap  ? rptMembersMap.get(award.memberId) : null;
          var catCfg = badge
            ? BADGE_CATEGORY_DISPLAY.find(function(c) { return c.category === badge.badgeCategory; })
            : null;
          badgesAwarded.push({
            badgeName   : badge  ? badge.caption       : award.badgeId,
            memberName  : member ? member.displayName  : award.memberId,
            tier        : badge  ? (badge.badgeTier || 0) : 0,
            categoryIcon: catCfg ? catCfg.icon         : '🏅',
            accentColor : catCfg ? catCfg.accent       : '#A984BA'
          });
        });

        // ── Book posts in period ─────────────────────────────────────────────────
        var bookPosts = [];
        (rptBookPostsDB || []).forEach(function(post) {
          var ts = _rptParseShelfDate_(post.timestamp || post.postDate);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms < startMs || ms > endMs) return;
          var member = rptMembersMap ? rptMembersMap.get(post.memberId) : null;
          bookPosts.push({
            memberName: member ? member.displayName : post.memberId,
            postText  : post.reviewText || post.postBody || ''
          });
        });

        // ── Previous week pages (delta badge on pages circle) ────────────────────
        var prevWeekStart = startMs - (7 * 24 * 60 * 60 * 1000);
        var prevWeekEnd   = startMs - 1;
        var prevWeekPages = 0;
        rptPageLogDB.forEach(function(log) {
          var pages = Number(log.pagesDelta) || 0;
          if (pages <= 0) return;
          var ts = _rptParseShelfDate_(log.timestamp);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms < prevWeekStart || ms > prevWeekEnd) return;
          prevWeekPages += pages;
        });

        return {
          totalPages,
          totalBooksFinished: booksFinished.length,
          activeMembers,
          totalAP,
          pagesByDay,
          topReaders,
          booksFinished,
          badgesAwarded,
          bookPosts,
          genreBreakdown,
          prevWeekPages,
          apCategoryList
        };
      }

      // ── Data computation — Monthly ────────────────────────────────────────────

      /**
       * Aggregates all report metrics for one calendar month from global in-memory DBs.
       *
       * @param {{ startMs:number, endMs:number, firstDay:Date }} periodInfo
       * @returns {MonthlyReportData}
       */
      function _rptComputeMonthlyData(periodInfo) {
        var startMs = periodInfo.startMs;
        var endMs   = periodInfo.endMs;

        // ── Pages by member ──────────────────────────────────────────────────────
        var memberPageMap = {};

        rptPageLogDB.forEach(function(log) {
          var pages = Number(log.pagesDelta) || 0;
          if (pages <= 0) return;
          var ts = _rptParseShelfDate_(log.timestamp);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms < startMs || ms > endMs) return;
          memberPageMap[log.memberId] = (memberPageMap[log.memberId] || 0) + pages;
        });

        var totalPages    = Object.values(memberPageMap).reduce(function(s, v) { return s + v; }, 0);
        var activeMembers = Object.keys(memberPageMap).length;

        // ── Books finished in period ─────────────────────────────────────────────
        var booksFinished = [];
        var memberBookMap = {}; // memberId → books finished count this month

        rptShelvesDB.forEach(function(shelf) {
          if (shelf.status !== 'Finished') return;

          var finishDate = _rptParseShelfDate_(
            (shelf.dateFinished && shelf.dateFinished !== 'null') ? shelf.dateFinished : null
          ) || _rptParseShelfDate_(shelf.dateUpdated)
            || _rptParseShelfDate_(shelf.lastModifiedOn);

          if (!finishDate) return;
          var ms = finishDate.getTime();
          if (ms < startMs || ms > endMs) return;

          var book   = rptBooksMap   ? rptBooksMap.get(shelf.bookId)     : null;
          var member = rptMembersMap ? rptMembersMap.get(shelf.memberId) : null;
          booksFinished.push({
            title     : book   ? book.title        : shelf.bookId,
            author    : book   ? book.author       : '—',
            memberName: member ? member.displayName : shelf.memberId,
            memberId  : shelf.memberId,
            bookId    : shelf.bookId
          });
          memberBookMap[shelf.memberId] = (memberBookMap[shelf.memberId] || 0) + 1;
        });

        // ── Top 5 readers (pages, with book count) ───────────────────────────────
        var maxPages = Math.max(1, Math.max.apply(null, Object.values(memberPageMap).concat([0])));
        var topReaders = Object.keys(memberPageMap)
          .sort(function(a, b) { return memberPageMap[b] - memberPageMap[a]; })
          .slice(0, 5)
          .map(function(id) {
            var m = rptMembersMap ? rptMembersMap.get(id) : null;
            return {
              displayName: m ? m.displayName : id,
              pages      : memberPageMap[id],
              books      : memberBookMap[id] || 0,
              pct        : Math.round((memberPageMap[id] / maxPages) * 100)
            };
          });

        // ── Genre breakdown ──────────────────────────────────────────────────────
        var genreBreakdown = {};
        booksFinished.forEach(function(bf) {
          var book = rptBooksMap ? rptBooksMap.get(bf.bookId) : null;
          if (!book || !book.genre) return;
          resolveCanonicalGenresFrontend_(book.genre).forEach(function(g) {
            genreBreakdown[g] = (genreBreakdown[g] || 0) + 1;
          });
        });

        // ── Total AP earned ──────────────────────────────────────────────────────
        var totalAP = 0;
        rptActivityLogDB.forEach(function(a) {
          var ts = _rptParseShelfDate_(a.activityDate);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms < startMs || ms > endMs) return;
          totalAP += Number(a.activityCPAwarded) || 0;
        });

        // ── Badges awarded ───────────────────────────────────────────────────────
        var badgesAwarded = [];
        rptBadgeAwardsDB.forEach(function(award) {
          if (award.status !== 'Active') return;
          var ts = _rptParseShelfDate_(award.awardedDate);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms < startMs || ms > endMs) return;

          var badge  = rptBadgesMap   ? rptBadgesMap.get(award.badgeId)     : null;
          var member = rptMembersMap  ? rptMembersMap.get(award.memberId)   : null;
          var catCfg = badge
            ? BADGE_CATEGORY_DISPLAY.find(function(c) { return c.category === badge.badgeCategory; })
            : null;
          badgesAwarded.push({
            badgeName   : badge  ? badge.caption       : award.badgeId,
            memberName  : member ? member.displayName  : award.memberId,
            tier        : badge  ? (badge.badgeTier || 0) : 0,
            categoryIcon: catCfg ? catCfg.icon         : '🏅',
            accentColor : catCfg ? catCfg.accent       : '#A984BA'
          });
        });

        // ── Month-over-month: prior calendar month ───────────────────────────────
        var prevMonthStart = new Date(
          periodInfo.firstDay.getFullYear(),
          periodInfo.firstDay.getMonth() - 1, 1, 0, 0, 0, 0
        );
        var prevMonthEnd = new Date(
          periodInfo.firstDay.getFullYear(),
          periodInfo.firstDay.getMonth(), 0, 23, 59, 59, 999
        );
        var prevPagesMs   = prevMonthStart.getTime();
        var prevPagesEndMs = prevMonthEnd.getTime();

        var prevPages = 0, prevBooks = 0, prevAP = 0;
        var prevMemberSet = {};

        rptPageLogDB.forEach(function(log) {
          var pages = Number(log.pagesDelta) || 0;
          if (pages <= 0) return;
          var ts = _rptParseShelfDate_(log.timestamp);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms < prevPagesMs || ms > prevPagesEndMs) return;
          prevPages += pages;
          prevMemberSet[log.memberId] = true;
        });

        rptShelvesDB.forEach(function(shelf) {
          if (shelf.status !== 'Finished') return;

          var finishDate = _rptParseShelfDate_(
            (shelf.dateFinished && shelf.dateFinished !== 'null') ? shelf.dateFinished : null
          ) || _rptParseShelfDate_(shelf.dateUpdated)
            || _rptParseShelfDate_(shelf.lastModifiedOn);

          if (!finishDate) return;
          var ms = finishDate.getTime();
          if (ms >= prevPagesMs && ms <= prevPagesEndMs) prevBooks++;
        });

        rptActivityLogDB.forEach(function(a) {
          var ts = _rptParseShelfDate_(a.activityDate);
          if (!ts) return;
          var ms = ts.getTime();
          if (ms >= prevPagesMs && ms <= prevPagesEndMs)
            prevAP += Number(a.activityCPAwarded) || 0;
        });

        var momComparison = {
          pages        : prevPages,
          books        : prevBooks,
          ap           : prevAP,
          activeMembers: Object.keys(prevMemberSet).length
        };

        // ── Lifetime milestone crossings this month ───────────────────────────────
        // Computed server-side on demand via getReportMilestones() — the frontend
        // 90-day PageLogDB slice does not carry enough history for this calculation.
        // The milestone slide renders immediately with an empty array and is patched
        // asynchronously when the backend call returns.
        var milestones = []; // populated asynchronously below
        var reportYear  = periodInfo.firstDay.getFullYear();
        var reportMonth = periodInfo.firstDay.getMonth() + 1; // 1-based

        google.script.run
          .withSuccessHandler(function(res) {
            if (res && res.status === 'success' && res.milestones.length > 0) {
              // Patch the already-rendered monthly report milestone slide in place.
              // _rptPatchMilestones_ is a lightweight updater that finds the slide
              // container by data attribute and injects the milestone rows.
              _rptPatchMilestones_(res.milestones);
            }
          })
          .withFailureHandler(function(e) {
            console.warn('getReportMilestones failed:', e);
          })
          .getReportMilestones(reportYear, reportMonth);

        return {
          totalPages,
          totalBooksFinished: booksFinished.length,
          activeMembers,
          totalAP,
          topReaders,
          booksFinished,
          badgesAwarded,
          genreBreakdown,
          momComparison,
          milestones
        };
      }

      /**
       * Patches the milestone section of an already-rendered monthly report slide.
       * Called asynchronously after getReportMilestones() returns.
       *
       * @param {Array<{memberName:string, text:string, color:string}>} milestones
       */
      function _rptPatchMilestones_(milestones) {
        // The monthly report milestone container is stamped with a known id
        // during _rptMonthlySlide_() render. If the report has since been
        // navigated away from, the element won't exist — fail silently.
        var container = document.getElementById('rptMilestonesContainer');
        if (!container) return;

        container.innerHTML = milestones.map(function(m) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;'
            + 'border-bottom:0.5px solid rgba(255,255,255,0.1);">'
            + '<span style="font-size:18px;">🏅</span>'
            + '<div>'
            + '<div style="font-size:11px;font-weight:700;color:#fff;">'
            + escapeHtml(m.memberName) + '</div>'
            + '<div style="font-size:10px;color:rgba(255,255,255,0.75);">'
            + escapeHtml(m.text) + '</div>'
            + '</div>'
            + '</div>';
        }).join('');
      }

      // ── Slide HTML builders ───────────────────────────────────────────────────
      // Each builder returns { html: string, caption: string }.
      // All HTML is absolutely/relatively positioned within 1200×675 px.
      // Uses inline styles only — no class dependencies on the app stylesheet.
      // Font stack matches the app: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif.
      //
      // Helper: _rptS(css) shorthand for full style attribute string.
      // Helper: _rptBar(pct, color) returns a mini horizontal bar div string.

      var _RPT_FONT = "'Segoe UI',Tahoma,Geneva,Verdana,sans-serif";

      /**
       * Wraps a slide's content in the standard dark background container.
       * @param {string} accentColor - Top-edge accent bar colour
       * @param {string} innerHtml
       * @param {string} footerText  - Right-aligned footer text (slide N/M)
       * @param {string} [periodLabel=''] - Left-aligned footer label
       * @returns {string}
       */
      function _rptSlideWrap(accentColor, innerHtml, slideNum, totalSlides, periodLabel) {
        return '<div style="width:1200px;height:675px;background:#1a252f;'
          + 'font-family:' + _RPT_FONT + ';position:relative;overflow:hidden;box-sizing:border-box;">'
          // Top accent bar
          + '<div style="position:absolute;top:0;left:0;width:1200px;height:6px;background:'
          + accentColor + ';"></div>'
          // Main content area
          + '<div style="position:absolute;top:6px;left:0;right:0;bottom:60px;padding:30px 50px;'
          + 'box-sizing:border-box;">'
          + innerHtml
          + '</div>'
          // Footer bar
          + '<div style="position:absolute;bottom:0;left:0;right:0;height:56px;'
          + 'background:rgba(255,255,255,0.04);display:flex;align-items:center;'
          + 'padding:0 50px;justify-content:space-between;box-sizing:border-box;">'
          + '<span style="font-size:11px;color:#95a5a6;">'
          + (periodLabel || 'Arka Readers Club')
          + '</span>'
          + '<span style="font-size:11px;color:#95a5a6;">'
          + slideNum + ' / ' + totalSlides + '</span>'
          + '</div>'
          + '</div>';
      }

      /**
       * Builds a horizontal progress bar HTML string.
       * @param {number} pct       - 0–100
       * @param {string} fillColor - CSS color for the fill
       * @param {number} [h=6]     - Bar height in px
       * @returns {string}
       */
      function _rptBar(pct, fillColor, h) {
        h = h || 6;
        return '<div style="background:rgba(255,255,255,0.08);border-radius:3px;height:' + h + 'px;overflow:hidden;">'
          + '<div style="width:' + Math.min(100, pct) + '%;background:' + fillColor
          + ';height:100%;border-radius:3px;"></div></div>';
      }

      /**
       * Formats a number as a compact string (1200 → "1,200", 1500000 → "1.5M").
       * @param {number} n
       * @returns {string}
       */
      function _rptFmt(n) {
        if (n >= 1000000) return (Math.round(n / 100000) / 10) + 'M';
        if (n >= 10000)   return (Math.round(n / 100) / 10) + 'k';
        return n.toLocaleString();
      }

      /**
       * Returns "+X%" or "–X%" delta label HTML.
       * @param {number} current
       * @param {number} previous
       * @param {string} color - accent color for positive delta
       * @returns {string}
       */
      function _rptDeltaHtml(current, previous, color) {
        if (!previous) return '';
        var pct  = Math.round(((current - previous) / previous) * 100);
        var sign = pct >= 0 ? '+' : '';
        var col  = pct >= 0 ? (color || '#1D9E75') : '#e74c3c';
        return '<span style="font-size:11px;font-weight:700;color:' + col + ';'
          + 'background:' + col + '22;border-radius:4px;padding:2px 7px;margin-left:8px;">'
          + sign + pct + '%</span>';
      }

      // ────────────────────────────────────────────────────────────────────────
      // PULSE SLIDE SVG HELPERS
      // These four functions produce SVG markup strings (no <svg> wrapper).
      // They are called by _rptWeeklyPulse() which embeds them in the full SVG.
      // All coordinate parameters are in the 1200×675 slide space.
      // ────────────────────────────────────────────────────────────────────────

      /**
       * Builds pre-computed SVG markup for the 7-spoke reading-pattern rose chart.
       * All trig runs in the builder (not at render time) so the slide HTML is static.
       *
       * @param {number[]} pagesByDay - [Mon, Tue, Wed, Thu, Fri, Sat, Sun] page counts
       * @param {number}   cx         - Rose centre x (slide coords)
       * @param {number}   cy         - Rose centre y (slide coords)
       * @param {number}   maxR       - Max spoke radius in px
       * @returns {string} SVG element markup (elements only, no wrapper)
       */
      function _rptBuildRoseSvgContent_(pagesByDay, cx, cy, maxR) {
        var N    = 7;
        var DAYS = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];
        var maxV = Math.max.apply(null, pagesByDay.concat([1]));
        // Index of the peak day — used to highlight that spoke
        var peakIdx = maxV > 0 ? pagesByDay.indexOf(maxV) : -1;
        var out = '';

        function polarPt(r, i) {
          var a = (-Math.PI / 2) + i * (2 * Math.PI / N);
          return [(cx + r * Math.cos(a)).toFixed(1), (cy + r * Math.sin(a)).toFixed(1)];
        }

        function polyPts(r) {
          return [0,1,2,3,4,5,6].map(function(i) {
            var p = polarPt(r, i); return p[0] + ',' + p[1];
          }).join(' ');
        }

        // Concentric web rings at 25 / 50 / 75 / 100%
        [0.25, 0.5, 0.75, 1.0].forEach(function(pct) {
          out += '<polygon points="' + polyPts(maxR * pct) + '" fill="none"'
            + ' stroke="rgba(255,255,255,' + (pct === 1 ? '0.12' : '0.06') + ')"'
            + ' stroke-width="0.5"/>';
        });

        // Spokes from centre to outer ring
        for (var i = 0; i < N; i++) {
          var ep = polarPt(maxR, i);
          out += '<line x1="' + cx + '" y1="' + cy + '"'
            + ' x2="' + ep[0] + '" y2="' + ep[1] + '"'
            + ' stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/>';
        }

        // Filled data polygon
        var dataPts = [0,1,2,3,4,5,6].map(function(i) {
          var r = (pagesByDay[i] / maxV) * maxR;
          var p = polarPt(r, i);
          return p[0] + ',' + p[1];
        }).join(' ');
        out += '<polygon points="' + dataPts + '" fill="rgba(169,132,186,0.22)"'
          + ' stroke="#A984BA" stroke-width="2"/>';

        // Data dots + day labels — peak day highlighted in purple
        for (var j = 0; j < N; j++) {
          var rj    = (pagesByDay[j] / maxV) * maxR;
          var dp    = polarPt(rj, j);
          var lp    = polarPt(maxR + 15, j);
          var isPeak = (j === peakIdx);
          var labelY = (parseFloat(lp[1]) + 4).toFixed(1);

          out += '<circle cx="' + dp[0] + '" cy="' + dp[1] + '"'
            + ' r="' + (isPeak ? '4.5' : '3') + '" fill="#A984BA"/>';

          out += '<text x="' + lp[0] + '" y="' + labelY + '"'
            + ' text-anchor="middle"'
            + ' font-size="' + (isPeak ? '12' : '11') + '"'
            + ' font-weight="' + (isPeak ? '700' : '400') + '"'
            + ' fill="' + (isPeak ? '#A984BA' : '#7f8c8d') + '">'
            + DAYS[j] + '</text>';
        }

        // Small centre dot
        out += '<circle cx="' + cx + '" cy="' + cy + '" r="2.5" fill="rgba(169,132,186,0.5)"/>';
        return out;
      }


      /**
       * Builds SVG markup for the books-finished list (up to 5 rows).
       * Shows teal bullet · bold title · muted author · member on two lines per row.
       * Renders an empty-state message when no books were finished.
       *
       * @param {Array}  books   - [{title, author, memberName}]
       * @param {number} xLeft   - Left edge (dot centre x = xLeft + 3)
       * @param {number} yStart  - Baseline y of the first title text
       * @param {number} xRight  - Right edge (for divider lines)
       * @returns {string} SVG markup string
       */
      function _rptBuildBooksListSvg_(books, xLeft, yStart, xRight) {
        var DOT_CX  = xLeft + 3;
        var TEXT_X  = xLeft + 16;
        var ROW_H   = 41;   // px between successive row baselines
        var MID_X   = ((xLeft + xRight) / 2).toFixed(0);
        var out     = '';

        if (!books || !books.length) {
          out += '<text x="' + MID_X + '" y="' + (yStart + 80) + '"'
            + ' text-anchor="middle" font-size="13" fill="#4a6175"'
            + ' font-style="italic">No books finished this week</text>';
          return out;
        }

        var visible  = books.slice(0, 5);
        var overflow = books.length - visible.length;

        visible.forEach(function(b, i) {
          var ry     = yStart + i * ROW_H;
          var isLast = (i === visible.length - 1) && (overflow === 0);

          // Truncate to fit column width (~240px at font-size 13 ≈ 30 chars)
          var title      = b.title.length > 26 ? b.title.substring(0, 25) + '…' : b.title;
          var authorRaw  = (b.author || '—').length > 14
            ? b.author.substring(0, 13) + '…' : (b.author || '—');
          var memberRaw  = (b.memberName || '').length > 14
            ? b.memberName.substring(0, 13) + '…' : (b.memberName || '');
          var authorLine = authorRaw + ' · ' + memberRaw;
          if (authorLine.length > 32) authorLine = authorLine.substring(0, 31) + '…';

          // Teal bullet dot (vertically centred with cap height of 13px title)
          out += '<circle cx="' + DOT_CX + '" cy="' + (ry - 4) + '" r="4" fill="#1D9E75"/>';

          out += '<text x="' + TEXT_X + '" y="' + ry + '"'
            + ' font-size="13" font-weight="700" fill="#f0f0f0">'
            + escapeHtml(title) + '</text>';

          out += '<text x="' + TEXT_X + '" y="' + (ry + 15) + '"'
            + ' font-size="11" fill="#7f8c8d">'
            + escapeHtml(authorLine) + '</text>';

          if (!isLast) {
            out += '<line x1="' + xLeft + '" y1="' + (ry + 25) + '"'
              + ' x2="' + xRight + '" y2="' + (ry + 25) + '"'
              + ' stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/>';
          }
        });

        // Overflow indicator when > 5 books
        if (overflow > 0) {
          var ovY = yStart + visible.length * ROW_H + 10;
          out += '<text x="' + MID_X + '" y="' + ovY + '"'
            + ' text-anchor="middle" font-size="11" fill="#4a6175"'
            + ' font-style="italic">+ ' + overflow + ' more</text>';
        }

        return out;
      }


      /**
       * Builds SVG markup for the top-readers ranked list (up to 5 rows).
       * Each row: coloured rank bubble · member name · right-aligned pages · bar.
       * Bar widths scale proportionally to the top reader's page count.
       *
       * @param {Array}  readers - [{displayName, pages, pct}]
       * @param {number} xLeft   - Left edge (rank bubble left)
       * @param {number} yStart  - Baseline y of the first row's name text
       * @param {number} xRight  - Right edge (pages text anchor, bar right)
       * @returns {string} SVG markup string
       */
      function _rptBuildReadersListSvg_(readers, xLeft, yStart, xRight) {
        var BUBBLE_CX = xLeft + 11;  // Rank bubble centre x
        var TEXT_X    = xLeft + 28;  // Name text start x
        var BAR_X     = xLeft + 28;  // Bar start x (aligns with name)
        var BAR_MAX_W = xRight - BAR_X; // Maximum bar width in px
        var ROW_H     = 44;          // px between successive row baselines
        var MID_X     = ((xLeft + xRight) / 2).toFixed(0);

        // Bubble fill and text colours per rank (gold / silver / bronze / muted)
        var BUBBLE_BG    = ['rgba(186,117,23,0.28)', 'rgba(180,178,169,0.18)',
                            'rgba(240,153,123,0.18)', 'rgba(255,255,255,0.06)',
                            'rgba(255,255,255,0.06)'];
        var BUBBLE_COLOR = ['#EF9F27', '#B4B2A9', '#F0997B', '#7f8c8d', '#7f8c8d'];
        var NAME_COLOR   = ['#f0f0f0', '#e0e0e0', '#e0e0e0', '#c0c0c0', '#c0c0c0'];
        var NAME_WEIGHT  = ['700', '400', '400', '400', '400'];
        // Bar opacity decreases by rank — all bars use the gold (#f39c12) colour
        var BAR_OPACITY  = ['1', '0.55', '0.45', '0.3', '0.22'];
        var BAR_COLOR    = '#f39c12';

        var out = '';

        if (!readers || !readers.length) {
          out += '<text x="' + MID_X + '" y="' + (yStart + 60) + '"'
            + ' text-anchor="middle" font-size="13" fill="#4a6175"'
            + ' font-style="italic">No reading logged</text>';
          return out;
        }

        var maxPagesForBar = readers[0].pages || 1;
        var visible = readers.slice(0, 5);

        visible.forEach(function(r, i) {
          var ry      = yStart + i * ROW_H;
          var isLast  = (i === visible.length - 1);
          var barW    = Math.round((r.pages / maxPagesForBar) * BAR_MAX_W);
          var name    = r.displayName.length > 17
            ? r.displayName.substring(0, 16) + '…' : r.displayName;
          var pagesStr = r.pages.toLocaleString() + 'p';

          // Rank bubble
          out += '<circle cx="' + BUBBLE_CX + '" cy="' + (ry - 4) + '"'
            + ' r="11" fill="' + BUBBLE_BG[i] + '"/>';
          out += '<text x="' + BUBBLE_CX + '" y="' + ry + '"'
            + ' text-anchor="middle" font-size="11" font-weight="700"'
            + ' fill="' + BUBBLE_COLOR[i] + '">' + (i + 1) + '</text>';

          // Member name
          out += '<text x="' + TEXT_X + '" y="' + ry + '"'
            + ' font-size="13" font-weight="' + NAME_WEIGHT[i] + '"'
            + ' fill="' + NAME_COLOR[i] + '">' + escapeHtml(name) + '</text>';

          // Pages right-aligned
          out += '<text x="' + xRight + '" y="' + ry + '"'
            + ' text-anchor="end" font-size="12" fill="#95a5a6">'
            + escapeHtml(pagesStr) + '</text>';

          // Bar: background track + proportional fill
          out += '<rect x="' + BAR_X + '" y="' + (ry + 4) + '"'
            + ' width="' + BAR_MAX_W + '" height="4" rx="2"'
            + ' fill="rgba(255,255,255,0.08)"/>';
          if (barW > 0) {
            out += '<rect x="' + BAR_X + '" y="' + (ry + 4) + '"'
              + ' width="' + barW + '" height="4" rx="2"'
              + ' fill="' + BAR_COLOR + '" opacity="' + BAR_OPACITY[i] + '"/>';
          }

          // Row divider — omit on last row
          if (!isLast) {
            out += '<line x1="' + xLeft + '" y1="' + (ry + 14) + '"'
              + ' x2="' + xRight + '" y2="' + (ry + 14) + '"'
              + ' stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>';
          }
        });

        return out;
      }


      /**
       * Builds SVG markup for the AP-by-activity category breakdown (up to 4 rows).
       * Each row: category label · right-aligned AP value · proportional bar · % sub-label.
       * Ends with a total summary pill.
       *
       * @param {Array}  catList  - [{name, ap}] sorted desc (max 4 entries)
       * @param {number} totalAP  - Gross total AP for the period (for percentage calc)
       * @param {number} xLeft    - Left edge
       * @param {number} yStart   - Baseline y of the first row's category label
       * @param {number} xRight   - Right edge (AP value text anchor, bar right)
       * @returns {string} SVG markup string
       */
      function _rptBuildApCategorySvg_(catList, totalAP, xLeft, yStart, xRight) {
        var BAR_MAX_W = xRight - xLeft;
        var ROW_H     = 47;   // px between successive row baselines
        var CORAL     = '#D85A30';
        // Opacity decreases by rank to show dominance at a glance
        var OPACITIES = ['1', '0.75', '0.6', '0.45'];
        var MID_X     = ((xLeft + xRight) / 2).toFixed(0);
        var out       = '';

        if (!catList || !catList.length || totalAP <= 0) {
          out += '<text x="' + MID_X + '" y="' + (yStart + 60) + '"'
            + ' text-anchor="middle" font-size="13" fill="#4a6175"'
            + ' font-style="italic">No AP earned this week</text>';
          return out;
        }

        var maxCatAP = catList[0].ap || 1;
        var visible  = catList.slice(0, 4);

        visible.forEach(function(cat, i) {
          var ry   = yStart + i * ROW_H;
          var pct  = Math.round((cat.ap / totalAP) * 100);
          var barW = Math.round((cat.ap / maxCatAP) * BAR_MAX_W);
          var op   = OPACITIES[i] || '0.35';
          // Compact number format: 7820 → "7.8k", 999 → "999"
          var apStr = cat.ap >= 10000 ? (Math.round(cat.ap / 100) / 10) + 'k'
            : cat.ap >= 1000 ? (Math.round(cat.ap / 100) / 10) + 'k'
            : cat.ap.toLocaleString();

          // Category name
          out += '<text x="' + xLeft + '" y="' + ry + '"'
            + ' font-size="12" fill="#f0f0f0">'
            + escapeHtml(cat.name) + '</text>';

          // AP value right-aligned, colour fades with rank
          out += '<text x="' + xRight + '" y="' + ry + '"'
            + ' text-anchor="end" font-size="12" fill="' + CORAL + '"'
            + ' opacity="' + op + '" font-weight="600">'
            + escapeHtml(apStr) + '</text>';

          // Bar: background track + proportional fill
          out += '<rect x="' + xLeft + '" y="' + (ry + 5) + '"'
            + ' width="' + BAR_MAX_W + '" height="5" rx="2.5"'
            + ' fill="rgba(255,255,255,0.07)"/>';
          if (barW > 0) {
            out += '<rect x="' + xLeft + '" y="' + (ry + 5) + '"'
              + ' width="' + barW + '" height="5" rx="2.5"'
              + ' fill="' + CORAL + '" opacity="' + op + '"/>';
          }

          // Percentage sub-label
          out += '<text x="' + xLeft + '" y="' + (ry + 19) + '"'
            + ' font-size="10" fill="#4a6175">' + pct + '%</text>';
        });

        return out;
      }


      // ────────────────────────────────────────────────────────────────────────
      // WEEKLY SLIDE BUILDERS
      // ────────────────────────────────────────────────────────────────────────

      /**
       * Builds the full array of weekly slides.
       * @param {WeeklyReportData} data
       * @param {Object} periodInfo
       * @returns {Array<{html:string, caption:string}>}
       */
      function _rptBuildWeeklySlides(data, periodInfo) {
        var slides = [];
        var label  = 'Arka Readers Club · ' + periodInfo.label;
        var total  = 6; // updated at end

        // Slide 1: Cover
        slides.push({
          caption: 'Cover',
          html: _rptWeeklyCover(data, periodInfo, 1, total)
        });
        // Slide 2: Club Pulse
        slides.push({
          caption: 'Club pulse — key numbers, top readers, genre mix',
          html: _rptWeeklyPulse(data, periodInfo, 2, total)
        });
        // Slide 3: Daily breakdown
        slides.push({
          caption: 'Daily breakdown — pages per day',
          html: _rptWeeklyDaily(data, periodInfo, 3, total)
        });
        // Slide 4: Books finished
        slides.push({
          caption: 'Books finished this week',
          html: _rptWeeklyBooks(data, periodInfo, 4, total)
        });
        // Slide 5: Badges & social
        slides.push({
          caption: 'Badges awarded & social activity',
          html: _rptWeeklyBadgesSocial(data, periodInfo, 5, total)
        });
        // Slide 6: Closing
        slides.push({
          caption: 'Closing — see you next week',
          html: _rptWeeklyClosing(data, periodInfo, 6, total)
        });

        return slides;
      }

      /** Slide 1 — Weekly cover */
      function _rptWeeklyCover(data, periodInfo, n, t) {
        var c = RPT_COLORS;
        var inner = ''
          + '<div style="display:flex;flex-direction:column;align-items:center;'
          + 'justify-content:center;height:100%;text-align:center;">'
          // Arka logo — uses preloaded base64 if available, styled circle fallback otherwise
          + (RPT_LOGO_BASE64
              ? '<img src="' + RPT_LOGO_BASE64 + '" style="width:110px;height:110px;'
                + 'border-radius:50%;object-fit:cover;margin-bottom:28px;'
                + 'border:3px solid rgba(255,255,255,0.15);">'
              : '<div style="width:110px;height:110px;border-radius:50%;background:' + c.purple
                + ';display:flex;align-items:center;justify-content:center;'
                + 'font-size:44px;color:#fff;font-weight:700;margin-bottom:28px;">A</div>'
            )
          + '<div style="font-size:11px;letter-spacing:2.5px;color:' + c.purple
          + ';text-transform:uppercase;margin-bottom:12px;">Arka Readers Club</div>'
          + '<div style="font-size:34px;font-weight:700;color:' + c.white
          + ';margin-bottom:14px;">Weekly Reading Report</div>'
          + '<div style="font-size:16px;color:' + c.muted + ';">' + periodInfo.label + '</div>'
          + '</div>';

        return _rptSlideWrap(c.purple, inner, n, t, '');
      }

      /**
       * Builds the redesigned weekly pulse slide (slide 2).
       *
       * Layout: full-bleed SVG at 1200×675.
       *   - Large "WEEK IN NUMBERS" heading
       *   - 4 stat circles at 35% slide height, one per column
       *   - Below divider: reading-pattern rose (col1), books list (col2),
       *     top-readers (col3), AP-by-category (col4)
       *
       * Uses pre-computed SVG markup from the four helper functions so the
       * slide HTML is fully static — no runtime JavaScript in the slide div.
       *
       * @param {WeeklyReportData} data
       * @param {Object}           periodInfo
       * @param {number}           n  - Slide number (1-based)
       * @param {number}           t  - Total slides
       * @returns {string} Complete slide HTML (div wrapping a full SVG)
       */
      function _rptWeeklyPulse(data, periodInfo, n, t) {
        var c = RPT_COLORS;
        var F = _RPT_FONT;

        // ── Circle stat strings + adaptive font sizes ───────────────────────
        var pagesStr      = data.totalPages.toLocaleString();
        var pagesFontSize = pagesStr.length <= 5 ? 44 : pagesStr.length <= 7 ? 38 : 32;

        var booksStr      = data.totalBooksFinished.toLocaleString();
        var booksFontSize = booksStr.length <= 2 ? 52 : booksStr.length <= 4 ? 42 : 36;

        var readersStr      = String(data.activeMembers);
        var readersFontSize = readersStr.length <= 2 ? 52 : 40;

        var apDisplayStr  = _rptFmt(data.totalAP);
        var apFontSize    = apDisplayStr.length <= 3 ? 52 : apDisplayStr.length <= 5 ? 42 : 36;

        // ── Pages delta badge (shown only when a prior week exists) ──────────
        var pagesDeltaSvg = '';
        if (data.prevWeekPages > 0) {
          var deltaPct   = Math.round(
            ((data.totalPages - data.prevWeekPages) / data.prevWeekPages) * 100
          );
          var deltaStr   = (deltaPct >= 0 ? '+' : '') + deltaPct + '%';
          var deltaColor = deltaPct >= 0 ? '#1D9E75' : '#e74c3c';
          var pillW      = Math.max(58, deltaStr.length * 8 + 24);
          var pillX      = (150 - pillW / 2).toFixed(1);

          pagesDeltaSvg = '<rect x="' + pillX + '" y="150"'
            + ' width="' + pillW + '" height="23" rx="11.5"'
            + ' fill="' + deltaColor + '33"/>'
            + '<text x="150" y="167" text-anchor="middle"'
            + ' font-size="13" font-weight="700" fill="' + deltaColor + '">'
            + escapeHtml(deltaStr) + '</text>';
        }

        // Y positions for number + sub-label shift down when delta badge is present
        var pagesNumY = data.prevWeekPages > 0 ? 210 : 208;
        var pagesSubY = data.prevWeekPages > 0 ? 234 : 232;

        // ── Peak day label for rose callout ─────────────────────────────────
        var maxDayPages = Math.max.apply(null, data.pagesByDay.concat([0]));
        var peakDayIdx  = data.pagesByDay.indexOf(maxDayPages);
        var FULL_DAYS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        var peakStr     = maxDayPages > 0
          ? (FULL_DAYS[peakDayIdx] + ' · peak · ' + maxDayPages.toLocaleString() + ' pages')
          : 'No pages logged this week';
        // Approximate pill width: 7.5px per character + 20px padding
        var peakPillW = Math.max(140, peakStr.length * 7.5 + 20);
        var peakPillX = (150 - peakPillW / 2).toFixed(1);

        // ── Pre-build the four column SVG content blocks ─────────────────────
        // Col 1 (cx=150): 7-day reading pattern rose chart
        var roseSvg = _rptBuildRoseSvgContent_(data.pagesByDay, 150, 468, 70);

        // Col 2 (cx=450): up to 5 finished books | x: 322–578 | first row y: 358
        var booksSvg = _rptBuildBooksListSvg_(data.booksFinished, 322, 358, 578);

        // Col 3 (cx=750): top 5 readers | rank bubble at x=633, name at x=650 | first row y: 358
        var readersSvg = _rptBuildReadersListSvg_(data.topReaders, 622, 358, 878);

        // Col 4 (cx=1050): AP by activity | x: 928–1170 | first row y: 361
        var apSvg = _rptBuildApCategorySvg_(data.apCategoryList, data.totalAP, 928, 361, 1170);

        // ── Assemble the complete SVG ────────────────────────────────────────
        var svg = ''
          + '<svg viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg"'
          + ' width="1200" height="675" font-family="' + escapeHtml(F) + '">'

          // Background + accent bar
          + '<rect width="1200" height="675" fill="' + c.dark + '"/>'
          + '<rect width="1200" height="5" fill="' + c.purple + '"/>'

          // Subtle column dividers
          + '<line x1="300" y1="70" x2="300" y2="618"'
          + ' stroke="rgba(255,255,255,0.04)" stroke-width="1"/>'
          + '<line x1="600" y1="70" x2="600" y2="618"'
          + ' stroke="rgba(255,255,255,0.04)" stroke-width="1"/>'
          + '<line x1="900" y1="70" x2="900" y2="618"'
          + ' stroke="rgba(255,255,255,0.04)" stroke-width="1"/>'

          // Heading + date label
          + '<text x="58" y="55" font-size="38" font-weight="700"'
          + ' fill="#ffffff" letter-spacing="3">WEEK IN NUMBERS</text>'
          + '<text x="1144" y="55" font-size="13" fill="' + c.muted + '"'
          + ' text-anchor="end">' + escapeHtml(periodInfo.label) + '</text>'

          // ── C1: Pages / Purple ──
          + '<circle cx="150" cy="198" r="114" fill="none"'
          + ' stroke="' + c.purple + '" stroke-width="1" opacity="0.14"/>'
          + '<circle cx="150" cy="198" r="108" fill="#1e2d3d"'
          + ' stroke="' + c.purple + '" stroke-width="5.5"/>'
          + pagesDeltaSvg
          + '<text x="150" y="' + pagesNumY + '" text-anchor="middle"'
          + ' font-size="' + pagesFontSize + '" font-weight="700" fill="#ffffff">'
          + escapeHtml(pagesStr) + '</text>'
          + '<text x="150" y="' + pagesSubY + '" text-anchor="middle"'
          + ' font-size="12" fill="' + c.muted + '">pages read</text>'

          // ── C2: Books Finished / Teal ──
          + '<circle cx="450" cy="198" r="114" fill="none"'
          + ' stroke="' + c.teal + '" stroke-width="1" opacity="0.14"/>'
          + '<circle cx="450" cy="198" r="108" fill="#1e2d3d"'
          + ' stroke="' + c.teal + '" stroke-width="5.5"/>'
          + '<text x="450" y="212" text-anchor="middle"'
          + ' font-size="' + booksFontSize + '" font-weight="700" fill="#ffffff">'
          + escapeHtml(booksStr) + '</text>'
          + '<text x="450" y="238" text-anchor="middle"'
          + ' font-size="12" fill="' + c.muted + '">books finished</text>'

          // ── C3: Active Readers / Gold ──
          + '<circle cx="750" cy="198" r="114" fill="none"'
          + ' stroke="' + c.gold + '" stroke-width="1" opacity="0.14"/>'
          + '<circle cx="750" cy="198" r="108" fill="#1e2d3d"'
          + ' stroke="' + c.gold + '" stroke-width="5.5"/>'
          + '<text x="750" y="212" text-anchor="middle"'
          + ' font-size="' + readersFontSize + '" font-weight="700" fill="#ffffff">'
          + escapeHtml(readersStr) + '</text>'
          + '<text x="750" y="238" text-anchor="middle"'
          + ' font-size="12" fill="' + c.muted + '">active readers</text>'

          // ── C4: AP Earned / Coral ──
          + '<circle cx="1050" cy="198" r="114" fill="none"'
          + ' stroke="' + c.coral + '" stroke-width="1" opacity="0.14"/>'
          + '<circle cx="1050" cy="198" r="108" fill="#1e2d3d"'
          + ' stroke="' + c.coral + '" stroke-width="5.5"/>'
          + '<text x="1050" y="208" text-anchor="middle"'
          + ' font-size="' + apFontSize + '" font-weight="700" fill="#ffffff">'
          + escapeHtml(apDisplayStr) + '</text>'
          + '<text x="1050" y="235" text-anchor="middle"'
          + ' font-size="12" fill="' + c.muted + '">AP earned</text>'

          // Horizontal divider separating circles from content zone
          + '<line x1="20" y1="320" x2="1180" y2="320"'
          + ' stroke="rgba(255,255,255,0.07)" stroke-width="0.5"/>'

          // Section header labels — coloured to match their circle
          + '<text x="150" y="339" text-anchor="middle"'
          + ' font-size="10" font-weight="700" fill="' + c.purple + '"'
          + ' letter-spacing="1.8">READING PATTERN</text>'
          + '<text x="450" y="339" text-anchor="middle"'
          + ' font-size="10" font-weight="700" fill="' + c.teal + '"'
          + ' letter-spacing="1.8">BOOKS FINISHED</text>'
          + '<text x="750" y="339" text-anchor="middle"'
          + ' font-size="10" font-weight="700" fill="' + c.gold + '"'
          + ' letter-spacing="1.8">TOP READERS</text>'
          + '<text x="1050" y="339" text-anchor="middle"'
          + ' font-size="10" font-weight="700" fill="' + c.coral + '"'
          + ' letter-spacing="1.8">AP BY ACTIVITY</text>'

          // ── Col 1: Rose chart + peak callout ──
          + roseSvg
          + '<rect x="' + peakPillX + '" y="577"'
          + ' width="' + peakPillW.toFixed(0) + '" height="22" rx="11"'
          + ' fill="rgba(169,132,186,0.18)"/>'
          + '<text x="150" y="592" text-anchor="middle"'
          + ' font-size="12" font-weight="700" fill="' + c.purple + '">'
          + escapeHtml(peakStr) + '</text>'

          // ── Col 2: Books finished list ──
          + booksSvg

          // ── Col 3: Top readers list ──
          + readersSvg

          // ── Col 4: AP by activity breakdown ──
          + apSvg

          // Footer bar
          + '<rect y="620" width="1200" height="55" fill="rgba(255,255,255,0.03)"/>'
          + '<line x1="0" y1="620" x2="1200" y2="620"'
          + ' stroke="rgba(255,255,255,0.06)" stroke-width="0.5"/>'
          + '<text x="58" y="652" font-size="11" fill="' + c.muted + '">'
          + 'Arka Readers Club · ' + escapeHtml(periodInfo.label) + '</text>'
          + '<text x="1142" y="652" text-anchor="end"'
          + ' font-size="11" fill="' + c.muted + '">' + n + ' / ' + t + '</text>'

          + '</svg>';

        // Wrap in the slide container div at exact canvas dimensions
        return '<div style="width:' + RPT_SLIDE_W + 'px;height:' + RPT_SLIDE_H + 'px;'
          + 'overflow:hidden;position:relative;">'
          + svg
          + '</div>';
      }

      /**
       * Renders a single stat card (used in pulse slides).
       * @param {string} value     - Large number
       * @param {string} label     - Descriptor below
       * @param {string} deltaHtml - Pre-built delta badge HTML (can be empty)
       * @param {string} color     - Accent color
       * @returns {string}
       */
      function _rptStatCard(value, label, deltaHtml, color) {
        return '<div style="flex:1;background:#2c3e50;border-radius:10px;padding:16px 12px;'
          + 'border-top:3px solid ' + color + ';">'
          + '<div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:4px;">'
          + value + deltaHtml + '</div>'
          + '<div style="font-size:11px;color:#95a5a6;">' + label + '</div>'
          + '</div>';
      }

      /**
       * Builds a simple genre breakdown list with colour-coded bars.
       * @param {Object} genreBreakdown - { canonical: count }
       * @returns {string}
       */
      function _rptGenreDonut(genreBreakdown) {
        var palette = ['#A984BA','#1D9E75','#f39c12','#D85A30','#378ADD','#e74c3c','#27ae60'];
        var entries = Object.keys(genreBreakdown)
          .sort(function(a,b){ return genreBreakdown[b] - genreBreakdown[a]; })
          .slice(0, 6);
        var total   = entries.reduce(function(s, g) { return s + genreBreakdown[g]; }, 0) || 1;

        if (!entries.length) {
          return '<div style="font-size:12px;color:#95a5a6;font-style:italic;padding:20px 0;">No finished books this period.</div>';
        }

        return entries.map(function(genre, i) {
          var pct = Math.round((genreBreakdown[genre] / total) * 100);
          var col = palette[i % palette.length];
          return '<div style="margin-bottom:10px;">'
            + '<div style="display:flex;justify-content:space-between;'
            + 'font-size:11px;margin-bottom:3px;">'
            + '<span style="color:#fff;">' + escapeHtml(genre) + '</span>'
            + '<span style="color:#95a5a6;">' + pct + '%</span>'
            + '</div>'
            + _rptBar(pct, col, 7)
            + '</div>';
        }).join('');
      }

      /** Slide 3 — Daily breakdown bar chart */
      function _rptWeeklyDaily(data, periodInfo, n, t) {
        var c    = RPT_COLORS;
        var days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
        var maxV = Math.max(1, Math.max.apply(null, data.pagesByDay));
        var avg  = Math.round(data.pagesByDay.reduce(function(s,v){return s+v;},0) / 7);

        // Bar chart: bars are positioned absolutely within a fixed-height area
        var barAreaH = 340; // px in the 1200-wide slide
        var barW     = 90;
        var gapX     = 60;
        var startX   = 80;

        var bars = data.pagesByDay.map(function(v, i) {
          var barH   = Math.round((v / maxV) * barAreaH);
          var bx     = startX + i * (barW + gapX);
          var isMax  = v === maxV;
          var col    = isMax ? c.purple : 'rgba(169,132,186,0.4)';
          var by     = barAreaH - barH;

          return '<div style="position:absolute;left:' + bx + 'px;bottom:40px;width:' + barW + 'px;">'
            // Bar fill
            + '<div style="position:absolute;bottom:0;left:0;width:' + barW + 'px;height:' + barH + 'px;'
            + 'background:' + col + ';border-radius:5px 5px 0 0;"></div>'
            // Value label above bar
            + '<div style="position:absolute;bottom:' + (barH+4) + 'px;width:' + barW + 'px;'
            + 'text-align:center;font-size:11px;color:' + (isMax ? '#fff' : '#95a5a6') + ';font-weight:600;">'
            + v.toLocaleString() + '</div>'
            // Day label below
            + '<div style="position:absolute;bottom:-28px;width:' + barW + 'px;'
            + 'text-align:center;font-size:12px;color:#95a5a6;">' + days[i] + '</div>'
            + '</div>';
        }).join('');

        // Average line
        var avgY = Math.round((1 - avg / maxV) * barAreaH);

        var inner = ''
          + '<div style="font-size:10px;letter-spacing:2px;color:' + c.teal
          + ';text-transform:uppercase;margin-bottom:8px;">Daily Breakdown</div>'
          + '<div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:4px;">'
          + 'Pages Logged Per Day</div>'
          + '<div style="font-size:14px;color:#95a5a6;margin-bottom:24px;">All members combined · '
          + periodInfo.label + '</div>'
          // Chart container
          + '<div style="position:relative;height:' + (barAreaH + 60) + 'px;width:100%;">'
          + bars
          // Avg dashed line
          + '<div style="position:absolute;left:' + startX + 'px;right:20px;'
          + 'bottom:' + (40 + avgY) + 'px;height:1px;border-top:1.5px dashed ' + c.gold + ';"></div>'
          + '<div style="position:absolute;right:20px;bottom:' + (40 + avgY + 4) + 'px;'
          + 'font-size:10px;color:' + c.gold + ';">avg ' + avg + '</div>'
          + '</div>';

        return _rptSlideWrap(c.teal, inner, n, t, 'Arka Readers Club · ' + periodInfo.label);
      }

      /** Slide 4 — Books finished */
      function _rptWeeklyBooks(data, periodInfo, n, t) {
        var c = RPT_COLORS;
        var visible = data.booksFinished.slice(0, 6);
        var overflow = data.booksFinished.length - visible.length;

        var rows = visible.length
          ? visible.map(function(b) {
              return '<div style="display:flex;align-items:center;gap:14px;padding:10px 14px;'
                + 'background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:8px;'
                + 'border-left:4px solid ' + c.teal + ';">'
                + '<div style="font-size:22px;flex-shrink:0;">📖</div>'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="font-size:14px;font-weight:700;color:#fff;white-space:nowrap;'
                + 'overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(b.title) + '</div>'
                + '<div style="font-size:11px;color:#95a5a6;margin-top:2px;">'
                + escapeHtml(b.author) + '</div>'
                + '</div>'
                + '<div style="font-size:11px;color:' + c.teal + ';font-weight:600;flex-shrink:0;'
                + 'background:' + c.teal + '22;padding:4px 10px;border-radius:12px;">'
                + escapeHtml(b.memberName) + '</div>'
                + '</div>';
            }).join('')
          + (overflow > 0
              ? '<div style="font-size:12px;color:#95a5a6;text-align:center;padding:8px 0;">+ ' + overflow + ' more books</div>'
              : '')
          : '<div style="font-size:14px;color:#95a5a6;font-style:italic;padding:40px 0;text-align:center;">No books finished this week.</div>';

        var inner = ''
          + '<div style="font-size:10px;letter-spacing:2px;color:' + c.gold
          + ';text-transform:uppercase;margin-bottom:8px;">Shelf Activity</div>'
          + '<div style="display:flex;align-items:baseline;gap:20px;margin-bottom:20px;">'
          + '<div style="font-size:28px;font-weight:700;color:#fff;">Books Finished</div>'
          + '<div style="font-size:42px;font-weight:700;color:' + c.teal + ';line-height:1;">'
          + data.totalBooksFinished + '</div>'
          + '</div>'
          + rows;

        return _rptSlideWrap(c.gold, inner, n, t, 'Arka Readers Club · ' + periodInfo.label);
      }

      /** Slide 5 — Badges awarded & social activity */
      function _rptWeeklyBadgesSocial(data, periodInfo, n, t) {
        var c = RPT_COLORS;

        var badgeRows = data.badgesAwarded.length
          ? data.badgesAwarded.slice(0, 5).map(function(b) {
              // Only show tier label when tier > 0 — special/untiered badges have tier = 0
              var tierLabel = b.tier > 0 ? ' · Tier ' + b.tier : '';
              return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;'
                + 'background:' + b.accentColor + '18;border-radius:8px;margin-bottom:8px;'
                + 'border-left:3px solid ' + b.accentColor + ';">'
                + '<span style="font-size:20px;flex-shrink:0;">' + b.categoryIcon + '</span>'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;'
                + 'overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(b.badgeName) + '</div>'
                + '<div style="font-size:11px;color:#95a5a6;">'
                + escapeHtml(b.memberName) + tierLabel + '</div>'
                + '</div></div>';
            }).join('')
          : '<div style="font-size:12px;color:#95a5a6;font-style:italic;padding:20px 0;">No badges awarded this week.</div>';

        var postRows = data.bookPosts.length
          ? data.bookPosts.slice(0, 3).map(function(p) {
              var excerpt = p.postText.length > 120
                ? p.postText.substring(0, 120) + '…'
                : p.postText;
              return '<div style="background:rgba(255,255,255,0.05);border-radius:8px;'
                + 'padding:12px 14px;margin-bottom:10px;">'
                + '<div style="font-size:11px;font-weight:700;color:' + c.purple
                + ';margin-bottom:5px;">' + escapeHtml(p.memberName) + '</div>'
                + '<div style="font-size:12px;color:#bdc3c7;line-height:1.5;">'
                + escapeHtml(excerpt) + '</div>'
                + '</div>';
            }).join('')
          : '<div style="font-size:12px;color:#95a5a6;font-style:italic;padding:20px 0;">No book posts this week.</div>';

        var inner = ''
          + '<div style="font-size:10px;letter-spacing:2px;color:' + c.coral
          + ';text-transform:uppercase;margin-bottom:8px;">Social & Achievements</div>'
          + '<div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:18px;">Activity Highlights</div>'
          + '<div style="display:flex;gap:20px;height:calc(100% - 80px);">'
          + '<div style="flex:1;">'
          + '<div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:10px;">'
          + '🏅 Badges Awarded (' + data.badgesAwarded.length + ')</div>'
          + badgeRows
          + '</div>'
          + '<div style="flex:1;">'
          + '<div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:10px;">'
          + '📝 Book Posts (' + data.bookPosts.length + ')</div>'
          + postRows
          + '</div>'
          + '</div>';

        return _rptSlideWrap(c.coral, inner, n, t, 'Arka Readers Club · ' + periodInfo.label);
      }

      /** Slide 6 — Weekly closing */
      function _rptWeeklyClosing(data, periodInfo, n, t) {
        var c = RPT_COLORS;
        var inner = ''
          + '<div style="display:flex;flex-direction:column;align-items:center;'
          + 'justify-content:center;height:100%;text-align:center;">'
          + '<div style="font-size:40px;margin-bottom:20px;">📚</div>'
          + '<div style="font-size:34px;font-weight:700;color:#fff;margin-bottom:12px;">Keep Reading!</div>'
          + '<div style="font-size:16px;color:#95a5a6;margin-bottom:36px;">See you next week, Arka.</div>'
          // Summary pill
          + '<div style="background:#2c3e50;border-radius:12px;padding:20px 40px;'
          + 'display:inline-block;margin-bottom:36px;">'
          + '<div style="font-size:12px;color:#95a5a6;margin-bottom:6px;">This week</div>'
          + '<div style="font-size:28px;font-weight:700;color:' + c.purple + ';margin-bottom:4px;">'
          + _rptFmt(data.totalPages) + ' pages</div>'
          + '<div style="font-size:13px;color:#95a5a6;">'
          + 'across ' + data.totalBooksFinished + ' books finished · '
          + data.activeMembers + ' active readers</div>'
          + '</div>'
          + '<div style="font-size:11px;color:#95a5a6;">Generated by Arka Club App</div>'
          + '</div>';

        return _rptSlideWrap(c.purple, inner, n, t, '');
      }

      // ────────────────────────────────────────────────────────────────────────
      // MONTHLY SLIDE BUILDERS
      // ────────────────────────────────────────────────────────────────────────

      /**
       * Builds the full array of monthly slides.
       * @param {MonthlyReportData} data
       * @param {Object} periodInfo
       * @returns {Array<{html:string, caption:string}>}
       */
      function _rptBuildMonthlySlides(data, periodInfo) {
        var slides = [];
        var total  = 7;

        slides.push({ caption: 'Cover', html: _rptMonthlyCover(data, periodInfo, 1, total) });
        slides.push({ caption: 'Month totals + month-over-month comparison', html: _rptMonthlyTotals(data, periodInfo, 2, total) });
        slides.push({ caption: 'Member leaderboard — pages + books', html: _rptMonthlyLeaderboard(data, periodInfo, 3, total) });
        slides.push({ caption: 'Genre analysis — what Arka read this month', html: _rptMonthlyGenres(data, periodInfo, 4, total) });
        slides.push({ caption: 'Badges awarded + milestones', html: _rptMonthlyBadgesMilestones(data, periodInfo, 5, total) });
        slides.push({ caption: 'Club totals — all-time progress', html: _rptMonthlyClubTotals(data, periodInfo, 6, total) });
        slides.push({ caption: 'Closing — month wrap-up', html: _rptMonthlyClosing(data, periodInfo, 7, total) });

        return slides;
      }

      /** Slide 1 — Monthly cover */
      function _rptMonthlyCover(data, periodInfo, n, t) {
        var c = RPT_COLORS;
        var inner = ''
          + '<div style="display:flex;flex-direction:column;align-items:center;'
          + 'justify-content:center;height:100%;text-align:center;">'
          // Arka logo — uses preloaded base64 if available, gold circle fallback otherwise
          + (RPT_LOGO_BASE64
              ? '<img src="' + RPT_LOGO_BASE64 + '" style="width:120px;height:120px;'
                + 'border-radius:50%;object-fit:cover;margin-bottom:28px;'
                + 'border:4px solid ' + c.gold + ';">'
              : '<div style="width:110px;height:110px;border-radius:50%;background:' + c.gold
                + ';display:flex;align-items:center;justify-content:center;'
                + 'font-size:44px;color:#1a252f;font-weight:700;margin-bottom:28px;">A</div>'
            )
          + '<div style="font-size:11px;letter-spacing:2.5px;color:' + c.gold
          + ';text-transform:uppercase;margin-bottom:12px;">Arka Readers Club</div>'
          + '<div style="font-size:34px;font-weight:700;color:#fff;margin-bottom:14px;">Monthly Reading Report</div>'
          + '<div style="font-size:20px;color:#95a5a6;">' + periodInfo.label + '</div>'
          + '</div>';

        return _rptSlideWrap(c.gold, inner, n, t, '');
      }

      /** Slide 2 — Month totals + MoM comparison */
      function _rptMonthlyTotals(data, periodInfo, n, t) {
        var c   = RPT_COLORS;
        var mom = data.momComparison;

        var statCards = ''
          + _rptStatCard(_rptFmt(data.totalPages), 'pages read',
              _rptDeltaHtml(data.totalPages, mom.pages, c.teal), c.purple)
          + _rptStatCard(String(data.totalBooksFinished), 'books finished',
              _rptDeltaHtml(data.totalBooksFinished, mom.books, c.teal), c.teal)
          + _rptStatCard(String(data.activeMembers), 'active readers',
              _rptDeltaHtml(data.activeMembers, mom.activeMembers, c.teal), c.gold)
          + _rptStatCard(_rptFmt(data.totalAP), 'AP earned',
              _rptDeltaHtml(data.totalAP, mom.ap, c.teal), c.coral);

        // MoM comparison table
        var compareRows = [
          ['Pages read', _rptFmt(data.totalPages), _rptFmt(mom.pages)],
          ['Books finished', String(data.totalBooksFinished), String(mom.books)],
          ['Active readers', String(data.activeMembers), String(mom.activeMembers)],
          ['AP earned', _rptFmt(data.totalAP), _rptFmt(mom.ap)]
        ].map(function(row, i) {
          return '<div style="display:flex;align-items:center;gap:12px;padding:10px 16px;'
            + 'background:' + (i%2===0 ? 'rgba(255,255,255,0.04)':'rgba(255,255,255,0.02)')
            + ';border-radius:6px;margin-bottom:4px;">'
            + '<div style="flex:1;font-size:12px;color:#fff;font-weight:500;">' + row[0] + '</div>'
            + '<div style="width:100px;text-align:right;font-size:13px;font-weight:700;color:#fff;">' + row[1] + '</div>'
            + '<div style="width:80px;text-align:right;font-size:12px;color:#95a5a6;">' + row[2] + '</div>'
            + '</div>';
        }).join('');

        var inner = ''
          + '<div style="font-size:10px;letter-spacing:2px;color:' + c.gold
          + ';text-transform:uppercase;margin-bottom:10px;">Monthly Totals</div>'
          + '<div style="font-size:26px;font-weight:700;color:#fff;margin-bottom:14px;">'
          + periodInfo.label + ' at a Glance</div>'
          + '<div style="display:flex;gap:12px;margin-bottom:20px;">' + statCards + '</div>'
          // MoM table
          + '<div style="background:#2c3e50;border-radius:10px;padding:14px 10px;">'
          + '<div style="display:flex;gap:12px;padding:4px 16px 10px;'
          + 'border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:6px;">'
          + '<div style="flex:1;font-size:10px;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;">Metric</div>'
          + '<div style="width:100px;text-align:right;font-size:10px;color:#fff;text-transform:uppercase;letter-spacing:1px;">This month</div>'
          + '<div style="width:80px;text-align:right;font-size:10px;color:#95a5a6;text-transform:uppercase;letter-spacing:1px;">Last month</div>'
          + '</div>'
          + compareRows
          + '</div>';

        return _rptSlideWrap(c.gold, inner, n, t, 'Arka Readers Club · ' + periodInfo.label);
      }

      /** Slide 3 — Member leaderboard */
      function _rptMonthlyLeaderboard(data, periodInfo, n, t) {
        var c    = RPT_COLORS;
        var ranks = ['🥇','🥈','🥉'];
        var maxP  = data.topReaders.length ? data.topReaders[0].pages : 1;

        var rows = data.topReaders.map(function(r, i) {
          var isTop  = i === 0;
          var accent = isTop ? c.purple : 'rgba(255,255,255,0.15)';
          return '<div style="display:flex;align-items:center;gap:14px;padding:' + (isTop?'14px':'10px') + ' 16px;'
            + 'background:' + (isTop?'rgba(169,132,186,0.15)':'rgba(255,255,255,0.04)') + ';'
            + 'border-radius:10px;margin-bottom:8px;'
            + (isTop ? 'border-top:2px solid ' + c.purple + ';' : '') + '">'
            + '<div style="font-size:' + (isTop?'22px':'18px') + ';width:30px;text-align:center;">'
            + (ranks[i] || String(i+1) + '.') + '</div>'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-size:' + (isTop?'16px':'13px') + ';font-weight:700;color:#fff;">'
            + escapeHtml(r.displayName) + '</div>'
            + '<div style="margin-top:4px;">' + _rptBar(r.pct, c.purple, isTop?7:5) + '</div>'
            + '</div>'
            + '<div style="text-align:right;flex-shrink:0;">'
            + '<div style="font-size:' + (isTop?'15px':'12px') + ';font-weight:700;color:#fff;">'
            + r.pages.toLocaleString() + ' pages</div>'
            + '<div style="font-size:11px;color:#95a5a6;">' + r.books + ' books</div>'
            + '</div>'
            + '</div>';
        }).join('');

        var empty = '<div style="font-size:14px;color:#95a5a6;font-style:italic;padding:40px 0;text-align:center;">No reading activity logged this month.</div>';

        var inner = ''
          + '<div style="font-size:10px;letter-spacing:2px;color:' + c.purple
          + ';text-transform:uppercase;margin-bottom:8px;">Leaderboard</div>'
          + '<div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:18px;">'
          + 'Top Readers — ' + periodInfo.label + '</div>'
          + (data.topReaders.length ? rows : empty);

        return _rptSlideWrap(c.purple, inner, n, t, 'Arka Readers Club · ' + periodInfo.label);
      }

      /** Slide 4 — Genre analysis */
      function _rptMonthlyGenres(data, periodInfo, n, t) {
        var c       = RPT_COLORS;
        var palette = ['#A984BA','#1D9E75','#f39c12','#D85A30','#378ADD','#e74c3c','#27ae60','#9b59b6'];
        var entries = Object.keys(data.genreBreakdown)
          .sort(function(a,b){ return data.genreBreakdown[b] - data.genreBreakdown[a]; })
          .slice(0, 8);
        var total   = entries.reduce(function(s,g){ return s + data.genreBreakdown[g]; }, 0) || 1;

        var bars = entries.length
          ? entries.map(function(genre, i) {
              var pct = Math.round((data.genreBreakdown[genre] / total) * 100);
              var col = palette[i % palette.length];
              return '<div style="margin-bottom:13px;">'
                + '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">'
                + '<span style="font-size:13px;color:#fff;font-weight:500;">' + escapeHtml(genre) + '</span>'
                + '<span style="font-size:12px;color:#95a5a6;">' + data.genreBreakdown[genre]
                + ' book' + (data.genreBreakdown[genre] !== 1 ? 's' : '') + ' · ' + pct + '%</span>'
                + '</div>'
                + _rptBar(pct, col, 9)
                + '</div>';
            }).join('')
          : '<div style="font-size:14px;color:#95a5a6;font-style:italic;padding:40px 0;text-align:center;">No finished books with genre tags this month.</div>';

        var inner = ''
          + '<div style="font-size:10px;letter-spacing:2px;color:' + c.teal
          + ';text-transform:uppercase;margin-bottom:8px;">Genre Analysis</div>'
          + '<div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:6px;">'
          + 'What Arka Read</div>'
          + '<div style="font-size:14px;color:#95a5a6;margin-bottom:20px;">'
          + data.totalBooksFinished + ' books finished · ' + periodInfo.label + '</div>'
          + bars;

        return _rptSlideWrap(c.teal, inner, n, t, 'Arka Readers Club · ' + periodInfo.label);
      }

      /** Slide 5 — Badges awarded + milestones */
      function _rptMonthlyBadgesMilestones(data, periodInfo, n, t) {
        var c = RPT_COLORS;

        var badgeRows = data.badgesAwarded.length
          ? data.badgesAwarded.slice(0, 6).map(function(b) {
              // Only show tier label when tier > 0 — special/untiered badges have tier = 0
              var tierLabel = b.tier > 0 ? ' · T' + b.tier : '';
              return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;'
                + 'background:' + b.accentColor + '18;border-radius:8px;margin-bottom:7px;'
                + 'border-left:3px solid ' + b.accentColor + ';">'
                + '<span style="font-size:18px;flex-shrink:0;">' + b.categoryIcon + '</span>'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;'
                + 'overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(b.badgeName) + '</div>'
                + '<div style="font-size:11px;color:#95a5a6;">'
                + escapeHtml(b.memberName) + tierLabel + '</div>'
                + '</div></div>';
            }).join('')
          : '<div style="font-size:12px;color:#95a5a6;font-style:italic;padding:10px 0;">No badges this month.</div>';

        var milestoneRows = data.milestones.length
          ? data.milestones.slice(0, 5).map(function(m) {
              return '<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">'
                + '<div style="width:8px;height:8px;border-radius:50%;background:' + m.color
                + ';margin-top:4px;flex-shrink:0;"></div>'
                + '<div>'
                + '<div style="font-size:12px;font-weight:700;color:#fff;">' + escapeHtml(m.memberName) + '</div>'
                + '<div style="font-size:11px;color:#95a5a6;">' + escapeHtml(m.text) + '</div>'
                + '</div></div>';
            }).join('')
          : '<div style="font-size:12px;color:#95a5a6;font-style:italic;padding:10px 0;">No lifetime milestones this month.</div>';

        var inner = ''
          + '<div style="font-size:10px;letter-spacing:2px;color:' + c.coral
          + ';text-transform:uppercase;margin-bottom:8px;">Achievements</div>'
          + '<div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:16px;">Badges & Milestones</div>'
          + '<div style="display:flex;gap:20px;height:calc(100% - 80px);">'
          + '<div style="flex:1;">'
          + '<div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:10px;">'
          + '🏅 Badges Awarded (' + data.badgesAwarded.length + ')</div>'
          + badgeRows
          + '</div>'
          + '<div style="flex:1;">'
          + '<div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:10px;">🎉 Member Milestones</div>'
          + milestoneRows
          + '</div>'
          + '</div>';

        return _rptSlideWrap(c.coral, inner, n, t, 'Arka Readers Club · ' + periodInfo.label);
      }

      /** Slide 6 — Club all-time totals */
      function _rptMonthlyClubTotals(data, periodInfo, n, t) {
        var c = RPT_COLORS;

        // Sum lifetime stats from rptMembersDB
        var lifetimePages = 0;
        var lifetimeBooks = 0;
        var totalMembers  = rptMembersDB.length;
        rptMembersDB.forEach(function(m) {
          lifetimePages += Number(m.pages) || 0;
          lifetimeBooks += Number(m.books) || 0;
        });

        var statCards = ''
          + _rptStatCard(_rptFmt(lifetimePages), 'pages all-time', '', c.purple)
          + _rptStatCard(_rptFmt(lifetimeBooks), 'books finished all-time', '', c.teal)
          + _rptStatCard(String(totalMembers), 'total members', '', c.gold)
          + _rptStatCard(String(rptBadgeAwardsDB.filter(function(a){ return a.status==='Active'; }).length), 'badges held', '', c.coral);

        // Top 3 readers all-time
        var allTimeTop = rptMembersDB
          .slice()
          .sort(function(a, b) { return (Number(b.pages)||0) - (Number(a.pages)||0); })
          .slice(0, 3);
        var allTimeRows = allTimeTop.map(function(m, i) {
          var medals = ['🥇','🥈','🥉'];
          return '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;'
            + 'background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:7px;">'
            + '<span style="font-size:20px;">' + medals[i] + '</span>'
            + '<div style="flex:1;">'
            + '<div style="font-size:13px;font-weight:700;color:#fff;">' + escapeHtml(m.displayName) + '</div>'
            + '<div style="font-size:11px;color:#95a5a6;">'
            + (Number(m.pages)||0).toLocaleString() + ' pages · '
            + (Number(m.books)||0) + ' books</div>'
            + '</div></div>';
        }).join('');

        var inner = ''
          + '<div style="font-size:10px;letter-spacing:2px;color:' + c.purple
          + ';text-transform:uppercase;margin-bottom:8px;">Club Totals</div>'
          + '<div style="font-size:28px;font-weight:700;color:#fff;margin-bottom:14px;">All-Time Progress</div>'
          + '<div style="display:flex;gap:12px;margin-bottom:20px;">' + statCards + '</div>'
          + '<div style="background:#2c3e50;border-radius:10px;padding:14px;">'
          + '<div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:10px;">🏆 All-Time Top 3 Readers</div>'
          + allTimeRows
          + '</div>';

        return _rptSlideWrap(c.purple, inner, n, t, 'Arka Readers Club · ' + periodInfo.label);
      }

      /** Slide 7 — Monthly closing */
      function _rptMonthlyClosing(data, periodInfo, n, t) {
        var c = RPT_COLORS;
        var inner = ''
          + '<div style="display:flex;flex-direction:column;align-items:center;'
          + 'justify-content:center;height:100%;text-align:center;">'
          + '<div style="font-size:44px;margin-bottom:20px;">📚</div>'
          + '<div style="font-size:32px;font-weight:700;color:#fff;margin-bottom:10px;">'
          + periodInfo.label + ' wrapped!</div>'
          + '<div style="font-size:16px;color:#95a5a6;margin-bottom:32px;">What a month for Arka.</div>'
          + '<div style="background:#2c3e50;border-radius:14px;padding:22px 50px;margin-bottom:32px;">'
          + '<div style="font-size:12px;color:#95a5a6;margin-bottom:6px;">In ' + periodInfo.label + ', Arka read</div>'
          + '<div style="font-size:38px;font-weight:700;color:' + c.gold + ';margin-bottom:6px;">'
          + _rptFmt(data.totalPages) + ' pages</div>'
          + '<div style="font-size:14px;color:#95a5a6;">across ' + data.totalBooksFinished
          + ' books · ' + data.activeMembers + ' active readers</div>'
          + '</div>'
          + '<div style="font-size:13px;color:#95a5a6;">Generated by Arka Club App</div>'
          + '</div>';

        return _rptSlideWrap(c.gold, inner, n, t, '');
      }

      // ── Export functions ──────────────────────────────────────────────────────

      /**
       * Exports all slides as individual JPEG images.
       * On desktop: downloads each slide as a separate file.
       * On mobile: uses the Web Share API if available, otherwise downloads.
       *
       * Requires html2canvas (loaded lazily from CDN on first use).
       */
      function rptExportImages() {
        if (!rptSlides.length) { showToast('No slides to export.'); return; }

        var btn = document.getElementById('rptShareImagesBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generating…'; }

        _rptLoadHtml2Canvas(function() {
          _rptCaptureSlidesSequentially(
            rptSlides,
            function(canvases) {
              if (btn) { btn.disabled = false; btn.innerHTML = '📲 Share Images'; }
              var dataUrls = canvases.map(function(c) { return c.toDataURL('image/jpeg', 0.92); });
              _rptShareOrDownload(dataUrls);
            },
            function(err) {
              if (btn) { btn.disabled = false; btn.innerHTML = '📲 Share Images'; }
              showToast('Image export failed. Try again.');
              console.error('rptExportImages error:', err);
            }
          );
        });
      }

      /**
       * Exports all slides as a single landscape PDF.
       * Page dimensions: 1200×675 pt — matches slide aspect ratio exactly.
       *
       * Requires html2canvas + jsPDF (both loaded lazily from CDN on first use).
       */
      function rptExportPdf() {
        if (!rptSlides.length) { showToast('No slides to export.'); return; }

        var btn = document.getElementById('rptExportPdfBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Generating PDF…'; }

        _rptLoadHtml2Canvas(function() {
          _rptLoadJsPdf(function() {
            _rptCaptureSlidesSequentially(
              rptSlides,
              function(canvases) {
                try {
                  // jsPDF in landscape, using px unit at 96dpi
                  var doc = new window.jspdf.jsPDF({
                    orientation: 'landscape',
                    unit       : 'px',
                    format     : [RPT_SLIDE_W, RPT_SLIDE_H],
                    hotfixes   : ['px_scaling']
                  });

                  canvases.forEach(function(canvas, i) {
                    if (i > 0) doc.addPage([RPT_SLIDE_W, RPT_SLIDE_H], 'landscape');
                    doc.addImage(
                      canvas.toDataURL('image/jpeg', 0.92),
                      'JPEG', 0, 0, RPT_SLIDE_W, RPT_SLIDE_H
                    );
                  });

                  // Build filename: "Arka_Weekly_Report_2025-W14.pdf" etc.
                  var periodInfo = _rptGetPeriodInfo();
                  var fileName   = 'Arka_' + (rptMode === 'weekly' ? 'Weekly' : 'Monthly')
                    + '_Report_' + periodInfo.label.replace(/[\s–—\/]/g, '_') + '.pdf';

                  doc.save(fileName);
                  showToast('PDF exported! 📄');
                } catch (pdfErr) {
                  showToast('PDF generation failed. Try again.');
                  console.error('rptExportPdf jsPDF error:', pdfErr);
                }
                if (btn) { btn.disabled = false; btn.innerHTML = '📄 Export PDF'; }
              },
              function(err) {
                if (btn) { btn.disabled = false; btn.innerHTML = '📄 Export PDF'; }
                showToast('PDF export failed. Try again.');
                console.error('rptExportPdf capture error:', err);
              }
            );
          });
        });
      }

      /**
       * Captures each slide sequentially using html2canvas.
       * Renders each slide into a hidden off-screen fixed element at the native
       * 1200×675 slide dimensions — no CSS transforms, no clipping — so html2canvas
       * always captures the full slide area.
       *
       * The visible #rptSlideCanvas is NOT used here to avoid the CSS transform
       * scale that shrinks it to fit the phone screen (which would give html2canvas
       * only the top-left corner of the content).
       *
       * @param {Array<{html:string}>} slides   - Slide objects to capture
       * @param {function(HTMLCanvasElement[])} onSuccess
       * @param {function(Error)}              onError
       */
      function _rptCaptureSlidesSequentially(slides, onSuccess, onError) {
        var canvases = [];

        // Create a hidden off-screen capture container at exact native slide size.
        // position:fixed + left far off-screen = renders at true size, invisible to user.
        var captureEl = document.createElement('div');
        captureEl.style.cssText = [
          'position:fixed',
          'left:-2000px',
          'top:0',
          'width:'  + RPT_SLIDE_W + 'px',
          'height:' + RPT_SLIDE_H + 'px',
          'overflow:hidden',
          'background:#1a252f',
          'font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif',
          'z-index:-9999'
        ].join(';');
        document.body.appendChild(captureEl);

        function captureNext(idx) {
          if (idx >= slides.length) {
            // All slides captured — remove the off-screen element and restore the visible slide
            document.body.removeChild(captureEl);
            _rptRenderCurrentSlide();
            onSuccess(canvases);
            return;
          }

          // Render this slide's HTML into the off-screen capture element
          captureEl.innerHTML = slides[idx].html;

          // Allow 100ms for fonts and inline images to paint before capture
          setTimeout(function() {
            html2canvas(captureEl, {
              width           : RPT_SLIDE_W,
              height          : RPT_SLIDE_H,
              scale           : 2,           // 2× pixel density for retina-quality output
              useCORS         : true,
              allowTaint      : false,
              backgroundColor : '#1a252f',
              logging         : false
            }).then(function(capturedCanvas) {
              canvases.push(capturedCanvas);
              captureNext(idx + 1);
            }).catch(function(err) {
              document.body.removeChild(captureEl);
              onError(err);
            });
          }, 100);
        }

        captureNext(0);
      }

      /**
       * Shares an array of JPEG data-URIs using the Web Share API (if supported)
       * or falls back to sequential download links.
       *
       * @param {string[]} dataUrls - Array of JPEG data-URI strings
       */
      function _rptShareOrDownload(dataUrls) {
        var periodInfo = _rptGetPeriodInfo();
        var baseName   = 'Arka_' + (rptMode === 'weekly' ? 'Weekly' : 'Monthly')
          + '_' + periodInfo.label.replace(/[\s–—\/]/g, '_');

        // Try Web Share API (works on Android Chrome + iOS Safari for images)
        if (navigator.share && navigator.canShare) {
          var sharePromises = dataUrls.map(function(dataUrl, i) {
            return fetch(dataUrl)
              .then(function(res) { return res.blob(); })
              .then(function(blob) {
                return new File([blob], baseName + '_Slide' + (i+1) + '.jpg',
                  { type: 'image/jpeg' });
              });
          });

          Promise.all(sharePromises).then(function(files) {
            var shareData = { files: files, title: 'Arka Report' };
            if (navigator.canShare(shareData)) {
              return navigator.share(shareData);
            }
            throw new Error('canShare returned false — falling back to download');
          }).then(function() {
            showToast('Report shared! ✓');
          }).catch(function() {
            // Fall back to download if share fails or is cancelled
            _rptDownloadImages(dataUrls, baseName);
          });
        } else {
          _rptDownloadImages(dataUrls, baseName);
        }
      }

      /**
       * Downloads each image as a separate file.
       * Creates temporary <a> elements and clicks them sequentially with a short delay
       * so browsers don't block the download chain.
       *
       * @param {string[]} dataUrls
       * @param {string}   baseName - Filename prefix (no extension)
       */
      function _rptDownloadImages(dataUrls, baseName) {
        dataUrls.forEach(function(dataUrl, i) {
          setTimeout(function() {
            var a  = document.createElement('a');
            a.href = dataUrl;
            a.download = baseName + '_Slide' + (i + 1) + '.jpg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }, i * 200); // 200ms stagger prevents browser blocking
        });
        showToast('Downloading ' + dataUrls.length + ' slides…');
      }

      // ── Lazy CDN loaders ──────────────────────────────────────────────────────

      /**
       * Loads html2canvas from CDN if not already present, then calls callback.
       * Uses a guard so multiple simultaneous callers don't double-load.
       *
       * @param {function} callback
       */
      function _rptLoadHtml2Canvas(callback) {
        if (window.html2canvas) { callback(); return; }

        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
        script.onload  = callback;
        script.onerror = function() {
          showToast('Could not load image export library. Check your connection.');
        };
        document.head.appendChild(script);
      }

      /**
       * Loads jsPDF from CDN if not already present, then calls callback.
       *
       * @param {function} callback
       */
      function _rptLoadJsPdf(callback) {
        if (window.jspdf) { callback(); return; }

        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        script.onload  = callback;
        script.onerror = function() {
          showToast('Could not load PDF library. Check your connection.');
        };
        document.head.appendChild(script);
      }
      // ── END CLUB REPORTS ─────────────────────────────────────────────────────

  /* Expose reports engine functions needed by onclick= attributes */
  window.switchReportMode = switchReportMode;
  window.rptShiftPeriod   = rptShiftPeriod;
  window.rptPrevSlide     = rptPrevSlide;
  window.rptNextSlide     = rptNextSlide;
  window.rptGoToSlide     = rptGoToSlide;
  window.rptExportImages  = rptExportImages;
  window.rptExportPdf     = rptExportPdf;
  window.rptLoadData      = admLoadReportsData; // Retry button in error state

})(); // end IIFE
