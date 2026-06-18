import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RapierPhysics } from './lib/RapierPhysics.js';
import { RapierHelper } from 'three/addons/helpers/RapierHelper.js';
import Stats from 'three/addons/libs/stats.module.js';

let camera, scene, renderer, stats;
let physics, physicsHelper, controls;
let car, chassis, wheels, vehicleController;
let clock;
let fpsLabel, posLabel;
let track, trackBody, sunLight, sunTarget;
let speedoEl, speedoNumEl, speedoGearEl, speedoRpmFillEl, speedoModeEl, speedoControllerEl;

// Lucide SVG icons inlined so we don't pull in the whole lucide package.
// Both use `currentColor` so they inherit text colour.
const ICONS = {
    'bar-chart-3': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
    'gamepad-2': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>',
    'x': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
};

function iconHTML( name, size = 14 ) {

    return `<span style="display:inline-flex;width:${ size }px;height:${ size }px;vertical-align:-2px">${ ICONS[ name ] || '' }</span>`;

}

// ---------------- car swap (Q to cycle) ----------------

function applyCarConfig( car, skipVisuals ) {

    currentCar = car;

    // Engine model values used by every per-frame path.
    engine.idleRpm = car.engineIdleRpm;
    engine.redline = car.engineRedline;
    engine.autoUpshiftRpm = car.autoUpshiftRpm;
    engine.autoDownshiftRpm = car.autoDownshiftRpm;

    // Clamp current gear to the new car's gear count (if we shrank from 10
    // gears down to 5 we don't want to be in nonexistent 8th).
    if ( transmission.gear > car.gearRatios.length ) transmission.gear = car.gearRatios.length;

    // Mass — Rapier setAdditionalMass adds to the baseline (lightest car).
    if ( chassis ) {

        const baselineMass = Math.min( ...CARS.map( c => c.mass ) );
        const extra = Math.max( 0, car.mass - baselineMass );
        chassis.setAdditionalMass( extra, true );

    }

    // Per-wheel suspension + friction + connection-point Y. Wheels keep their
    // X/Z positions; we only retune what the wheel/spring does.
    if ( vehicleController ) {

        for ( let i = 0; i < 4; i ++ ) {

            vehicleController.setWheelFrictionSlip( i, car.wheelFrictionSlip );
            vehicleController.setWheelSuspensionStiffness( i, car.suspensionStiffness );
            vehicleController.setWheelSuspensionCompression( i, car.suspensionCompression );
            vehicleController.setWheelSuspensionRelaxation( i, car.suspensionRelaxation );
            vehicleController.setWheelSuspensionRestLength( i, car.suspensionRestLength );
            const cp = vehicleController.wheelChassisConnectionPointCs( i );
            vehicleController.setWheelChassisConnectionPointCs( i, { x: cp.x, y: car.wheelConnectionY, z: cp.z } );

        }

    }

    // Visuals.
    if ( ! skipVisuals && carVisualsGroup ) {

        _disposeCarVisuals();
        buildCarVisuals( carVisualsGroup, car );

    }

    // Engine sound.
    swapEngineAudio( car );

    // Update the speedometer gear-digit colour + persistent top badge to match.
    const hex = '#' + car.bodyColor.toString( 16 ).padStart( 6, '0' );
    if ( speedoGearEl ) speedoGearEl.style.color = hex;
    if ( carBadgeEl ) {

        carBadgeEl.textContent = car.name.toUpperCase();
        carBadgeEl.style.color = hex;
        carBadgeEl.style.borderColor = hex + '4d'; // ~30% alpha

    }

}

function cycleCar( direction ) {

    currentCarIndex = ( currentCarIndex + direction + CARS.length ) % CARS.length;
    applyCarConfig( CARS[ currentCarIndex ] );
    showCarToast( CARS[ currentCarIndex ].name );

}

function initCarToast() {

    // Persistent top-right badge: sits above the keybind cheatsheet. Rounded
    // square edges (4px) to match the rest of the dark overlays.
    carBadgeEl = document.createElement( 'div' );
    carBadgeEl.style.cssText = [
        'position:absolute', 'top:10px', 'right:10px',
        'padding:6px 12px', 'background:rgba(0,0,0,0.55)',
        'color:#FFCB47', 'font-family:Monospace', 'font-size:13px',
        'font-weight:700', 'letter-spacing:2px', 'border-radius:4px',
        'z-index:3', 'pointer-events:none',
        'border:1px solid rgba(255,255,255,0.18)',
        'box-shadow:0 4px 14px rgba(0,0,0,0.35)'
    ].join( ';' );
    carBadgeEl.textContent = currentCar.name.toUpperCase();
    document.body.appendChild( carBadgeEl );

    // Center pop-up toast on cycle.
    carToastEl = document.createElement( 'div' );
    carToastEl.style.cssText = [
        'position:absolute', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
        'padding:18px 36px', 'background:rgba(0,0,0,0.78)', 'color:#FFCB47',
        'font-family:Monospace', 'font-size:28px', 'font-weight:700',
        'letter-spacing:2px', 'border-radius:8px', 'z-index:10',
        'pointer-events:none', 'opacity:0', 'transition:opacity 200ms',
        'border:1px solid rgba(255,203,71,0.4)',
        'box-shadow:0 8px 32px rgba(0,0,0,0.5)'
    ].join( ';' );
    document.body.appendChild( carToastEl );

}

let _carToastTimer = null;
function showCarToast( name ) {

    if ( ! carToastEl ) return;
    carToastEl.textContent = '→  ' + name.toUpperCase();
    carToastEl.style.opacity = '1';
    if ( _carToastTimer ) clearTimeout( _carToastTimer );
    _carToastTimer = setTimeout( () => { carToastEl.style.opacity = '0'; }, 1400 );

}

// ---------------- minimap (bottom-left, top-down birds-eye) ----------------

function initMinimap() {

    // Bottom-left container: semi-transparent dark frame + rounded corners,
    // matches the other overlay styling.
    const wrap = document.createElement( 'div' );
    wrap.style.cssText = [
        'position:absolute', 'bottom:46px', 'left:10px',
        'width:200px', 'height:200px',
        'background:rgba(0,0,0,0.55)', 'border:1px solid rgba(255,255,255,0.22)',
        'border-radius:8px', 'overflow:hidden', 'z-index:3',
        'display:none', 'pointer-events:none',
        'box-shadow:0 4px 16px rgba(0,0,0,0.4)'
    ].join( ';' );
    document.body.appendChild( wrap );
    minimap.containerEl = wrap;

    const canvas = document.createElement( 'canvas' );
    canvas.width = Math.floor( 200 * window.devicePixelRatio );
    canvas.height = Math.floor( 200 * window.devicePixelRatio );
    canvas.style.cssText = 'width:200px;height:200px;display:block';
    wrap.appendChild( canvas );
    minimap.canvas = canvas;

    // Tiny center-of-minimap dot for the car position (DOM, so it's crisp).
    const dot = document.createElement( 'div' );
    dot.style.cssText = [
        'position:absolute', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
        'width:0', 'height:0',
        'border-left:6px solid transparent', 'border-right:6px solid transparent',
        'border-bottom:10px solid #FFCB47', 'pointer-events:none'
    ].join( ';' );
    wrap.appendChild( dot );

    // Dedicated WebGL renderer for the minimap canvas. Antialiasing off and
    // shadow map disabled — minimap doesn't need them and we keep the cost low.
    const r = new THREE.WebGLRenderer( { canvas, alpha: true, antialias: false } );
    r.setPixelRatio( window.devicePixelRatio );
    r.setSize( 200, 200, false );
    r.setClearColor( 0x000000, 0 );
    r.shadowMap.enabled = false;
    minimap.renderer = r;

    // Orthographic top-down camera. half-size 250 = shows a 500m × 500m area
    // around the car. far 1000 covers the height drop on the Nürburgring.
    const half = 250;
    minimap.camera = new THREE.OrthographicCamera( - half, half, half, - half, 1, 1000 );
    // Drive-up — camera.up is rotated each frame to the car's heading so the
    // car always faces "up" on the map.
    minimap.camera.up.set( 0, 0, - 1 );

    // Toggle entry lives inside the keybind cheatsheet (#info) so it doesn't
    // need its own button. Only this single <p> has pointer-events / cursor,
    // the rest of the cheatsheet stays passive.
    const infoEl = document.getElementById( 'info' );
    if ( infoEl ) {

        const line = document.createElement( 'p' );
        line.textContent = 'minimap · off';
        line.style.cssText = 'pointer-events:auto;cursor:pointer';
        line.addEventListener( 'click', toggleMinimap );
        line.addEventListener( 'mouseenter', () => { line.style.color = '#FFCB47'; } );
        line.addEventListener( 'mouseleave', () => { line.style.color = ''; } );
        infoEl.appendChild( line );
        minimap.toggleBtn = line;

    }

}

function toggleMinimap() {

    minimap.enabled = ! minimap.enabled;
    if ( minimap.containerEl ) minimap.containerEl.style.display = minimap.enabled ? 'block' : 'none';
    if ( minimap.toggleBtn ) minimap.toggleBtn.textContent = 'minimap · ' + ( minimap.enabled ? 'on' : 'off' );

}

const _miniForward = new THREE.Vector3();
const _miniQuat = new THREE.Quaternion();

function renderMinimap() {

    if ( ! minimap.enabled || ! car || ! chassis ) return;

    // Camera position: high above the car so the ortho frustum covers a wide
    // ground area without geometry clipping at the near plane.
    minimap.camera.position.set( car.position.x, car.position.y + 500, car.position.z );

    // Drive-up: rotate camera.up to the car's planar forward heading. Project
    // to XZ plane so pitch/roll don't tilt the minimap.
    const r = chassis.rotation();
    _miniQuat.set( r.x, r.y, r.z, r.w );
    _miniForward.set( 0, 0, - 1 ).applyQuaternion( _miniQuat );
    _miniForward.y = 0;
    if ( _miniForward.lengthSq() < 1e-4 ) _miniForward.set( 0, 0, - 1 );
    _miniForward.normalize();
    minimap.camera.up.copy( _miniForward );
    minimap.camera.lookAt( car.position );

    // Temporarily strip the HDR background so the minimap is transparent
    // outside the track geometry — lets the dark panel behind show through.
    const bg = scene.background;
    scene.background = null;
    minimap.renderer.render( scene, minimap.camera );
    scene.background = bg;

}

// ---------------- audio ----------------
//
// Two looping AudioBufferSourceNodes:
//  - engine: playbackRate (pitch) is driven by engine.rpm; volume by throttle.
//  - squeal: volume is driven by max |wheelSideImpulse| across the four wheels.
// AudioContext starts in 'suspended' state on most browsers — created lazily
// on the first user gesture (keydown / pointerdown / touch).
const audio = {
    ctx: null,
    started: false,
    engineBuffer: null, squealBuffer: null,
    engineNode: null,   squealNode: null,
    engineGain: null,   squealGain: null,
    masterGain: null,
    smoothedSqueal: 0,
    engineBufferCache: new Map() // url → AudioBuffer, lazily populated per car swap
};

const AUDIO_PATHS = {
    engine: 'sounds/engine.mp3',
    squeal: 'sounds/squeal.mp3'
};

async function _loadAudio( ctx, url ) {

    const res = await fetch( import.meta.env.BASE_URL + url );
    const buf = await res.arrayBuffer();
    return await ctx.decodeAudioData( buf );

}

// Helper used both at startup and when swapping cars: spin up a fresh
// AudioBufferSourceNode wired to the persistent engineGain, with loopStart
// set so the steady-state idle is what actually loops.
function _startEngineNode( buffer, loopStart ) {

    if ( ! audio.ctx || ! buffer ) return;
    if ( audio.engineNode ) {

        try { audio.engineNode.stop(); } catch ( e ) { /* already stopped */ }
        audio.engineNode.disconnect();

    }

    const node = audio.ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = true;
    node.loopStart = loopStart;
    node.loopEnd = buffer.duration;
    node.connect( audio.engineGain );
    node.start();
    audio.engineNode = node;
    audio.engineBuffer = buffer;

}

async function swapEngineAudio( car ) {

    if ( ! audio.ctx || ! audio.started ) return;

    let buf;
    if ( audio.engineBufferCache.has( car.soundFile ) ) {

        buf = audio.engineBufferCache.get( car.soundFile );

    } else {

        try {

            buf = await _loadAudio( audio.ctx, car.soundFile );
            audio.engineBufferCache.set( car.soundFile, buf );

        } catch ( err ) {

            // No file for this car yet — keep using the existing buffer but
            // still re-apply the loopStart for this car's settings.
            buf = audio.engineBuffer;

        }

    }
    _startEngineNode( buf, car.soundLoopStart );

}

async function startAudio() {

    if ( audio.started ) return;
    audio.started = true;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if ( ! Ctx ) return;
    const ctx = new Ctx();
    audio.ctx = ctx;

    audio.masterGain = ctx.createGain();
    audio.masterGain.gain.value = 0.4;
    audio.masterGain.connect( ctx.destination );

    try {

        [ audio.engineBuffer, audio.squealBuffer ] = await Promise.all( [
            _loadAudio( ctx, currentCar.soundFile ),
            _loadAudio( ctx, AUDIO_PATHS.squeal )
        ] );
        audio.engineBufferCache.set( currentCar.soundFile, audio.engineBuffer );

    } catch ( err ) {

        // Fall back to the generic engine.mp3 if the car-specific file is missing.
        try {

            audio.engineBuffer = await _loadAudio( ctx, AUDIO_PATHS.engine );
            audio.squealBuffer = audio.squealBuffer || await _loadAudio( ctx, AUDIO_PATHS.squeal );
            audio.engineBufferCache.set( AUDIO_PATHS.engine, audio.engineBuffer );

        } catch ( err2 ) {

            console.warn( '[audio] failed to load:', err2 );
            return;

        }

    }

    audio.engineGain = ctx.createGain();
    audio.engineGain.gain.value = 0.2;
    audio.engineGain.connect( audio.masterGain );

    _startEngineNode( audio.engineBuffer, currentCar.soundLoopStart );

    audio.squealNode = ctx.createBufferSource();
    audio.squealNode.buffer = audio.squealBuffer;
    audio.squealNode.loop = true;
    audio.squealGain = ctx.createGain();
    audio.squealGain.gain.value = 0;
    audio.squealNode.connect( audio.squealGain ).connect( audio.masterGain );
    audio.squealNode.start();

}

