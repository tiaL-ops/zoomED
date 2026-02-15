import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

function VideoApp() {
  const [searchParams] = useSearchParams();
  const meetingIdFromUrl = searchParams.get('meetingId') || '';
  const userIdFromUrl = searchParams.get('userId') || '';
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('OFFLINE');
  const [direction, setDirection] = useState('');
  const [background, setBackground] = useState('white');
  const faceMeshRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    // Load MediaPipe scripts dynamically
    const script1 = document.createElement('script');
    script1.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
    script1.async = true;
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
    script2.async = true;
    document.body.appendChild(script2);

    return () => {
      // Cleanup
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      document.body.removeChild(script1);
      document.body.removeChild(script2);
    };
  }, []);

  const onResults = (results) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      
      const leftIris = landmarks[468];
      const rightIris = landmarks[473];
      const leftInner = landmarks[133];
      const leftOuter = landmarks[33];
      const rightInner = landmarks[362];
      const rightOuter = landmarks[263];

      const leftGaze = (leftIris.x - leftOuter.x) / (leftInner.x - leftOuter.x);
      const rightGaze = (rightIris.x - rightInner.x) / (rightOuter.x - rightInner.x);
      
      const avgGaze = (leftGaze + rightGaze) / 2;

      // Send gaze data to backend for analysis (include meetingId/userId from URL to feed agents)
      const body = { avgGaze };
      if (meetingIdFromUrl) body.meetingId = meetingIdFromUrl;
      if (userIdFromUrl) body.userId = userIdFromUrl;
      if (userIdFromUrl) body.displayName = userIdFromUrl;
      fetch('/api/analyze-gaze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })
      .then(response => response.json())
      .then(data => {
        setStatus(data.status);
        setBackground(data.background);
        setDirection(data.direction);
      })
      .catch(error => {
        console.error('Error communicating with backend:', error);
      });

      // Do not draw gaze dots on screen (privacy; not visible to students)
    } else {
      setStatus('NO FACE');
      setBackground('white');
      setDirection('');
    }
  };

  const initFaceMesh = () => {
    if (window.FaceMesh) {
      faceMeshRef.current = new window.FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
      });

      faceMeshRef.current.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6
      });

      faceMeshRef.current.onResults(onResults);
    }
  };

  const startCamera = async () => {
    if (!faceMeshRef.current) {
      initFaceMesh();
      // Wait a bit for FaceMesh to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (window.Camera && videoRef.current) {
      cameraRef.current = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if (faceMeshRef.current) {
            await faceMeshRef.current.send({ image: videoRef.current });
          }
        },
        width: 640,
        height: 480
      });
      cameraRef.current.start();
      setStatus('STARTING...');
    }
  };

  const stopCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.stop();
      setStatus('OFFLINE');
      setBackground('white');
      setDirection('');
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  return (
    <div style={{ fontFamily: 'monospace', textAlign: 'center', background: 'white', color: 'black', padding: '20px' }}>
      <h2>Gaze Detection</h2>
      <p>Look center for "FOCUS", look left/right for "BORED"</p>
      
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          style={{ 
            transform: 'scaleX(-1)', 
            width: '640px', 
            height: '480px', 
            background: '#eee', 
            border: '1px solid #000' 
          }}
        />
        <canvas 
          ref={canvasRef}
          width={640}
          height={480}
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            transform: 'scaleX(-1)', 
            width: '640px', 
            height: '480px' 
          }}
        />
      </div>

      <div style={{ margin: '20px' }}>
        <button onClick={startCamera} style={{ padding: '10px 20px', marginRight: '10px' }}>START</button>
        <button onClick={stopCamera} style={{ padding: '10px 20px' }}>STOP</button>
      </div>

      <div style={{ 
        fontSize: '3rem', 
        fontWeight: 'bold', 
        border: '4px solid black', 
        padding: '10px', 
        display: 'inline-block', 
        minWidth: '300px',
        background: background
      }}>
        {status}
      </div>
      <div style={{ fontSize: '1.2rem', marginTop: '10px' }}>{direction}</div>
    </div>
  );
}

export default VideoApp;
