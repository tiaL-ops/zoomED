import React, { useState } from 'react';
import NotesViewer from './NotesViewer';

function Home() {
  const [showNotes, setShowNotes] = useState(false);
  const [meetingId, setMeetingId] = useState('demo-meeting-001');

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>🚀 Zoom Engagement Suite</h1>
      <p>AI-Powered Multi-Agent System for Enhanced Learning</p>
      
      <div style={{ marginTop: '30px', marginBottom: '40px' }}>
        <a href="/videoapp" style={{ 
          padding: '12px 24px', 
          background: '#007bff', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: '5px',
          margin: '0 10px'
        }}>
          👀 Gaze Detection
        </a>
        <a href="/poll" style={{ 
          padding: '12px 24px', 
          background: '#dc3545', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: '5px',
          margin: '0 10px'
        }}>
          📊 Generate Poll
        </a>
        <a href="/hi" style={{ 
          padding: '12px 24px', 
          background: '#28a745', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: '5px',
          margin: '0 10px'
        }}>
          💬 Say Hi
        </a>
        <button
          onClick={() => setShowNotes(!showNotes)}
          style={{ 
            padding: '12px 24px', 
            background: '#ffc107', 
            color: 'black',
            border: 'none',
            textDecoration: 'none',
            borderRadius: '5px',
            margin: '0 10px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          📝 {showNotes ? 'Hide Notes' : 'View Notes'}
        </button>
      </div>

      {showNotes && (
        <div style={{
          marginTop: '40px',
          borderTop: '2px solid #ddd',
          paddingTop: '40px'
        }}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ marginRight: '10px', fontSize: '1.1rem' }}>
              Meeting ID:
            </label>
            <input
              type="text"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '1rem',
                borderRadius: '4px',
                border: '1px solid #ccc',
                minWidth: '200px'
              }}
            />
          </div>
          <NotesViewer meetingId={meetingId} />
        </div>
      )}
    </div>
  );
}

export default Home;