// Short, punchy synthesized gear-shift sound. Two layers: a low ~180→60 Hz
// thump (square osc) and a 30 ms highpassed noise burst tick on top. Free —
// no asset, < 100 ms total, called every time the gear actually changes.
function playShiftSound() {

    if ( ! audio.started || ! audio.ctx || ! audio.masterGain ) return;
    const ctx = audio.ctx;
    const now = ctx.currentTime;

    // Thump
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime( 180, now );
    osc.frequency.exponentialRampToValueAtTime( 60, now + 0.06 );
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime( 0.18, now );
    oscGain.gain.exponentialRampToValueAtTime( 0.001, now + 0.08 );
    osc.connect( oscGain ).connect( audio.masterGain );
    osc.start( now );
    osc.stop( now + 0.1 );

    // Tick (highpassed white-noise burst with linear decay envelope baked in)
    const len = Math.floor( ctx.sampleRate * 0.03 );
    const buf = ctx.createBuffer( 1, len, ctx.sampleRate );
    const d = buf.getChannelData( 0 );
    for ( let i = 0; i < len; i ++ ) d[ i ] = ( Math.random() * 2 - 1 ) * ( 1 - i / len );
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.12;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    noise.connect( hp ).connect( noiseGain ).connect( audio.masterGain );
    noise.start( now );

}

function updateAudio( dt ) {

    if ( ! audio.started || ! audio.engineGain || ! vehicleController ) return;

    // Engine pitch from RPM. Per-car pitchMin/pitchMax give each engine its
    // own range — F1 ramps higher and steeper than the hatchback.
    const rpmNorm = Math.max( 0, Math.min( 1, ( engine.rpm - engine.idleRpm ) / ( engine.redline - engine.idleRpm ) ) );
    const targetRate = currentCar.pitchMin + rpmNorm * ( currentCar.pitchMax - currentCar.pitchMin );
    // Smooth pitch using setTargetAtTime so abrupt RPM jumps (gear changes)
    // don't click.
    audio.engineNode.playbackRate.setTargetAtTime( targetRate, audio.ctx.currentTime, 0.08 );

    // Engine volume: base idle + throttle contribution. Soft floor so even at
    // 0 throttle you hear a quiet idle.
    const engineVol = 0.15 + input.throttle * 0.5 + rpmNorm * 0.2;
    audio.engineGain.gain.setTargetAtTime( engineVol, audio.ctx.currentTime, 0.05 );

    // Skid: take max abs side impulse across the four wheels, normalize, and
    // smooth so the squeal fades in instead of popping.
    let maxSide = 0;
    for ( let i = 0; i < 4; i ++ ) {

        const s = Math.abs( vehicleController.wheelSideImpulse( i ) );
        if ( s > maxSide ) maxSide = s;

    }
    // Only count squeal when wheels are actually in contact AND we're moving.
    const speed = Math.abs( vehicleController.currentVehicleSpeed() );
    const inAir = ! vehicleController.wheelIsInContact( 0 ) && ! vehicleController.wheelIsInContact( 1 )
        && ! vehicleController.wheelIsInContact( 2 ) && ! vehicleController.wheelIsInContact( 3 );
    let squealRaw = 0;
    if ( ! inAir && speed > 2 ) {

        // Empirical: side impulse of ~6+ on a wheel = strong squeal.
        squealRaw = Math.max( 0, Math.min( 1, ( maxSide - 1.5 ) / 5.0 ) );

    }
    const a = 1 - Math.exp( - 8 * dt );
    audio.smoothedSqueal += ( squealRaw - audio.smoothedSqueal ) * a;
    audio.squealGain.gain.setTargetAtTime( audio.smoothedSqueal * 0.6, audio.ctx.currentTime, 0.03 );

}

// On-screen touch controls. Activated when the device looks touch-only
// (touchscreen present + no hover/fine pointer), or hidden when a gamepad
// connects. Feeds touch.* into updateInput() in the standard merge path.
const touch = {
    enabled: false,
    rootEl: null,
    ringEl: null, thumbEl: null,
    throttleFillEl: null, brakeFillEl: null,
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: 0,
    brakeActive: false,           // mirrors "S key held" for the long-press reverse logic
    dragPointerId: - 1,
    dragOriginX: 0
};

// Stats-for-nerds (F3-style) panel.
const statsForNerds = {
    enabled: false,
    panel: null,
    toggleBtn: null,
    fields: {},   // id -> <span>
    graphs: {},   // id -> { canvas, ctx, buffer, capacity }
    lastDelta: 0
};

// Driver input — normalized to [0,1] for pedals / [-1,1] for steer.
// Both keyboard and gamepad feed into this each frame.
const input = {
    throttle: 0,
    brake: 0,
    steer: 0,
    handbrake: 0,
    reset: false,
    // raw key states so we can hold + combine
    keyW: false, keyS: false, keyA: false, keyD: false, keyE: false,
    arrowUp: false, arrowDown: false, arrowLeft: false, arrowRight: false,
    keyR: false, keySpace: false,
    // S-held timer for long-press reverse engagement
    sHeldTime: 0,
    reverseEngaged: false
};

// Transmission state. Gear: -1 = R, 0 = N, 1..5 = forward gears.
const transmission = {
    mode: 'auto', // 'auto' | 'manual'
    gear: 1,
    shiftCooldown: 0
};

// Engine model. RPM is computed from wheel speed × gear ratio × final drive.
// idleRpm / redline / autoUpshiftRpm / autoDownshiftRpm are re-synced from the
// current car each time the player swaps via Q.
const engine = {
    rpm: 900,
    idleRpm: 900,
    redline: 7500,
    autoUpshiftRpm: 6200,
    autoDownshiftRpm: 2300
};

// Wheel radius is locked to the visual / collider geometry, so it stays fixed
// across cars. Everything else (mass, gears, redline, friction, suspension,
// brakes, engine sound, visual silhouette) is per-car in CARS below.
const WHEEL_RADIUS = 0.3;

// Per-car configs tuned by the planning subagent against real-world archetypes.
const CARS = [
    // Hatchback — 1300 kg FWD economy car baseline.
    {
        name: 'Hatchback',
        bodyColor: 0xFFCB47,
        soundFile: 'sounds/engines/hatchback.mp3', soundLoopStart: 3.0,
        pitchMin: 0.55, pitchMax: 2.8,
        mass: 10, chassisFriction: 0.8,
        maxEngineForce: 60, engineIdleRpm: 900, engineRedline: 7500,
        peakTorqueRpm: 4500, torqueCurveWidth: 2400,
        gearRatios: [ 3.5, 2.1, 1.4, 1.0, 0.78 ], reverseRatio: - 3.4, finalDrive: 3.6,
        autoUpshiftRpm: 6200, autoDownshiftRpm: 2300,
        wheelFrictionSlip: 2.0,
        suspensionStiffness: 24, suspensionCompression: 2.0, suspensionRelaxation: 2.4,
        suspensionRestLength: 0.4, wheelConnectionY: - 0.3,
        maxBrakeForce: 1.2, handbrakeMultiplier: 1.6, maxSteeringAngle: Math.PI / 4
    },
    // Muscle V8 — 1700 kg Mustang GT class; heavy nose, fat low-end torque.
    {
        name: 'Muscle V8',
        bodyColor: 0xB42020,
        soundFile: 'sounds/engines/muscle.mp3', soundLoopStart: 3.0,
        pitchMin: 0.6, pitchMax: 2.2,
        mass: 13, chassisFriction: 0.8,
        maxEngineForce: 110, engineIdleRpm: 750, engineRedline: 7000,
        peakTorqueRpm: 3500, torqueCurveWidth: 2800,
        gearRatios: [ 3.66, 2.43, 1.69, 1.32, 1.0, 0.79 ], reverseRatio: - 3.5, finalDrive: 3.55,
        autoUpshiftRpm: 6000, autoDownshiftRpm: 2000,
        wheelFrictionSlip: 1.8,
        suspensionStiffness: 22, suspensionCompression: 1.9, suspensionRelaxation: 2.3,
        suspensionRestLength: 0.42, wheelConnectionY: - 0.32,
        maxBrakeForce: 1.4, handbrakeMultiplier: 1.7, maxSteeringAngle: Math.PI / 4.2
    },
    // Sport Flat-six — 1430 kg 911 GT3 class.
    {
        name: 'Sport Flat-six',
        bodyColor: 0xC8CDD2,
        soundFile: 'sounds/engines/sport.mp3', soundLoopStart: 3.0,
        pitchMin: 0.7, pitchMax: 3.2,
        mass: 11, chassisFriction: 0.85,
        maxEngineForce: 140, engineIdleRpm: 1000, engineRedline: 9000,
        peakTorqueRpm: 6500, torqueCurveWidth: 2000,
        gearRatios: [ 3.91, 2.29, 1.65, 1.30, 1.08, 0.88 ], reverseRatio: - 3.55, finalDrive: 3.97,
        autoUpshiftRpm: 8400, autoDownshiftRpm: 3200,
        wheelFrictionSlip: 3.0,
        suspensionStiffness: 34, suspensionCompression: 2.6, suspensionRelaxation: 2.9,
        suspensionRestLength: 0.32, wheelConnectionY: - 0.28,
        maxBrakeForce: 1.9, handbrakeMultiplier: 1.8, maxSteeringAngle: Math.PI / 4
    },
    // Rally Turbo — WRX STI class; AWD-feel grip, broad turbo plateau.
    {
        name: 'Rally Turbo',
        bodyColor: 0x1F4DFF,
        soundFile: 'sounds/engines/rally.mp3', soundLoopStart: 3.0,
        pitchMin: 0.65, pitchMax: 2.9,
        mass: 11, chassisFriction: 0.9,
        maxEngineForce: 130, engineIdleRpm: 850, engineRedline: 8000,
        peakTorqueRpm: 3000, torqueCurveWidth: 3200,
        gearRatios: [ 3.64, 2.37, 1.76, 1.35, 1.06, 0.84 ], reverseRatio: - 3.55, finalDrive: 3.90,
        autoUpshiftRpm: 6800, autoDownshiftRpm: 2600,
        wheelFrictionSlip: 2.5,
        suspensionStiffness: 26, suspensionCompression: 2.1, suspensionRelaxation: 2.5,
        suspensionRestLength: 0.48, wheelConnectionY: - 0.34,
        maxBrakeForce: 1.7, handbrakeMultiplier: 2.2, maxSteeringAngle: Math.PI / 3.8
    },
    // Supercar V12 — Ferrari 812 class.
    {
        name: 'Supercar V12',
        bodyColor: 0xFF6F1A,
        soundFile: 'sounds/engines/supercar.mp3', soundLoopStart: 3.0,
        pitchMin: 0.7, pitchMax: 3.4,
        mass: 12, chassisFriction: 0.85,
        maxEngineForce: 160, engineIdleRpm: 1000, engineRedline: 8900,
        peakTorqueRpm: 5500, torqueCurveWidth: 2600,
        gearRatios: [ 3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69 ], reverseRatio: - 2.9, finalDrive: 4.10,
        autoUpshiftRpm: 8300, autoDownshiftRpm: 3000,
        wheelFrictionSlip: 2.8,
        suspensionStiffness: 32, suspensionCompression: 2.5, suspensionRelaxation: 2.8,
        suspensionRestLength: 0.30, wheelConnectionY: - 0.26,
        maxBrakeForce: 2.0, handbrakeMultiplier: 1.8, maxSteeringAngle: Math.PI / 4
    },
    // F1 — 798 kg open-wheeler with V10-era 18000 rpm scream.
    {
        name: 'F1',
        bodyColor: 0xD11A1A,
        soundFile: 'sounds/engines/f1.mp3', soundLoopStart: 3.0,
        pitchMin: 1.0, pitchMax: 4.0,
        mass: 6, chassisFriction: 0.9,
        maxEngineForce: 200, engineIdleRpm: 4000, engineRedline: 18000,
        peakTorqueRpm: 13000, torqueCurveWidth: 3000,
        gearRatios: [ 2.90, 2.20, 1.75, 1.42, 1.18, 1.0, 0.86, 0.74 ], reverseRatio: - 2.5, finalDrive: 4.4,
        autoUpshiftRpm: 17500, autoDownshiftRpm: 6500,
        wheelFrictionSlip: 4.0,
        suspensionStiffness: 55, suspensionCompression: 3.4, suspensionRelaxation: 3.6,
        suspensionRestLength: 0.18, wheelConnectionY: - 0.20,
        maxBrakeForce: 3.0, handbrakeMultiplier: 1.5, maxSteeringAngle: Math.PI / 4.5
    },
    // God Car — physically impossible: max grip, 10 gears, flat torque, near-instant stops.
    {
        name: 'God Car',
        bodyColor: 0xF0F0F8,
        soundFile: 'sounds/engines/god.mp3', soundLoopStart: 3.0,
        pitchMin: 0.4, pitchMax: 4.5,
        mass: 5, chassisFriction: 1.0,
        maxEngineForce: 260, engineIdleRpm: 1000, engineRedline: 20000,
        peakTorqueRpm: 10000, torqueCurveWidth: 8000,
        gearRatios: [ 3.2, 2.6, 2.1, 1.75, 1.45, 1.2, 1.0, 0.85, 0.72, 0.6 ], reverseRatio: - 3.0, finalDrive: 4.0,
        autoUpshiftRpm: 19000, autoDownshiftRpm: 2500,
        wheelFrictionSlip: 5.0,
        suspensionStiffness: 45, suspensionCompression: 3.0, suspensionRelaxation: 3.2,
        suspensionRestLength: 0.30, wheelConnectionY: - 0.26,
        maxBrakeForce: 5.0, handbrakeMultiplier: 2.0, maxSteeringAngle: Math.PI / 4
    }
];

