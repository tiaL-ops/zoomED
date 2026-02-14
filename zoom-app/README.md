init zoom apps sdk, listen for valuable events and forward them to backend as JSON
also relay backend responses forward and propogate them

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
