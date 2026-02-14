import React from 'react';

function Home() {
  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>bro idk</h1>
      <p>trying to make this all nighter worht it :( .</p>
      <div style={{ marginTop: '30px' }}>
        <a href="/videoapp" style={{ 
          padding: '12px 24px', 
          background: '#007bff', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: '5px',
          margin: '0 10px'
        }}>
          Try Gaze Detection
        </a>
        <a href="/hi" style={{ 
          padding: '12px 24px', 
          background: '#28a745', 
          color: 'white', 
          textDecoration: 'none',
          borderRadius: '5px',
          margin: '0 10px'
        }}>
          Say Hi
        </a>
      </div>
    </div>
  );
}

export default Home;
