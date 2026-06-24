# choir app — MVP validation checklist

## Loop spike validation (Phase 1)

### Sample setup
- [ ] Load sample MP3 (vocal phrase with clear transients)
- [ ] Confirm duration parses correctly
- [ ] Set loop A/B to short phrase (~1–3s)

### Loop quality
- [ ] 30+ consecutive loop repetitions
- [ ] No severe audible gap/glitch
- [ ] No drift in loop boundaries over repetitions
- [ ] Loop remains stable after pause/resume

### Track/position behavior
- [ ] Seek works while stopped
- [ ] Seek works while playing
- [ ] Stop resets to loop start (current spike behavior)

### Browser/device matrix
- [ ] Desktop browser path validated
- [ ] Mobile browser path validated
- [ ] Known limitations documented

## Product MVP acceptance (later)
- [ ] Auth required for app access
- [ ] Admin can create song and upload multiple MP3s
- [ ] Member can play uploaded tracks
- [ ] Member can set A/B markers
- [ ] Member can enable loop and repeat selected section
- [ ] Track switch retains loop range on compatible durations
- [ ] Docker deploy with persistent storage
