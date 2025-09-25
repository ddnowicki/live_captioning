import React, { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';

const App = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [microphones, setMicrophones] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState('');

  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyzerRef = useRef(null);
  const processorRef = useRef(null);
  const animationFrameRef = useRef(null);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    // Debug: Log all available environment variables
    console.log('=== WebSocket Connection Debug Info ===');
    console.log('REACT_APP_WS_URL:', process.env.REACT_APP_WS_URL);
    console.log('Current hostname:', window.location.hostname);
    console.log('Current protocol:', window.location.protocol);
    console.log('Current port:', window.location.port);

    // Smart WebSocket URL construction
    let wsUrl;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;

    // Check if we're running in production (HTTPS) or development
    if (window.location.protocol === 'https:') {
      // HTTPS: Use WSS with same hostname but port 60006
      wsUrl = `wss://${host}:60006`;
      console.log('🔒 HTTPS detected - Using WSS connection:', wsUrl);
    } else if (host === 'localhost' || host === '127.0.0.1') {
      // Local development: Direct connection to localhost
      wsUrl = `ws://localhost:60006`;
      console.log('💻 Local development - Using localhost WebSocket:', wsUrl);
    } else {
      // HTTP production (local network): Use server IP
      wsUrl = `ws://${host}:60006`;
      console.log('🌐 HTTP production - Using server WebSocket:', wsUrl);
    }
    console.log('=== End Debug Info ===');

    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus('connected');
      setError('');
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'ready':
          setConnectionStatus('ready');
          break;
        case 'interim_transcript':
          setInterimTranscript(data.transcript);
          break;
        case 'polish_sentence':
          // Display Polish translations on main page too
          const polishText = data.sentence?.trim() || '';
          if (polishText) {
            setTranscript(prev => prev + '🇵🇱 ' + polishText + '\n');
          }
          setInterimTranscript(''); // Clear interim when Polish appears
          break;
        case 'error':
          setError(`Error: ${data.message}`);
          console.error('Server error:', data.message);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus('disconnected');
    };

    wsRef.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection failed');
      setConnectionStatus('error');
    };
  }, []);

  // Get available microphones
  const getMicrophones = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      setMicrophones(audioInputs);

      if (audioInputs.length > 0 && !selectedMicId) {
        setSelectedMicId(audioInputs[0].deviceId);
      }
    } catch (err) {
      console.error('Error getting microphones:', err);
      setError('Failed to get microphone list');
    }
  }, [selectedMicId]);

  // Audio level monitoring
  const updateAudioLevel = useCallback(() => {
    if (analyzerRef.current) {
      const dataArray = new Uint8Array(analyzerRef.current.fftSize);
      analyzerRef.current.getByteTimeDomainData(dataArray);

      // Calculate RMS (Root Mean Square) for better audio level detection
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const sample = (dataArray[i] - 128) / 128; // Convert to -1 to 1 range
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const level = Math.min(100, rms * 100 * 3); // Multiply by 3 for better sensitivity

      setAudioLevel(level);

      if (isRecording) {
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      }
    }
  }, [isRecording]);

  // Initialize WebSocket and get microphones on component mount
  useEffect(() => {
    connectWebSocket();
    getMicrophones();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [connectWebSocket, getMicrophones]);

  // Start recording
  const startRecording = async () => {
    try {
      setError('');

      // Request microphone access with selected device
      const constraints = {
        audio: {
          deviceId: selectedMicId ? { exact: selectedMicId } : undefined,
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Create AudioContext for raw audio processing
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyzerRef.current = audioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 256;

      // Create ScriptProcessorNode for raw audio data
      processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);

      processorRef.current.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);

        // Convert float32 to int16 (PCM format for Deepgram)
        const int16Array = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputData[i]));
          int16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        }

        // Send raw PCM data to server
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const buffer = int16Array.buffer;
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

          wsRef.current.send(JSON.stringify({
            type: 'audio',
            audio: base64
          }));
        }
      };

      // Connect audio nodes
      source.connect(analyzerRef.current);
      analyzerRef.current.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      // Start audio level monitoring
      updateAudioLevel();

      // Signal server to start transcription
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'start' }));
      }

      setIsRecording(true);
      setTranscript('');
      setInterimTranscript('');

    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Failed to access microphone. Please check permissions.');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (analyzerRef.current) {
      analyzerRef.current.disconnect();
      analyzerRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }

    setIsRecording(false);
    setAudioLevel(0);
    setConnectionStatus('connected');
  };

  // Clear transcript
  const clearTranscript = () => {
    setTranscript('');
    setInterimTranscript('');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎤 Live Transcription</h1>
        <p>Real-time audio transcription with Deepgram</p>
      </header>

      <main className="app-main">
        <div className="controls">
          <div className="status-indicators">
            <div className={`status-indicator ${connectionStatus}`}>
              <span className="status-dot"></span>
              <span>
                {connectionStatus === 'connected' && 'Connected'}
                {connectionStatus === 'ready' && 'Ready'}
                {connectionStatus === 'disconnected' && 'Disconnected'}
                {connectionStatus === 'error' && 'Error'}
              </span>
            </div>

            {isRecording && (
              <div className="recording-indicator">
                <span className="recording-dot"></span>
                <span>Recording</span>
              </div>
            )}
          </div>

          <div className="microphone-settings">
            <div className="mic-selector">
              <label htmlFor="mic-select">🎤 Microphone:</label>
              <select
                id="mic-select"
                value={selectedMicId}
                onChange={(e) => setSelectedMicId(e.target.value)}
                disabled={isRecording}
              >
                {microphones.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Microphone ${mic.deviceId.slice(0, 8)}...`}
                  </option>
                ))}
              </select>
            </div>

            <div className="audio-level">
              <label>🔊 Audio Level:</label>
              <div className="level-meter">
                <div
                  className="level-bar"
                  style={{
                    width: `${audioLevel}%`,
                    backgroundColor: audioLevel > 70 ? '#ef4444' : audioLevel > 40 ? '#f59e0b' : '#10b981'
                  }}
                ></div>
              </div>
              <span className="level-text">{Math.round(audioLevel)}%</span>
            </div>
          </div>

          <div className="control-buttons">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={connectionStatus !== 'connected' && connectionStatus !== 'ready'}
              className={`record-button ${isRecording ? 'recording' : ''}`}
            >
              {isRecording ? '⏹️ Stop' : '🎤 Start Recording'}
            </button>

            <button onClick={clearTranscript} className="clear-button">
              🗑️ Clear
            </button>
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}
        </div>

        <div className="transcript-container">
          <div className="transcript-header">
            <h2>Transcription</h2>
            <small>Interim results shown in gray, final results in white</small>
          </div>

          <div className="transcript-content">
            <div className="final-transcript">
              {transcript}
            </div>
            {interimTranscript && (
              <div className="interim-transcript">
                ... {interimTranscript}
              </div>
            )}
            {!transcript && !interimTranscript && !isRecording && (
              <div className="placeholder">
                Click "Start Recording" and begin speaking to see transcription here.
                <br />
                <small>Make sure to allow microphone access when prompted.</small>
              </div>
            )}
          </div>
        </div>

        <div className="instructions">
          <h3>Instructions</h3>
          <ul>
            <li>Click "Start Recording" to begin transcription</li>
            <li>Allow microphone access when prompted</li>
            <li>Speak clearly into your microphone</li>
            <li>Transcription appears both here and in the terminal</li>
            <li>Click "Stop" to end the session</li>
          </ul>

          <div className="obs-section">
            <h3>🎥 For OBS/Streaming</h3>
            <p>Use this URL for transparent subtitles overlay in OBS:</p>
            <div className="obs-url">
              <code>http://localhost:3000/subtitles</code>
              <button
                onClick={() => navigator.clipboard.writeText('http://localhost:3000/subtitles')}
                className="copy-button"
              >
                📋 Copy
              </button>
            </div>
            <div className="obs-instructions">
              <h4>OBS Setup:</h4>
              <ol>
                <li>Add "Browser Source" to your scene</li>
                <li>Paste the URL above</li>
                <li>Set Width: 1920, Height: 1080 (or your resolution)</li>
                <li>Enable "Shutdown source when not visible"</li>
                <li>Start recording here first, then the subtitles will appear in OBS</li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;