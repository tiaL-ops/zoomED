import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Report from './components/Report';

function App() {
  return (
    <Router>
      <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
        <nav style={{
          padding: '18px 40px',
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: 'white',
          boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '28px',
        }}>
          <Link to="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 700, fontSize: '20px' }}>Engage</Link>
        </nav>

        <Routes>
          <Route path="/" element={<Report />} />
          <Route path="/report" element={<Report />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
