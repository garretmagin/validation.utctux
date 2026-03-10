"""
UTCT UX Demo — Voice-Over Generation Script

Generates narration audio from the SSML transcript using Azure Cognitive Services TTS.

Prerequisites:
  pip install azure-cognitiveservices-speech

Environment variables:
  AZURE_SPEECH_KEY     — Azure Speech Services subscription key
  AZURE_SPEECH_REGION  — Azure region (e.g., 'westus2')

Usage:
  python generate-voice.py                          # Generate with defaults
  python generate-voice.py --voice en-US-GuyNeural  # Specify voice
  python generate-voice.py --output narration.mp3   # Specify output file

Alternative (no Azure key): Use Clipchamp or MAI-Voice-1
  See transcript.md for the plain-text script you can paste into either tool.
"""

import argparse
import os
import sys

def generate_with_azure(ssml_path: str, output_path: str, voice_name: str):
    """Generate audio using Azure Cognitive Services Speech SDK."""
    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError:
        print("ERROR: azure-cognitiveservices-speech not installed.")
        print("Run: pip install azure-cognitiveservices-speech")
        sys.exit(1)

    speech_key = os.environ.get('AZURE_SPEECH_KEY')
    speech_region = os.environ.get('AZURE_SPEECH_REGION')

    if not speech_key or not speech_region:
        print("ERROR: Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION environment variables.")
        print()
        print("Alternative approaches that don't require an Azure key:")
        print()
        print("  1. CLIPCHAMP (recommended, free with Microsoft account):")
        print("     - Open https://clipchamp.com")
        print("     - Create project → Record & Create → Text to Speech")
        print("     - Paste segments from transcript.md")
        print("     - Choose voice, adjust speed, export audio")
        print()
        print("  2. MAI-Voice-1 via Copilot Labs:")
        print("     - Open https://copilot.microsoft.com/labs")
        print("     - Use Audio Expressions feature")
        print("     - Paste transcript, generate MP3 segments")
        print()
        sys.exit(1)

    # Read SSML content
    with open(ssml_path, 'r', encoding='utf-8') as f:
        ssml_content = f.read()

    # Configure speech synthesis
    speech_config = speechsdk.SpeechConfig(subscription=speech_key, region=speech_region)
    speech_config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Audio48Khz192KBitRateMonoMp3
    )

    audio_config = speechsdk.audio.AudioOutputConfig(filename=output_path)
    synthesizer = speechsdk.SpeechSynthesizer(
        speech_config=speech_config,
        audio_config=audio_config
    )

    print(f"Generating voice-over with voice: {voice_name}")
    print(f"SSML source: {ssml_path}")
    print(f"Output: {output_path}")
    print()

    result = synthesizer.speak_ssml_async(ssml_content).get()

    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        duration_ms = result.audio_duration.total_seconds() * 1000 if result.audio_duration else 0
        print(f"✅ Audio generated successfully!")
        print(f"   Duration: {duration_ms/1000:.1f}s")
        print(f"   Saved to: {output_path}")
    elif result.reason == speechsdk.ResultReason.Canceled:
        cancellation = result.cancellation_details
        print(f"❌ Speech synthesis canceled: {cancellation.reason}")
        if cancellation.error_details:
            print(f"   Error: {cancellation.error_details}")
        sys.exit(1)


def print_manual_instructions():
    """Print instructions for generating audio without Azure."""
    print("=" * 60)
    print("VOICE-OVER GENERATION — Manual Options")
    print("=" * 60)
    print()
    print("Option 1: CLIPCHAMP (Recommended)")
    print("-" * 40)
    print("1. Open https://clipchamp.com")
    print("2. Import your screen recording video")
    print("3. Go to 'Record & Create' → 'Text to Speech'")
    print("4. Paste segments from transcript.md one at a time")
    print("5. Choose a voice (e.g., 'Guy' or 'Jenny' in en-US)")
    print("6. Adjust pitch and speed to taste")
    print("7. Save each segment to your media library")
    print("8. Drag audio clips onto the timeline, aligned to video")
    print("9. Export final video with voiceover baked in")
    print("10. Save transcript as .tt file for captions")
    print()
    print("Option 2: MAI-Voice-1 (Copilot Labs)")
    print("-" * 40)
    print("1. Open https://copilot.microsoft.com/labs")
    print("2. Find 'Audio Expressions' or TTS feature")
    print("3. Paste full transcript from transcript.md")
    print("4. Select 'Story Mode' for natural narration")
    print("5. Generate and download MP3")
    print("6. Import into video editor (Clipchamp, etc.)")
    print()
    print("Option 3: Azure TTS (Automated)")
    print("-" * 40)
    print("Set environment variables and re-run:")
    print("  $env:AZURE_SPEECH_KEY = 'your-key'")
    print("  $env:AZURE_SPEECH_REGION = 'westus2'")
    print("  python generate-voice.py")
    print()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate demo voice-over audio')
    parser.add_argument('--ssml', default='transcript-ssml.xml',
                        help='Path to SSML transcript file')
    parser.add_argument('--output', '-o', default='narration.mp3',
                        help='Output audio file path')
    parser.add_argument('--voice', default='en-US-GuyNeural',
                        help='Azure TTS voice name')
    parser.add_argument('--manual', action='store_true',
                        help='Print manual generation instructions instead')

    args = parser.parse_args()

    if args.manual:
        print_manual_instructions()
    else:
        # Check if Azure credentials are available
        if not os.environ.get('AZURE_SPEECH_KEY'):
            print("No AZURE_SPEECH_KEY found. Showing manual alternatives.\n")
            print_manual_instructions()
        else:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            ssml_path = os.path.join(script_dir, args.ssml)
            output_path = os.path.join(script_dir, args.output)
            generate_with_azure(ssml_path, output_path, args.voice)
