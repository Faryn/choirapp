# Score Tagger Spec

## Purpose

The score tagger is an internal helper page for creating score timing data from the existing choir app repertoire. It is used while listening to a teachme track and viewing the matching score PDF. Each press of **Next page** records the current playback time as the start time of the next PDF page. Named section markers can also be added at the current playback time.

The first implementation is happy-path only. It assumes the selected voice track is a suitable reference for the song and does not handle voice tracks with different lengths.

## Source Data

The tool reuses the static choir app data:

- `web/repertoire.json` for songs, tracks, score PDFs, fingerprints, and display names.
- `web/waveforms/<song>.json` with fallback to `web/waveforms.json` for cached waveform and duration data.
- `web/vendor/pdfjs/` for PDF rendering.
- `web/data/` symlinked to the repertoire audio and PDF files.

## User Flow

1. Open `web/page-coder.html`.
2. Choose a song.
3. Choose one voice/track as the reference audio.
4. Start playback.
5. The PDF starts on page 1.
6. When playback reaches the beginning of page 2, press **Next page**.
7. The tool records the current playback time as the start of page 2 and flips the PDF to page 2.
8. When playback reaches a section boundary, type the section name and press **Mark**.
9. Repeat until all page starts and named sections are recorded.
10. Export the timing JSON.

## UI

- Song selector.
- Track selector.
- Playback controls:
  - Play/Pause.
  - Stop.
  - Skip back 5 seconds.
  - Skip forward 5 seconds.
- One waveform for the selected track.
- Current time and duration.
- One PDF page visible at a time.
- **Next page** button.
- Section-name input.
- **Mark** button for named sections.
- **Undo** button for the last marker.
- Marker list showing page number and start time.
- Section list showing section name, start time, and inferred page.
- Export JSON button.

## Timing Semantics

- Page 1 is always assumed to start at `0`.
- Pressing **Next page** records the current audio time as the start of the next page.
- Example:
  - Initial state: page 1 active, `pageStarts = [0]`.
  - Press **Next page** at `34.218s`: records page 2 start, flips to page 2.
  - Press **Next page** at `71.004s`: records page 3 start, flips to page 3.
- **Undo** removes the last recorded page start and returns to the previous page.
- **Mark** records a named section at the current audio time.
- Named sections are sorted by timestamp for export.
- A section's page is inferred from the latest page start at or before the section start.

## Export Format

The exported JSON contains one record for the current song and score:

```json
{
  "schema": "choir-app-score-tags-v1",
  "createdAt": "2026-06-19T21:18:00.000Z",
  "song": "Africa",
  "score": {
    "name": "Africa SSATB Noten.pdf",
    "url": "data/repertoire/01_Aktuelles_Repertoire/Africa/Africa SSATB Noten.pdf",
    "fingerprint": "1774730854-10811753"
  },
  "referenceTrack": {
    "name": "TM Africa - S1.mp3",
    "url": "data/repertoire/01_Aktuelles_Repertoire/Africa/TM Africa - S1.mp3",
    "fingerprint": "1774730853-4703524"
  },
  "pageStarts": [
    0,
    34.218,
    71.004
  ],
  "sections": [
    {
      "name": "Verse 1",
      "start": 12.405,
      "page": 1
    },
    {
      "name": "Chorus",
      "start": 47.813,
      "page": 2
    }
  ]
}
```

## Out Of Scope For First Version

- Handling different voice-track lengths.
- Multi-track synchronization.
- Login/admin save flow.
- Backend persistence.
- Automatic page-turn playback in the main app.
- Editing arbitrary middle markers beyond undoing the latest marker.

## Later Integration

After page timings exist, the main choir app can load a checked-in `page-sync.json` and use the selected song's `pageStarts` to scroll or flip the score page during playback.