let currentCarIndex = 0;
let currentCar = CARS[ 0 ];
let carVisualsGroup = null;
let carToastEl = null;
let carBadgeEl = null;

const MINIMAP_LAYER = 2; // dedicated three.js layer for objects only the minimap should see
const minimap = {
    enabled: false,
    containerEl: null,
    canvas: null,
    renderer: null,
    camera: null,
    toggleBtn: null,
    marker: null
};

// Gamepad state — populated each frame in pollGamepad if one is plugged in.
const gamepad = {
    index: - 1,
    id: '',
    prevButtons: []
};

// Spawn pose captured live from driving the car onto the road and pressing P.
const spawnPoint = new THREE.Vector3( 3147.90, - 80.45, - 2733.54 );
const spawnQuaternion = new THREE.Quaternion( - 0.0046, - 0.5791, 0.0216, 0.8150 );
// Stored once so we can keep the directional light a fixed offset from the car.
// Values match the original three.js example exactly: light sits 12.5 up and
// 12.5 forward, giving a ~45° sun angle.
const sunOffset = new THREE.Vector3( 0, 12.5, 12.5 );

// FPS lock state. `target` is decided after a brief refresh-rate detection
// (see detectRefreshRate). We render at most once per `frameInterval` ms;
// physics is initialized at the same rate to keep them in lockstep.
const fpsTarget = {
    target: 60,
    frameInterval: 1000 / 60,
    lastRenderTime: 0,
    // adaptive downgrade: if we miss the target for too many frames in a row,
    // drop from 120 → 60 so the player gets a stable, consistent feel
    overBudgetStreak: 0,
    overBudgetThreshold: 60
};

const chaseCam = {
    enabled: true,
    positionOffset: new THREE.Vector3( 0, 2.6, 7.5 ),
    lookOffset: new THREE.Vector3( 0, 1.1, - 3 ),
    positionDamping: 6,
    lookDamping: 9,
    baseFov: 60,
    maxFovBoost: 14,
    speedForMaxFov: 28,
    fovDamping: 4,
    currentLookAt: new THREE.Vector3(),
    initialized: false
};

init();

async function init() {

    scene = new THREE.Scene();
    // Fallback flat colour while the HDR streams in (avoids a black flash).
    scene.background = new THREE.Color( 0xbfd1e5 );

    // Equirectangular HDR — used as visible background only. We deliberately
    // do NOT assign it to scene.environment because that floods every PBR
    // material with indirect lighting and washes out the punchy direct-sun
    // look the hemisphere + DirectionalLight pair was giving.
    new RGBELoader().load( import.meta.env.BASE_URL + 'textures/sky.hdr', ( texture ) => {

        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        // HDR comes through brighter than SDR backgrounds — dial it down so the
        // sky doesn't blow out the rest of the scene.
        scene.backgroundIntensity = 0.45;

    } );

    // Far plane bumped from 200 → 12000 because the track is ~6km across.
    camera = new THREE.PerspectiveCamera( chaseCam.baseFov, window.innerWidth / window.innerHeight, 0.1, 12000 );
    camera.position.set( 0, 4, 10 );

    const ambient = new THREE.HemisphereLight( 0x555555, 0xFFFFFF );
    scene.add( ambient );

    // Matches the original three.js example one-for-one, including radius/blurSamples
    // (the user wanted the look back). The light + shadow frustum still follow the
    // car every frame so shadows actually land somewhere on the 6km track.
    sunLight = new THREE.DirectionalLight( 0xffffff, 4 );
    sunLight.position.copy( sunOffset );
    sunLight.castShadow = true;
    sunLight.shadow.radius = 3;
    sunLight.shadow.blurSamples = 8;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;

    const shadowSize = 40;
    sunLight.shadow.camera.left = - shadowSize;
    sunLight.shadow.camera.bottom = - shadowSize;
    sunLight.shadow.camera.right = shadowSize;
    sunLight.shadow.camera.top = shadowSize;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 50;
    scene.add( sunLight );

    sunTarget = new THREE.Object3D();
    scene.add( sunTarget );
    sunLight.target = sunTarget;

    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.shadowMap.enabled = true;
    document.body.appendChild( renderer.domElement );
    renderer.setAnimationLoop( animate );

    controls = new OrbitControls( camera, renderer.domElement );
    controls.target = new THREE.Vector3( 0, 2, 0 );
    controls.enabled = ! chaseCam.enabled;
    controls.update();

    clock = new THREE.Clock();

    stats = new Stats();
    document.body.appendChild( stats.dom );

    fpsLabel = document.createElement( 'div' );
    fpsLabel.style.cssText = 'position:absolute;bottom:10px;left:10px;padding:4px 8px;background:rgba(0,0,0,0.55);color:#fff;font:12px Monospace;border-radius:4px;z-index:1';
    fpsLabel.textContent = 'detecting refresh rate...';
    document.body.appendChild( fpsLabel );

    posLabel = document.createElement( 'div' );
    posLabel.style.cssText = 'position:absolute;bottom:10px;right:10px;padding:4px 8px;background:rgba(0,0,0,0.55);color:#fff;font:12px Monospace;border-radius:4px;z-index:1;min-width:220px;text-align:right';
    posLabel.textContent = 'pos: —     (P to copy)';
    document.body.appendChild( posLabel );

    const detectedHz = await detectRefreshRate();
    fpsTarget.target = detectedHz >= 100 ? 120 : 60;
    fpsTarget.frameInterval = 1000 / fpsTarget.target;
    fpsLabel.textContent = `display ~${ detectedHz.toFixed( 0 ) }Hz · locked ${ fpsTarget.target }fps`;

    await initPhysics();

    onWindowResize();

    initSpeedometer();
    initStatsForNerds();
    initTouchControls();
    initCarToast();
    initMinimap();

    // First user gesture unlocks the AudioContext on every browser.
    const unlockAudio = () => { startAudio(); };
    window.addEventListener( 'keydown', unlockAudio, { once: true } );
    window.addEventListener( 'pointerdown', unlockAudio, { once: true } );
    window.addEventListener( 'touchstart', unlockAudio, { once: true } );

    window.addEventListener( 'keydown', ( event ) => {

        if ( event.repeat ) return; // edges only for some actions; held state for pedals tracked below

        const k = event.key;
        if ( k === 'w' || k === 'W' ) input.keyW = true;
        if ( k === 's' || k === 'S' ) input.keyS = true;
        if ( k === 'a' || k === 'A' ) input.keyA = true;
        if ( k === 'd' || k === 'D' ) input.keyD = true;
        if ( k === 'e' || k === 'E' ) input.keyE = true;
        if ( k === 'ArrowUp' ) input.arrowUp = true;
        if ( k === 'ArrowDown' ) input.arrowDown = true;
        if ( k === 'ArrowLeft' ) input.arrowLeft = true;
        if ( k === 'ArrowRight' ) input.arrowRight = true;
        if ( k === 'r' || k === 'R' ) input.keyR = true;
        if ( k === ' ' ) input.keySpace = true;

        // Manual shift edges — Art-of-Rally style: LShift up, LCtrl down.
        if ( k === 'Shift' && transmission.mode === 'manual' ) manualShift( 1 );
        if ( k === 'Control' && transmission.mode === 'manual' ) manualShift( - 1 );

        if ( k === 'm' || k === 'M' ) toggleTransmissionMode();
        if ( k === 'q' || k === 'Q' ) cycleCar( 1 );
        if ( k === 'F3' ) { event.preventDefault(); toggleStatsForNerds(); }

        if ( k === 'c' || k === 'C' ) {

            chaseCam.enabled = ! chaseCam.enabled;
            controls.enabled = ! chaseCam.enabled;
            chaseCam.initialized = false;

        }

        if ( k === 'h' || k === 'H' ) {

            if ( physicsHelper ) physicsHelper.visible = ! physicsHelper.visible;

        }

        if ( k === 'p' || k === 'P' ) {

            if ( ! chassis ) return;
            const t = chassis.translation();
            const r = chassis.rotation();
            const str = `pos ${ t.x.toFixed( 2 ) }, ${ t.y.toFixed( 2 ) }, ${ t.z.toFixed( 2 ) } | rot ${ r.x.toFixed( 4 ) }, ${ r.y.toFixed( 4 ) }, ${ r.z.toFixed( 4 ) }, ${ r.w.toFixed( 4 ) }`;
            console.log( '[snapshot]', str );
            navigator.clipboard?.writeText( str ).then( () => {

                if ( posLabel ) {

                    const prev = posLabel.style.background;
                    posLabel.style.background = 'rgba(40,160,80,0.85)';
                    setTimeout( () => { posLabel.style.background = prev; }, 400 );

                }

            } );

        }

    } );

    window.addEventListener( 'keyup', ( event ) => {

        const k = event.key;
        if ( k === 'w' || k === 'W' ) input.keyW = false;
        if ( k === 's' || k === 'S' ) input.keyS = false;
        if ( k === 'a' || k === 'A' ) input.keyA = false;
        if ( k === 'd' || k === 'D' ) input.keyD = false;
        if ( k === 'e' || k === 'E' ) input.keyE = false;
        if ( k === 'ArrowUp' ) input.arrowUp = false;
        if ( k === 'ArrowDown' ) input.arrowDown = false;
        if ( k === 'ArrowLeft' ) input.arrowLeft = false;
        if ( k === 'ArrowRight' ) input.arrowRight = false;
        if ( k === 'r' || k === 'R' ) input.keyR = false;
        if ( k === ' ' ) input.keySpace = false;

    } );

    window.addEventListener( 'gamepadconnected', ( e ) => {

        gamepad.index = e.gamepad.index;
        gamepad.id = e.gamepad.id;
        if ( speedoControllerEl ) speedoControllerEl.style.display = 'block';
        if ( touch.enabled ) setTouchOverlayVisible( false ); // gamepad wins
        console.log( '[gamepad] connected:', e.gamepad.id );

    } );

    window.addEventListener( 'gamepaddisconnected', ( e ) => {

        if ( e.gamepad.index === gamepad.index ) {

            gamepad.index = - 1;
            gamepad.id = '';
            if ( speedoControllerEl ) speedoControllerEl.style.display = 'none';
            if ( touch.enabled ) setTouchOverlayVisible( true );

        }

    } );

    window.addEventListener( 'resize', onWindowResize, false );

}

// Probe display refresh rate by averaging ~60 rAF intervals. This also
// implicitly measures whether the system is keeping up: if the page is
// already janking, we'll see ~30Hz here and lock to 60.
function detectRefreshRate() {

    return new Promise( ( resolve ) => {

        let frames = 0;
        let startTime = 0;

        function tick( time ) {

            if ( frames === 0 ) startTime = time;
            frames ++;

            if ( frames > 60 ) {

                const elapsed = time - startTime;
                const avgInterval = elapsed / ( frames - 1 );
                resolve( 1000 / avgInterval );

            } else {

                requestAnimationFrame( tick );

            }

        }

        requestAnimationFrame( tick );

    } );

}

async function initPhysics() {

    // selfStep: false → physics stepping driven by us inside the rAF animate
    // loop with the same delta as updateVehicle, so chassis pose + wheel
    // raycast state are sampled at the same instant. This fixes the chassis
    // flicker that no amount of damping could remove.
    physics = await RapierPhysics( { frameRate: fpsTarget.target, selfStep: false } );

    physicsHelper = new RapierHelper( physics.world );
    physicsHelper.visible = false; // toggle with H — at track scale this is heavy
    scene.add( physicsHelper );

    physics.addScene( scene );

    await loadTrack();

    createCar();

}

// Spatially bucket a loaded GLB's triangles into ~tileSize tiles so we can
// dynamically toggle receiveShadow per tile (the shadow camera only covers
// ±60m around the car, so any tile farther than that does pointless PCF
// taps every fragment if receiveShadow stays on). World transforms are baked
// into the chunk geometry so the chunks can be parented to scene directly.
function chunkTrackMeshes( sceneRoot, tileSize ) {

    const buckets = new Map();

    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    const n0 = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();

    sceneRoot.traverse( ( obj ) => {

        if ( ! obj.isMesh || ! obj.geometry ) return;

        const geom = obj.geometry;
        const posAttr = geom.attributes.position;
        if ( ! posAttr ) return;
        const normalAttr = geom.attributes.normal;
        const uvAttr = geom.attributes.uv;
        const idxAttr = geom.index;
        const material = obj.material;
        const matrixWorld = obj.matrixWorld;
        const normalMat = new THREE.Matrix3().getNormalMatrix( matrixWorld );

        const triCount = idxAttr ? ( idxAttr.count / 3 ) : ( posAttr.count / 3 );

        for ( let t = 0; t < triCount; t ++ ) {

            const i0 = idxAttr ? idxAttr.getX( t * 3 + 0 ) : t * 3 + 0;
            const i1 = idxAttr ? idxAttr.getX( t * 3 + 1 ) : t * 3 + 1;
            const i2 = idxAttr ? idxAttr.getX( t * 3 + 2 ) : t * 3 + 2;

            v0.fromBufferAttribute( posAttr, i0 ).applyMatrix4( matrixWorld );
            v1.fromBufferAttribute( posAttr, i1 ).applyMatrix4( matrixWorld );
            v2.fromBufferAttribute( posAttr, i2 ).applyMatrix4( matrixWorld );

            const cx = ( v0.x + v1.x + v2.x ) / 3;
            const cz = ( v0.z + v1.z + v2.z ) / 3;
            const tileX = Math.floor( cx / tileSize );
            const tileZ = Math.floor( cz / tileSize );
            const key = `${ tileX }_${ tileZ }|${ material.uuid }`;

            let bucket = buckets.get( key );
            if ( ! bucket ) {

                bucket = {
                    positions: [],
                    normals: normalAttr ? [] : null,
                    uvs: uvAttr ? [] : null,
                    material
                };
                buckets.set( key, bucket );

            }

            bucket.positions.push(
                v0.x, v0.y, v0.z,
                v1.x, v1.y, v1.z,
                v2.x, v2.y, v2.z
            );

            if ( normalAttr ) {

                n0.fromBufferAttribute( normalAttr, i0 ).applyMatrix3( normalMat ).normalize();
                n1.fromBufferAttribute( normalAttr, i1 ).applyMatrix3( normalMat ).normalize();
                n2.fromBufferAttribute( normalAttr, i2 ).applyMatrix3( normalMat ).normalize();
                bucket.normals.push(
                    n0.x, n0.y, n0.z,
                    n1.x, n1.y, n1.z,
                    n2.x, n2.y, n2.z
                );

            }

            if ( uvAttr ) {

                bucket.uvs.push(
                    uvAttr.getX( i0 ), uvAttr.getY( i0 ),
                    uvAttr.getX( i1 ), uvAttr.getY( i1 ),
                    uvAttr.getX( i2 ), uvAttr.getY( i2 )
                );

            }

        }

    } );

    const meshes = [];
    for ( const bucket of buckets.values() ) {

        const g = new THREE.BufferGeometry();
        g.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( bucket.positions ), 3 ) );
        if ( bucket.normals ) g.setAttribute( 'normal', new THREE.BufferAttribute( new Float32Array( bucket.normals ), 3 ) );
        if ( bucket.uvs ) g.setAttribute( 'uv', new THREE.BufferAttribute( new Float32Array( bucket.uvs ), 2 ) );
        g.computeBoundingBox();
        g.computeBoundingSphere();

        const mesh = new THREE.Mesh( g, bucket.material );
        mesh.castShadow = false;
        mesh.receiveShadow = false; // toggled per frame in updateTrackShadowReceive()
        meshes.push( mesh );

    }

    return meshes;

}

// AABB intersection between each track chunk and the sun's shadow camera
// footprint (centered on the car). receiveShadow is only true on chunks that
// can actually contain shadowed fragments — every other chunk skips the PCF
// taps that the shader would otherwise do per fragment.
function updateTrackShadowReceive() {

    if ( ! track || ! sunTarget ) return;

    const sx = sunTarget.position.x;
    const sy = sunTarget.position.y;
    const sz = sunTarget.position.z;
    const margin = 55; // ±40m shadow extent + small slack

    for ( const child of track.children ) {

        const bb = child.geometry && child.geometry.boundingBox;
        if ( ! bb ) continue;

        const overlaps =
            bb.max.x >= sx - margin && bb.min.x <= sx + margin &&
            bb.max.z >= sz - margin && bb.min.z <= sz + margin &&
            bb.max.y >= sy - 250 && bb.min.y <= sy + 250;

        child.receiveShadow = overlaps;

    }

}

async function loadTrack() {

    if ( fpsLabel ) fpsLabel.textContent = 'loading track...';

    const loader = new GLTFLoader();
    // Use BASE_URL so the path works both at /  (dev) and /race_in_progress/ (GH Pages).
    const gltf = await loader.loadAsync( import.meta.env.BASE_URL + 'textures/models/nurburgring.glb' );

    track = gltf.scene;

    // The GLB's root node already bakes in a Z-up→Y-up rotation matrix
    // (verified in the file's JSON chunk). Adding our own would double-rotate
    // and flip the track upside-down — which is exactly what was happening.
    scene.add( track );
    track.updateMatrixWorld( true );

    track.traverse( ( obj ) => {

        if ( obj.isMesh ) {

            // Casting shadows from a 6km mesh is pointless and very expensive;
            // the car still casts onto the track because the track receives them.
            obj.castShadow = false;
            obj.receiveShadow = true;

        }

    } );

    // One static body, one trimesh collider per mesh — no need to merge.
    const RAPIER = physics.RAPIER;
    trackBody = physics.world.createRigidBody( RAPIER.RigidBodyDesc.fixed() );

    let totalTris = 0;
    const vtmp = new THREE.Vector3();

    track.traverse( ( obj ) => {

        if ( ! obj.isMesh || ! obj.geometry ) return;

        const geom = obj.geometry;
        const posAttr = geom.attributes.position;
        if ( ! posAttr ) return;

        const vertices = new Float32Array( posAttr.count * 3 );

        for ( let i = 0; i < posAttr.count; i ++ ) {

            vtmp.fromBufferAttribute( posAttr, i ).applyMatrix4( obj.matrixWorld );
            vertices[ i * 3 ] = vtmp.x;
            vertices[ i * 3 + 1 ] = vtmp.y;
            vertices[ i * 3 + 2 ] = vtmp.z;

        }

        let indices;
        if ( geom.index ) {

            indices = geom.index.array instanceof Uint32Array
                ? geom.index.array
                : new Uint32Array( geom.index.array );

        } else {

            // Non-indexed geometry — synthesize sequential indices.
            indices = new Uint32Array( posAttr.count );
            for ( let i = 0; i < posAttr.count; i ++ ) indices[ i ] = i;

        }

        const colliderDesc = RAPIER.ColliderDesc.trimesh( vertices, indices );
        physics.world.createCollider( colliderDesc, trackBody );

        totalTris += indices.length / 3;

    } );

    _trackTris = totalTris;

    // ── chunk the visual track so we can per-tile-cull receiveShadow ──
    // Tile size: 200m. Each tile larger than the shadow camera's 120m extent
    // means we cover the shadow region with 1–4 active tiles at any time.
    const tStart = performance.now();
    const chunkMeshes = chunkTrackMeshes( track, 200 );
    const tEnd = performance.now();

    // Replace the loaded gltf scene (which sits under the Sketchfab_model root
    // matrix) with a flat Group of chunks at identity. We baked world coords
    // into the chunk vertices already.
    scene.remove( track );

    const chunkedTrack = new THREE.Group();
    chunkedTrack.name = 'TrackChunked';
    chunkMeshes.forEach( c => chunkedTrack.add( c ) );
    scene.add( chunkedTrack );
    chunkedTrack.updateMatrixWorld( true );

    // Track is static — three.js doesn't need to walk it every frame.
    chunkedTrack.matrixWorldAutoUpdate = false;
    chunkMeshes.forEach( c => { c.matrixWorldAutoUpdate = false; } );

    track = chunkedTrack;

    console.log( `[track] ${ totalTris.toLocaleString() } triangles, ${ chunkMeshes.length } chunks (${ ( tEnd - tStart ).toFixed( 0 ) } ms), spawn ${ spawnPoint.x.toFixed( 1 ) }, ${ spawnPoint.y.toFixed( 1 ) }, ${ spawnPoint.z.toFixed( 1 ) }` );
    if ( fpsLabel ) fpsLabel.textContent = `display ~${ fpsTarget.target }fps · ${ ( totalTris / 1000 ).toFixed( 0 ) }k tris · ${ chunkMeshes.length } chunks`;

}

function createCar() {

    // Invisible 2×1×4 box: this is what Rapier reads to build the chassis
    // collider via physics.addMesh. Visual car parts are added as children so
    // they inherit the rigid body's transform without affecting physics.
    const chassisGeom = new THREE.BoxGeometry( 2, 1, 4 );
    const chassisMat = new THREE.MeshStandardMaterial();
    chassisMat.visible = false;
    const mesh = new THREE.Mesh( chassisGeom, chassisMat );
    mesh.castShadow = false;
    scene.add( mesh );
    car = mesh;

    mesh.position.copy( spawnPoint );
    mesh.quaternion.copy( spawnQuaternion );

    // Mass baseline = the lightest car so we can only ADD mass dynamically
    // (Rapier setAdditionalMass requires non-negative). All other cars layer
    // additional mass on top in applyCarConfig.
    const baselineMass = Math.min( ...CARS.map( c => c.mass ) );
    physics.addMesh( mesh, baselineMass, currentCar.chassisFriction );
    chassis = mesh.userData.physics.body;
    chassis.setRotation( new physics.RAPIER.Quaternion( spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w ), true );

    carVisualsGroup = new THREE.Group();
    mesh.add( carVisualsGroup );
    buildCarVisuals( carVisualsGroup, currentCar );

    vehicleController = physics.world.createVehicleController( chassis );

    wheels = [];

    const wy = currentCar.wheelConnectionY;
    addWheel( 0, { x: - 1, y: wy, z: - 1.5 }, mesh );
    addWheel( 1, { x: 1, y: wy, z: - 1.5 }, mesh );
    addWheel( 2, { x: - 1, y: wy, z: 1.5 }, mesh );
    addWheel( 3, { x: 1, y: wy, z: 1.5 }, mesh );

    vehicleController.setWheelSteering( 0, currentCar.maxSteeringAngle );
    vehicleController.setWheelSteering( 1, currentCar.maxSteeringAngle );

    // Sync runtime engine settings + per-wheel params for the starting car.
    applyCarConfig( currentCar, /* skipVisuals */ true );

    // Engine RPM defaults already match the hatchback; if a non-default car
    // becomes the starter later this guarantees idle.
    engine.idleRpm = currentCar.engineIdleRpm;
    engine.redline = currentCar.engineRedline;
    engine.autoUpshiftRpm = currentCar.autoUpshiftRpm;
    engine.autoDownshiftRpm = currentCar.autoDownshiftRpm;
    engine.rpm = engine.idleRpm;

}

function initSpeedometer() {

    speedoEl = document.createElement( 'div' );
    speedoEl.style.cssText = [
        'position:absolute', 'bottom:18px', 'left:50%', 'transform:translateX(-50%)',
        'padding:10px 16px', 'background:rgba(0,0,0,0.62)', 'border-radius:10px',
        'color:#fff', 'font-family:Monospace', 'z-index:2',
        'display:flex', 'align-items:center', 'gap:18px',
        'box-shadow:0 4px 18px rgba(0,0,0,0.35)', 'pointer-events:none'
    ].join( ';' );

    speedoGearEl = document.createElement( 'div' );
    speedoGearEl.style.cssText = 'font-size:42px;font-weight:700;line-height:1;min-width:48px;text-align:center;color:#FFCB47';
    speedoGearEl.textContent = '1';
    speedoEl.appendChild( speedoGearEl );

    const speedCol = document.createElement( 'div' );
    speedCol.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:4px;min-width:120px';

    speedoNumEl = document.createElement( 'div' );
    speedoNumEl.style.cssText = 'font-size:36px;font-weight:700;line-height:1';
    speedoNumEl.textContent = '0';
    speedCol.appendChild( speedoNumEl );

    const unit = document.createElement( 'div' );
    unit.style.cssText = 'font-size:10px;opacity:0.75;letter-spacing:1.5px';
    unit.textContent = 'KM / H';
    speedCol.appendChild( unit );

    // RPM bar
    const rpmTrack = document.createElement( 'div' );
    rpmTrack.style.cssText = 'width:140px;height:6px;background:rgba(255,255,255,0.12);border-radius:3px;position:relative;overflow:hidden';
    speedoRpmFillEl = document.createElement( 'div' );
    speedoRpmFillEl.style.cssText = 'height:100%;width:0%;background:linear-gradient(90deg,#7BD37F 0%,#F5D04A 65%,#E04141 100%);transition:width 60ms linear';
    rpmTrack.appendChild( speedoRpmFillEl );
    // Redline marker (last ~15% of bar)
    const redline = document.createElement( 'div' );
    redline.style.cssText = 'position:absolute;left:85%;top:-2px;width:2px;height:10px;background:#E04141';
    rpmTrack.appendChild( redline );
    speedCol.appendChild( rpmTrack );

    speedoEl.appendChild( speedCol );

    speedoModeEl = document.createElement( 'div' );
    speedoModeEl.style.cssText = 'font-size:10px;letter-spacing:1.5px;padding:4px 8px;border:1px solid rgba(255,255,255,0.45);border-radius:4px;opacity:0.9';
    speedoModeEl.textContent = 'AUTO';
    speedoEl.appendChild( speedoModeEl );

    speedoControllerEl = document.createElement( 'div' );
    speedoControllerEl.style.cssText = 'display:none;color:#fff;opacity:0.9';
    speedoControllerEl.innerHTML = iconHTML( 'gamepad-2', 18 );
    speedoControllerEl.title = 'Gamepad connected';
    speedoEl.appendChild( speedoControllerEl );

    document.body.appendChild( speedoEl );

}

function updateSpeedometer( speed ) {

    const kmh = Math.abs( speed ) * 3.6;
    speedoNumEl.textContent = Math.round( kmh ).toString();

    const gear = transmission.gear;
    speedoGearEl.textContent = gear === - 1 ? 'R' : gear === 0 ? 'N' : gear.toString();

    const pct = Math.max( 0, Math.min( 100, ( engine.rpm / engine.redline ) * 100 ) );
    speedoRpmFillEl.style.width = pct.toFixed( 1 ) + '%';

}

// ---------------- touch controls ----------------

function shouldShowTouch() {

    const hasTouch = ( 'ontouchstart' in window ) || navigator.maxTouchPoints > 0;
    const hasMouse = window.matchMedia && window.matchMedia( '(hover: hover) and (pointer: fine)' ).matches;
    return hasTouch && ! hasMouse;

}

function _touchHoldBtn( label, fontSize, onDown, onUp ) {

    const b = document.createElement( 'div' );
    b.textContent = label;
    b.style.cssText = [
        'width:52px', 'height:52px', 'border-radius:10px',
        'background:rgba(0,0,0,0.5)', 'color:#fff', 'font-family:Monospace',
        'display:flex', 'align-items:center', 'justify-content:center',
        `font-size:${ fontSize }px`, 'pointer-events:auto', 'user-select:none',
        '-webkit-user-select:none', 'touch-action:none',
        'border:1px solid rgba(255,255,255,0.18)', 'transition:transform 60ms,background 60ms'
    ].join( ';' );
    let pid = - 1;
    b.addEventListener( 'pointerdown', ( e ) => {

        if ( pid !== - 1 ) return;
        pid = e.pointerId;
        b.setPointerCapture( pid );
        b.style.background = 'rgba(255,203,71,0.6)';
        b.style.transform = 'scale(0.94)';
        if ( onDown ) onDown();

    } );
    const release = ( e ) => {

        if ( e.pointerId !== pid ) return;
        pid = - 1;
        b.style.background = 'rgba(0,0,0,0.5)';
        b.style.transform = 'scale(1)';
        if ( onUp ) onUp();

    };
    b.addEventListener( 'pointerup', release );
    b.addEventListener( 'pointercancel', release );
    b.addEventListener( 'pointerleave', release );
    return b;

}

function _touchTapBtn( label, fontSize, onTap ) {

    return _touchHoldBtn( label, fontSize, onTap, null );

}

function _touchPedal( color ) {

    const bar = document.createElement( 'div' );
    bar.style.cssText = [
        'position:absolute', 'width:88px', 'height:240px',
        'background:rgba(0,0,0,0.42)', 'border-radius:14px',
        'border:1px solid rgba(255,255,255,0.15)',
        'pointer-events:auto', 'touch-action:none', 'overflow:hidden'
    ].join( ';' );
    const fill = document.createElement( 'div' );
    fill.style.cssText = [
        'position:absolute', 'left:0', 'right:0', 'bottom:0',
        `background:${ color }`, 'height:0%', 'transition:height 60ms linear', 'opacity:0.85'
    ].join( ';' );
    bar.appendChild( fill );
    return { bar, fill };

}

function _bindPedal( bar, fill, kindKey ) {

    let pid = - 1;
    const setFromEvent = ( e ) => {

        const rect = bar.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const v = 1 - Math.max( 0, Math.min( 1, y / rect.height ) ); // top = max
        touch[ kindKey ] = v;
        fill.style.height = ( v * 100 ).toFixed( 1 ) + '%';
        if ( kindKey === 'brake' ) touch.brakeActive = v > 0.05;

    };
    bar.addEventListener( 'pointerdown', ( e ) => {

        if ( pid !== - 1 ) return;
        pid = e.pointerId;
        bar.setPointerCapture( pid );
        setFromEvent( e );

    } );
    bar.addEventListener( 'pointermove', ( e ) => {

        if ( e.pointerId !== pid ) return;
        setFromEvent( e );

    } );
    const release = ( e ) => {

        if ( e.pointerId !== pid ) return;
        pid = - 1;
        touch[ kindKey ] = 0;
        if ( kindKey === 'brake' ) touch.brakeActive = false;
        fill.style.height = '0%';

    };
    bar.addEventListener( 'pointerup', release );
    bar.addEventListener( 'pointercancel', release );
    bar.addEventListener( 'pointerleave', release );

}

function initTouchControls() {

    if ( ! shouldShowTouch() ) return;
    touch.enabled = true;

    const root = document.createElement( 'div' );
    root.id = 'touch-overlay';
    root.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;user-select:none;-webkit-user-select:none';
    document.body.appendChild( root );
    touch.rootEl = root;

    // ── floating drag-pad on the left half ──
    const pad = document.createElement( 'div' );
    pad.style.cssText = 'position:absolute;left:0;top:60px;bottom:120px;width:50%;pointer-events:auto;touch-action:none';
    root.appendChild( pad );

    const ring = document.createElement( 'div' );
    ring.style.cssText = 'position:absolute;width:120px;height:120px;border-radius:50%;border:2px solid rgba(255,255,255,0.55);background:rgba(0,0,0,0.18);display:none;pointer-events:none;transform:translate(-50%,-50%)';
    root.appendChild( ring );
    touch.ringEl = ring;

    const thumb = document.createElement( 'div' );
    thumb.style.cssText = 'position:absolute;width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,0.88);display:none;pointer-events:none;transform:translate(-50%,-50%);box-shadow:0 2px 10px rgba(0,0,0,0.4)';
    root.appendChild( thumb );
    touch.thumbEl = thumb;

    pad.addEventListener( 'pointerdown', ( e ) => {

        if ( touch.dragPointerId !== - 1 ) return;
        touch.dragPointerId = e.pointerId;
        pad.setPointerCapture( e.pointerId );
        touch.dragOriginX = e.clientX;
        ring.style.left = e.clientX + 'px';
        ring.style.top = e.clientY + 'px';
        ring.style.display = 'block';
        thumb.style.left = e.clientX + 'px';
        thumb.style.top = e.clientY + 'px';
        thumb.style.display = 'block';
        touch.steer = 0;

    } );
    pad.addEventListener( 'pointermove', ( e ) => {

        if ( e.pointerId !== touch.dragPointerId ) return;
        const dx = e.clientX - touch.dragOriginX;
        const dead = 6;
        const max = 90;
        let v = 0;
        if ( Math.abs( dx ) > dead ) {

            const s = Math.sign( dx );
            v = s * Math.min( 1, ( Math.abs( dx ) - dead ) / max );

        }
        // negate because in our control convention +1 = LEFT (matches keyA) and
        // we want dragging right on screen to steer right (-1).
        touch.steer = - v;
        const clampedDx = Math.max( - max, Math.min( max, dx ) );
        thumb.style.left = ( touch.dragOriginX + clampedDx ) + 'px';
        thumb.style.top = e.clientY + 'px';

    } );
    const padRelease = ( e ) => {

        if ( e.pointerId !== touch.dragPointerId ) return;
        touch.dragPointerId = - 1;
        touch.steer = 0;
        ring.style.display = 'none';
        thumb.style.display = 'none';

    };
    pad.addEventListener( 'pointerup', padRelease );
    pad.addEventListener( 'pointercancel', padRelease );

    // ── pedals (right side) ──
    const throttle = _touchPedal( '#FFCB47' );
    throttle.bar.style.right = '20px';
    throttle.bar.style.bottom = '90px';
    root.appendChild( throttle.bar );
    _bindPedal( throttle.bar, throttle.fill, 'throttle' );
    touch.throttleFillEl = throttle.fill;

    const brake = _touchPedal( '#E04141' );
    brake.bar.style.right = '116px';
    brake.bar.style.bottom = '90px';
    root.appendChild( brake.bar );
    _bindPedal( brake.bar, brake.fill, 'brake' );
    touch.brakeFillEl = brake.fill;

    // ── 2×2 cluster above the pedals ──
    const cluster = document.createElement( 'div' );
    cluster.style.cssText = 'position:absolute;right:20px;bottom:340px;display:grid;grid-template-columns:52px 52px;gap:8px;pointer-events:none';
    root.appendChild( cluster );

    const hb = _touchHoldBtn( 'HB', 13,
        () => { touch.handbrake = 1; },
        () => { touch.handbrake = 0; } );
    const shiftUp = _touchTapBtn( '↑', 22, () => { if ( transmission.mode === 'manual' ) manualShift( 1 ); } );
    const cam = _touchTapBtn( 'CAM', 11, () => {

        chaseCam.enabled = ! chaseCam.enabled;
        if ( controls ) controls.enabled = ! chaseCam.enabled;
        chaseCam.initialized = false;

    } );
    const shiftDn = _touchTapBtn( '↓', 22, () => { if ( transmission.mode === 'manual' ) manualShift( - 1 ); } );
    cluster.appendChild( hb );
    cluster.appendChild( shiftUp );
    cluster.appendChild( cam );
    cluster.appendChild( shiftDn );

    // ── utility row top-center ──
    const utility = document.createElement( 'div' );
    utility.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);display:flex;gap:8px;pointer-events:none';
    root.appendChild( utility );

    const resetBtn = _touchTapBtn( 'RESET', 10, () => {

        input.keyR = true;
        setTimeout( () => { input.keyR = false; }, 80 );

    } );
    resetBtn.style.width = '64px';
    resetBtn.style.height = '36px';
    const modeBtn = _touchTapBtn( 'A·M', 11, () => toggleTransmissionMode() );
    modeBtn.style.width = '52px';
    modeBtn.style.height = '36px';
    utility.appendChild( resetBtn );
    utility.appendChild( modeBtn );

}

function setTouchOverlayVisible( v ) {

    if ( touch.rootEl ) touch.rootEl.style.display = v ? 'block' : 'none';

}

// ---------------- stats-for-nerds (F3 / button toggle) ----------------

function _sStat( section, label, id, hint ) {

    const row = document.createElement( 'div' );
    row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;font-size:11px;line-height:1.55';
    const lbl = document.createElement( 'span' );
    lbl.textContent = label;
    lbl.style.cssText = 'opacity:0.62';
    if ( hint ) lbl.title = hint;
    const val = document.createElement( 'span' );
    val.style.cssText = 'font-weight:600;text-align:right;font-variant-numeric:tabular-nums';
    val.textContent = '—';
    statsForNerds.fields[ id ] = val;
    row.appendChild( lbl );
    row.appendChild( val );
    section.appendChild( row );

}

function _sSection( panel, title ) {

    const h = document.createElement( 'div' );
    h.textContent = title;
    h.style.cssText = 'margin:10px 0 4px;font-size:10px;letter-spacing:1.5px;color:#FFCB47;border-bottom:1px solid rgba(255,203,71,0.25);padding-bottom:2px';
    panel.appendChild( h );
    const sec = document.createElement( 'div' );
    panel.appendChild( sec );
    return sec;

}

function _sGraph( panel, label, id, w, h, color, min, max ) {

    const wrap = document.createElement( 'div' );
    wrap.style.cssText = 'margin-top:6px';
    const lab = document.createElement( 'div' );
    lab.textContent = label;
    lab.style.cssText = 'font-size:10px;opacity:0.62;margin-bottom:2px;display:flex;justify-content:space-between';
    const labRange = document.createElement( 'span' );
    labRange.textContent = `${ min }–${ max }`;
    labRange.style.opacity = '0.5';
    lab.appendChild( labRange );
    wrap.appendChild( lab );

    const canvas = document.createElement( 'canvas' );
    canvas.width = w;
    canvas.height = h;
    canvas.style.cssText = `width:${ w }px;height:${ h }px;background:rgba(255,255,255,0.05);border-radius:3px;display:block`;
    wrap.appendChild( canvas );
    panel.appendChild( wrap );

    statsForNerds.graphs[ id ] = { canvas, ctx: canvas.getContext( '2d' ), buffer: [], capacity: w, color, min, max };

}

function pushAndDrawGraph( id, v ) {

    const g = statsForNerds.graphs[ id ];
    if ( ! g ) return;
    g.buffer.push( v );
    if ( g.buffer.length > g.capacity ) g.buffer.shift();
    if ( ! statsForNerds.enabled ) return;

    const { ctx, canvas, buffer, color, min, max } = g;
    const w = canvas.width;
    const hh = canvas.height;
    ctx.clearRect( 0, 0, w, hh );

    // baseline mid-line for zero-ish reference
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect( 0, hh - 1, w, 1 );

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for ( let i = 0; i < buffer.length; i ++ ) {

        const x = w - buffer.length + i;
        const t = ( buffer[ i ] - min ) / ( max - min );
        const y = hh - Math.max( 0, Math.min( 1, t ) ) * hh;
        if ( i === 0 ) ctx.moveTo( x, y ); else ctx.lineTo( x, y );

    }
    ctx.stroke();

}

function initStatsForNerds() {

    // Toggle button — small pill below the three.js Stats overlay.
    statsForNerds.toggleBtn = document.createElement( 'div' );
    statsForNerds.toggleBtn.style.cssText = [
        'position:absolute', 'top:240px', 'right:10px',
        'padding:5px 9px', 'background:rgba(0,0,0,0.55)', 'color:#fff',
        'font:11px Monospace', 'border-radius:4px', 'z-index:3',
        'cursor:pointer', 'user-select:none',
        'border:1px solid rgba(255,255,255,0.15)'
    ].join( ';' );
    statsForNerds.toggleBtn.innerHTML = `${ iconHTML( 'bar-chart-3', 13 ) } <span style="margin-left:6px">stats for nerds</span>`;
    statsForNerds.toggleBtn.style.display = 'inline-flex';
    statsForNerds.toggleBtn.style.alignItems = 'center';
    statsForNerds.toggleBtn.title = 'F3';
    statsForNerds.toggleBtn.addEventListener( 'click', toggleStatsForNerds );
    document.body.appendChild( statsForNerds.toggleBtn );

    // Panel.
    const panel = document.createElement( 'div' );
    panel.style.cssText = [
        'position:absolute', 'top:240px', 'right:10px',
        'padding:10px 12px 12px', 'background:rgba(0,0,0,0.72)', 'color:#fff',
        'font:11px Monospace', 'border-radius:6px', 'z-index:3',
        'min-width:300px', 'max-width:340px', 'max-height:75vh', 'overflow-y:auto',
        'display:none', 'border:1px solid rgba(255,255,255,0.18)',
        'box-shadow:0 6px 28px rgba(0,0,0,0.45)'
    ].join( ';' );

    // header with close button
    const header = document.createElement( 'div' );
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:4px';
    const title = document.createElement( 'div' );
    title.innerHTML = `${ iconHTML( 'bar-chart-3', 13 ) } <span style="margin-left:6px">STATS FOR NERDS</span>`;
    title.style.cssText = 'font-size:11px;letter-spacing:1.5px;opacity:0.85;display:inline-flex;align-items:center';
    header.appendChild( title );
    const close = document.createElement( 'div' );
    close.innerHTML = iconHTML( 'x', 14 );
    close.style.cssText = 'cursor:pointer;padding:0 4px;opacity:0.7;display:inline-flex';
    close.addEventListener( 'click', toggleStatsForNerds );
    header.appendChild( close );
    panel.appendChild( header );

    // --- sections ---
    const drive = _sSection( panel, 'DRIVER INPUT' );
    _sStat( drive, 'throttle', 's_throttle' );
    _sStat( drive, 'brake', 's_brake' );
    _sStat( drive, 'steer', 's_steer' );
    _sStat( drive, 'handbrake', 's_handbrake' );
    _sStat( drive, 'reverse engaged', 's_reverse' );

    const drv = _sSection( panel, 'DRIVETRAIN' );
    _sStat( drv, 'mode', 's_mode' );
    _sStat( drv, 'gear', 's_gear' );
    _sStat( drv, 'engine RPM', 's_rpm' );
    _sStat( drv, 'norm. torque', 's_torque', 'torque curve value at current RPM' );
    _sStat( drv, 'wheel engine F', 's_engineF', 'force applied to front wheels' );
    _sStat( drv, 'speed', 's_speed' );

    _sGraph( panel, 'RPM', 'g_rpm', 280, 36, '#F5D04A', 0, 7500 );
    _sGraph( panel, 'speed (km/h)', 'g_speed', 280, 36, '#7BD37F', 0, 220 );

    const wh = _sSection( panel, 'WHEELS · FL · FR · RL · RR' );
    _sStat( wh, 'contact', 's_w_contact' );
    _sStat( wh, 'susp. len', 's_w_susp' );
    _sStat( wh, 'susp. force', 's_w_suspF' );
    _sStat( wh, 'fwd impulse', 's_w_fwdI' );
    _sStat( wh, 'side impulse', 's_w_sideI' );
    _sStat( wh, 'brake', 's_w_brake' );

    const ch = _sSection( panel, 'CHASSIS' );
    _sStat( ch, 'pos', 's_pos' );
    _sStat( ch, 'velocity (m/s)', 's_vel' );
    _sStat( ch, 'ang. velocity', 's_angvel' );
    _sStat( ch, 'pitch · yaw · roll', 's_pyr' );

    const sim = _sSection( panel, 'SIM' );
    _sStat( sim, 'Δt frame', 's_dt' );
    _sStat( sim, 'target fps', 's_targetfps' );
    _sStat( sim, 'gamepad', 's_pad' );
    _sStat( sim, 'track triangles', 's_tris' );

    document.body.appendChild( panel );
    statsForNerds.panel = panel;

}

function toggleStatsForNerds() {

    statsForNerds.enabled = ! statsForNerds.enabled;
    if ( statsForNerds.enabled ) {

        statsForNerds.panel.style.display = 'block';
        statsForNerds.toggleBtn.style.display = 'none';

    } else {

        statsForNerds.panel.style.display = 'none';
        statsForNerds.toggleBtn.style.display = 'inline-flex';

    }

}

function _sset( id, txt ) {

    const el = statsForNerds.fields[ id ];
    if ( el ) el.textContent = txt;

}

const _eulerTmp = new THREE.Euler();
const _quatTmp = new THREE.Quaternion();

function updateStatsForNerds( speed ) {

    // Always push graph data even when hidden so opening the panel shows
    // recent history rather than starting from a flat line.
    pushAndDrawGraph( 'g_rpm', engine.rpm );
    pushAndDrawGraph( 'g_speed', Math.abs( speed ) * 3.6 );

    if ( ! statsForNerds.enabled || ! chassis ) return;

    _sset( 's_throttle', input.throttle.toFixed( 2 ) );
    _sset( 's_brake', input.brake.toFixed( 2 ) );
    _sset( 's_steer', input.steer.toFixed( 2 ) );
    _sset( 's_handbrake', input.handbrake.toFixed( 2 ) );
    _sset( 's_reverse', input.reverseEngaged ? 'YES' : 'no' );

    _sset( 's_mode', transmission.mode.toUpperCase() );
    const g = transmission.gear;
    _sset( 's_gear', g === - 1 ? 'R' : g === 0 ? 'N' : g.toString() );
    _sset( 's_rpm', engine.rpm.toFixed( 0 ) );
    _sset( 's_torque', torqueAt( engine.rpm ).toFixed( 3 ) );
    _sset( 's_engineF', vehicleController.wheelEngineForce( 0 ).toFixed( 1 ) + ' N' );
    _sset( 's_speed', `${ ( Math.abs( speed ) * 3.6 ).toFixed( 1 ) } km/h · ${ Math.abs( speed ).toFixed( 2 ) } m/s` );

    // Wheels — FL=0, FR=1, RL=2, RR=3 in our addWheel order.
    const wContact = [], wSusp = [], wSuspF = [], wFwdI = [], wSideI = [], wBrake = [];
    for ( let i = 0; i < 4; i ++ ) {

        wContact.push( vehicleController.wheelIsInContact( i ) ? '✓' : '·' );
        wSusp.push( vehicleController.wheelSuspensionLength( i ).toFixed( 2 ) );
        wSuspF.push( vehicleController.wheelSuspensionForce( i ).toFixed( 0 ) );
        wFwdI.push( vehicleController.wheelForwardImpulse( i ).toFixed( 1 ) );
        wSideI.push( vehicleController.wheelSideImpulse( i ).toFixed( 1 ) );
        wBrake.push( vehicleController.wheelBrake( i ).toFixed( 2 ) );

    }
    _sset( 's_w_contact', wContact.join( ' · ' ) );
    _sset( 's_w_susp', wSusp.join( ' · ' ) );
    _sset( 's_w_suspF', wSuspF.join( ' · ' ) );
    _sset( 's_w_fwdI', wFwdI.join( ' · ' ) );
    _sset( 's_w_sideI', wSideI.join( ' · ' ) );
    _sset( 's_w_brake', wBrake.join( ' · ' ) );

    const t = chassis.translation();
    const v = chassis.linvel();
    const av = chassis.angvel();
    const q = chassis.rotation();
    _quatTmp.set( q.x, q.y, q.z, q.w );
    _eulerTmp.setFromQuaternion( _quatTmp, 'YXZ' );

    _sset( 's_pos', `${ t.x.toFixed( 1 ) } · ${ t.y.toFixed( 1 ) } · ${ t.z.toFixed( 1 ) }` );
    _sset( 's_vel', `${ v.x.toFixed( 1 ) } · ${ v.y.toFixed( 1 ) } · ${ v.z.toFixed( 1 ) }` );
    _sset( 's_angvel', `${ av.x.toFixed( 2 ) } · ${ av.y.toFixed( 2 ) } · ${ av.z.toFixed( 2 ) }` );
    _sset( 's_pyr', `${ ( _eulerTmp.x * 180 / Math.PI ).toFixed( 1 ) }° · ${ ( _eulerTmp.y * 180 / Math.PI ).toFixed( 1 ) }° · ${ ( _eulerTmp.z * 180 / Math.PI ).toFixed( 1 ) }°` );

    _sset( 's_dt', `${ ( statsForNerds.lastDelta * 1000 ).toFixed( 2 ) } ms` );
    _sset( 's_targetfps', String( fpsTarget.target ) );
    _sset( 's_pad', gamepad.index >= 0 ? gamepad.id.slice( 0, 28 ) : '—' );
    _sset( 's_tris', _trackTris ? _trackTris.toLocaleString() : '?' );

}

let _trackTris = 0;

// ── seven low-poly car silhouettes (from the design subagent) ─────────────
const _visLightGeom = new THREE.BoxGeometry( 0.35, 0.18, 0.08 );

function _addCarMesh( parent, geom, mat, pos, rot ) {

    const m = new THREE.Mesh( geom, mat );
    if ( pos ) m.position.set( pos[ 0 ], pos[ 1 ], pos[ 2 ] );
    if ( rot ) m.rotation.set( rot[ 0 ] || 0, rot[ 1 ] || 0, rot[ 2 ] || 0 );
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add( m );
    return m;

}

function _buildHatchback( parent ) {

    const bodyMat = new THREE.MeshStandardMaterial( { color: 0xFFCB47, roughness: 0.55, metalness: 0.15 } );
    const cabinMat = new THREE.MeshStandardMaterial( { color: 0x202830, roughness: 0.3, metalness: 0.4 } );
    const headlightMat = new THREE.MeshStandardMaterial( { color: 0xFFEEB0, emissive: 0xFFCC55, emissiveIntensity: 0.6 } );
    const taillightMat = new THREE.MeshStandardMaterial( { color: 0xCC1818, emissive: 0xFF2222, emissiveIntensity: 0.7 } );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.85, 0.7, 3.7 ), bodyMat, [ 0, - 0.15, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.55, 0.5, 1.9 ), cabinMat, [ 0, 0.45, 0.05 ] );
    for ( const x of [ - 0.6, 0.6 ] ) {

        _addCarMesh( parent, _visLightGeom, headlightMat, [ x, - 0.08, - 1.86 ] );
        _addCarMesh( parent, _visLightGeom, taillightMat, [ x, - 0.02, 1.86 ] );

    }

}

function _buildMuscleV8( parent ) {

    const bodyMat = new THREE.MeshStandardMaterial( { color: 0xB42020, roughness: 0.45, metalness: 0.25 } );
    const cabinMat = new THREE.MeshStandardMaterial( { color: 0x101418, roughness: 0.3, metalness: 0.5 } );
    const stripeMat = new THREE.MeshStandardMaterial( { color: 0x0A0A0A, roughness: 0.6, metalness: 0.2 } );
    const headlightMat = new THREE.MeshStandardMaterial( { color: 0xFFEEB0, emissive: 0xFFCC55, emissiveIntensity: 0.7 } );
    const taillightMat = new THREE.MeshStandardMaterial( { color: 0xCC1818, emissive: 0xFF2222, emissiveIntensity: 0.8 } );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.9, 0.8, 3.7 ), bodyMat, [ 0, - 0.1, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.5, 0.45, 1.4 ), cabinMat, [ 0, 0.5, 0.55 ], [ - 0.08, 0, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.25, 0.95, 3.72 ), stripeMat, [ - 0.35, 0.32, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.25, 0.95, 3.72 ), stripeMat, [ 0.35, 0.32, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.3, 0.12, 0.5 ), bodyMat, [ - 0.3, 0.36, - 0.9 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.3, 0.12, 0.5 ), bodyMat, [ 0.3, 0.36, - 0.9 ] );
    for ( const x of [ - 0.65, 0.65 ] ) {

        _addCarMesh( parent, _visLightGeom, headlightMat, [ x, 0, - 1.86 ] );
        _addCarMesh( parent, _visLightGeom, taillightMat, [ x, 0.05, 1.86 ] );

    }

}

function _buildSportFlatSix( parent ) {

    const bodyMat = new THREE.MeshStandardMaterial( { color: 0xC8CDD2, roughness: 0.4, metalness: 0.55 } );
    const cabinMat = new THREE.MeshStandardMaterial( { color: 0x0A0C10, roughness: 0.2, metalness: 0.6 } );
    const headlightMat = new THREE.MeshStandardMaterial( { color: 0xFFEEB0, emissive: 0xFFCC55, emissiveIntensity: 0.7 } );
    const taillightMat = new THREE.MeshStandardMaterial( { color: 0xCC1818, emissive: 0xFF2222, emissiveIntensity: 0.8 } );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.85, 0.5, 3.7 ), bodyMat, [ 0, - 0.25, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.4, 0.45, 1.5 ), cabinMat, [ 0, 0.25, - 0.1 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.9, 0.25, 0.8 ), bodyMat, [ 0, 0.15, 1.2 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.7, 0.08, 0.15 ), bodyMat, [ 0, 0.4, 1.7 ] );
    for ( const x of [ - 0.6, 0.6 ] ) {

        _addCarMesh( parent, _visLightGeom, headlightMat, [ x, - 0.18, - 1.86 ] );
        _addCarMesh( parent, new THREE.BoxGeometry( 0.6, 0.1, 0.08 ), taillightMat, [ x, 0.05, 1.86 ] );

    }

}

