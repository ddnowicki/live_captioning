const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const { createClient } = require('@deepgram/sdk');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure WebSocket server with CORS
const wss = new WebSocket.Server({
    server,
    cors: {
        origin: "*",
        credentials: true
    }
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// Add CORS headers for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'WebSocket server running', connections: wss.clients.size });
});

// Serve static files from the React build (for production)
app.use(express.static('build'));

// Check for API keys
if (!process.env.DEEPGRAM_API_KEY) {
    console.error('ERROR: Please set your DEEPGRAM_API_KEY in the .env file');
    console.error('Get your API key from: https://console.deepgram.com/');
    process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: Please set your OPENAI_API_KEY in the .env file');
    console.error('Get your API key from: https://platform.openai.com/');
    process.exit(1);
}

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Translation cache to avoid repeated translations
const translationCache = new Map();

// Global Deepgram connection shared among all clients
let globalDeepgramLive = null;
let isTranscriptionActive = false;

// Removed queue system for immediate display (performance optimized)

// Simple 5-second translation system
const STRICT_CHUNK_TIME_MS = 2000; // 2-second chunks to reduce latency/backlog
let currentChunk = ''; // Current chunk being accumulated
let chunkTimer = null; // Timer for chunk processing
let chunkStartTime = null; // When current chunk started

// Simple translation function
// A "meaningful" text is anything containing at least one letter (latin or polish)
function isMeaningful(text) {
    return /[A-Za-z\u0104\u0105\u0106\u0107\u0118\u0119\u0141\u0142\u0143\u0144\u00D3\u00F3\u015A\u015B\u0179\u017A\u017B\u017C]/.test(text);
}

async function translateAndDisplay(chunkText) {
    if (!chunkText || !isMeaningful(chunkText.trim())) return; // Skip empty/punctuation-only

    console.log(`🔄 Translating: "${chunkText}" (${chunkText.length} chars)`);

    try {
        const translation = await translateToPolish(chunkText);

        if (translation && translation.trim().length > 0) {
            // Keep even very short, but ensure it's meaningful (e.g., "OK", "Tak", "Nie")
            const polishSentences = splitIntoSentences(translation)
                .filter(sentence => isMeaningful(sentence));

            if (polishSentences.length > 0) {
                // Display immediately
                polishSentences.forEach(sentence => {
                    broadcastToAll({
                        type: 'polish_sentence',
                        sentence: sentence,
                        displayTime: 1000
                    });
                    console.log(`➤ PL: ${sentence}`);
                });
            }
        }
    } catch (error) {
        console.error('Translation failed:', error);
    }
}

// Simple chunk accumulation with STRICT 5-second limit
function addToChunk(text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    // Start timing if this is first text
    if (currentChunk.length === 0) {
        chunkStartTime = Date.now();
    }

    // Add to current chunk
    if (currentChunk.length > 0) {
        currentChunk += ' ' + trimmedText;
    } else {
        currentChunk = trimmedText;
    }

    console.log(`📝 Chunk: "${currentChunk}" (${currentChunk.length} chars)`);

    // Check if we've hit 5 seconds - if so, cut immediately
    const elapsed = Date.now() - chunkStartTime;
    if (elapsed >= STRICT_CHUNK_TIME_MS) {
        processCurrentChunk();
        return;
    }

    // Reset timer for 5 seconds from now
    if (chunkTimer) {
        clearTimeout(chunkTimer);
    }

    chunkTimer = setTimeout(() => {
        processCurrentChunk();
    }, STRICT_CHUNK_TIME_MS - elapsed);
}

// Process current chunk immediately
function processCurrentChunk() {
    if (currentChunk.trim().length > 0) {
        console.log(`⏰ Processing chunk after ${Date.now() - chunkStartTime}ms`);

        // Translate and display in background
        translateAndDisplay(currentChunk.trim());

        currentChunk = '';
        chunkStartTime = null;
    }

    if (chunkTimer) {
        clearTimeout(chunkTimer);
        chunkTimer = null;
    }
}

// Function to translate text to Polish using OpenAI (low-cost model)
async function translateToPolish(text) {
    if (!text || text.trim().length === 0) return '';

    // Check cache first
    if (translationCache.has(text)) {
        return translationCache.get(text);
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // low-cost, fast
            temperature: 0.2,
            messages: [
                {
                    role: 'system',
                    content: `Task: You are a fast, precise translation engine. Translate all input into fluent, natural Polish for live subtitles. Output only the translation text.
                    Please repeat the prompt back as you understand it.
                    Specifics:
                    1. Translate all English text into Polish.
                    2. Maintain natural flow, clarity, and readability for subtitles.
                    3. Preserve meaning, tone, and sentence boundaries.
                    4. Do not add commentary, notes, or explanations.`
                },
                { role: 'user', content: text }
            ]
        });

        const translation = (response.choices?.[0]?.message?.content || '').trim();

        // Cache the translation
        translationCache.set(text, translation);
        if (translationCache.size > 100) {
            const firstKey = translationCache.keys().next().value;
            translationCache.delete(firstKey);
        }
        return translation;
    } catch (error) {
        console.error('Translation error:', error);
        return text; // Fallback to original text
    }
}

// Removed calculateDisplayTime function - using immediate display for speed

