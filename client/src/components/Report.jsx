import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;

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
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!meetingId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/report?meetingId=${encodeURIComponent(meetingId.trim())}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      setReport(data);
    } catch (e) {
      setError(e.message);
      setReport(null);
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
          setPopupSummary({ ...msg.payload, at: msg.payload.at || new Date().toISOString() });
          setReport((prev) => (prev ? { ...prev, lastSummary: msg.payload.summary } : { meetingId, lastSummary: msg.payload.summary, lastDecision: null, eventCount: 0 }));
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

  const loadSampleTranscript = useCallback(async () => {
    if (!meetingId.trim()) return;
    setTranscriptLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meetings/${encodeURIComponent(meetingId.trim())}/transcript/load-sample`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      await fetchReport();
    } catch (e) {
      setError(e.message);
    } finally {
      setTranscriptLoading(false);
    }
  }, [meetingId, fetchReport]);

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>Teacher Report</h1>
      <p style={{ color: '#666', marginBottom: '24px' }}>
        View engagement summary for a meeting (during or after). Live updates every 5 minutes when connected via WebSocket.
      </p>

      <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Meeting ID:
          <input
            type="text"
            value={meetingId}
            onChange={(e) => setMeetingId(e.target.value)}
            placeholder="default"
            style={{ marginLeft: '8px', padding: '8px 12px', width: '200px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </label>
        <button
          onClick={fetchReport}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Loading…' : 'Refresh report'}
        </button>
        <button
          onClick={loadSampleTranscript}
          disabled={transcriptLoading || !meetingId.trim()}
          style={{ padding: '8px 16px', background: '#6c757d', color: 'white', border: 'none', borderRadius: '5px', cursor: transcriptLoading ? 'not-allowed' : 'pointer' }}
        >
          {transcriptLoading ? 'Loading…' : 'Load sample transcript'}
        </button>
        {liveConnected && <span style={{ color: '#28a745', fontSize: '14px' }}>● Live</span>}
        <label style={{ marginLeft: '12px' }}>
          Preview as attendee (userId):
          <input
            type="text"
            value={previewAttendeeId}
            onChange={(e) => setPreviewAttendeeId(e.target.value)}
            placeholder="e.g. u2"
            style={{ marginLeft: '6px', padding: '6px 10px', width: '100px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </label>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#f8d7da', color: '#721c24', borderRadius: '5px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {report && report.lastSummary && (
        <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
          <h2 style={{ marginTop: 0 }}>Latest engagement summary</h2>
          <p><strong>Class engagement:</strong> {report.lastSummary.class_engagement} (1=low, 2=medium, 3=high)</p>
          <p><strong>Summary:</strong> {report.lastSummary.summary}</p>
          {report.lastSummary.cold_students?.length > 0 && (
            <p><strong>Cold students (need attention):</strong> {report.lastSummary.cold_students.join(', ') || '—'}</p>
          )}
          {report.lastSummary.per_user?.length > 0 && (
            <div>
              <strong>Per user:</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
                {report.lastSummary.per_user.map((u, i) => (
                  <li key={i}>{u.userId || u.displayName}: engagement {u.engagement} — {u.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {report.lastDecision && (
            <p style={{ marginTop: '12px', marginBottom: 0 }}><strong>Last decision:</strong> {report.lastDecision.action} — {report.lastDecision.reason}</p>
          )}
          <p style={{ fontSize: '12px', color: '#666', marginTop: '12px' }}>Event count: {report.eventCount}</p>
        </div>
      )}

      {report?.transcriptLines?.length > 0 && (
        <div style={{ background: '#f0f8f0', border: '1px solid #b8d4b8', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h2 style={{ marginTop: 0 }}>Transcript</h2>
          <p style={{ fontSize: '13px', color: '#555', marginBottom: '10px' }}>Last {report.transcriptLines.length} snippet(s) from the meeting. Load sample transcript to test with summary.txt.</p>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px', maxHeight: '280px', overflowY: 'auto' }}>
            {report.transcriptLines.slice(-20).map((line, i) => (
              <li key={i} style={{ marginBottom: '8px' }}>
                {line.speaker && <strong>{line.speaker}: </strong>}
                {(line.text || '').slice(0, 300)}{(line.text || '').length > 300 ? '…' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report?.engagementHistory?.length > 0 && (
        <div style={{ background: '#f0f4ff', border: '1px solid #cce', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h2 style={{ marginTop: 0 }}>Engagement over time</h2>
          <p style={{ fontSize: '13px', color: '#555', marginBottom: '10px' }}>High vs low engagement by time window (for professor review).</p>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
            {report.engagementHistory.slice(-15).reverse().map((h, i) => (
              <li key={i}>
                <strong>{new Date(h.at).toLocaleTimeString()}</strong> — engagement {h.class_engagement} {h.cold_students?.length ? `(${h.cold_students.length} cold)` : ''}: {h.summary}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report && !report.lastSummary && report.eventCount !== undefined && (
        <p style={{ color: '#666' }}>No summary yet. Send events (e.g. gaze with meetingId, or POST /api/events) and run an agent tick (POST /api/tick) or wait for the 5‑minute periodic summary.</p>
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
            <h3 style={{ marginTop: 0 }}>Periodic engagement update</h3>
            <p style={{ fontSize: '12px', color: '#666' }}>{new Date(popupSummary.at).toLocaleString()}</p>
            <p>{popupSummary.summary?.summary}</p>
            <p><strong>Class engagement:</strong> {popupSummary.summary?.class_engagement}</p>
            {popupSummary.summary?.cold_students?.length > 0 && (
              <p><strong>Cold students:</strong> {popupSummary.summary.cold_students.join(', ')}</p>
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
