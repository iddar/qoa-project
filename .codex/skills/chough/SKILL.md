---
name: chough
description: Transcribe audio and video files (MP3, WAV, MP4, MOV, M4A, OGG, WEBM, etc.) to text using the `chough` CLI tool with local STT (Whisper) models. Use when you need to identify, classify, or understand the content of audio or video files with cryptic names, unknown recordings, voice messages, podcasts, screen recordings, or any media where the content is not obvious from the filename. Also use when organizing files by content type or when verifying media is correctly classified.
---

# chough — Audio Transcription (Local STT)

This skill provides fast, private audio transcription using the `chough` CLI tool, which runs Whisper-based STT models entirely on-device (no internet required).

## When to Use

- **Classifying audio or video files**: A media file has a cryptic name (UUID, hash, generic name like `audio.mp3`, `recording.wav`, `video.mp4`, `16293949.mov`) and you need to know what it contains.
- **Verifying media placement**: You're unsure if a file is in the correct folder (e.g., a podcast vs. a voice note vs. a demo video).
- **Identifying unknown recordings**: Screen recordings with audio, WhatsApp voices, meeting recordings, call logs, AI demo videos, pitch videos.
- **Batch identification**: Many media files need content inspection — transcribe a sample or all to understand the collection.
- **Organizing by topic**: After transcription, move media to the correct category (podcast, voice note, demo, pitch, screen recording, etc.)

## Supported File Types

- **Audio**: MP3, WAV, M4A, OGG, AAC, FLAC, OPUS
- **Video**: MP4, MOV, M4V, WEBM (chough extracts the audio track automatically)
- **Other**: Any file that contains an audio stream

## Basic Usage

Transcribe a single file:

```bash
chough "/path/to/audio.mp3"
```

Transcribe and save to a file:

```bash
chough -o transcription.txt "/path/to/audio.mp3"
```

Transcribe from stdin / pipe:

```bash
cat audio.mp3 | chough > output.txt
```

Change chunk size (default 60s):

```bash
chough -c 30 "/path/to/audio.mp3"  # 30s chunks
```

Output in different formats:

```bash
chough -f json "/path/to/audio.mp3"    # JSON output
chough -f vtt -o subtitles.vtt "/path/to/audio.mp3"  # WebVTT subtitles
```

## Remote Server Mode

For faster transcription on a remote server:

```bash
# Set the remote server URL
CHOUGH_URL=http://localhost:8080 chough -r "/path/to/audio.mp3"

# Start a chough server
chough --server --host 0.0.0.0 --port 8080 --workers 4
```

## Batch Transcription

Transcribe all audio files in a directory:

```bash
for f in *.mp3 *.wav *.m4a; do
  [ -f "$f" ] || continue
  echo "=== $f ==="
  chough "$f" 2>/dev/null | head -n 5
  echo ""
done
```

Or use a loop with output files:

```bash
mkdir -p transcriptions
for f in *.mp3; do
  chough -o "transcriptions/${f%.mp3}.txt" "$f"
done
```

## Workflow for Audio Classification

1. Identify media files with suspicious or unknown names:
   ```bash
   find . -maxdepth 2 -type f | grep -iE '\.(mp3|wav|m4a|ogg|webm|aac|flac|mp4|mov|m4v)$'
   find . -maxdepth 1 -type f | grep -iE '[0-9a-f]{8}-|voice|audio|record|recording|sample|video|pitch|demo|screen'
   ```

2. Transcribe each suspicious file (works with both audio and video):
   ```bash
   chough "suspicious-audio.mp3" 2>&1 | tail -n 20
   chough "suspicious-video.mp4" 2>&1 | tail -n 20
   ```