function _buildRallyTurbo( parent ) {

    const bodyMat = new THREE.MeshStandardMaterial( { color: 0x1F4DFF, roughness: 0.5, metalness: 0.2 } );
    const cabinMat = new THREE.MeshStandardMaterial( { color: 0x202830, roughness: 0.3, metalness: 0.4 } );
    const goldMat = new THREE.MeshStandardMaterial( { color: 0xD4A52A, roughness: 0.4, metalness: 0.7 } );
    const headlightMat = new THREE.MeshStandardMaterial( { color: 0xFFEEB0, emissive: 0xFFCC55, emissiveIntensity: 0.7 } );
    const taillightMat = new THREE.MeshStandardMaterial( { color: 0xCC1818, emissive: 0xFF2222, emissiveIntensity: 0.8 } );
    const roofLightMat = new THREE.MeshStandardMaterial( { color: 0xFFF4B0, emissive: 0xFFEE55, emissiveIntensity: 1.0 } );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.95, 0.85, 3.7 ), bodyMat, [ 0, - 0.05, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.65, 0.6, 1.9 ), cabinMat, [ 0, 0.65, 0.05 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.5, 0.12, 0.45 ), bodyMat, [ 0, 1.0, 0.1 ] );
    const roofLightGeom = new THREE.BoxGeometry( 0.22, 0.18, 0.18 );
    for ( const x of [ - 0.6, - 0.2, 0.2, 0.6 ] ) _addCarMesh( parent, roofLightGeom, roofLightMat, [ x, 1.05, - 0.6 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.4, 0.1, 0.35 ), goldMat, [ 0, 0.65, 1.75 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.18, 0.25, 0.35 ), goldMat, [ - 0.55, 0.5, 1.75 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.18, 0.25, 0.35 ), goldMat, [ 0.55, 0.5, 1.75 ] );
    for ( const x of [ - 0.7, 0.7 ] ) {

        _addCarMesh( parent, _visLightGeom, headlightMat, [ x, 0.05, - 1.86 ] );
        _addCarMesh( parent, _visLightGeom, taillightMat, [ x, 0.1, 1.86 ] );

    }

}

function _buildSupercarV12( parent ) {

    const bodyMat = new THREE.MeshStandardMaterial( { color: 0xFF6F1A, roughness: 0.55, metalness: 0.3 } );
    const cabinMat = new THREE.MeshStandardMaterial( { color: 0x0A0C10, roughness: 0.2, metalness: 0.6 } );
    const darkMat = new THREE.MeshStandardMaterial( { color: 0x111111, roughness: 0.6, metalness: 0.3 } );
    const headlightMat = new THREE.MeshStandardMaterial( { color: 0xFFEEB0, emissive: 0xFFCC55, emissiveIntensity: 0.8 } );
    const taillightMat = new THREE.MeshStandardMaterial( { color: 0xCC1818, emissive: 0xFF2222, emissiveIntensity: 0.9 } );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.85, 0.35, 3.7 ), bodyMat, [ 0, - 0.25, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.55, 0.5, 1.7 ), cabinMat, [ 0, 0.1, - 0.15 ], [ - 0.15, 0, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.8, 0.15, 0.7 ), bodyMat, [ 0, 0, 1.2 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.95, 0.08, 0.3 ), darkMat, [ 0, - 0.5, - 1.75 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.6, 0.06, 0.2 ), darkMat, [ 0, 0.05, 1.85 ] );
    for ( const x of [ - 0.55, 0.55 ] ) {

        _addCarMesh( parent, new THREE.BoxGeometry( 0.4, 0.1, 0.08 ), headlightMat, [ x, - 0.18, - 1.86 ] );
        _addCarMesh( parent, new THREE.BoxGeometry( 0.45, 0.1, 0.08 ), taillightMat, [ x, 0, 1.86 ] );

    }

}

function _buildF1( parent ) {

    const bodyMat = new THREE.MeshStandardMaterial( { color: 0xD11A1A, roughness: 0.45, metalness: 0.35 } );
    const darkMat = new THREE.MeshStandardMaterial( { color: 0x0A0A0A, roughness: 0.5, metalness: 0.4 } );
    const cockpitMat = new THREE.MeshStandardMaterial( { color: 0x050505, roughness: 0.7, metalness: 0.2 } );
    const taillightMat = new THREE.MeshStandardMaterial( { color: 0xCC1818, emissive: 0xFF2222, emissiveIntensity: 1.0 } );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.7, 0.25, 3.7 ), bodyMat, [ 0, - 0.2, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.35, 0.18, 1.0 ), bodyMat, [ 0, - 0.2, - 1.85 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.9, 0.05, 0.35 ), bodyMat, [ 0, - 0.35, - 2.0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 2.0, 0.08, 0.45 ), bodyMat, [ 0, 0.45, 1.85 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.08, 0.55, 0.4 ), bodyMat, [ - 0.55, 0.2, 1.85 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.08, 0.55, 0.4 ), bodyMat, [ 0.55, 0.2, 1.85 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.5, 0.35, 0.5 ), cockpitMat, [ 0, 0, 0.3 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.7, 0.08, 0.6 ), darkMat, [ 0, 0.4, 0.3 ], [ 0.3, 0, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.6, 0.18, 0.6 ), bodyMat, [ 0, - 0.15, 1.0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.18, 0.18, 0.08 ), taillightMat, [ 0, 0.1, 1.86 ] );

}

function _buildGodCar( parent ) {

    const bodyMat = new THREE.MeshStandardMaterial( { color: 0xF0F0F8, roughness: 0.15, metalness: 0.85 } );
    const cabinMat = new THREE.MeshStandardMaterial( { color: 0x0A0C10, roughness: 0.15, metalness: 0.7 } );
    const darkMat = new THREE.MeshStandardMaterial( { color: 0x111111, roughness: 0.5, metalness: 0.4 } );
    const headlightMat = new THREE.MeshStandardMaterial( { color: 0xFFFFFF, emissive: 0xFFFFFF, emissiveIntensity: 1.5 } );
    const taillightMat = new THREE.MeshStandardMaterial( { color: 0xCC1818, emissive: 0xFF2222, emissiveIntensity: 1.0 } );
    const roofLightMat = new THREE.MeshStandardMaterial( { color: 0xFFF4B0, emissive: 0xFFEE55, emissiveIntensity: 1.2 } );
    const neonMat = new THREE.MeshStandardMaterial( { color: 0x00FFFF, emissive: 0x00FFFF, emissiveIntensity: 1.5 } );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.9, 0.3, 3.7 ), bodyMat, [ 0, - 0.25, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.5, 0.45, 1.7 ), cabinMat, [ 0, 0.15, - 0.1 ], [ - 0.15, 0, 0 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 1.95, 0.08, 0.3 ), darkMat, [ 0, - 0.5, - 1.75 ] );
    const neon = new THREE.Mesh( new THREE.BoxGeometry( 1.7, 0.04, 3.4 ), neonMat );
    neon.position.set( 0, - 0.46, 0 );
    parent.add( neon );
    _addCarMesh( parent, new THREE.BoxGeometry( 2.0, 0.08, 0.45 ), bodyMat, [ 0, 0.55, 1.8 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.08, 0.4, 0.4 ), bodyMat, [ - 0.55, 0.35, 1.8 ] );
    _addCarMesh( parent, new THREE.BoxGeometry( 0.08, 0.4, 0.4 ), bodyMat, [ 0.55, 0.35, 1.8 ] );
    const roofLightGeom = new THREE.BoxGeometry( 0.2, 0.16, 0.16 );
    for ( const x of [ - 0.5, - 0.17, 0.17, 0.5 ] ) _addCarMesh( parent, roofLightGeom, roofLightMat, [ x, 0.55, - 0.4 ] );
    for ( const x of [ - 0.6, 0.6 ] ) {

        _addCarMesh( parent, _visLightGeom, headlightMat, [ x, - 0.2, - 1.86 ] );
        _addCarMesh( parent, _visLightGeom, taillightMat, [ x, 0, 1.86 ] );

    }

}

const _CAR_BUILDERS = {
    'Hatchback': _buildHatchback,
    'Muscle V8': _buildMuscleV8,
    'Sport Flat-six': _buildSportFlatSix,
    'Rally Turbo': _buildRallyTurbo,
    'Supercar V12': _buildSupercarV12,
    'F1': _buildF1,
    'God Car': _buildGodCar
};

function buildCarVisuals( parent, car ) {

    ( _CAR_BUILDERS[ car.name ] || _buildHatchback )( parent );

}

function _disposeCarVisuals() {

    if ( ! carVisualsGroup ) return;
    while ( carVisualsGroup.children.length > 0 ) {

        const c = carVisualsGroup.children[ 0 ];
        carVisualsGroup.remove( c );
        if ( c.geometry ) c.geometry.dispose();
        if ( c.material ) c.material.dispose();

    }

}

function addWheel( index, pos, carMesh ) {

    const wheelWidth = 0.4;
    const wheelDirection = { x: 0.0, y: - 1.0, z: 0.0 };
    const wheelAxle = { x: - 1.0, y: 0.0, z: 0.0 };

    vehicleController.addWheel(
        pos,
        wheelDirection,
        wheelAxle,
        currentCar.suspensionRestLength,
        WHEEL_RADIUS
    );

    vehicleController.setWheelSuspensionStiffness( index, currentCar.suspensionStiffness );
    vehicleController.setWheelSuspensionCompression( index, currentCar.suspensionCompression );
    vehicleController.setWheelSuspensionRelaxation( index, currentCar.suspensionRelaxation );
    vehicleController.setWheelFrictionSlip( index, currentCar.wheelFrictionSlip );
    vehicleController.setWheelSteering( index, pos.z < 0 );

    const geometry = new THREE.CylinderGeometry( WHEEL_RADIUS, WHEEL_RADIUS, wheelWidth, 16 );
    geometry.rotateZ( Math.PI * 0.5 );
    const material = new THREE.MeshStandardMaterial( { color: 0x000000 } );
    const wheel = new THREE.Mesh( geometry, material );

    wheel.castShadow = true;
    wheel.position.copy( pos );

    wheels.push( wheel );
    carMesh.add( wheel );

}

function updateWheels() {

    if ( vehicleController === undefined ) return;

    const wheelSteeringQuat = new THREE.Quaternion();
    const wheelRotationQuat = new THREE.Quaternion();
    const up = new THREE.Vector3( 0, 1, 0 );

    wheels.forEach( ( wheel, index ) => {

        const wheelAxleCs = vehicleController.wheelAxleCs( index );
        const connection = vehicleController.wheelChassisConnectionPointCs( index ).y || 0;
        const suspension = vehicleController.wheelSuspensionLength( index ) || 0;
        const steering = vehicleController.wheelSteering( index ) || 0;
        const rotationRad = vehicleController.wheelRotation( index ) || 0;

        wheel.position.y = connection - suspension;

        wheelSteeringQuat.setFromAxisAngle( up, steering );
        wheelRotationQuat.setFromAxisAngle( wheelAxleCs, rotationRad );

        wheel.quaternion.multiplyQuaternions( wheelSteeringQuat, wheelRotationQuat );

    } );

}

// ---------- input / transmission / engine pipeline ----------

function applyDeadzone( v, dz ) {

    if ( Math.abs( v ) < dz ) return 0;
    return Math.sign( v ) * ( Math.abs( v ) - dz ) / ( 1 - dz );

}

function pollGamepad() {

    if ( gamepad.index < 0 ) return null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[ gamepad.index ];
    if ( ! pad ) return null;

    const steer = applyDeadzone( pad.axes[ 0 ] || 0, 0.12 );
    const throttle = pad.buttons[ 7 ] ? pad.buttons[ 7 ].value : 0; // RT
    const brake = pad.buttons[ 6 ] ? pad.buttons[ 6 ].value : 0;   // LT
    const handbrake = pad.buttons[ 0 ] && pad.buttons[ 0 ].pressed ? 1 : 0; // A

    // Edge-trigger bumpers / face buttons.
    const prev = gamepad.prevButtons;
    const rb = pad.buttons[ 5 ] && pad.buttons[ 5 ].pressed;
    const lb = pad.buttons[ 4 ] && pad.buttons[ 4 ].pressed;
    const x = pad.buttons[ 2 ] && pad.buttons[ 2 ].pressed; // mode toggle
    const y = pad.buttons[ 3 ] && pad.buttons[ 3 ].pressed; // camera toggle
    const start = pad.buttons[ 9 ] && pad.buttons[ 9 ].pressed; // reset

    if ( rb && ! prev[ 5 ] && transmission.mode === 'manual' ) manualShift( 1 );
    if ( lb && ! prev[ 4 ] && transmission.mode === 'manual' ) manualShift( - 1 );
    if ( x && ! prev[ 2 ] ) toggleTransmissionMode();
    if ( y && ! prev[ 3 ] ) {

        chaseCam.enabled = ! chaseCam.enabled;
        if ( controls ) controls.enabled = ! chaseCam.enabled;
        chaseCam.initialized = false;

    }
    if ( start && ! prev[ 9 ] ) input.keyR = true; else if ( ! start && prev[ 9 ] ) input.keyR = false;

    gamepad.prevButtons = pad.buttons.map( b => b.pressed );

    return { steer, throttle, brake, handbrake };

}

