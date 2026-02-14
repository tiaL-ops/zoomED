import React, { useState, useEffect } from 'react';

function Poll() {
  const [studentPolls, setStudentPolls] = useState([]);
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState({});

  const generatePoll = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/poll');
      const data = await response.json();
      
      if (data.success) {
        setStudentPolls(data.studentPolls);
        setTopic(data.topic);
        setAnswers({});
        setSubmitted({});
      } else {
        setError(data.error || 'Failed to generate poll');
      }
    } catch (err) {
      setError('Error fetching poll: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId, value) => {
    setAnswers({
      ...answers,
      [questionId]: value
    });
  };

  const handleSubmit = (questionId, correctIndex) => {
    const userAnswer = answers[questionId];
    const isCorrect = parseInt(userAnswer) === correctIndex;
    
    setSubmitted({
      ...submitted,
      [questionId]: {
        isCorrect,
        userAnswer,
        correctIndex
      }
    });
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
      <h1>Personalized Student Quiz Generator</h1>
      <p>Generate adaptive quiz questions for each student based on their engagement level from the lecture summary</p>
      
      <button
        onClick={generatePoll}
        disabled={loading}
        style={{
          padding: '12px 24px',
          fontSize: '16px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '30px'
        }}
      >
        {loading ? 'Generating Personalized Quizzes...' : 'Generate Student Quizzes'}
      </button>

      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '5px',
          marginBottom: '20px'
        }}>
          {error}
        </div>
      )}

      {topic && (
        <h2 style={{ color: '#333', marginBottom: '30px', textAlign: 'center' }}>
          {topic}
        </h2>
      )}

      {studentPolls.length > 0 && studentPolls.map((studentPoll, studentIdx) => (
        <div key={studentIdx} style={{ marginBottom: '50px' }}>
          <div style={{
            backgroundColor: studentPoll.engagementLevel === 3 ? '#d4edda' : 
                           studentPoll.engagementLevel === 2 ? '#fff3cd' : '#f8d7da',
            padding: '15px',
            borderRadius: '8px',
            marginBottom: '20px',
            border: '2px solid ' + (studentPoll.engagementLevel === 3 ? '#28a745' : 
                                     studentPoll.engagementLevel === 2 ? '#ffc107' : '#dc3545')
          }}>
            <h2 style={{ margin: 0, marginBottom: '5px' }}>
              📚 {studentPoll.student}'s Quiz
            </h2>
            <p style={{ margin: 0, fontSize: '14px', opacity: 0.8 }}>
              {studentPoll.description}
            </p>
          </div>

          {studentPoll.poll && studentPoll.poll.questions && studentPoll.poll.questions.map((question, idx) => (
            <div
              key={`${studentIdx}-${question.id}`}
              style={{
                backgroundColor: '#f8f9fa',
                padding: '20px',
                borderRadius: '8px',
                marginBottom: '20px',
                border: '1px solid #dee2e6'
              }}
            >
              <h3 style={{ marginTop: 0 }}>
                Question {idx + 1}: {question.question}
              </h3>

              {question.type === 'mcq' && (
                <div>
                  {question.options.map((option, optIdx) => (
                    <div key={optIdx} style={{ margin: '10px 0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`${studentIdx}-${question.id}`}
                          value={optIdx}
                          checked={answers[`${studentIdx}-${question.id}`] === optIdx.toString()}
                          onChange={(e) => handleAnswerChange(`${studentIdx}-${question.id}`, e.target.value)}
                          disabled={submitted[`${studentIdx}-${question.id}`]}
                          style={{ marginRight: '10px' }}
                        />
                        <span style={{
                          color: submitted[`${studentIdx}-${question.id}`] 
                            ? (optIdx === question.correctIndex ? 'green' : 
                               optIdx === parseInt(submitted[`${studentIdx}-${question.id}`].userAnswer) ? 'red' : 'black')
                            : 'black',
                          fontWeight: submitted[`${studentIdx}-${question.id}`] && optIdx === question.correctIndex ? 'bold' : 'normal'
                        }}>
                          {option}
                          {submitted[`${studentIdx}-${question.id}`] && optIdx === question.correctIndex && ' ✓'}
                        </span>
                      </label>
                    </div>
                  ))}

                  {!submitted[`${studentIdx}-${question.id}`] && (
                    <button
                      onClick={() => handleSubmit(`${studentIdx}-${question.id}`, question.correctIndex)}
                      disabled={!answers[`${studentIdx}-${question.id}`]}
                      style={{
                        marginTop: '15px',
                        padding: '8px 16px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: answers[`${studentIdx}-${question.id}`] ? 'pointer' : 'not-allowed'
                      }}
                    >
                      Submit Answer
                    </button>
                  )}

                  {submitted[`${studentIdx}-${question.id}`] && (
                    <div style={{
                      marginTop: '15px',
                      padding: '10px',
                      backgroundColor: submitted[`${studentIdx}-${question.id}`].isCorrect ? '#d4edda' : '#f8d7da',
                      color: submitted[`${studentIdx}-${question.id}`].isCorrect ? '#155724' : '#721c24',
                      borderRadius: '5px'
                    }}>
                      {submitted[`${studentIdx}-${question.id}`].isCorrect ? '✓ Correct!' : '✗ Incorrect. Try again!'}
                    </div>
                  )}
                </div>
              )}

              {question.type === 'open' && (
                <div>
                  <textarea
                    value={answers[`${studentIdx}-${question.id}`] || ''}
                    onChange={(e) => handleAnswerChange(`${studentIdx}-${question.id}`, e.target.value)}
                    placeholder="Type your answer here..."
                    style={{
                      width: '100%',
                      minHeight: '100px',
                      padding: '10px',
                      fontSize: '14px',
                      borderRadius: '5px',
                      border: '1px solid #ced4da',
                      fontFamily: 'inherit'
                    }}
                  />
                  <button
                    onClick={() => setSubmitted({ ...submitted, [`${studentIdx}-${question.id}`]: { submitted: true } })}
                    disabled={!answers[`${studentIdx}-${question.id}`] || submitted[`${studentIdx}-${question.id}`]}
                    style={{
                      marginTop: '10px',
                      padding: '8px 16px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: (answers[`${studentIdx}-${question.id}`] && !submitted[`${studentIdx}-${question.id}`]) ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {submitted[`${studentIdx}-${question.id}`] ? 'Submitted' : 'Submit Answer'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default Poll;
