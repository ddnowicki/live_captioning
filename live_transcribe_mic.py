#!/usr/bin/env python3
"""
Live Microphone Transcription with Deepgram
Transcribes audio from your microphone in real-time and prints the output to the screen.
"""

import re
import os
import sys
import asyncio
import pyaudio
from dotenv import load_dotenv
from openai import AsyncOpenAI
from deepgram import (
    DeepgramClient,
    LiveOptions,
    LiveTranscriptionEvents,
)

class Sentence:
    _openai_client = None

    def __init__(self, sentence: str):
        self._sentence = sentence
        self._tr_sentence = None
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
        """Translate sentence to Polish using GPT-4o"""
        if not self._sentence:
            return

        client = self._get_openai_client()
        if not client:
            return  # No API key configured

        try:
            response = await client.chat.completions.create(
                model="gpt-4o",  # Using GPT-4o
                messages=[
                    {"role": "system", "content": "Translate the following English text to Polish. Provide only the translation, no explanations."},
                    {"role": "user", "content": self._sentence}
                ],
                temperature=0.3,
                max_tokens=200
            )
            self._tr_sentence = response.choices[0].message.content.strip()
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
                                # Merge with previous incomplete sentence
                                sentences[-1].sentence = last_sentence.sentence + ' ' + part
                            else:
                                sentences.append(Sentence(part))
                        else:
                            sentences.append(Sentence(part))
                    
                    # # If speech_final is true, add a visual separator
                    # if speech_final:
                    #     print("")  # Extra newline for speech break
                else:
                    not_final_sentences = [Sentence(part.strip()) for part in split_keep_delimiter(sentence, ['.', '?', ';'])]


                # clear entire terminal
                print("\033[2J\033[H")
                for sentence_obj in sentences:
                    print(f"➤ {sentence_obj.sentence}")
                    print(f"➤➤ {sentence_obj.tr_sentence}")
                for sentence_obj in not_final_sentences:
                    print(f"➤ {sentence_obj.sentence}")
                    print(f"➤➤ {sentence_obj.tr_sentence}")
            
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
    
    # Create transcriber and start transcription
    transcriber = MicrophoneTranscriber()
    await transcriber.transcribe_microphone()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\nTranscription stopped.")
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)