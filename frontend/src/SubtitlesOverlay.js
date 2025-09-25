import React, { useState, useRef, useCallback, useEffect } from 'react';
import './SubtitlesOverlay.css';

// Display config
const MAX_LINES = 4; // how many lines to keep visible
const LINE_TTL_MS = 20000; // auto-remove lines older than 20s
// Pace: only one new line is appended at a time; others are queued
// This prevents multiple lines arriving at once from being pasted simultaneously
const MIN_DISPLAY_MS = 1400; // base min display time
const PER_CHAR_MS = 40;      // per character
const MAX_DISPLAY_MS = 6000; // cap duration
const QUEUE_SOFT_LIMIT = 8;  // when pending exceeds this, speed up
const QUEUE_HARD_LIMIT = 30; // drop oldest pending beyond this to avoid runaway lag

function splitIntoSentences(text) {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed.match(/[^.!?\n]*[.!?]+|[^.!?\n]+$/g) || [];
  return parts
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 2);
}

const SubtitlesOverlay = () => {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const nextId = useRef(1);
  const MAX_RECONNECT_ATTEMPTS = 10;
  const queueRef = useRef([]); // pending sentences to append sequentially
  const isTickingRef = useRef(false);
  const [lines, setLines] = useState([]); // [{id,text,ts}]
  const tickerTimeoutRef = useRef(null);

  // Add a new finalized sentence line
  const pushLine = useCallback((text) => {
    const clean = (text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;

    setLines(prev => {
      // avoid duplicates (same as the newest line)
      if (prev.length && prev[prev.length - 1].text === clean) return prev;

      const now = Date.now();
      const updated = [...prev, { id: nextId.current++, text: clean, ts: now }];

      // keep only last MAX_LINES items (but older should remain on top visually)
      const sliced = updated.slice(-MAX_LINES);
      return sliced;
    });
  }, []);

  // Periodic cleanup for TTL
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - LINE_TTL_MS;
      setLines(prev => prev.filter(l => l.ts >= cutoff));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Compute readable duration based on text length
  const computeDuration = useCallback((text) => {
    const len = (text || '').length;
    let ms = Math.min(MAX_DISPLAY_MS, Math.max(MIN_DISPLAY_MS, MIN_DISPLAY_MS + len * PER_CHAR_MS));
    // Catch-up mode: if we have a lot queued, shorten the time
    const pending = queueRef.current.length;
    if (pending > QUEUE_SOFT_LIMIT) {
      const factor = Math.min(0.6, 1 - (pending - QUEUE_SOFT_LIMIT) * 0.05); // down to 60%
      ms = Math.max(500, Math.floor(ms * (1 - factor))); // faster while backlog exists
    }
    return ms;
  }, []);

  // Append lines from queue one-by-one with pacing
  const tickQueue = useCallback(() => {
    if (isTickingRef.current) return; // already in progress
    const next = queueRef.current.shift();
    if (!next) return; // nothing to do

    isTickingRef.current = true;
    pushLine(next);

    const delay = computeDuration(next);
    tickerTimeoutRef.current = setTimeout(() => {
      isTickingRef.current = false;
      tickQueue(); // show next if any
    }, delay);
  }, [computeDuration, pushLine]);

  // Enqueue sentences and start ticking if idle
  const enqueueSentences = useCallback((sentences) => {
    const toAdd = sentences
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (toAdd.length === 0) return;
    // Cap queue to avoid unbounded lag; prefer keeping the newest
    queueRef.current.push(...toAdd);
    if (queueRef.current.length > QUEUE_HARD_LIMIT) {
      queueRef.current = queueRef.current.slice(-QUEUE_HARD_LIMIT);
    }
    if (!isTickingRef.current) {
      tickQueue();
    }
  }, [tickQueue]);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
    }

    console.log(`Attempting WebSocket connection (attempt ${reconnectAttempts.current + 1})`);

    // Debug: Log all available environment variables
    console.log('=== SubtitlesOverlay WebSocket Debug Info ===');
    console.log('REACT_APP_WS_URL:', process.env.REACT_APP_WS_URL);
    console.log('REACT_APP_WS_PORT:', process.env.REACT_APP_WS_PORT);
    console.log('Current hostname:', window.location.hostname);
    console.log('All REACT_APP_ env vars:', Object.keys(process.env).filter(key => key.startsWith('REACT_APP_')).reduce((obj, key) => {
      obj[key] = process.env[key];
      return obj;
    }, {}));

    // Priority: Use explicit URL from env, then fallback to dynamic construction
    const envUrl = process.env.REACT_APP_WS_URL;

    let wsUrl;
    if (envUrl) {
      // Use explicit URL from environment (Docker internal communication)
      wsUrl = envUrl;
      console.log('✅ Using WebSocket URL from environment:', wsUrl);
    } else {
      // Fallback: Build dynamic URL for local development
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      const envPort = process.env.REACT_APP_WS_PORT;
      const wsPort = envPort || '3001';
      wsUrl = `${protocol}//${host}:${wsPort}`;
      console.log('⚠️ Using dynamic WebSocket URL (env var not found):', wsUrl);
    }
    console.log('=== End SubtitlesOverlay Debug Info ===');

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected successfully');
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
      };

      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'ready':
            setConnectionStatus('ready');
            break;
          case 'polish_sentence': {
            // Some servers may send multiple sentences in one payload
            const raw = data.sentence || '';
            const sentences = splitIntoSentences(raw);
            if (sentences.length === 0 && raw.trim().length > 0) {
              enqueueSentences([raw]);
            } else if (sentences.length > 0) {
              enqueueSentences(sentences);
            }
            break;
          }
          case 'stopped':
            // let the last lines linger briefly; then clear
            setTimeout(() => setLines([]), 1500);
            setConnectionStatus('connected');
            // clear pending queue and ticker
            queueRef.current = [];
            isTickingRef.current = false;
            if (tickerTimeoutRef.current) {
              clearTimeout(tickerTimeoutRef.current);
              tickerTimeoutRef.current = null;
            }
            break;
          case 'error':
            console.error('Server error:', data.message);
            break;
          default:
            break;
        }
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket connection closed');
        setConnectionStatus('disconnected');

        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          console.log(`Scheduling reconnection in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connectWebSocket();
          }, delay);
        } else {
          console.error('Max reconnection attempts reached');
          setConnectionStatus('error');
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      setConnectionStatus('error');
    }
  }, []);

  // Initialize
  useEffect(() => {
    document.body.classList.add('obs-overlay');
    connectWebSocket();
    return () => {
      document.body.classList.remove('obs-overlay');
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
  if (tickerTimeoutRef.current) clearTimeout(tickerTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connectWebSocket]);

  // Determine display order: oldest at the top, newest at the bottom
  const displayLines = lines; // already cropped to MAX_LINES when pushing

  return (
    <div className="subtitle-overlay">
      {connectionStatus === 'disconnected' && (
        <div className="connection-status">🔄 Reconnecting...</div>
      )}

      {(connectionStatus === 'connected' || connectionStatus === 'ready') && displayLines.length === 0 && (
        <div className="waiting-status">🎤 Waiting for audio...</div>
      )}

      {displayLines.length > 0 && (
        <div className="subtitle-list" aria-live="polite" aria-atomic="false">
          {displayLines.map((line, idx) => {
            // Newest line should be visually strongest. Compute age from bottom.
            const ageFromNewest = displayLines.length - 1 - idx; // 0=newest, higher=older
            return (
              <div key={line.id} className={`subtitle-line age-${ageFromNewest}`}>
                {line.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SubtitlesOverlay;