// zoomapp/transcript-manager.js
// Client-side utility for managing meeting transcripts

class TranscriptManager {
  constructor(meetingId, backendUrl = "http://localhost:3000") {
    this.meetingId = meetingId;
    this.backendUrl = backendUrl;
    this.buffer = [];
    this.flushInterval = null;
  }

  /**
   * Add a transcript segment to the buffer
   * @param {string} text - The transcript text
   * @param {string} speaker - Speaker name
   * @param {string} timestamp - Optional timestamp (HH:MM:SS)
   */
  addSegment(text, speaker = "Unknown", timestamp = null) {
    if (!text || !text.trim()) return;

    const segment = {
      meetingId: this.meetingId,
      type: "TRANSCRIPT_UPDATE",
      speaker,
      text: text.trim(),
      timestamp: timestamp || this.getCurrentTimestamp(),
    };

    this.buffer.push(segment);

    // Auto-flush if buffer gets large
    if (this.buffer.length >= 5) {
      this.flush();
    }
  }

  /**
   * Get current meeting timestamp
   */
  getCurrentTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Send buffered segments to backend
   */
  async flush() {
    if (this.buffer.length === 0) return;

    const toSend = [...this.buffer];
    this.buffer = [];

    console.log(`📤 Flushing ${toSend.length} transcript segments...`);

    for (const segment of toSend) {
      try {
        const response = await fetch(`${this.backendUrl}/api/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(segment),
        });

        if (response.ok) {
          console.log(`✓ Sent: "${segment.text.substring(0, 40)}..."`);
        } else {
          console.warn(`✗ Failed to send segment: ${response.statusText}`);
          this.buffer.push(segment); // Re-add to buffer for retry
        }
      } catch (error) {
        console.error("Network error sending transcript:", error);
        this.buffer.push(segment); // Re-add to buffer for retry
      }
    }
  }

  /**
   * Start auto-flush interval (every N seconds)
   */
  startAutoFlush(intervalSeconds = 10) {
    this.flushInterval = setInterval(() => this.flush(), intervalSeconds * 1000);
    console.log(`⏱️ Auto-flush enabled (every ${intervalSeconds}s)`);
  }

  /**
   * Stop auto-flush
   */
  stopAutoFlush() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
      console.log("⏹️ Auto-flush disabled");
    }
  }

  /**
   * Get transcript buffer status
   */
  getStatus() {
    return {
      meetingId: this.meetingId,
      buffered: this.buffer.length,
      isAutoFlushing: !!this.flushInterval,
    };
  }

  /**
   * Clear buffer
   */
  clear() {
    this.buffer = [];
    console.log("🗑️ Transcript buffer cleared");
  }
}

// Export for use in other scripts
if (typeof module !== "undefined" && module.exports) {
  module.exports = TranscriptManager;
}

// Example usage:
/*
// Initialize
const manager = new TranscriptManager("89247964461");
manager.startAutoFlush(5); // Auto-flush every 5 seconds

// Add segments
manager.addSegment("Today we're discussing AI", "Instructor", "00:00:15");
manager.addSegment("Machine learning is...", "Instructor", "00:01:30");

// Manual flush when needed
manager.flush();

// Check status
console.log(manager.getStatus());

// Cleanup
manager.stopAutoFlush();
*/
