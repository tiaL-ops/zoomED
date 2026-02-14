import React, { useState } from 'react';

function Hi() {
  const [name, setName] = useState('');
  const [greeting, setGreeting] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setGreeting(`Hi there, ${name || 'friend'}! `);
  };

  return (
    <div style={{ textAlign: 'center', padding: '50px' }}>
      <h1>Say Hi!</h1>
      <form onSubmit={handleSubmit} style={{ marginTop: '30px' }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter your name"
          style={{
            padding: '10px',
            fontSize: '16px',
            borderRadius: '5px',
            border: '1px solid #ccc',
            marginRight: '10px'
          }}
        />
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            borderRadius: '5px',
            border: 'none',
            background: '#007bff',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Greet Me!
        </button>
      </form>
      {greeting && (
        <h2 style={{ marginTop: '30px', color: '#28a745' }}>{greeting}</h2>
      )}
    </div>
  );
}

export default Hi;
