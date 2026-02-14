/**
 * Engagement panel for Meeting SDK flow.
 * Calls backend at API_BASE; meetingId = Zoom meeting number, userId = displayName for demo.
 */
(function () {
  var API_BASE = 'http://localhost:3000';
  let meetingId = null;
  let displayName = null;

  function getMeetingId() {
    return meetingId || document.getElementById('meeting-number')?.value?.replace(/\s/g, '') || 'demo';
  }

  function getDisplayName() {
    return displayName || document.getElementById('user-name')?.value || 'Student';
  }

  function getUserId() {
    return (displayName || 'student') + '-' + Math.random().toString(36).slice(2, 8);
  }

  function showError(msg) {
    const el = document.getElementById('engagement-error');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  function runAgents() {
    const mid = getMeetingId();
    const btn = document.getElementById('run-agents-btn');
    btn.disabled = true;
    btn.textContent = 'Running…';
    showError(null);
    fetch(API_BASE + '/api/meetings/' + encodeURIComponent(mid) + '/run-agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((r) => r.json())
      .then((data) => {
        const summary = data.engagementSummary;
        const meter = document.getElementById('engagement-meter');
        meter.textContent = summary?.class_engagement != null ? summary.class_engagement : '—';
        meter.className = 'meter';
        if (summary?.class_engagement === 1) meter.classList.add('low');
        else if (summary?.class_engagement === 2) meter.classList.add('mid');
        else if (summary?.class_engagement === 3) meter.classList.add('high');
        document.getElementById('engagement-summary').textContent = summary?.summary || '—';
        if (data.poll) renderPoll(data.poll);
      })
      .catch((e) => showError('Run agents failed: ' + e.message))
      .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Run agents';
      });
  }

  function generatePoll() {
    const mid = getMeetingId();
    const btn = document.getElementById('generate-poll-btn');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    showError(null);
    fetch(API_BASE + '/api/meetings/' + encodeURIComponent(mid) + '/generate-poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'Quick check' }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.poll) renderPoll(data.poll);
      })
      .catch((e) => showError('Generate poll failed: ' + e.message))
      .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Generate poll';
      });
  }

  function renderPoll(poll) {
    const wrap = document.getElementById('poll-result');
    const content = document.getElementById('poll-content');
    if (!poll || !poll.questions || !poll.questions.length) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'block';
    content.innerHTML = poll.questions
      .map(
        (q) =>
          '<div style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1);">' +
          '<div style="font-weight:500;margin-bottom:4px;">' +
          escapeHtml(q.question) +
          '</div>' +
          (q.options
            ? '<ul style="margin:0;padding-left:16px;">' +
              q.options.map((o) => '<li>' + escapeHtml(o) + '</li>').join('') +
              '</ul>'
            : '') +
          '</div>'
      )
      .join('');
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function sendSelfReport(value) {
    const mid = getMeetingId();
    const uid = getUserId();
    const name = getDisplayName();
    fetch(API_BASE + '/api/meetings/' + encodeURIComponent(mid) + '/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'SELF_REPORT',
        userId: uid,
        displayName: name,
        value: value,
      }),
    }).catch((e) => showError('Self report failed: ' + e.message));
  }

  window.EngagementPanel = {
    onJoin: function (meetingNumber, userName, role) {
      meetingId = String(meetingNumber || 'demo').replace(/\s/g, '');
      displayName = userName || 'Student';
      window._engagementRole = role;
    },
    onMeetingJoined: function (role) {
      var r = role !== undefined ? role : window._engagementRole;
      var isStudent = r === 0 || r === undefined;
      var sidebar = document.getElementById('engagement-sidebar');
      if (sidebar) {
        sidebar.style.display = isStudent ? 'block' : 'none';
      }
      document.body.classList.toggle('student-panel-open', isStudent);
    },
    hide: function () {
      var sidebar = document.getElementById('engagement-sidebar');
      if (sidebar) sidebar.style.display = 'none';
      document.body.classList.remove('student-panel-open');
    },
  };

  function toggleCollapse() {
    var sidebar = document.getElementById('engagement-sidebar');
    var btn = document.getElementById('engagement-collapse-btn');
    if (!sidebar || !btn) return;
    var collapsed = sidebar.classList.toggle('collapsed');
    document.body.classList.toggle('student-panel-collapsed', collapsed);
    btn.textContent = collapsed ? '›' : '‹';
    btn.title = collapsed ? 'Expand panel' : 'Collapse panel';
  }

  (function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }
    var collapseBtn = document.getElementById('engagement-collapse-btn');
    if (collapseBtn) collapseBtn.addEventListener('click', toggleCollapse);
    var runBtn = document.getElementById('run-agents-btn');
    var pollBtn = document.getElementById('generate-poll-btn');
    var goodBtn = document.getElementById('im-good-btn');
    var lostBtn = document.getElementById('im-lost-btn');
    if (runBtn) runBtn.addEventListener('click', runAgents);
    if (pollBtn) pollBtn.addEventListener('click', generatePoll);
    if (goodBtn) goodBtn.addEventListener('click', function () { sendSelfReport('good'); });
    if (lostBtn) lostBtn.addEventListener('click', function () { sendSelfReport('lost'); });
  })();
})();
