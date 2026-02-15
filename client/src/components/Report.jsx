import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

function formatEngagement(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (v <= 1) return 'Low';
  if (v >= 3) return 'High';
  return 'Medium';
}

function formatParticipant(id) {
  if (!id || typeof id !== 'string') return '—';
  const s = id.trim();
  if (s.startsWith('u-')) return s.slice(2).replace(/_/g, ' ');
  return s.replace(/_/g, ' ');
}

const CHART_HEIGHT = 220;
const CHART_PAD = { top: 14, right: 14, bottom: 32, left: 52 };

function EngagementChart({ history }) {
  const points = (history || []).slice(-24);
  if (points.length < 2) return null;

  const width = 640;
  const innerWidth = width - CHART_PAD.left - CHART_PAD.right;
  const innerHeight = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;

  const minT = points[0].at ? new Date(points[0].at).getTime() : 0;
  const maxT = points[points.length - 1].at ? new Date(points[points.length - 1].at).getTime() : minT + 1;
  const rangeT = maxT - minT || 1;

  const yScale = (v) => {
    const n = Number(v);
    if (n <= 1) return 1;
    if (n >= 3) return 3;
    return n;
  };
  const yToPx = (v) => CHART_PAD.top + innerHeight - ((yScale(v) - 1) / 2) * innerHeight;
  const tToPx = (t) => CHART_PAD.left + ((t - minT) / rangeT) * innerWidth;

  const pathPoints = points
    .map((h, i) => {
      const t = h.at ? new Date(h.at).getTime() : minT + (i / (points.length - 1)) * rangeT;
      const x = tToPx(t);
      const y = yToPx(h.class_engagement);
      return `${x},${y}`;
    })
    .join(' ');
  const bottomY = CHART_PAD.top + innerHeight;
  const areaPathD =
    `M ${tToPx(minT)},${bottomY} L ` +
    points
      .map((h, i) => {
        const t = h.at ? new Date(h.at).getTime() : minT + (i / (points.length - 1)) * rangeT;
        return `${tToPx(t)},${yToPx(h.class_engagement)}`;
      })
      .join(' L ') +
    ` L ${tToPx(maxT)},${bottomY} Z`;

  const yTicks = [1, 2, 3];
  const timeLabels = [];
  const step = Math.max(1, Math.floor(points.length / 5));
  for (let i = 0; i < points.length; i += step) {
    const h = points[i];
    if (h?.at) timeLabels.push({ t: new Date(h.at).getTime(), label: new Date(h.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
  }
  if (points.length > 0 && !timeLabels.find((l) => l.t === maxT)) {
    timeLabels.push({ t: maxT, label: new Date(points[points.length - 1].at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${width} ${CHART_HEIGHT}`} preserveAspectRatio="xMidYMid meet" style={{ maxWidth: width, overflow: 'visible' }}>
        <defs>
          <linearGradient id="engagementGradient" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#cce5ff" />
            <stop offset="100%" stopColor="#e8f2ff" />
          </linearGradient>
        </defs>
        <path d={areaPathD} fill="url(#engagementGradient)" />
        <polyline points={pathPoints} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={CHART_PAD.left} x2={CHART_PAD.left + innerWidth} y1={yToPx(v)} y2={yToPx(v)} stroke="#e2e8f0" strokeDasharray="4" strokeWidth="1" />
            <text x={CHART_PAD.left - 10} y={yToPx(v) + 5} textAnchor="end" fontSize="13" fill="#64748b">
              {formatEngagement(v)}
            </text>
          </g>
        ))}
        {timeLabels.map((l, i) => (
          <text key={i} x={tToPx(l.t)} y={CHART_HEIGHT - 8} textAnchor="middle" fontSize="12" fill="#64748b">
            {l.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function Report() {
  const [searchParams] = useSearchParams();
  const meetingIdFromUrl = searchParams.get('meetingId') || '';
  const [meetingId, setMeetingId] = useState(meetingIdFromUrl || 'default');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [popupSummary, setPopupSummary] = useState(null);
  const [popupNudge, setPopupNudge] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [previewAttendeeId, setPreviewAttendeeId] = useState('');

  const fetchReport = useCallback(async (runSummaryFirst = false) => {
    if (!meetingId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (runSummaryFirst) {
        const tickRes = await fetch('/api/tick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId: meetingId.trim() }),
        });
        if (!tickRes.ok) {
          const data = await tickRes.json().catch(() => ({}));
          setError(data.error || 'Could not run instant summary; showing latest saved report.');
        }
      }
      const res = await fetch(`/api/report?meetingId=${encodeURIComponent(meetingId.trim())}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      setReport(data);
    } catch (e) {
      const msg = e?.message || 'Unknown error';
      if (msg === 'Internal Server Error' || msg.includes('Failed to fetch')) {
        setError('Backend is offline. Start server with `cd server && node index.js`.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    if (meetingIdFromUrl) setMeetingId(meetingIdFromUrl);
  }, [meetingIdFromUrl]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    if (!meetingId.trim()) return;
    const ws = new WebSocket(`${WS_URL}?meetingId=${encodeURIComponent(meetingId.trim())}`);
    ws.onopen = () => setLiveConnected(true);
    ws.onclose = () => setLiveConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SUMMARY_UPDATE' && msg.payload?.summary) {
          const summary = { ...msg.payload.summary, studentsLosingFocus: msg.payload.studentsLosingFocus ?? msg.payload.summary.cold_students };
          setPopupSummary({ ...msg.payload, at: msg.payload.at || new Date().toISOString() });
          setReport((prev) => (prev ? { ...prev, lastSummary: summary } : { meetingId, lastSummary: summary, lastDecision: null, eventCount: 0 }));
        }
        if (msg.type === 'COORDINATOR_UPDATE' && msg.payload?.summary) {
          setReport((prev) => (prev ? { ...prev, lastSummary: msg.payload.summary, lastDecision: msg.payload.decision } : null));
        }
        if (msg.type === 'NUDGE' && msg.payload) {
          const uid = (msg.payload.userId || '').toString().trim();
          const preview = previewAttendeeId.trim();
          if (preview && uid && (uid === preview || msg.payload.displayName === preview)) {
            setPopupNudge(msg.payload);
          }
          // Do not add nudges to report state—teacher report does not show them (give students leeway)
        }
      } catch (_) {}
    };
    return () => ws.close();
  }, [meetingId, previewAttendeeId]);

  const dismissPopup = () => setPopupSummary(null);
  const dismissNudge = () => setPopupNudge(null);

  const endMeeting = async () => {
    if (!meetingId.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/meeting-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: meetingId.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      await fetchReport();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '40px 32px 48px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'system-ui, sans-serif', fontSize: '17px', minHeight: 'calc(100vh - 60px)' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: '2rem', fontWeight: 700, color: '#1e293b' }}>Engagement dashboard</h1>
        <p style={{ color: '#64748b', margin: 0, fontSize: '16px' }}>
          {report?.endedAt ? 'Final engagement summary for this meeting.' : 'Engagement for this meeting. Updates every 10 min when live.'}
        </p>
      </div>

      <div style={{ marginBottom: '28px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '16px' }}>
          <span style={{ color: '#475569' }}>Meeting ID</span>
          <input
            type="text"
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            placeholder="default"
            style={{ padding: '10px 14px', width: '180px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '16px' }}
          />
        </label>
        <button
          onClick={() => fetchReport(true)}
          disabled={loading}
          style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}
          title="Update summary from latest events (attention, chat, joins) and refresh report"
        >
          {loading ? 'Updating…' : 'Update summary'}
        </button>
        {report && !report.endedAt && (
          <button
            onClick={endMeeting}
            disabled={loading}
            style={{ padding: '10px 20px', background: '#64748b', color: 'white', border: 'none', borderRadius: '8px', fontSize: '16px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer' }}
            title="Mark meeting as ended and lock this report as the final engagement summary"
          >
            End meeting
          </button>
        )}
        {liveConnected && !report?.endedAt && <span style={{ color: '#16a34a', fontSize: '15px', fontWeight: 500 }}>● Live</span>}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: '#64748b', marginLeft: '8px' }}>
          Preview as
          <input
            type="text"
            value={previewAttendeeId}
            onChange={(e) => setPreviewAttendeeId(e.target.value)}
            placeholder="attendee ID"
            style={{ padding: '8px 12px', width: '110px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '15px' }}
          />
        </label>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', marginBottom: '24px', fontSize: '16px' }}>
          {error}
        </div>
      )}

      {report?.endedAt && (
        <div style={{ padding: '14px 20px', background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: '10px', marginBottom: '24px', fontSize: '16px', color: '#0369a1' }}>
          Meeting ended at {new Date(report.endedAt).toLocaleString()}. The graph below shows engagement over the full meeting.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px', marginBottom: '24px' }}>
        {report && report.lastSummary && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '28px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 600, color: '#1e293b' }}>Latest summary</h2>
              <span
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '15px',
                  fontWeight: 500,
                  background: report.lastSummary.class_engagement >= 3 ? '#dcfce7' : report.lastSummary.class_engagement >= 2 ? '#fef9c3' : '#fee2e2',
                  color: report.lastSummary.class_engagement >= 3 ? '#166534' : report.lastSummary.class_engagement >= 2 ? '#a16207' : '#b91c1c',
                }}
              >
                {formatEngagement(report.lastSummary.class_engagement)}
              </span>
            </div>
            <p style={{ margin: '0 0 18px', lineHeight: 1.6, color: '#334155', fontSize: '16px' }}>{report.lastSummary.summary}</p>
            {((report.lastSummary.studentsLosingFocus || report.lastSummary.cold_students)?.length > 0) && (
              <div style={{ marginBottom: '14px' }}>
                <span style={{ fontSize: '15px', color: '#64748b', marginRight: '10px' }}>Need attention:</span>
                {(report.lastSummary.studentsLosingFocus || report.lastSummary.cold_students || []).map((id, i) => (
                  <span
                    key={i}
                    style={{
                      display: 'inline-block',
                      margin: '4px 8px 4px 0',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '15px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    {formatParticipant(id)}
                  </span>
                ))}
              </div>
            )}
            {report.lastSummary.per_user?.length > 0 && (
              <details style={{ marginTop: '10px', fontSize: '15px', color: '#475569' }}>
                <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>Per-student notes</summary>
                <ul style={{ margin: 0, paddingLeft: '24px' }}>
                  {report.lastSummary.per_user.map((u, i) => (
                    <li key={i} style={{ marginBottom: '6px' }}>
                      {formatParticipant(u.userId || u.displayName)} — {u.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {report.lastDecision && (
              <p style={{ marginTop: '14px', marginBottom: 0, fontSize: '15px', color: '#475569' }}>
                <strong>Suggested action:</strong> {report.lastDecision.action} — {report.lastDecision.reason}
              </p>
            )}
            <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '14px', marginBottom: 0 }}>Events: {report.eventCount}</p>
          </div>
        )}

        {report?.engagementHistory?.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '28px 32px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <h2 style={{ marginTop: 0, marginBottom: '14px', fontSize: '1.35rem', fontWeight: 600, color: '#1e293b' }}>
              {report.endedAt ? 'Engagement over the meeting' : 'Engagement over time'}
            </h2>
            {report.endedAt && (
              <p style={{ margin: '0 0 14px', fontSize: '15px', color: '#64748b' }}>
                Engagement level across each 10‑minute window during the meeting.
              </p>
            )}
            <EngagementChart history={report.engagementHistory} />
            <details style={{ marginTop: '12px', fontSize: '15px' }}>
              <summary style={{ cursor: 'pointer', color: '#64748b' }}>Show history list</summary>
              <ul style={{ margin: '10px 0 0', paddingLeft: '24px', lineHeight: 1.65 }}>
                {report.engagementHistory.slice(-15).reverse().map((h, i) => (
                  <li key={i} style={{ marginBottom: '8px' }}>
                    <strong>{new Date(h.at).toLocaleTimeString()}</strong> — {formatEngagement(h.class_engagement)}
                    {h.cold_students?.length ? ` · ${h.cold_students.length} need attention` : ''}: {h.summary}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </div>

      {report && !report.lastSummary && report.eventCount !== undefined && (
        <p style={{ color: '#64748b', fontSize: '16px' }}>No summary yet. Send events and refresh, or wait for the next 10‑minute update.</p>
      )}

      {/* Popup: every X minutes summary update */}
      {popupSummary && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={dismissPopup}
        >
          <div
            style={{
              background: 'white',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '480px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Engagement update</h3>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: (popupSummary.summary?.class_engagement ?? 0) >= 3 ? '#d4edda' : (popupSummary.summary?.class_engagement ?? 0) >= 2 ? '#fff3cd' : '#f8d7da',
                  color: (popupSummary.summary?.class_engagement ?? 0) >= 3 ? '#155724' : (popupSummary.summary?.class_engagement ?? 0) >= 2 ? '#856404' : '#721c24',
                }}
              >
                {formatEngagement(popupSummary.summary?.class_engagement)}
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>{new Date(popupSummary.at).toLocaleString()}</p>
            <p style={{ marginBottom: '12px', lineHeight: 1.5 }}>{popupSummary.summary?.summary}</p>
            {(popupSummary.summary?.cold_students?.length > 0 || popupSummary.studentsLosingFocus?.length > 0) && (
              <p style={{ marginBottom: 0, fontSize: '13px' }}>
                <strong>Need attention:</strong>{' '}
                {(popupSummary.studentsLosingFocus || popupSummary.summary?.cold_students || []).map((id) => formatParticipant(id)).join(', ')}
              </p>
            )}
            <button
              onClick={dismissPopup}
              style={{ marginTop: '16px', padding: '8px 16px', background: '#333', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Nudge popup: shown to attendee (or when previewing as that userId) */}
      {popupNudge && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
          onClick={dismissNudge}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #e8f5e9 0%, #fff 100%)',
              padding: '24px',
              borderRadius: '12px',
              maxWidth: '400px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
              border: '2px solid #81c784',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: '#2e7d32' }}>Quick check-in</h3>
            <p style={{ fontSize: '16px', lineHeight: 1.5 }}>{popupNudge.message}</p>
            <button
              onClick={dismissNudge}
              style={{ marginTop: '16px', padding: '10px 20px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Report;
