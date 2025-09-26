#!/usr/bin/env python3
"""
Live Microphone Transcription with Deepgram
Transcribes audio from your microphone in real-time and prints the output to the screen.
"""

import re
import os
import sys
import asyncio
import json
import pyaudio
import websockets
from dotenv import load_dotenv
from openai import AsyncOpenAI
from deepgram import (
    DeepgramClient,
    LiveOptions,
    LiveTranscriptionEvents,
)

class Sentence:
    _openai_client = None

    def __init__(self, sentence: str, initial_translation: str = None):
        self._sentence = sentence
        self._tr_sentence = initial_translation
        # Trigger translation on initialization
        asyncio.create_task(self._translate_to_polish())

    @classmethod
    def _get_openai_client(cls):
        if cls._openai_client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if api_key and api_key != "your_openai_api_key_here":
                cls._openai_client = AsyncOpenAI(api_key=api_key)
        return cls._openai_client

    async def _translate_to_polish(self):
        """Translate sentence to Polish using GPT-4o Realtime API"""
        if not self._sentence:
            return

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return

        try:
            import websockets
            import json

            url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Beta": "realtime=v1"
            }

            async with websockets.connect(url, additional_headers=headers) as websocket:
                # Configure session for text-only mode
                session_config = {
                    "type": "session.update",
                    "session": {
                        "modalities": ["text"],
                        "instructions": "You are a translator. Translate the following English text to Polish. Provide only the translation, no explanations.",
                        "tools": [],
                        "tool_choice": "auto",
                        "temperature": 0.6,
                        "max_response_output_tokens": 200
                    }
                }
                await websocket.send(json.dumps(session_config))

                # Create conversation item
                item_create = {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "message",
                        "role": "user",
                        "content": [{"type": "input_text", "text": self._sentence}]
                    }
                }
                await websocket.send(json.dumps(item_create))

                # Request response
                response_create = {"type": "response.create"}
                await websocket.send(json.dumps(response_create))

                # Listen for response
                translation_text = ""
                while True:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                        data = json.loads(message)

                        if data.get('type') == 'response.text.delta':
                            translation_text += data.get('delta', '')
                        elif data.get('type') == 'response.text.done':
                            self._tr_sentence = translation_text.strip()
                            asyncio.create_task(broadcast_update())
                            break
                        elif data.get('type') == 'response.done':
                            break
                        elif data.get('type') == 'error':
                            print(f"Translation error: {data}")
                            break
                    except asyncio.TimeoutError:
                        print("Translation timeout")
                        break

        except Exception as e:
            print(f"Translation error: {e}")

    @property
    def sentence(self):
        return self._sentence

    @sentence.setter
    def sentence(self, value: str):
        self._sentence = value
        # Trigger translation when sentence is updated
        asyncio.create_task(self._translate_to_polish())

    @property
    def tr_sentence(self):
        return self._tr_sentence

sentences = []
not_final_sentences = []
connected_clients = set()

async def broadcast_update():
    """Broadcast current sentences to all connected WebSocket clients"""
    if connected_clients:
        message = json.dumps({
            'type': 'update',
            'sentences': [
                {'sentence': s.sentence, 'tr_sentence': s.tr_sentence}
                for s in sentences
            ],
            'not_final_sentences': [
                {'sentence': s.sentence, 'tr_sentence': s.tr_sentence}
                for s in not_final_sentences
            ]
        })
        disconnected = set()
        for client in connected_clients:
            try:
                await client.send(message)
            except:
                disconnected.add(client)
        connected_clients.difference_update(disconnected)

async def websocket_handler(websocket):
    """Handle WebSocket connections from OBS overlay"""
    connected_clients.add(websocket)
    print(f"Client connected. Total clients: {len(connected_clients)}")

    try:
        # Send initial data
        await broadcast_update()
        # Keep connection alive
        await websocket.wait_closed()
    finally:
        connected_clients.remove(websocket)
        print(f"Client disconnected. Total clients: {len(connected_clients)}")

def split_keep_delimiter(text, delimiters):
    """Split text by delimiters while keeping delimiters attached to sentences."""
    if not text:
        return []

    pattern = f'([{re.escape("".join(delimiters))}])'
    parts = re.split(pattern, text)

    # Filter out empty strings and combine parts with delimiters
    result = []
    for i in range(0, len(parts) - 1, 2):
        sentence = parts[i]
        delimiter = parts[i + 1] if i + 1 < len(parts) else ""
        if sentence.strip():  # Skip empty sentences
            result.append(sentence + delimiter)

    # Handle last part if it doesn't end with a delimiter
    if len(parts) % 2 == 1 and parts[-1].strip():
        result.append(parts[-1])

    return result

# Load environment variables
load_dotenv()

