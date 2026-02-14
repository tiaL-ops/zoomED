import React, { useState, useEffect, useCallback } from 'react';
import zoomSdk from '@zoom/appssdk';

const DEFAULT_MEETING_ID = 'demo';
const DEFAULT_API_BASE = ''; // use relative /api when proxied

function getApiBase() {
  return typeof import.meta.env?.VITE_API_BASE === 'string' && import.meta.env.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, '')
    : DEFAULT_API_BASE;
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

  const runAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = apiBase
        ? `${apiBase}/api/meetings/${encodeURIComponent(meetingId)}/run-agents`
        : `/api/meetings/${encodeURIComponent(meetingId)}/run-agents`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setEngagementSummary(data.engagementSummary ?? null);
      setEngagement(data.engagementSummary?.class_engagement ?? null);
      const act = data.action && typeof data.action === 'object' ? data.action : data;
      setAction(act);
      if (data.poll) setPoll(data.poll);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, meetingId]);

  const generatePoll = useCallback(async () => {
    setPollLoading(true);
    setError(null);
    try {
      const url = apiBase
        ? `${apiBase}/api/meetings/${encodeURIComponent(meetingId)}/generate-poll`
        : `/api/meetings/${encodeURIComponent(meetingId)}/generate-poll`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: 'Quick check' }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (data.poll) setPoll(data.poll);
    } catch (e) {
      setError(e.message);
    } finally {
      setPollLoading(false);
    }
  }, [apiBase, meetingId]);

  const sendSelfReport = useCallback(
    async (value) => {
      try {
        const url = apiBase
          ? `${apiBase}/api/meetings/${encodeURIComponent(meetingId)}/events`
          : `/api/meetings/${encodeURIComponent(meetingId)}/events`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
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

  if (!sdkReady) {
    return (
      <div className="panel panel--loading">
        <p>Loading…</p>
      </div>
    );
  }

  const coldStudents = engagementSummary?.cold_students ?? [];
  const actAction = action?.action ?? action;
  const actReason = action?.reason ?? '';

  return (
    <div className="panel">
      <header className="panel-header">
        <h1 className="panel-title">Engagement</h1>
        <p className="panel-context">
          Meeting: <code>{meetingId}</code>
        </p>
      </header>

      <section className="panel-section">
        <h2 className="panel-section-title">Engagement</h2>
        <div
          className={`meter meter--${engagement === 1 ? 'low' : engagement === 2 ? 'mid' : engagement === 3 ? 'high' : ''}`}
          aria-label={`Class engagement ${engagement ?? '—'}`}
        >
          {engagement != null ? engagement : '—'}
        </div>
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
        <div className="panel-action">{actAction ?? '—'}</div>
        {actReason && <p className="panel-reason">{actReason}</p>}
      </section>

      <section className="panel-section panel-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={runAgents}
          disabled={loading}
        >
          {loading ? 'Running…' : 'Run agents'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={generatePoll}
          disabled={pollLoading}
        >
          {pollLoading ? 'Generating…' : 'Generate poll'}
        </button>
      </section>

      <section className="panel-section">
        <h2 className="panel-section-title">Quick check-in</h2>
        <div className="panel-signals">
          <button type="button" className="btn btn-small" onClick={() => sendSelfReport('good')}>
            I'm good
          </button>
          <button type="button" className="btn btn-small" onClick={() => sendSelfReport('lost')}>
            I'm lost
          </button>
        </div>
      </section>

      {poll?.questions?.length > 0 && (
        <section className="panel-section panel-poll">
          <h2 className="panel-section-title">Quick check poll</h2>
          <div className="poll-content">
            {poll.questions.map((q) => (
              <div key={q.id} className="poll-question">
                <div className="poll-question-text">{q.question}</div>
                {q.options && (
                  <ul className="poll-options">
                    {q.options.map((opt, i) => (
                      <li key={i}>{opt}</li>
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
  );
}