function updateInput( dt ) {

    // Keyboard contribution (binary).
    let kSteer = 0;
    if ( input.keyA || input.arrowLeft ) kSteer += 1;
    if ( input.keyD || input.arrowRight ) kSteer -= 1;

    const kThrottle = ( input.keyW || input.arrowUp ) ? 1 : 0;
    // Space is a plain brake (no reverse). S still does brake + long-press reverse.
    const kBrake = ( input.keyS || input.arrowDown || input.keySpace ) ? 1 : 0;
    const kHandbrake = input.keyE ? 1 : 0;

    // Gamepad contribution (analog, overrides if magnitude > keyboard).
    const pad = pollGamepad();
    let steer = kSteer;
    let throttle = kThrottle;
    let brake = kBrake;
    let handbrake = kHandbrake;
    if ( pad ) {

        if ( Math.abs( pad.steer ) > Math.abs( steer ) ) steer = - pad.steer; // invert for our coord system
        if ( pad.throttle > throttle ) throttle = pad.throttle;
        if ( pad.brake > brake ) brake = pad.brake;
        if ( pad.handbrake > handbrake ) handbrake = pad.handbrake;

    }

    // Touch overlay merges in last. Analog values, max-wins.
    if ( touch.enabled ) {

        if ( Math.abs( touch.steer ) > Math.abs( steer ) ) steer = touch.steer;
        if ( touch.throttle > throttle ) throttle = touch.throttle;
        if ( touch.brake > brake ) brake = touch.brake;
        if ( touch.handbrake > handbrake ) handbrake = touch.handbrake;

    }

    input.steer = steer;
    input.throttle = throttle;
    input.brake = brake;
    input.handbrake = handbrake;
    input.reset = input.keyR;

    // Long-press reverse: S / ↓ / touch brake bar trigger this — Space is a
    // pure brake and never engages reverse. Requires car essentially stopped.
    const speed = vehicleController ? Math.abs( vehicleController.currentVehicleSpeed() ) : 0;
    const reverseTrigger = ( input.keyS || input.arrowDown || touch.brakeActive ) ? 1 : 0;
    if ( reverseTrigger > 0.5 && speed < 0.6 ) {

        input.sHeldTime += dt;
        if ( input.sHeldTime > 0.3 ) input.reverseEngaged = true;

    } else if ( reverseTrigger < 0.1 ) {

        input.sHeldTime = 0;
        if ( throttle > 0.1 && transmission.mode === 'auto' ) input.reverseEngaged = false;

    }

}

function gearRatio( gear ) {

    if ( gear === 0 ) return 0;
    if ( gear === - 1 ) return currentCar.reverseRatio;
    const idx = gear - 1;
    if ( idx < 0 || idx >= currentCar.gearRatios.length ) return 0;
    return currentCar.gearRatios[ idx ];

}

function maxGear() { return currentCar.gearRatios.length; }

function manualShift( direction ) {

    if ( transmission.shiftCooldown > 0 ) return;
    const next = transmission.gear + direction;
    if ( next < - 1 || next > maxGear() ) return;
    transmission.gear = next;
    transmission.shiftCooldown = 0.15;
    playShiftSound();

}

function toggleTransmissionMode() {

    transmission.mode = transmission.mode === 'auto' ? 'manual' : 'auto';
    if ( speedoModeEl ) speedoModeEl.textContent = transmission.mode.toUpperCase();
    // When switching to manual mid-drive, start in current ratio so we don't
    // jolt the engine. Auto will sort itself out next frame.

}

// Map vehicle speed + current gear → engine RPM.
function computeRpm( speed, gear ) {

    const ratio = gearRatio( gear );
    if ( ratio === 0 ) return engine.idleRpm;
    const wheelOmega = Math.abs( speed ) / WHEEL_RADIUS;       // rad/s
    const wheelRpm = wheelOmega * 60 / ( 2 * Math.PI );
    const rpm = wheelRpm * Math.abs( ratio ) * currentCar.finalDrive;
    return Math.max( engine.idleRpm, rpm );

}

// Bell-shaped torque curve, normalized to [0,1]. Peak / width come from the
// current car, so different engines have visibly different powerband shapes.
function torqueAt( rpm ) {

    if ( rpm >= engine.redline ) return 0.15; // rev limiter cut
    const x = ( rpm - currentCar.peakTorqueRpm ) / currentCar.torqueCurveWidth;
    return Math.max( 0.18, Math.exp( - x * x ) );

}

function updateTransmission( dt, speed ) {

    if ( transmission.shiftCooldown > 0 ) transmission.shiftCooldown -= dt;

    if ( transmission.mode === 'manual' ) return; // user shifts in manual

    // Auto reverse handling.
    if ( input.reverseEngaged && transmission.gear !== - 1 ) {

        transmission.gear = - 1;
        transmission.shiftCooldown = 0.2;
        playShiftSound();
        return;

    }
    if ( ! input.reverseEngaged && transmission.gear === - 1 && input.throttle > 0.1 ) {

        transmission.gear = 1;
        transmission.shiftCooldown = 0.2;
        playShiftSound();
        return;

    }

    if ( transmission.shiftCooldown > 0 ) return;

    // From a standing start, auto shifts into 1st when throttle is pressed.
    if ( transmission.gear === 0 && input.throttle > 0.05 ) {

        transmission.gear = 1;
        transmission.shiftCooldown = 0.15;
        playShiftSound();
        return;

    }

    // Upshift when RPM crosses threshold and we're under throttle.
    if ( transmission.gear >= 1 && transmission.gear < maxGear() && engine.rpm > engine.autoUpshiftRpm && input.throttle > 0.4 ) {

        transmission.gear += 1;
        transmission.shiftCooldown = 0.25;
        playShiftSound();
        return;

    }

    // Downshift on low RPM.
    if ( transmission.gear > 1 && engine.rpm < engine.autoDownshiftRpm ) {

        transmission.gear -= 1;
        transmission.shiftCooldown = 0.25;
        playShiftSound();

    }

}

function applyVehicleForces( speed ) {

    if ( input.reset ) {

        chassis.setTranslation( new physics.RAPIER.Vector3( spawnPoint.x, spawnPoint.y, spawnPoint.z ), true );
        chassis.setRotation( new physics.RAPIER.Quaternion( spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w ), true );
        chassis.setLinvel( new physics.RAPIER.Vector3( 0, 0, 0 ), true );
        chassis.setAngvel( new physics.RAPIER.Vector3( 0, 0, 0 ), true );
        transmission.gear = 1;
        transmission.shiftCooldown = 0;
        engine.rpm = engine.idleRpm;
        input.reverseEngaged = false;
        input.sHeldTime = 0;
        chaseCam.initialized = false;
        return;

    }

    if ( chassis.isSleeping() ) chassis.wakeUp();

    // ENGINE FORCE.
    // In AUTO with reverseEngaged, the brake pedal doubles as the reverse throttle.
    // In MANUAL, throttle is always W; gear sign decides direction.
    let throttleEffective = input.throttle;
    if ( transmission.mode === 'auto' && input.reverseEngaged ) {

        throttleEffective = input.brake; // S pedal acts as reverse accelerator

    }

    const ratio = gearRatio( transmission.gear );
    let engineForce = 0;
    if ( ratio !== 0 && throttleEffective > 0 ) {

        const torque = torqueAt( engine.rpm );
        // Force pushes the chassis in the -Z (forward) direction for + ratio,
        // and +Z for negative (reverse) ratio. Our convention from the original
        // example: negative wheel engine force => forward motion.
        const magnitude = throttleEffective * torque * currentCar.maxEngineForce;
        engineForce = - magnitude * Math.sign( ratio );

    }

    // Apply engine force to the front wheels (FWD).
    vehicleController.setWheelEngineForce( 0, engineForce );
    vehicleController.setWheelEngineForce( 1, engineForce );

    // BRAKE.
    // In auto+reverseEngaged, the brake pedal is throttle so no braking from it.
    // In every other case, S applies the service brake.
    let serviceBrake = 0;
    if ( ! ( transmission.mode === 'auto' && input.reverseEngaged ) ) {

        // Light brake unless gear opposes motion → use engine braking instead.
        serviceBrake = input.brake * currentCar.maxBrakeForce;

    }
    const handbrake = input.handbrake * currentCar.maxBrakeForce * currentCar.handbrakeMultiplier;

    // Service brake on all 4, handbrake biased to rear wheels (indices 2,3).
    vehicleController.setWheelBrake( 0, serviceBrake );
    vehicleController.setWheelBrake( 1, serviceBrake );
    vehicleController.setWheelBrake( 2, Math.max( serviceBrake, handbrake ) );
    vehicleController.setWheelBrake( 3, Math.max( serviceBrake, handbrake ) );

    // STEERING — smoothed. Max angle per car.
    const currentSteering = vehicleController.wheelSteering( 0 );
    const steering = THREE.MathUtils.lerp( currentSteering, currentCar.maxSteeringAngle * input.steer, 0.25 );
    vehicleController.setWheelSteering( 0, steering );
    vehicleController.setWheelSteering( 1, steering );

}

const _carQuat = new THREE.Quaternion();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _desiredPos = new THREE.Vector3();
const _desiredLook = new THREE.Vector3();
const _worldUp = new THREE.Vector3( 0, 1, 0 );

function updateChaseCamera( delta ) {

    if ( ! chassis || ! car ) return;

    const r = chassis.rotation();
    _carQuat.set( r.x, r.y, r.z, r.w );

    _forward.set( 0, 0, - 1 ).applyQuaternion( _carQuat );
    _forward.y = 0;

    if ( _forward.lengthSq() < 1e-4 ) {

        _forward.subVectors( car.position, camera.position );
        _forward.y = 0;
        if ( _forward.lengthSq() < 1e-4 ) _forward.set( 0, 0, - 1 );

    }

    _forward.normalize();
    _right.crossVectors( _forward, _worldUp ).normalize();

    _desiredPos.copy( car.position )
        .addScaledVector( _forward, - chaseCam.positionOffset.z )
        .addScaledVector( _right, chaseCam.positionOffset.x )
        .addScaledVector( _worldUp, chaseCam.positionOffset.y );

    _desiredLook.copy( car.position )
        .addScaledVector( _forward, - chaseCam.lookOffset.z )
        .addScaledVector( _right, chaseCam.lookOffset.x )
        .addScaledVector( _worldUp, chaseCam.lookOffset.y );

    if ( ! chaseCam.initialized ) {

        camera.position.copy( _desiredPos );
        chaseCam.currentLookAt.copy( _desiredLook );
        chaseCam.initialized = true;

    } else {

        const posAlpha = 1 - Math.exp( - chaseCam.positionDamping * delta );
        const lookAlpha = 1 - Math.exp( - chaseCam.lookDamping * delta );

        camera.position.lerp( _desiredPos, posAlpha );
        chaseCam.currentLookAt.lerp( _desiredLook, lookAlpha );

    }

    camera.lookAt( chaseCam.currentLookAt );

    const v = chassis.linvel();
    const planarSpeed = Math.hypot( v.x, v.z );
    const t = Math.min( planarSpeed / chaseCam.speedForMaxFov, 1 );
    const targetFov = chaseCam.baseFov + chaseCam.maxFovBoost * t;
    const fovAlpha = 1 - Math.exp( - chaseCam.fovDamping * delta );
    camera.fov += ( targetFov - camera.fov ) * fovAlpha;
    camera.updateProjectionMatrix();

}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );

}

function animate( time ) {

    // Frame lock: bail out if it isn't time for the next frame yet.
    // The 0.5ms slack absorbs rAF jitter so we don't drop a frame that
    // arrives a hair early on a 120Hz display.
    if ( time - fpsTarget.lastRenderTime < fpsTarget.frameInterval - 0.5 ) return;

    const frameDelta = time - fpsTarget.lastRenderTime;
    fpsTarget.lastRenderTime = time;

    // Adaptive downgrade: only meaningful when targeting 120.
    if ( fpsTarget.target === 120 ) {

        if ( frameDelta > fpsTarget.frameInterval * 1.4 ) {

            fpsTarget.overBudgetStreak ++;

            if ( fpsTarget.overBudgetStreak >= fpsTarget.overBudgetThreshold ) {

                fpsTarget.target = 60;
                fpsTarget.frameInterval = 1000 / 60;
                fpsTarget.overBudgetStreak = 0;
                if ( fpsLabel ) fpsLabel.textContent = 'system busy · downgraded to 60fps';

            }

        } else {

            fpsTarget.overBudgetStreak = 0;

        }

    }

    const delta = Math.min( clock.getDelta(), 0.1 );

    if ( vehicleController ) {

        const speed = vehicleController.currentVehicleSpeed();

        updateInput( delta );

        const targetRpm = computeRpm( speed, transmission.gear );
        const rpmAlpha = 1 - Math.exp( - 12 * delta );
        engine.rpm += ( targetRpm - engine.rpm ) * rpmAlpha;

        updateTransmission( delta, speed );
        applyVehicleForces( speed );

        // Order matters: updateVehicle applies suspension/engine forces TO the
        // chassis body, then world.step integrates one timestep. Same dt for
        // both so the wheel raycasts and the chassis pose match.
        vehicleController.updateVehicle( delta );
        physics.step( delta );

        updateWheels();
        updateSpeedometer( speed );

        statsForNerds.lastDelta = delta;
        updateStatsForNerds( speed );

        updateAudio( delta );

    }

    if ( chaseCam.enabled ) {

        updateChaseCamera( delta );

    } else if ( controls && car ) {

        controls.target.copy( car.position );
        controls.update();

    }

    // Sun follows the car so the tight shadow frustum stays useful at any
    // point on the 6km track.
    if ( car && sunLight && sunTarget ) {

        sunTarget.position.copy( car.position );
        sunLight.position.copy( car.position ).add( sunOffset );

        updateTrackShadowReceive();

    }

    if ( posLabel && chassis ) {

        const t = chassis.translation();
        posLabel.textContent = `pos: ${ t.x.toFixed( 1 ) }, ${ t.y.toFixed( 1 ) }, ${ t.z.toFixed( 1 ) }    (P to copy)`;

    }

    if ( physicsHelper && physicsHelper.visible ) physicsHelper.update();

    renderer.render( scene, camera );
    renderMinimap();

    stats.update();

}
