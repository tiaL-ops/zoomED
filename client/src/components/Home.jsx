import React from 'react';
import { Link } from 'react-router-dom';

function Home() {
  const cardStyle = {
    display: 'block',
    padding: '24px 32px',
    textDecoration: 'none',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
    transition: 'transform 0.2s, box-shadow 0.2s',
    color: 'inherit',
    textAlign: 'left',
    maxWidth: '320px',
    border: '1px solid rgba(0,0,0,0.04)',
  };

  return (
    <div style={{
      maxWidth: '900px',
      margin: '0 auto',
      padding: '48px 24px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#1a1d29', marginBottom: '8px' }}>
        Engage
      </h1>
      <p style={{ fontSize: '18px', color: '#5c6370', marginBottom: '40px', lineHeight: 1.5 }}>
        AI-powered engagement tools for Zoom classes. Track attention, generate polls, and view teacher reports.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
        <Link
          to="/videoapp"
          style={{
            ...cardStyle,
            background: 'linear-gradient(135deg, #0b65c2 0%, #095196 100%)',
            color: 'white',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(11,101,194,0.25)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)';
          }}
        >
          <span style={{ fontSize: '14px', opacity: 0.9 }}>Gaze detection</span>
          <h2 style={{ fontSize: '20px', margin: '8px 0 4px', fontWeight: 600 }}>Test Attention</h2>
          <p style={{ fontSize: '14px', opacity: 0.9, margin: 0 }}>Use your camera to test focus detection.</p>
        </Link>

        <Link
          to="/poll"
          style={{
            ...cardStyle,
            background: 'white',
            color: '#1a1d29',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)';
          }}
        >
          <span style={{ fontSize: '14px', color: '#6f42c1', fontWeight: 600 }}>Polls</span>
          <h2 style={{ fontSize: '20px', margin: '8px 0 4px', fontWeight: 600 }}>Generate Poll</h2>
          <p style={{ fontSize: '14px', color: '#5c6370', margin: 0 }}>Create quizzes from meeting context.</p>
        </Link>

        <Link
          to="/report"
          style={{
            ...cardStyle,
            background: 'white',
            color: '#1a1d29',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'none';
            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)';
          }}
        >
          <span style={{ fontSize: '14px', color: '#2e7d32', fontWeight: 600 }}>Teacher</span>
          <h2 style={{ fontSize: '20px', margin: '8px 0 4px', fontWeight: 600 }}>Report</h2>
          <p style={{ fontSize: '14px', color: '#5c6370', margin: 0 }}>View engagement summary by meeting.</p>
        </Link>
      </div>
    </div>
  );
}

export default Home;