// Function to split text into better sentences
function splitIntoSentences(text) {
    if (!text) return [];

    // Clean and normalize the text
    text = text.trim();
    if (text.length === 0) return [];

    // Split by sentence-ending punctuation, keeping the punctuation
    let sentences = text.match(/[^.!?]*[.!?]+/g) || [];

    // If no sentence-ending punctuation found, split by pauses and conjunctions
    if (sentences.length === 0) {
        // Try splitting by common pause indicators
        sentences = text.split(/(?:,\s+(?:and|but|or|so|because|however|therefore|meanwhile))/i);

        // If still one long piece, split by length (max ~15 words per chunk)
        if (sentences.length === 1 && text.split(/\s+/).length > 15) {
            const words = text.split(/\s+/);
            sentences = [];
            for (let i = 0; i < words.length; i += 15) {
                sentences.push(words.slice(i, i + 15).join(' '));
            }
        } else if (sentences.length === 1) {
            sentences = [text]; // Keep as single sentence if reasonable length
        }
    }

    // Clean up sentences and filter out very short ones
    return sentences
        .map(s => s.trim())
        .filter(s => s.length > 3); // Keep very short sentences but filter empty
}

// Removed old display function - now using pipeline system

// Function to broadcast message to all connected clients
function broadcastToAll(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log(`New WebSocket connection from ${clientIP}. Total connections: ${wss.clients.size}`);

    // Send current transcription status to new client
    if (isTranscriptionActive) {
        ws.send(JSON.stringify({ type: 'ready' }));
    }

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'start') {
                // Only start transcription if not already active
                if (!isTranscriptionActive) {
                    console.log('Starting transcription session...');
                    isTranscriptionActive = true;

                    // Create Deepgram live transcription connection
                    globalDeepgramLive = deepgram.listen.live({
                        model: 'nova-2',
                        language: 'en-GB',
                        punctuate: true,
                        smart_format: true,
                        interim_results: true,
                        endpointing: 300,
                        utterance_end_ms: 2000,
                        encoding: 'linear16',
                        sample_rate: 16000,
                    });

                    // Handle transcription results
                    globalDeepgramLive.addListener('Results', async (data) => {
                        const transcript = data.channel.alternatives[0].transcript;

                        if (transcript && transcript.length > 0) {
                            if (data.is_final) {
                                process.stdout.write(`\r${' '.repeat(80)}\r`);
                                console.log(`➤ EN: ${transcript}`);

                                // Add to pipeline chunk system
                                addToChunk(transcript);

                                if (data.speech_final) {
                                    console.log(''); // Extra newline for speech break
                                    // Process chunk immediately on speech break
                                    processCurrentChunk();
                                }
                            } else {
                                // Show interim English results
                                process.stdout.write(`\r... ${transcript}`);

                                // Send interim transcript to clients (for English feedback)
                                broadcastToAll({
                                    type: 'interim_transcript',
                                    transcript: transcript
                                });
                            }
                        }
                    });

                    // Handle errors
                    globalDeepgramLive.addListener('Error', (error) => {
                        console.error('Deepgram error:', error);
                        broadcastToAll({ type: 'error', message: error.message });
                    });

                    // Handle metadata
                    globalDeepgramLive.addListener('Metadata', (data) => {
                        // Suppress metadata for cleaner output
                    });

                    console.log('Deepgram connection established. Ready for audio...');
                }

                // Notify the requesting client that transcription is ready
                broadcastToAll({ type: 'ready' });

            } else if (data.type === 'audio') {
                // Forward audio data to Deepgram (only if transcription is active)
                if (globalDeepgramLive && data.audio && isTranscriptionActive) {
                    const audioBuffer = Buffer.from(data.audio, 'base64');
                    globalDeepgramLive.send(audioBuffer);
                }
            } else if (data.type === 'stop') {
                console.log('Stopping transcription session...');
                if (globalDeepgramLive) {
                    globalDeepgramLive.finish();
                    globalDeepgramLive = null;
                    isTranscriptionActive = false;

                    // Notify all clients that transcription stopped
                    broadcastToAll({ type: 'stopped' });
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({ type: 'error', message: error.message }));
        }
    });

    ws.on('close', () => {
        console.log(`WebSocket connection closed. Remaining connections: ${wss.clients.size - 1}`);

        // If no clients left, stop transcription
        if (wss.clients.size === 0 && globalDeepgramLive) {
            console.log('No clients remaining, stopping transcription...');
            globalDeepgramLive.finish();
            globalDeepgramLive = null;
            isTranscriptionActive = false;
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        // Don't stop global transcription on individual client error
    });
});

server.listen(PORT, HOST, () => {
    console.log('='.repeat(50));
    console.log('Live Transcription Web Server');
    console.log('='.repeat(50));
    console.log(`Server running on http://${HOST}:${PORT}`);
    console.log('WebSocket ready for connections...');
    console.log('-'.repeat(50));
    console.log('INSTRUCTIONS:');
    console.log('- Open the web browser and allow microphone access');
    console.log('- Speak clearly into your microphone');
    console.log('- Transcription will appear in browser AND terminal');
    console.log('- Press Ctrl+C to stop server');
    console.log('-'.repeat(50));
});