3. Based on content, determine the correct category:

   | Content Type | Keywords / Signals | Move To |
   |---|---|---|
   | Podcast / Tech discussion | "bienvenidos a otro episodio", "tendencia", "IA", "modelo", "agente" | `05_Codigo_Datos_Tech/Herramientas_IA/` |
   | AI Demo video | "Innova y Vende", product showcase, clothing/sacks description | `04_Negocios_Proyectos/Innova_y_Vende/` |
   | WhatsApp voice note | Short duration (<30s), informal speech, reference to people/things | `06_Imagenes/Screenshots_Desktop/Chat_Mensajes/` |
   | Music | Lyrics, song titles, artist mentions | `06_Imagenes/Fotos_Generales/Musica/` or create Music folder |
   | Screen recording with audio | "Screen Recording", presentation, code demos | `07_Videos_Audio/Screen_Recordings/` |
   | Pitch / Demo video | "pitch", "demo", startup/product pitch | `07_Videos_Audio/Pitch_Demo_Videos/` |
   | Demo / Test | "probando", "test", product/service name | `07_Videos_Audio/Audio/` or project folder |
   | Business call | "cliente", "proyecto", "deadline", "reunión" | `04_Negocios_Proyectos/` or relevant project |
   | Personal memo | Notes, reminders, personal thoughts | `02_Documentos_Personal_Legal/` |
   | Security camera | `.dav` extension, long duration, no speech | `07_Videos_Audio/Vigilancia_Camara/` |
   | Startup video | Company names, market analysis, "burbuja", "tragedia" | `07_Videos_Audio/Startup_Videos/` |

4. Rename and move:
   ```bash
   # Rename based on content
   mv "unknown-video.mp4" "Innova_y_Vende_Sacos_Demo.mp4"

   # Move to correct folder
   mv "Innova_y_Vende_Sacos_Demo.mp4" ~/Downloads/04_Negocios_Proyectos/Innova_y_Vende/
   ```

## Common Content Patterns

### Podcasts / AI Content
```
"bienvenidos a otro episodio", "tendencia", "modelo de IA", "agente",
"Dreamer", "Mistral", "Claude", "OpenAI"
```
→ `05_Codigo_Datos_Tech/Herramientas_IA/`

### WhatsApp Voice Messages
```
Short (<20s), informal, references to food/people/actions,
"Acepto el cargo", "Agrega un refresco"
```
→ `06_Imagenes/Screenshots_Desktop/Chat_Mensajes/`

### AI / Product Demo Videos
```
"Innova y Vende", "sacos", product description, clothing,
"hyperrealistic 3D", specific product showcases
```
→ `04_Negocios_Proyectos/Innova_y_Vende/` or `06_Imagenes/Imagenes_IA/`

### Business / Consulting
```
"cliente", "sistema", "optimización", "base de datos", "consulta",
"experiencia del usuario", "costos", "arquitectura"
```
→ `04_Negocios_Proyectos/` or relevant project

### Music
```
Lyrics with melody, song structure, artist/song titles
```
→ `06_Imagenes/Fotos_Generales/Musica/` or dedicated folder

## Notes

- **Local processing**: All transcription runs locally — no internet, no data sent to external servers.
- **Language**: `chough` auto-detects language. For Spanish audio it works well out of the box.
- **Speed**: Typically 30-40x realtime on modern hardware (e.g., a 10s file processes in ~0.3s).
- **File formats**: Supports audio formats (MP3, WAV, M4A, OGG, WEBM, AAC, FLAC) and video formats (MP4, MOV, M4V). For video files, `chough` automatically extracts the audio track and transcribes it.
- **Long files**: Use `-c 30` or `-c 60` for chunked transcription of files >60s.
- **Pipe input**: You can pipe audio data directly: `cat audio.mp3 | chough`.
- **Privacy**: Since transcription is 100% local, it respects privacy for sensitive audio (calls, medical, legal recordings).

## Installation

If `chough` is not installed:

```bash
# Install via pip (if available)
pip install chough

# Or download from GitHub releases
# https://github.com/your-repo/chough
```

## Troubleshooting

**Error: failed to get duration**
- The audio file may be corrupted or in an unsupported format.
- Try converting first: `ffmpeg -i input.mov -acodec mp3 output.mp3`

**Slow transcription**
- Try smaller chunk size: `chough -c 30 large-file.mp3`
- For a remote server: `chough -r large-file.mp3`

**Empty transcription**
- The audio may be mostly music/silence with no speech.
- Check if the file has actual speech content.

**Wrong language detected**
- `chough` auto-detects. For consistent results with specific languages, check if the tool supports a language flag.
