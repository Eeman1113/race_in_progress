# race_in_progress

## Latest Commit

- Backfill README ledger with the lap-timer + format-change commits (catches the ledger up to HEAD) **(HEAD)**

## all commits

- Initial commit (Rapier vehicle on the Nürburgring Nordschleife) `(e0e1949)`
- Bump deploy workflow to Node 22 (CI) `(57a1b4e)`
- Add HDR sky + restore original lighting params (visual baseline) `(8b1280d)`
- Make UI overlays responsive across viewports (media queries for ≤900 / ≤600 / ≤420 / short) `(7831be6)`
- Add touch controls for mobile (on-screen throttle / brake / steer / handbrake) `(0504060)`
- Add engine + tire-squeal audio and synthesized gear-shift sound `(cd5f894)`
- Add 7 selectable cars (hatchback / muscle / sport / rally / supercar / f1 / god — Q to cycle) `(191b7a1)`
- Add drive-up minimap (toggle inside the keybind cheatsheet) `(23f2397)`
- Add driver-POV camera + live steering wheel (C cycles chase / free / pov) `(4d333c1)`
- Physics overhaul (suspension, friction, aero, drivetrain — close to real) `(dd60072)`
- Add master volume slider (originally on the left of the controls overlay) `(e53102f)`
- Move volume slider into the top-right controls panel `(61d5246)`
- Fix stats panel scroll + reposition below #info dynamically; gamepad Back → cycle car `(a16cb99)`
- Map gamepad d-pad up → stats for nerds, d-pad left → minimap `(e15a4b6)`
- Route engine force per driveType FWD/RWD/AWD (preserves total chassis force so accel tuning is unchanged) `(065441f)`
- Unlock audio on any gesture (broader events, gamepad, resume suspended ctx) `(37744cd)`
- Add Nürburgring GP layout as second map (press 2 / dpad right, 1 to return) `(35ed254)`
- Drop center of mass + full inertia tensor (kills wheelie / pitch-up under acceleration) `(c042535)`
- Retune Nürburgring GP spawn pose (lands on asphalt at the new 2× scale) `(f7ea679)`
- Add lap timer with persistent history and finish-line detection (bottom-left pill with drop-up of past laps + average; arms only on real input; multi-gate anti-cheese on spawn-point crossings) `(c4ba794)`
- Format README ledger as proper markdown (h2 sections + bullet list) `(d5f5d8a)`
- Backfill README ledger with the lap-timer + format-change commits (catches the ledger up to HEAD) **(HEAD)**
