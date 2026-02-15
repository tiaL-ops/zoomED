import React, { useState, useEffect, useCallback } from 'react';
import zoomSdk from '@zoom/appssdk';

const DEFAULT_MEETING_ID = 'demo';
const DEFAULT_API_BASE = ''; // set VITE_API_BASE=http://localhost:3000 when running against this backend
const WS_PORT = 3000; // same as server

function getApiBase() {
  return typeof import.meta.env?.VITE_API_BASE === 'string' && import.meta.env.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, '')
    : DEFAULT_API_BASE;
}

function getWsUrl(meetingId) {
  const apiBase = getApiBase();
  if (apiBase) {
    const u = new URL(apiBase);
    const scheme = u.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${u.host}/ws?meetingId=${encodeURIComponent(meetingId)}`;
  }
  return `ws://localhost:${WS_PORT}/ws?meetingId=${encodeURIComponent(meetingId)}`;
}

export default function ZoomPanelApp() {
  const [sdkReady, setSdkReady] = useState(false);
  const [meetingId, setMeetingId] = useState(DEFAULT_MEETING_ID);
  const [userId, setUserId] = useState('demo-user');
  const [displayName, setDisplayName] = useState('Student');
  const [engagement, setEngagement] = useState(null);
  const [engagementSummary, setEngagementSummary] = useState(null);
  const [action, setAction] = useState(null);
  const [poll, setPoll] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pollLoading, setPollLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [transcriptLines, setTranscriptLines] = useState([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const apiBase = getApiBase();

  useEffect(() => {
    let cancelled = false;

    async function initZoom() {
      try {
        await zoomSdk.config({
          capabilities: [],
          popoutSize: { width: 360, height: 640 },
        });
        if (cancelled) return;
        setSdkReady(true);

        const meetingContext = await zoomSdk.getMeetingContext?.();
        if (cancelled) return;
        if (meetingContext?.meetingID) {
          setMeetingId(String(meetingContext.meetingID));
        }

        const userContext = await zoomSdk.getUserContext?.();
        if (cancelled) return;
        if (userContext?.participantUUID) setUserId(String(userContext.participantUUID));
        if (userContext?.screenName) setDisplayName(userContext.screenName);
      } catch (e) {
        if (!cancelled) {
          console.warn('Zoom SDK init or context failed, using demo context:', e);
          setSdkReady(true);
          setMeetingId(DEFAULT_MEETING_ID);
          setUserId('demo-user');
          setDisplayName('Student');
        }
      }
    }

    initZoom();
    return () => { cancelled = true; };
  }, []);

  // WebSocket: receive POLL_SUGGESTION and NUDGE from backend (same as zoomapp)
  useEffect(() => {
    if (!meetingId) return;
    const wsUrl = getWsUrl(meetingId);
    let ws;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'POLL_SUGGESTION' && msg.payload?.poll) {
            setPoll(msg.payload.poll);
          }
        } catch (_) {}
      };
      ws.onclose = () => { ws = null; };
    } catch (e) {
      console.warn('Panel WebSocket failed:', e);
    }
    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [meetingId]);

  // Run agents: POST /api/tick (this backend)
  const runAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = apiBase ? `${apiBase}/api/tick` : '/api/tick';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const summary = data.summary ?? null;
      const decision = data.decision ?? null;
      setEngagementSummary(summary);
      setEngagement(summary?.class_engagement ?? null);
      setAction(decision ? { action: decision.action, reason: decision.reason } : null);
      if (data.poll) setPoll(data.poll);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, meetingId]);

  // Generate material quiz: POST /api/meetings/:meetingId/trigger-material-quiz (this backend)
  const generatePoll = useCallback(async () => {
    setPollLoading(true);
    setError(null);
    try {
      const url = apiBase
        ? `${apiBase}/api/meetings/${encodeURIComponent(meetingId)}/trigger-material-quiz`
        : `/api/meetings/${encodeURIComponent(meetingId)}/trigger-material-quiz`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, displayName }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.poll) setPoll(data.poll);
    } catch (e) {
      setError(e.message);
    } finally {
      setPollLoading(false);
    }
  }, [apiBase, meetingId, userId, displayName]);

  // Self report: POST /api/events (this backend)
  const sendSelfReport = useCallback(
    async (value) => {
      try {
        const url = apiBase ? `${apiBase}/api/events` : '/api/events';
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId,
            type: 'SELF_REPORT',
            userId,
            displayName,
            value,
          }),
        });
      } catch (e) {
        setError(e.message);
      }
    },
    [apiBase, meetingId, userId, displayName]
  );

  // Transcript reader: GET transcript, Load sample
  const fetchTranscript = useCallback(async () => {
    setTranscriptLoading(true);
    setError(null);
    try {
      const url = apiBase
        ? `${apiBase}/api/meetings/${encodeURIComponent(meetingId)}/transcript`
        : `/api/meetings/${encodeURIComponent(meetingId)}/transcript`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setTranscriptLines(data.lines ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setTranscriptLoading(false);
    }
  }, [apiBase, meetingId]);

  const loadSampleTranscript = useCallback(async () => {
    setTranscriptLoading(true);
    setError(null);
    try {
      const url = apiBase
        ? `${apiBase}/api/meetings/${encodeURIComponent(meetingId)}/transcript/load-sample`
        : `/api/meetings/${encodeURIComponent(meetingId)}/transcript/load-sample`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      await fetchTranscript();
    } catch (e) {
      setError(e.message);
    } finally {
      setTranscriptLoading(false);
    }
  }, [apiBase, meetingId, fetchTranscript]);

  useEffect(() => {
    if (sdkReady && meetingId) fetchTranscript();
  }, [sdkReady, meetingId, fetchTranscript]);

  if (!sdkReady) {
    return (
      <div className="panel panel--loading">
        Loading…
      </div>
    );
  }

  const coldStudents = engagementSummary?.cold_students ?? [];
  const actAction = action?.action ?? action;
  const actReason = action?.reason ?? '';

  return (
    <div className={`engagement-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button
        type="button"
        className="collapse-btn"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
        title={collapsed ? 'Expand panel' : 'Collapse panel'}
      >
        {collapsed ? '»' : '«'}
      </button>
      <div className="engagement-content">
        <div className="panel">
          <header className="panel-header">
            <h1 className="panel-title">Engagement</h1>
            <p className="panel-context">
              Meeting: <code>{meetingId}</code>
            </p>
          </header>

          <section className="panel-section">
            <h2 className="panel-section-title">Engagement</h2>
            <p className="meter">{engagement != null ? engagement : '—'}</p>
            <p className="panel-summary">{engagementSummary?.summary ?? 'Run agents to see summary.'}</p>
          </section>

          {coldStudents.length > 0 && (
            <section className="panel-section">
              <h2 className="panel-section-title">Cold students</h2>
              <ul className="panel-list">
                {coldStudents.map((id) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel-section">
            <h2 className="panel-section-title">Recommended action</h2>
            <p className="panel-action">{actAction ?? '—'}</p>
            {actReason && <p className="panel-reason">{actReason}</p>}
          </section>

          <div className="panel-actions">
            <button type="button" className="btn btn-primary" onClick={runAgents} disabled={loading}>
              {loading ? 'Running…' : 'Run agents'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={generatePoll} disabled={pollLoading}>
              {pollLoading ? 'Generating…' : 'Generate poll'}
            </button>
          </div>

          <section className="panel-section">
            <h2 className="panel-section-title">Transcript</h2>
            <button type="button" className="btn btn-small" onClick={fetchTranscript} disabled={transcriptLoading}>
              Refresh
            </button>
            <button type="button" className="btn btn-small" onClick={loadSampleTranscript} disabled={transcriptLoading}>
              Load sample
            </button>
            <div className="transcript-view">
              {transcriptLines.length === 0 && !transcriptLoading && (
                <p className="panel-summary">No transcript yet. Load sample to test.</p>
              )}
              {transcriptLines.slice(-15).map((line, i) => (
                <p key={i} className="transcript-line">
                  {line.speaker && <strong>{line.speaker}: </strong>}
                  {(line.text || '').slice(0, 200)}{(line.text || '').length > 200 ? '…' : ''}
                </p>
              ))}
            </div>
          </section>

          <section className="panel-section">
            <h2 className="panel-section-title">Quick check-in</h2>
            <button type="button" className="btn btn-small" onClick={() => sendSelfReport('good')}>
              I'm good
            </button>
            <button type="button" className="btn btn-small" onClick={() => sendSelfReport('lost')}>
              I'm lost
            </button>
          </section>

          {poll?.questions?.length > 0 && (
            <section className="panel-section panel-poll">
              <h2 className="panel-section-title">Quick check poll</h2>
              <div className="poll-content">
                {poll.questions.map((q, i) => (
                  <div key={i} className="poll-question">
                    <p className="poll-question-text">{q.question}</p>
                    {q.options && (
                      <ul className="poll-options">
                        {q.options.map((opt, j) => (
                          <li key={j}>{opt}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {error && (
            <div className="panel-error" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