class MicrophoneTranscriber:
    def __init__(self):
        """Initialize the Deepgram client and audio settings."""
        api_key = os.getenv("DEEPGRAM_API_KEY")
        if not api_key or api_key == "your_deepgram_api_key_here":
            print("ERROR: Please set your DEEPGRAM_API_KEY in the .env file")
            print("Get your API key from: https://console.deepgram.com/")
            sys.exit(1)
        
        self.deepgram = DeepgramClient(api_key)
        self.connection = None
        
        # Audio settings
        self.RATE = 16000
        self.CHUNK = 8000
        self.FORMAT = pyaudio.paInt16
        self.CHANNELS = 1
        
    async def transcribe_microphone(self):
        """Transcribe audio from the microphone in real-time."""
        print("Initializing microphone...")
        print("-" * 50)
        print("INSTRUCTIONS:")
        print("- Speak clearly into your microphone")
        print("- Press Ctrl+C to stop transcription")
        print("-" * 50)
        
        try:
            # Initialize PyAudio
            audio = pyaudio.PyAudio()
            
            # Open microphone stream
            stream = audio.open(
                format=self.FORMAT,
                channels=self.CHANNELS,
                rate=self.RATE,
                input=True,
                frames_per_buffer=self.CHUNK
            )
            
            print("Connecting to Deepgram...")
            
            # Create a websocket connection to Deepgram
            self.connection = self.deepgram.listen.asyncwebsocket.v("1")
            
            # Configure transcription options for maximum accuracy
            options = LiveOptions(
                model="nova-3",  # Nova-2 model for streaming
                language="en-GB",  # British English
                punctuate=True,
                smart_format=True,
                interim_results=True,
                endpointing=1500,  # Increased endpointing to prevent mid-sentence cuts (1.5s silence)
                utterance_end_ms=5000,  # Longer utterance end for better context (5 seconds)
                vad_events=True,  # Enable VAD events for better speech detection
                encoding="linear16",
                sample_rate=self.RATE,
                channels=self.CHANNELS,
                diarize=False,  # Disable speaker diarization for better continuity
                multichannel=False,  # Single channel for consistency
                profanity_filter=False,  # No filtering for natural speech
                redact=False,  # No redaction for complete context
                filler_words=True,  # Enable filler words for more accurate representation
                numerals=True,  # Format numbers properly
                search=None,  # No keyword search filtering
                replace=None,  # No word replacement
                keywords=None,  # No keyword boosting that might fragment speech
                tag=["accuracy"],  # Tag for accuracy optimization
            )
            
            # Define event handlers
            async def on_message(_, result):
                """Handle transcription results."""
                global sentences, not_final_sentences
                if result is None:
                    return
                    
                sentence = result.channel.alternatives[0].transcript
                
                # Skip empty transcripts
                if len(sentence) == 0:
                    return
                
                # Check if this is a final or interim result
                is_final = result.is_final
                speech_final = result.speech_final if hasattr(result, 'speech_final') else False
                
                if is_final:
                    not_final_sentences = []
                    # Clear any interim output and print final
                    # print(f"\r{' ' * 80}\r", end="")  # Clear the line
                    # print(f"➤ {sentence}")
                    parts = split_keep_delimiter(sentence, ['.', '?', ';'])
                    for part in parts:
                        part = part.strip()
                        # Check if previous sentence ended properly, if not merge
                        if sentences and len(sentences) > 0:
                            last_sentence = sentences[-1]
                            if last_sentence.sentence and not last_sentence.sentence.endswith(('.', '?', ';', '!', ':')):
                                # Merge with previous incomplete sentence, preserve translation
                                old_translation = last_sentence.tr_sentence + '...' if last_sentence.tr_sentence is not None else None
                                merged_text = last_sentence.sentence + ' ' + part
                                sentences[-1] = Sentence(merged_text, old_translation)
                            elif last_sentence.sentence and len(last_sentence.sentence) < 80:
                                # Merge with previous too short sentence, preserve translation
                                old_translation = last_sentence.tr_sentence + '...' if last_sentence.tr_sentence is not None else None
                                merged_text = last_sentence.sentence + ' ' + part
                                sentences[-1] = Sentence(merged_text, old_translation)
                            else:
                                sentences.append(Sentence(part))
                        else:
                            sentences.append(Sentence(part))
                else:
                    var_translation = not_final_sentences[-1].tr_sentence + '...' if len(not_final_sentences) > 0 and not_final_sentences[-1].tr_sentence is not None else None
                    not_final_sentences = [Sentence(sentence, var_translation)]

                # Broadcast update to WebSocket clients (non-blocking)
                asyncio.create_task(broadcast_update())
            
            async def on_metadata(_, metadata):
                """Handle metadata events."""
                # Suppress metadata output for cleaner display
                pass
            
            async def on_error(_, error):
                """Handle error events."""
                print(f"\n[ERROR]: {error}")
            
            # Register event handlers
            self.connection.on(LiveTranscriptionEvents.Transcript, on_message)
            self.connection.on(LiveTranscriptionEvents.Metadata, on_metadata)
            self.connection.on(LiveTranscriptionEvents.Error, on_error)
            
            # Start the connection
            print("Starting transcription...")
            await self.connection.start(options)
            
            print("\n🎤 Listening... Start speaking!\n")
            
            # Create a task for reading from the microphone
            async def microphone_stream():
                """Read audio from microphone and send to Deepgram."""
                loop = asyncio.get_event_loop()
                
                while True:
                    try:
                        # Read audio chunk from microphone
                        data = await loop.run_in_executor(None, stream.read, self.CHUNK, False)
                        # Send to Deepgram
                        await self.connection.send(data)
                    except Exception as e:
                        break
            
            # Run the microphone stream
            await microphone_stream()
            
        except KeyboardInterrupt:
            print("\n\nStopping transcription...")
        except Exception as e:
            print(f"Error during transcription: {e}")
        finally:
            # Clean up
            if self.connection:
                await self.connection.finish()
                print("Connection closed.")
            
            try:
                stream.stop_stream()
                stream.close()
                audio.terminate()
            except:
                pass

async def main():
    """Main function to run the microphone transcriber."""
    print("Live Microphone Transcription with Deepgram")
    print("=" * 50)
    print("WebSocket server running on ws://localhost:8765")
    print("Open obs_overlay.html in OBS Browser Source")
    print("=" * 50)

    # Start WebSocket server
    ws_server = await websockets.serve(websocket_handler, "localhost", 8765)

    # Create transcriber and start transcription
    transcriber = MicrophoneTranscriber()

    try:
        await transcriber.transcribe_microphone()
    finally:
        ws_server.close()
        await ws_server.wait_closed()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nTranscription stopped.")
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)