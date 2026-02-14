init zoom apps sdk, listen for valuable events and forward them to backend as JSON
also relay backend responses forward and propogate them

## PROBLEM: You neeed to deploy it so  not sure wher to host it yet. need help with that can;t figur e it out 
TUto herE: 
https://github.com/zoom/meetingsdk-javascript-sample


when zoom part done, need to connect websocket
useEffect(() => {
  const ws = new WebSocket(`wss://your-server.ngrok.io?meetingId=${meetingId}`);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "POLL_SUGGESTION") setPollSuggestion(msg.payload);
    if (msg.type === "LEADERBOARD_UPDATE") setLeaderboard(msg.payload.leaderboard);
  };
  return () => ws.close();
}, [meetingId]);
