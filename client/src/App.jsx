import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Home from './components/Home';
import VideoApp from './components/VideoApp';
import Hi from './components/Hi';
import Poll from './components/Poll';
import Report from './components/Report';

function App() {
  return (
    <Router>
      <div>
        <nav style={{ padding: '20px', background: '#333', color: 'white' }}>
          <Link to="/" style={{ margin: '0 10px', color: 'white' }}>Home</Link>
          <Link to="/videoapp" style={{ margin: '0 10px', color: 'white' }}>Video App</Link>
          <Link to="/poll" style={{ margin: '0 10px', color: 'white' }}>Poll</Link>
          <Link to="/report" style={{ margin: '0 10px', color: 'white' }}>Report</Link>
          <Link to="/hi" style={{ margin: '0 10px', color: 'white' }}>Hi</Link>
        </nav>

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/videoapp" element={<VideoApp />} />
          <Route path="/poll" element={<Poll />} />
          <Route path="/report" element={<Report />} />
          <Route path="/hi" element={<Hi />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
