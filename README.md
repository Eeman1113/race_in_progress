# race_in_progress

## Latest Commit

- Holistic per-car physics tuning pass across all 7 cars (Hatchback / Muscle V8 / Sport Flat-six / Rally Turbo / Supercar V12 / F1 / God Car): each car re-tuned to its archetype across mass, torque curve, friction, suspension, brake bias, camber / toe, LSD, aero — added `brakeBias` field per car (FWD nose-bias 0.66, RWD rotation 0.54–0.58), Muscle gets more LSD + grip + heavier crank inertia so RWD is drivable, Sport drops engine inertia + adds rear-rotation toe + small wing, Rally widens turbo plateau + max LSD + biggest handbrake mult, Supercar adds top-end power + downforce + V12 inertia, F1 pushed to friction 4.4 / Cl 0.060 / mass 5 for true power-to-weight, God Car bumped to 300 force / Cl 0.070 **(HEAD)**

## all commits

- Initial commit (Rapier vehicle on the Nürburgring Nordschleife) [(e0e1949)](https://github.com/Eeman1113/race_in_progress/commit/e0e1949)
- Bump deploy workflow to Node 22 (CI) [(57a1b4e)](https://github.com/Eeman1113/race_in_progress/commit/57a1b4e)
- Add HDR sky + restore original lighting params (visual baseline) [(8b1280d)](https://github.com/Eeman1113/race_in_progress/commit/8b1280d)
- Make UI overlays responsive across viewports (media queries for ≤900 / ≤600 / ≤420 / short) [(7831be6)](https://github.com/Eeman1113/race_in_progress/commit/7831be6)
- Add touch controls for mobile (on-screen throttle / brake / steer / handbrake) [(0504060)](https://github.com/Eeman1113/race_in_progress/commit/0504060)
- Add engine + tire-squeal audio and synthesized gear-shift sound [(cd5f894)](https://github.com/Eeman1113/race_in_progress/commit/cd5f894)
- Add 7 selectable cars (hatchback / muscle / sport / rally / supercar / f1 / god — Q to cycle) [(191b7a1)](https://github.com/Eeman1113/race_in_progress/commit/191b7a1)
- Add drive-up minimap (toggle inside the keybind cheatsheet) [(23f2397)](https://github.com/Eeman1113/race_in_progress/commit/23f2397)
- Add driver-POV camera + live steering wheel (C cycles chase / free / pov) [(4d333c1)](https://github.com/Eeman1113/race_in_progress/commit/4d333c1)
- Physics overhaul (suspension, friction, aero, drivetrain — close to real) [(dd60072)](https://github.com/Eeman1113/race_in_progress/commit/dd60072)
- Add master volume slider (originally on the left of the controls overlay) [(e53102f)](https://github.com/Eeman1113/race_in_progress/commit/e53102f)
- Move volume slider into the top-right controls panel [(61d5246)](https://github.com/Eeman1113/race_in_progress/commit/61d5246)
- Fix stats panel scroll + reposition below #info dynamically; gamepad Back → cycle car [(a16cb99)](https://github.com/Eeman1113/race_in_progress/commit/a16cb99)
- Map gamepad d-pad up → stats for nerds, d-pad left → minimap [(e15a4b6)](https://github.com/Eeman1113/race_in_progress/commit/e15a4b6)
- Route engine force per driveType FWD/RWD/AWD (preserves total chassis force so accel tuning is unchanged) [(065441f)](https://github.com/Eeman1113/race_in_progress/commit/065441f)
- Unlock audio on any gesture (broader events, gamepad, resume suspended ctx) [(37744cd)](https://github.com/Eeman1113/race_in_progress/commit/37744cd)
- Add Nürburgring GP layout as second map (press 2 / dpad right, 1 to return) [(35ed254)](https://github.com/Eeman1113/race_in_progress/commit/35ed254)
- Drop center of mass + full inertia tensor (kills wheelie / pitch-up under acceleration) [(c042535)](https://github.com/Eeman1113/race_in_progress/commit/c042535)
- Retune Nürburgring GP spawn pose (lands on asphalt at the new 2× scale) [(f7ea679)](https://github.com/Eeman1113/race_in_progress/commit/f7ea679)
- Add lap timer with persistent history and finish-line detection (bottom-left pill with drop-up of past laps + average; arms only on real input; multi-gate anti-cheese on spawn-point crossings) [(c4ba794)](https://github.com/Eeman1113/race_in_progress/commit/c4ba794)
- Format README ledger as proper markdown (h2 sections + bullet list) [(d5f5d8a)](https://github.com/Eeman1113/race_in_progress/commit/d5f5d8a)
- Swap controls cheatsheet to gamepad bindings when a controller is connected (LS/RT/LT/A/X/Y/Back/Start/bumpers/dpad listed; keyboard scheme restored on disconnect) [(be95de2)](https://github.com/Eeman1113/race_in_progress/commit/be95de2)
- Drop the backfill bullet from the ledger [(6db0a34)](https://github.com/Eeman1113/race_in_progress/commit/6db0a34)
- Add the missing ledger bullet for the prior cleanup commit [(4abe7ba)](https://github.com/Eeman1113/race_in_progress/commit/4abe7ba)
- Add P2P multiplayer with ghost cars + race-to-first-lap (Trystero/nostr, no backend; shareable /CODE URL + GH-Pages SPA fallback for auto-join; ready-check with locked car selection; 1-2-3 countdown; host-wins map sync; per-peer random colors; live name + car tag updates on switch; spawn-slot offset so friends never land on you; initial-spawn handbrake held until first input) [(39b2fb0)](https://github.com/Eeman1113/race_in_progress/commit/39b2fb0)
- Make remote cars solid + collidable during the race, ghost otherwise (kinematic Rapier body per RemoteCar enabled on ready_check / countdown / racing; opaque visuals; back to translucent + non-colliding in lobby / finished) [(acf4e30)](https://github.com/Eeman1113/race_in_progress/commit/acf4e30)
- Driveability pass: joystick map widget, non-linear steering curve + deadzone + speed-scaled max angle, traction control, residual-drift zero-snap, 60-second T-key telemetry recorder, new Stats-for-Nerds sections + steering / TC graphs, Map 2 spawn relocated to the new captured pose [(57551b7)](https://github.com/Eeman1113/race_in_progress/commit/57551b7)
- Holistic per-car physics tuning pass across all 7 cars (Hatchback / Muscle V8 / Sport Flat-six / Rally Turbo / Supercar V12 / F1 / God Car): each car re-tuned to its archetype across mass, torque curve, friction, suspension, brake bias, camber / toe, LSD, aero — added `brakeBias` field per car (FWD nose-bias 0.66, RWD rotation 0.54–0.58), Muscle gets more LSD + grip + heavier crank inertia so RWD is drivable, Sport drops engine inertia + adds rear-rotation toe + small wing, Rally widens turbo plateau + max LSD + biggest handbrake mult, Supercar adds top-end power + downforce + V12 inertia, F1 pushed to friction 4.4 / Cl 0.060 / mass 5 for true power-to-weight, God Car bumped to 300 force / Cl 0.070 **(HEAD)**
