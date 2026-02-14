import { useState, useEffect } from 'react';
import '../styles/NotesViewer.css';

export default function NotesViewer({ meetingId }) {
  const [notes, setNotes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const generateNotes = async () => {
    if (!meetingId) {
      setError('No meeting ID provided');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to generate notes: ${response.statusText}`);
      }

      const data = await response.json();
      setNotes(data.notes);
    } catch (err) {
      setError(err.message);
      console.error('Error generating notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const refineNotes = async () => {
    if (!chatInput.trim()) return;

    setChatLoading(true);
    try {
      const response = await fetch(`/api/notes/${meetingId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: chatInput }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update notes: ${response.statusText}`);
      }

      const data = await response.json();
      setNotes(data.notes);
      setChatInput('');
    } catch (err) {
      setError(err.message);
      console.error('Error refining notes:', err);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (meetingId) {
      fetch(`/api/notes/${meetingId}`)
        .then(r => r.json())
        .then(data => {
          if (data.notes) setNotes(data.notes);
        })
        .catch(err => console.error('Error fetching notes:', err));
    }
  }, [meetingId]);

  if (!notes) {
    return (
      <div className="notes-viewer">
        <div className="notes-header">
          <h2>Meeting Notes</h2>
          <button 
            onClick={generateNotes} 
            disabled={loading}
            className="btn-generate"
          >
            {loading ? 'Generating...' : 'Generate Notes from Transcript'}
          </button>
        </div>
        {error && <div className="error-message">{error}</div>}
        {!loading && !notes && (
          <div className="empty-state">
            <p>No notes available. Generate notes from the meeting transcript to get started.</p>
          </div>
        )}
      </div>
    );
  }

  // Extract associations for the selected node
  const nodeAssociations = selectedNode 
    ? notes.associations?.filter(
        a => a.from_id === selectedNode.id || a.to_id === selectedNode.id
      ) || []
    : [];

  return (
    <div className="notes-viewer">
      <div className="notes-header">
        <h2>{notes.title || 'Meeting Notes'}</h2>
        <button 
          onClick={generateNotes} 
          disabled={loading}
          className="btn-regenerate"
        >
          Regenerate
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="notes-content">
        {/* Summary Section */}
        <div className="summary-section">
          <h3>Summary</h3>
          <p>{notes.summary}</p>
          {notes.tags && notes.tags.length > 0 && (
            <div className="tags">
              {notes.tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          )}
          {notes.generatedAt && (
            <small className="timestamp">Generated: {new Date(notes.generatedAt).toLocaleString()}</small>
          )}
        </div>

        <div className="notes-main">
          {/* Knowledge Graph Section */}
          <div className="knowledge-graph">
            <h3>Key Concepts</h3>
            <div className="key-points-grid">
              {notes.key_points?.map(kp => (
                <div
                  key={kp.id}
                  className={`key-point ${kp.importance} ${selectedNode?.id === kp.id ? 'selected' : ''}`}
                  onClick={() => setSelectedNode(kp)}
                >
                  <div className="kp-title">{kp.title}</div>
                  <div className="kp-importance">{kp.importance}</div>
                  {kp.timestamp && <div className="kp-timestamp">{kp.timestamp}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Details Section */}
          {selectedNode && (
            <div className="node-details">
              <h3>{selectedNode.title}</h3>
              <p className="node-summary">{selectedNode.summary}</p>
              
              {selectedNode.details && selectedNode.details.length > 0 && (
                <div className="node-details-list">
                  <h4>Details:</h4>
                  <ul>
                    {selectedNode.details.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}

              {nodeAssociations.length > 0 && (
                <div className="node-associations">
                  <h4>Connections:</h4>
                  <div className="associations-list">
                    {nodeAssociations.map((assoc, idx) => (
                      <div key={idx} className="association">
                        <div className="relationship-type">{assoc.relationship_type}</div>
                        <p>{assoc.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Chat Refinement Section */}
      <div className="notes-chat">
        <h3>Refine Notes with AI</h3>
        <div className="chat-input-group">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="e.g., 'Add a concept about algorithms' or 'Connect machine learning to data science'"
            onKeyPress={e => e.key === 'Enter' && refineNotes()}
          />
          <button 
            onClick={refineNotes} 
            disabled={chatLoading || !chatInput.trim()}
            className="btn-refine"
          >
            {chatLoading ? 'Updating...' : 'Refine'}
          </button>
        </div>
      </div>
    </div>
  );
}
