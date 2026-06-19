import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RapierPhysics } from './lib/RapierPhysics.js';
import { RapierHelper } from 'three/addons/helpers/RapierHelper.js';
import Stats from 'three/addons/libs/stats.module.js';
import { openRoom, generateRoomCode } from './lib/net.js';

let camera, scene, renderer, stats;
let physics, physicsHelper, controls;
let car, chassis, wheels, vehicleController;
let clock;
let fpsLabel, posLabel;
let lapTimer;
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

// ---------------- steering wheel + cockpit (driver POV) ----------------

function buildSteeringWheel( car ) {

    const group = new THREE.Group();

    let rimColor = 0x111111, hubColor = 0x222222, spokeColor = 0x111111;
    let rimMetal = 0.4, rimRough = 0.6;
    let hubMetal = 0.4, hubRough = 0.6;
    let hubEmissive = 0x000000, hubEmissiveIntensity = 0;
    let spokeMetal = 0.4, spokeRough = 0.6;
    let flatBottom = false;
    let paddles = false;

    switch ( car.name ) {

        case 'Hatchback':      rimColor = 0x111111; hubColor = 0xFFD400; spokeColor = 0xFFD400; break;
        case 'Muscle V8':      rimColor = 0x111111; hubColor = 0xCC1A1A; spokeColor = 0x111111; break;
        case 'Sport Flat-six': rimColor = 0x111111; hubColor = 0x1A1A1A; spokeColor = 0xC0C0C0; spokeMetal = 0.8; spokeRough = 0.3; break;
        case 'Rally Turbo':    rimColor = 0x1F4DFF; hubColor = 0x111111; spokeColor = 0x111111; rimRough = 0.95; rimMetal = 0.05; break;
        case 'Supercar V12':   rimColor = 0x0A0A0A; hubColor = 0x1A1A1A; spokeColor = 0xFF6F1A; rimRough = 0.9; rimMetal = 0.05; break;
        case 'F1':             rimColor = 0x080808; hubColor = 0xCC1A1A; spokeColor = 0x111111; rimRough = 0.4; rimMetal = 0.3; flatBottom = true; paddles = true; break;
        case 'God Car':        rimColor = 0xEEEEEE; hubColor = 0x00FFFF; spokeColor = 0xEEEEEE; rimMetal = 0.9; rimRough = 0.15; spokeMetal = 0.9; spokeRough = 0.15; hubEmissive = 0x00FFFF; hubEmissiveIntensity = 1.0; break;

    }

    const rimMat = new THREE.MeshStandardMaterial( { color: rimColor, metalness: rimMetal, roughness: rimRough } );
    const hubMat = new THREE.MeshStandardMaterial( { color: hubColor, metalness: hubMetal, roughness: hubRough, emissive: hubEmissive, emissiveIntensity: hubEmissiveIntensity } );
    const spokeMat = new THREE.MeshStandardMaterial( { color: spokeColor, metalness: spokeMetal, roughness: spokeRough } );

    const rimR = 0.18, rimTube = 0.025;
    let rimGeo;
    if ( flatBottom ) {

        const gap = Math.PI / 3;
        rimGeo = new THREE.TorusGeometry( rimR, rimTube, 8, 32, Math.PI * 2 - gap );
        rimGeo.rotateZ( - Math.PI / 2 + gap / 2 );

    } else {

        rimGeo = new THREE.TorusGeometry( rimR, rimTube, 8, 32 );

    }
    const rim = new THREE.Mesh( rimGeo, rimMat );
    rim.castShadow = false;
    group.add( rim );

    const hub = new THREE.Mesh( new THREE.CylinderGeometry( 0.05, 0.05, 0.05, 16 ), hubMat );
    hub.rotation.x = Math.PI / 2;
    hub.castShadow = false;
    group.add( hub );

    const spokeInner = 0.04, spokeOuter = rimR;
    const spokeLen = spokeOuter - spokeInner;
    const spokeGeo = new THREE.BoxGeometry( spokeLen, 0.02, 0.015 );
    const baseAngles = [ Math.PI / 2, Math.PI / 2 + ( 2 * Math.PI ) / 3, Math.PI / 2 + ( 4 * Math.PI ) / 3 ];
    for ( const a of baseAngles ) {

        const spoke = new THREE.Mesh( spokeGeo, spokeMat );
        const midR = ( spokeInner + spokeOuter ) / 2;
        spoke.position.set( Math.cos( a ) * midR, Math.sin( a ) * midR, 0 );
        spoke.rotation.z = a;
        spoke.castShadow = false;
        group.add( spoke );

    }

    if ( paddles ) {

        const paddleMat = new THREE.MeshStandardMaterial( { color: 0xCC1A1A, metalness: 0.3, roughness: 0.5 } );
        const paddleGeo = new THREE.BoxGeometry( 0.06, 0.04, 0.01 );
        const pL = new THREE.Mesh( paddleGeo, paddleMat );
        pL.position.set( - 0.15, - 0.2, - 0.02 );
        pL.castShadow = false;
        group.add( pL );
        const pR = new THREE.Mesh( paddleGeo, paddleMat );
        pR.position.set( 0.15, - 0.2, - 0.02 );
        pR.castShadow = false;
        group.add( pR );

    }

    return group;

}

function _disposeSteeringWheel() {

    if ( ! steeringWheelGroup || ! car ) return;
    car.remove( steeringWheelGroup );
    steeringWheelGroup.traverse( ( o ) => {

        if ( o.geometry ) o.geometry.dispose();
        if ( o.material ) o.material.dispose();

    } );
    steeringWheelGroup = null;
    steeringWheelMesh = null;

}

function buildAndMountSteeringWheel( carConfig ) {

    if ( ! car ) return;
    _disposeSteeringWheel();
    const cockpit = COCKPITS[ carConfig.name ];
    if ( ! cockpit ) return;

    steeringWheelGroup = new THREE.Group();
    steeringWheelGroup.position.set( cockpit.steeringWheelOffset.x, cockpit.steeringWheelOffset.y, cockpit.steeringWheelOffset.z );
    steeringWheelGroup.rotation.x = cockpit.steeringWheelTilt;
    car.add( steeringWheelGroup );

    steeringWheelMesh = buildSteeringWheel( carConfig );
    steeringWheelGroup.add( steeringWheelMesh );

}

const _povWorldPos = new THREE.Vector3();
const _povWorldLook = new THREE.Vector3();

function updatePovCamera() {

    if ( ! car ) return;
    const cockpit = COCKPITS[ currentCar.name ];
    if ( ! cockpit ) return;

    _povWorldPos.set( cockpit.cockpitOffset.x, cockpit.cockpitOffset.y, cockpit.cockpitOffset.z );
    car.localToWorld( _povWorldPos );
    camera.position.copy( _povWorldPos );

    _povWorldLook.set( cockpit.cockpitLookOffset.x, cockpit.cockpitLookOffset.y, cockpit.cockpitLookOffset.z );
    car.localToWorld( _povWorldLook );
    camera.lookAt( _povWorldLook );

    if ( Math.abs( camera.fov - cockpit.fov ) > 0.1 ) {

        camera.fov = cockpit.fov;
        camera.updateProjectionMatrix();

    }

}

function setCameraMode( mode ) {

    cameraMode = mode;
    if ( mode === 'pov' ) {

        if ( carVisualsGroup ) carVisualsGroup.visible = false;
        if ( controls ) controls.enabled = false;
        chaseCam.enabled = false;

    } else if ( mode === 'free' ) {

        if ( carVisualsGroup ) carVisualsGroup.visible = true;
        if ( controls ) controls.enabled = true;
        chaseCam.enabled = false;
        camera.fov = chaseCam.baseFov;
        camera.updateProjectionMatrix();

    } else { // chase

        if ( carVisualsGroup ) carVisualsGroup.visible = true;
        if ( controls ) controls.enabled = false;
        chaseCam.enabled = true;
        chaseCam.initialized = false;

    }

}

function cycleCameraMode() {

    const modes = [ 'chase', 'free', 'pov' ];
    const next = ( modes.indexOf( cameraMode ) + 1 ) % modes.length;
    setCameraMode( modes[ next ] );

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
    // if ( chassis ) {

    //     const baselineMass = Math.min( ...CARS.map( c => c.mass ) );
    //     const extra = Math.max( 0, car.mass - baselineMass );
    //     chassis.setAdditionalMass( extra, true );

    // }
    
    // Mass + lowered center of mass. The chassis box is 2×1×4 centered at y=0,
    // but the wheels connect near y=-0.3, so the default CoM sits above the
    // suspension. Dropping the CoM below center kills the wheelie/pitch-up
    // under acceleration.
    if ( chassis ) {

        const totalMass = car.mass;

        // Solid-box inertia (1/12)·m·(a²+b²) per axis. Box = 2(x)×1(y)×4(z).
        const w = 2, h = 1, d = 4;
        const ix = ( 1 / 12 ) * totalMass * ( h * h + d * d );
        const iy = ( 1 / 12 ) * totalMass * ( w * w + d * d );
        const iz = ( 1 / 12 ) * totalMass * ( w * w + h * h );

        chassis.setAdditionalMassProperties(
            totalMass,
            { x: 0, y: - 0.5, z: 0 },          // CoM dropped 0.5m below center
            { x: ix, y: iy, z: iz },
            { x: 0, y: 0, z: 0, w: 1 },
            true
        );

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

    // Cockpit / steering wheel rebuilt per-car (different colour, paddles
    // for F1, flat-bottomed rim, etc.).
    if ( ! skipVisuals ) buildAndMountSteeringWheel( car );

    // Re-bake the per-car toe into the wheel steering channel.
    applySuspensionGeometry();

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

    if ( typeof _isCarLocked === 'function' && _isCarLocked() ) {

        if ( typeof showCarToast === 'function' ) showCarToast( 'car locked for race' );
        return;

    }

    currentCarIndex = ( currentCarIndex + direction + CARS.length ) % CARS.length;
    applyCarConfig( CARS[ currentCarIndex ] );
    showCarToast( CARS[ currentCarIndex ].name );
    resetTires();         // fresh tires on each car
    resetDrivetrain();    // engine starts at the new car's idle, clutch closed
    clearSkidMarks();
    if ( typeof _broadcastLocalMeta === 'function' ) _broadcastLocalMeta();

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

// ---------------- camber + toe (suspension geometry) ----------------
// Rapier's vehicle controller can't tilt wheel axles out of the suspension
// plane, so we approximate camber's effect on lateral grip by modulating
// setWheelSideFrictionStiffness with corner load. Toe is baked into the
// per-wheel steering offset (front wheels get base toe + driver steering on top).

const _DEG = Math.PI / 180;
const CAMBER_GRIP_PER_DEG = 0.06;     // +6 % lat grip per |°| of camber at reference load
const CAMBER_STRAIGHT_COST = 0.30;    // straight-line penalty coefficient

function applySuspensionGeometry() {

    if ( ! vehicleController || ! currentCar ) return;
    const toe = currentCar.toeDeg || [ 0, 0, 0, 0 ];
    for ( let i = 0; i < 4; i ++ ) {

        vehicleController.setWheelSteering( i, toe[ i ] * _DEG );

    }

}

function updateSuspensionGeometry() {

    if ( ! vehicleController || ! currentCar ) return;
    const camber = currentCar.camberDeg || [ 0, 0, 0, 0 ];
    for ( let i = 0; i < 4; i ++ ) {

        const cVal = camber[ i ];
        const cMag = Math.abs( cVal );
        if ( cMag < 0.01 ) {

            vehicleController.setWheelSideFrictionStiffness( i, 1.0 );
            continue;

        }
        const load = vehicleController.wheelIsInContact( i )
            ? Math.max( 0, vehicleController.wheelSuspensionForce( i ) )
            : 0;
        const loadFactor = load / TIRE_LOAD_REF;
        // Negative camber (top-leans-in) is the configured race setup → bonus
        // grip under load. Positive camber would reduce it. Penalty term scales
        // with magnitude either way (any camber away from 0° costs straight-line grip).
        const gain = - cVal * CAMBER_GRIP_PER_DEG * loadFactor;
        const penalty = cMag * CAMBER_STRAIGHT_COST * _DEG;
        const mult = Math.max( 0.5, 1.0 + gain - penalty );
        vehicleController.setWheelSideFrictionStiffness( i, mult );

    }

}

// Wheel index convention is FL=0, FR=1, RL=2, RR=3 (matches the
// "WHEELS · FL · FR · RL · RR" stats panel). Returns the indices that
// receive engine torque for a given driveType.
function drivenWheelIndices( driveType ) {

    if ( driveType === 'RWD' ) return [ 2, 3 ];
    if ( driveType === 'AWD' ) return [ 0, 1, 2, 3 ];
    return [ 0, 1 ]; // FWD default

}

// ---------------- drivetrain v2 (engine flywheel + clutch + LSD) ----------------
// Engine has its own angular velocity with flywheel inertia — no longer slaved
// kinematically to wheel speed. Clutch couples engine and wheels through a stiff
// spring; opens during shifts. LSD biases torque to the slower drive wheel.

const _OMEGA_PER_RPM = 2 * Math.PI / 60;
const _RPM_PER_OMEGA = 60 / ( 2 * Math.PI );

const drivetrain = {
    engineOmega: 900 * _OMEGA_PER_RPM, // start at idle
    lastWheelRotation: [ 0, 0, 0, 0 ],
    wheelOmega: [ 0, 0, 0, 0 ],
    clutchTorque: 0,
    clutchOpen: true,
    // Traction-control telemetry — updated each frame by applyVehicleForces.
    // `cutPct` is the largest fractional torque cut across driven wheels, in
    // [0,1]. `engaged` is sticky for ~120ms so the UI light stays visible.
    tc: { cutPct: 0, engaged: false, engagedUntil: 0, eventCount: 0 }
};

function resetDrivetrain() {

    drivetrain.engineOmega = ( engine.idleRpm || 900 ) * _OMEGA_PER_RPM;
    drivetrain.clutchTorque = 0;
    drivetrain.clutchOpen = true;
    for ( let i = 0; i < 4; i ++ ) {

        // Seed lastWheelRotation from the live wheel so the first-frame
        // finite-difference doesn't generate a fake huge ω.
        drivetrain.lastWheelRotation[ i ] = vehicleController ? ( vehicleController.wheelRotation( i ) || 0 ) : 0;
        drivetrain.wheelOmega[ i ] = 0;

    }

}

function _idleGovernor( omegaRpm ) {

    const target = engine.idleRpm + 200;
    if ( omegaRpm >= target ) return 0;
    return ( target - omegaRpm ) / target;

}

function updateDrivetrain( dt, throttle, ratio, brake ) {

    if ( ! vehicleController ) return;

    // 1) wheel ω from wheelRotation finite-difference, light low-pass.
    for ( let i = 0; i < 4; i ++ ) {

        const theta = vehicleController.wheelRotation( i ) || 0;
        let dTheta = theta - drivetrain.lastWheelRotation[ i ];
        if ( dTheta > Math.PI ) dTheta -= 2 * Math.PI;
        if ( dTheta < - Math.PI ) dTheta += 2 * Math.PI;
        drivetrain.lastWheelRotation[ i ] = theta;
        const raw = dTheta / Math.max( dt, 1e-4 );
        drivetrain.wheelOmega[ i ] = drivetrain.wheelOmega[ i ] * 0.6 + raw * 0.4;

    }

    // 2) Engine torque has TWO components:
    //    - playerTorque: what the driver actually asked for (throttle). This is
    //      what's available to transmit through the clutch to the wheels.
    //    - idleTorque: internal anti-stall, ONLY spins the flywheel — never
    //      reaches the wheels. Real engines maintain idle via spark + fuel that
    //      doesn't get passed to the gearbox.
    const rpm = drivetrain.engineOmega * _RPM_PER_OMEGA;
    const torqueBell = torqueAt( rpm );
    const playerTorque = Math.max( 0, throttle ) * torqueBell * currentCar.maxEngineForce;
    const idleTorque = _idleGovernor( rpm ) * torqueBell * currentCar.maxEngineForce;

    // 3) Internal friction. Brake adds a small engine-braking bleed.
    const frictionCoef = 0.00018 + 0.00045 * brake;
    const engineFriction = frictionCoef * drivetrain.engineOmega * currentCar.maxEngineForce;

    // 4) Clutch. Open during shifts (`shiftCooldown > 0`) and in neutral.
    //    Saturation is bounded by the PLAYER-requested torque plus a tiny creep
    //    allowance (so automatics inch forward at a stop, brake disables creep).
    const clutchOpen = transmission.shiftCooldown > 0 || ratio === 0;
    drivetrain.clutchOpen = clutchOpen;
    let clutchTorque = 0;
    if ( ! clutchOpen ) {

        const gearMult = Math.abs( ratio ) * currentCar.finalDrive;
        const wheelOmegaAvg = 0.5 * ( drivetrain.wheelOmega[ 0 ] + drivetrain.wheelOmega[ 1 ] );
        const wheelEquivAtClutch = wheelOmegaAvg * gearMult * Math.sign( ratio );
        const slip = drivetrain.engineOmega - wheelEquivAtClutch;
        // Clutch saturation is sized like a real clutch — fixed friction limit,
        // NOT scaled with current throttle. Real clutches transmit up to about
        // 1.5× engine peak torque; the engine finds equilibrium via slip.
        // We DO gate the FORWARD-drive direction by throttle (so off-throttle
        // doesn't push the car forward), but keep the REVERSE direction at
        // ~half peak so engine-braking still works when coasting off throttle.
        const maxFwd = ( throttle > 0.05 )
            ? currentCar.maxEngineForce * 1.5
            : ( brake > 0.05 ? 0 : currentCar.maxEngineForce * 0.03 );
        const maxRev = currentCar.maxEngineForce * 0.5;
        let raw = slip * currentCar.clutchStiffness * 0.05;
        if ( raw > maxFwd ) raw = maxFwd;
        if ( raw < - maxRev ) raw = - maxRev;
        clutchTorque = raw;

    }
    drivetrain.clutchTorque = clutchTorque;

    // 5) Integrate flywheel: dω = (T_player + T_idle − T_friction − T_clutch) / I.
    //    Both engine torque components add to the flywheel; only T_clutch leaves
    //    via the gearbox.
    const netTorque = playerTorque + idleTorque - engineFriction - clutchTorque;
    drivetrain.engineOmega += ( netTorque / currentCar.engineInertia ) * dt;

    const stallOmega = engine.idleRpm * 0.8 * _OMEGA_PER_RPM;
    const redlineOmega = engine.redline * 1.02 * _OMEGA_PER_RPM;
    if ( drivetrain.engineOmega < stallOmega ) drivetrain.engineOmega = stallOmega;
    if ( drivetrain.engineOmega > redlineOmega ) drivetrain.engineOmega = redlineOmega;

    // Publish to existing engine.rpm so HUD / audio remain unchanged.
    engine.rpm = drivetrain.engineOmega * _RPM_PER_OMEGA;

    // 6) Split clutch torque across drive wheels (front-wheel-drive only here).
    //    LSD bias: factor=0 → open diff (equal split), factor=1 → fully locked
    //    (all torque to slower wheel).
    //
    //    NOTE: we do NOT gear-amplify clutchTorque here. The torqueAt(rpm) curve
    //    and per-car maxEngineForce together produce values calibrated for the
    //    wheel-side (matching the original simple model). Multiplying by
    //    gearMult would 10×+ amplify creep at idle into a real launch.
    let wheelTorque0 = 0, wheelTorque1 = 0;
    if ( ! clutchOpen ) {

        const totalAtWheels = clutchTorque * Math.sign( ratio );
        const w0 = Math.abs( drivetrain.wheelOmega[ 0 ] );
        const w1 = Math.abs( drivetrain.wheelOmega[ 1 ] );
        const fast = Math.max( w0, w1, 0.1 );
        const slow = Math.min( w0, w1 );
        const lockingExp = Math.max( 0.05, 4 * ( 1 - currentCar.lsdLocking ) );
        const bias = Math.pow( slow / fast, lockingExp );
        const slowShare = 0.5 + 0.5 * ( 1 - bias );
        const fastShare = 1 - slowShare;
        if ( w0 <= w1 ) {

            wheelTorque0 = totalAtWheels * slowShare;
            wheelTorque1 = totalAtWheels * fastShare;

        } else {

            wheelTorque0 = totalAtWheels * fastShare;
            wheelTorque1 = totalAtWheels * slowShare;

        }

    }

    // Rapier convention: NEGATIVE engine force = forward motion.
    vehicleController.setWheelEngineForce( 0, - wheelTorque0 );
    vehicleController.setWheelEngineForce( 1, - wheelTorque1 );

}

// ---------------- aerodynamics ----------------
// F_drag    = Cd × v²  applied opposite to velocity
// F_downforce = Cl × v²  applied in -Y world
// Per-car Cd / Cl already baked into each CARS entry by the planning subagent
// so engine force ≈ Cd × topSpeed² balances at the target top speed.

const _aeroVel = new THREE.Vector3();
const _aeroImpulse = { x: 0, y: 0, z: 0 };

function updateAerodynamics( dt ) {

    if ( ! chassis || ! currentCar ) return;
    const v = chassis.linvel();
    const speed2 = v.x * v.x + v.y * v.y + v.z * v.z;
    if ( speed2 < 25 ) return; // < 5 m/s, skip — no meaningful aero at low speed

    const Cd = currentCar.Cd || 0;
    const Cl = currentCar.Cl || 0;
    if ( Cd <= 0 && Cl <= 0 ) return;

    const speed = Math.sqrt( speed2 );
    // Drag impulse opposite velocity. F = Cd × v², impulse = F × dt, then split
    // back across components via the unit vector.
    if ( Cd > 0 ) {

        const dragMag = Cd * speed2;
        const k = ( dragMag * dt ) / speed;
        _aeroImpulse.x = - v.x * k;
        _aeroImpulse.y = - v.y * k;
        _aeroImpulse.z = - v.z * k;
        chassis.applyImpulse( _aeroImpulse, true );

    }

    // Downforce: F = Cl × v² straight down in world. Pure load, no pitch torque.
    if ( Cl > 0 ) {

        _aeroImpulse.x = 0;
        _aeroImpulse.y = - Cl * speed2 * dt;
        _aeroImpulse.z = 0;
        chassis.applyImpulse( _aeroImpulse, true );

    }

}

// ---------------- brake lights + reverse light ----------------

function updateBrakeLights() {

    if ( ! carVisualsGroup ) return;
    const braking = input.brake > 0.05;
    const inReverse = transmission.gear === - 1;
    carVisualsGroup.traverse( ( o ) => {

        if ( ! o.userData.taillight ) return;
        // Brake boosts emissive ~2.3× over the per-car base (so muscle pops
        // harder than the hatchback).
        o.material.emissiveIntensity = o.userData.baseEmissiveIntensity * ( braking ? 2.3 : 1.0 );
        if ( o.userData.reverseLight ) {

            if ( inReverse ) {

                o.material.color.setHex( 0xFFFFFF );
                o.material.emissive.setHex( 0xFFFFFF );

            } else {

                o.material.color.setHex( o.userData.baseColor );
                o.material.emissive.setHex( o.userData.baseEmissiveColor );

            }

        }

    } );

}

// ---------------- skid marks ----------------

const SKID_MAX = 800;
let skidMesh = null;
let skidIndex = 0;
const _skidDummy = new THREE.Object3D();
const _skidQuat = new THREE.Quaternion();
const _skidEuler = new THREE.Euler();
const _skidZeroMatrix = new THREE.Matrix4().makeScale( 0, 0, 0 );

function initSkidMarks() {

    // Single InstancedMesh = 1 draw call for up to 800 marks. PlaneGeometry
    // rotated to lie flat in XZ so its normal is +Y (faces up).
    const geom = new THREE.PlaneGeometry( 0.4, 0.55 );
    geom.rotateX( - Math.PI / 2 );
    const mat = new THREE.MeshBasicMaterial( {
        color: 0x111111, transparent: true, opacity: 0.6,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: - 2
    } );
    skidMesh = new THREE.InstancedMesh( geom, mat, SKID_MAX );
    skidMesh.frustumCulled = false;
    skidMesh.castShadow = false;
    skidMesh.receiveShadow = false;
    for ( let i = 0; i < SKID_MAX; i ++ ) skidMesh.setMatrixAt( i, _skidZeroMatrix );
    skidMesh.instanceMatrix.needsUpdate = true;
    scene.add( skidMesh );

}

function placeSkidMark( cp, headingY ) {

    _skidDummy.position.set( cp.x, cp.y + 0.025, cp.z );
    _skidDummy.rotation.set( 0, headingY, 0 );
    _skidDummy.updateMatrix();
    skidMesh.setMatrixAt( skidIndex, _skidDummy.matrix );
    skidIndex = ( skidIndex + 1 ) % SKID_MAX;

}

function updateSkidMarks() {

    if ( ! vehicleController || ! skidMesh || ! chassis ) return;
    const speed = Math.abs( vehicleController.currentVehicleSpeed() );
    if ( speed < 2 ) return; // no marks when crawling / parked

    const r = chassis.rotation();
    _skidQuat.set( r.x, r.y, r.z, r.w );
    _skidEuler.setFromQuaternion( _skidQuat, 'YXZ' );

    const handbraking = input.handbrake > 0.1;
    let dirty = false;

    // Rear wheels = indices 2 and 3. Hard lateral slip OR locked handbrake
    // both leave marks. Lateral slip threshold 3.0 is tuned to "started
    // drifting".
    for ( const wi of [ 2, 3 ] ) {

        if ( ! vehicleController.wheelIsInContact( wi ) ) continue;
        const side = Math.abs( vehicleController.wheelSideImpulse( wi ) );
        if ( side < 3.0 && ! handbraking ) continue;
        const cp = vehicleController.wheelContactPoint( wi );
        placeSkidMark( cp, _skidEuler.y );
        dirty = true;

    }

    if ( dirty ) skidMesh.instanceMatrix.needsUpdate = true;

}

function clearSkidMarks() {

    if ( ! skidMesh ) return;
    for ( let i = 0; i < SKID_MAX; i ++ ) skidMesh.setMatrixAt( i, _skidZeroMatrix );
    skidMesh.instanceMatrix.needsUpdate = true;
    skidIndex = 0;

}

// ---------------- tire model (heat + wear) ----------------

const tires = {
    // Surface temp is what the grip curve reads. Carcass is the slow reservoir.
    // Pressure rises with carcass temp. Wear is monotonic-decreasing.
    // `heat` is kept as an alias for surface so the existing tile widget keeps working.
    heat:        [ 25, 25, 25, 25 ],
    carcass:     [ 25, 25, 25, 25 ],
    pressure:    [ 200, 200, 200, 200 ], // kPa cold baseline (matches TIRE_P_COLD declared below)
    wear:        [ 1.0, 1.0, 1.0, 1.0 ],
    slipRatio:   [ 0, 0, 0, 0 ],         // longitudinal slip (live telemetry)
    slipAngle:   [ 0, 0, 0, 0 ],         // lateral slip in rad (live telemetry)
    gripMult:    [ 1, 1, 1, 1 ],         // last Pacejka multiplier (telemetry)
    prevWheelRot:[ 0, 0, 0, 0 ]          // for finite-difference angular velocity
};

// Two-layer tyre thermal model + tyre pressure (Gay-Lussac) + Pacejka-flavoured
// slip-grip curve. Surface temp drives grip + cools fast; carcass temp is the
// bulk reservoir + slowly couples to surface via conduction. Pressure rises with
// carcass temp and modulates contact-patch grip via a Gaussian around the cold-
// optimum.
const TIRE_AMBIENT       = 25;
const TIRE_OPTIMAL_HEAT  = 90;     // surface temp peak (slightly raised from 80 — modern compounds)
const TIRE_HEAT_SIGMA_SQ = 900;
const TIRE_ROLL_GAIN     = 0.020;  // °C/s into carcass per (load_kN × m/s)
const TIRE_SLIP_GAIN     = 0.85;   // °C/s into SURFACE per slip-unit
const TIRE_FWD_SLIP_FAC  = 0.5;
const TIRE_SURF_CARC_K   = 0.35;   // surface↔carcass conduction (per second)
const TIRE_SURF_COOL_K   = 0.045;  // surface→air convection
const TIRE_CARC_COOL_K   = 0.008;  // carcass→air (insulated, slow)
const TIRE_COOL_VSCALE   = 28;     // m/s where forced cooling doubles
const TIRE_AIR_COOL_K    = 0.05;   // airborne cooling
const TIRE_LOAD_REF      = 1000;   // N
const TIRE_HEAT_MIN      = 15;
const TIRE_HEAT_MAX      = 160;
const TIRE_WEAR_RATE     = 0.0015;

// Pressure model
const TIRE_P_COLD        = 200;    // kPa baseline
const TIRE_P_COLD_T      = 25;     // °C
const TIRE_P_OPTIMAL     = 230;    // kPa for peak grip
const TIRE_P_SIGMA_SQ    = 800;
const TIRE_P_GAIN        = 0.78;   // kPa per °C above cold
const TIRE_P_GRIP_WEIGHT = 0.25;   // how much pressure deviation eats grip

// Slip / Pacejka — we compute slipRatio (longitudinal) and slipAngle (lateral)
// per wheel from chassis velocity + wheel angular velocity, then run them
// through a smooth peak-and-drop curve. Below peak: full grip. Past peak:
// grip drops linearly to a floor — so the player CAN lose grip by over-driving
// (sim feel) but a stationary car never goes below baseline (no slide-on-the-spot).
const PAC_PEAK_SLIP      = 0.14;   // ~14 % slip ratio = grip peak (typical road tyre)
const PAC_PEAK_ANGLE     = 0.12;   // ~7° slip angle = lateral peak
const PAC_FALLOFF        = 1.3;    // how steeply grip drops past the peak
const PAC_GRIP_FLOOR     = 0.55;   // never less than this even at full slide
const PAC_SLIP_RATIO_CAP = 2.0;    // saturation for snowy/locked wheels

// Inverse-quaternion world→chassis-local vector (so we can decompose chassis
// linear velocity into forward / lateral components).
function _worldToLocalVec( v, q, out ) {

    const x = v.x, y = v.y, z = v.z;
    const qx = - q.x, qy = - q.y, qz = - q.z, qw = q.w;
    const ix =  qw * x + qy * z - qz * y;
    const iy =  qw * y + qz * x - qx * z;
    const iz =  qw * z + qx * y - qy * x;
    const iw = - qx * x - qy * y - qz * z;
    out.x = ix * qw + iw * - qx + iy * - qz - iz * - qy;
    out.y = iy * qw + iw * - qy + iz * - qx - ix * - qz;
    out.z = iz * qw + iw * - qz + ix * - qy - iy * - qx;
    return out;

}
const _carLocalVel = { x: 0, y: 0, z: 0 };

function updateTires( dt ) {

    if ( ! vehicleController || ! chassis ) return;

    const vSpeed = Math.abs( vehicleController.currentVehicleSpeed() );
    const linvel = chassis.linvel();
    const r = chassis.rotation();
    _worldToLocalVec( linvel, r, _carLocalVel );
    // In chassis-local: +Z = back, -Z = forward. Our convention uses -Z forward,
    // so vLong = -localV.z gives signed forward speed (positive when moving
    // forward).
    const vLong = - _carLocalVel.z;
    const vLat  = _carLocalVel.x;
    const driven = drivenWheelIndices( currentCar.driveType );

    for ( let i = 0; i < 4; i ++ ) {

        let Tsurf = tires.heat[ i ];
        let Tcarc = tires.carcass[ i ];
        const airV = vSpeed;
        const conv = 1 + airV / TIRE_COOL_VSCALE;

        if ( ! vehicleController.wheelIsInContact( i ) ) {

            // Airborne — fast cooling of surface toward ambient. Carcass cools
            // more slowly but also forced by airflow.
            Tsurf += - TIRE_AIR_COOL_K * conv * ( Tsurf - TIRE_AMBIENT ) * dt;
            Tcarc += - TIRE_CARC_COOL_K * conv * ( Tcarc - TIRE_AMBIENT ) * dt;
            tires.heat[ i ] = Math.max( TIRE_HEAT_MIN, Math.min( TIRE_HEAT_MAX, Tsurf ) );
            tires.carcass[ i ] = Math.max( TIRE_HEAT_MIN, Math.min( TIRE_HEAT_MAX, Tcarc ) );
            tires.slipRatio[ i ] = 0;
            tires.slipAngle[ i ] = 0;
            tires.gripMult[ i ] = 1;
            continue;

        }

        const load = Math.max( 0, vehicleController.wheelSuspensionForce( i ) ) / TIRE_LOAD_REF;
        const sideI = Math.abs( vehicleController.wheelSideImpulse( i ) );
        const fwdI  = Math.abs( vehicleController.wheelForwardImpulse( i ) );

        // Slip ratio (longitudinal): difference between wheel-rim speed and
        // contact-patch ground speed, normalised.
        //
        // IMPORTANT: we do NOT use `wheelRotation` here. Rapier's wheelRotation
        // is the integral of its internal solver-decided angular velocity, which
        // depends on the very friction value we feed back via setWheelFrictionSlip.
        // That creates a feedback loop: low friction → Rapier holds ω low → we
        // see vWheel ≈ 0 → kappa = -1 → pacFactor → 0.55 → friction lower next
        // frame. Symptom: cruising cars showed slip ratio of -1 on all wheels.
        //
        // Instead derive vWheel kinematically from the drivetrain:
        //   driven wheel: ω = engineOmega / gearMult
        //   non-driven  : ω = vLong / WHEEL_RADIUS (free-rolling)
        // Driven set depends on the per-car driveType (FWD/RWD/AWD).
        const isDriven = driven.indexOf( i ) >= 0;
        const ratio = gearRatio( transmission.gear );
        const engineOmegaRad = engine.rpm * Math.PI / 30; // RPM → rad/s
        let vWheel;
        if ( isDriven && ratio !== 0 && transmission.shiftCooldown <= 0 ) {

            const gearMult = Math.abs( ratio ) * currentCar.finalDrive;
            const idealOmega = engineOmegaRad / gearMult * Math.sign( ratio );
            vWheel = idealOmega * WHEEL_RADIUS;

        } else {

            vWheel = vLong; // free-rolling matches ground

        }
        const denom = Math.max( Math.abs( vLong ), 0.5 );
        let kappa = ( vWheel - vLong ) / denom;
        if ( kappa > PAC_SLIP_RATIO_CAP ) kappa = PAC_SLIP_RATIO_CAP;
        if ( kappa < - PAC_SLIP_RATIO_CAP ) kappa = - PAC_SLIP_RATIO_CAP;

        // Slip angle (lateral): atan2(vLat, |vLong|). Only meaningful above
        // very low speeds — at standstill it's noise.
        let alpha = 0;
        if ( vSpeed > 0.5 ) alpha = Math.atan2( vLat, Math.abs( vLong ) + 0.5 );
        if ( alpha > Math.PI / 2 ) alpha = Math.PI / 2;
        if ( alpha < - Math.PI / 2 ) alpha = - Math.PI / 2;

        tires.slipRatio[ i ] = kappa;
        tires.slipAngle[ i ] = alpha;

        // Combined slip magnitude. We deliberately use ONLY the lateral
        // (slip-angle) component for the Pacejka falloff. Slip ratio is kept
        // for telemetry but doesn't feed grip back: our model derives engine
        // RPM kinematically from wheel speed, so slip ratio can't physically
        // detect wheel-spin without a real engine flywheel — which we don't
        // have. The lateral term is a genuine physical signal (chassis side-
        // slip relative to heading), so cornering-limit drift still works.
        const latRatio = Math.abs( alpha ) / PAC_PEAK_ANGLE;
        const slipMag = latRatio;

        // Pacejka-flavoured grip multiplier: full grip below peak, drops past
        // it, floored so we never lose all grip and slide off the road parked.
        let pacFactor;
        if ( slipMag < 1.0 ) {

            pacFactor = 1.0;

        } else {

            pacFactor = Math.max( PAC_GRIP_FLOOR, 1.0 - ( slipMag - 1.0 ) * PAC_FALLOFF );

        }

        // Thermal: surface heats from slip-impulse (already a proxy for slip
        // power); carcass heats from rolling deformation. They couple by
        // conduction, both cool to ambient.
        const slip = sideI + TIRE_FWD_SLIP_FAC * fwdI;
        const qSurfIn = TIRE_SLIP_GAIN * slip;
        const qRollIn = TIRE_ROLL_GAIN * load * vSpeed;
        const cond = TIRE_SURF_CARC_K * ( Tsurf - Tcarc );
        const qSurfOut = TIRE_SURF_COOL_K * conv * ( Tsurf - TIRE_AMBIENT );
        const qCarcOut = TIRE_CARC_COOL_K * conv * ( Tcarc - TIRE_AMBIENT );
        Tsurf += ( qSurfIn - cond - qSurfOut ) * dt;
        Tcarc += ( qRollIn + cond - qCarcOut ) * dt;
        if ( Tsurf < TIRE_HEAT_MIN ) Tsurf = TIRE_HEAT_MIN;
        if ( Tsurf > TIRE_HEAT_MAX ) Tsurf = TIRE_HEAT_MAX;
        if ( Tcarc < TIRE_HEAT_MIN ) Tcarc = TIRE_HEAT_MIN;
        if ( Tcarc > TIRE_HEAT_MAX ) Tcarc = TIRE_HEAT_MAX;
        tires.heat[ i ] = Tsurf;
        tires.carcass[ i ] = Tcarc;

        // Pressure: Gay-Lussac on carcass temp. Hotter = more pressure.
        tires.pressure[ i ] = TIRE_P_COLD + TIRE_P_GAIN * ( Tcarc - TIRE_P_COLD_T );

        // Wear: slip-only, never recovers, accelerated past 110°C surface.
        const wearRate = slip * TIRE_WEAR_RATE
            + 0.0008 * Math.max( 0, Tsurf - 110 );
        tires.wear[ i ] = Math.max( 0.2, tires.wear[ i ] - wearRate * dt );

        // Final grip = base × Pacejka × surfaceTemp × pressure × wear
        const heatDelta = Tsurf - TIRE_OPTIMAL_HEAT;
        const heatFactor = Math.exp( - heatDelta * heatDelta / TIRE_HEAT_SIGMA_SQ );
        const pDelta = tires.pressure[ i ] - TIRE_P_OPTIMAL;
        const pressFactor = ( 1 - TIRE_P_GRIP_WEIGHT ) + TIRE_P_GRIP_WEIGHT * Math.exp( - pDelta * pDelta / TIRE_P_SIGMA_SQ );

        // Cold tyres still have usable mechanical grip — only the *peak* falls
        // off when off-temperature. Floor raised from 0.4 → 0.7 so a fresh
        // spawn doesn't slide off a slope before the player gets to drive.
        const totalMult = pacFactor
            * ( 0.7 + 0.3 * heatFactor )
            * pressFactor
            * ( 0.5 + 0.5 * tires.wear[ i ] );
        tires.gripMult[ i ] = totalMult;

        const grip = currentCar.wheelFrictionSlip * totalMult;
        vehicleController.setWheelFrictionSlip( i, grip );

    }

}

function resetTires() {

    for ( let i = 0; i < 4; i ++ ) {

        tires.heat[ i ] = TIRE_AMBIENT;
        tires.carcass[ i ] = TIRE_AMBIENT;
        tires.pressure[ i ] = TIRE_P_COLD;
        tires.wear[ i ] = 1.0;
        tires.slipRatio[ i ] = 0;
        tires.slipAngle[ i ] = 0;
        tires.gripMult[ i ] = 1;
        // Seed from current wheel rotation so the next-frame finite-difference
        // doesn't manufacture a fake huge omega from a 0-to-N angle jump.
        tires.prevWheelRot[ i ] = vehicleController ? ( vehicleController.wheelRotation( i ) || 0 ) : 0;

    }

}

// ---------------- minimap (bottom-left, top-down birds-eye) ----------------

function initMinimap() {

    // Bottom-left container: semi-transparent dark frame + rounded corners,
    // matches the other overlay styling.
    const wrap = document.createElement( 'div' );
    wrap.style.cssText = [
        'position:absolute', 'bottom:200px', 'left:10px',
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

// ---------------- lap timer ----------------
//
// Single-row pill at bottom-left (above the FPS bar) showing the running lap
// time. Click to drop UP a panel of past laps + average. Past laps persist in
// localStorage, keyed per map (lapTimes_v1_<mapId>).
//
// IMPORTANT: the timer only ARMS on a real user input — keyboard, gamepad, or
// touch — because the chassis can roll on its own under gravity on inclines
// and we don't want a phantom lap starting then. Once armed, it runs
// continuously until completeLap() is called (which records the split and
// restarts), or until the player presses R (which re-arms it from zero).
//
// To finish a lap you need a start/finish line check. That part is map-
// specific so I left it to you — see the END of this file for the hook
// (completeLap is exposed on window so you can also test from devtools).

const LAP_STORAGE_PREFIX = 'lapTimes_v1_';

function _fmtLap( ms ) {

    if ( ! isFinite( ms ) || ms < 0 ) return '—';
    const m = Math.floor( ms / 60000 );
    const s = Math.floor( ( ms % 60000 ) / 1000 );
    const cs = Math.floor( ( ms % 1000 ) / 10 );
    return `${ m }:${ String( s ).padStart( 2, '0' ) }.${ String( cs ).padStart( 2, '0' ) }`;

}

function initLapTimer() {

    lapTimer = {
        armed: false,    // true once a real input has been seen
        running: false,  // ticking
        startTime: 0,    // performance.now() reference
        elapsed: 0,
        laps: [],        // [{ time, ts }] — newest pushed at end
        expanded: false,
        // DOM
        root: null, bar: null, timeEl: null, arrowEl: null,
        panel: null, listEl: null, statsEl: null
    };

    // Anchor + drop-up host. Positioned right above the FPS pill (which is
    // at bottom:10px with ~24px height + a small gap).
    const root = document.createElement( 'div' );
    root.style.cssText = [
        'position:absolute', 'bottom:46px', 'left:10px',
        'z-index:2', 'font:12px Monospace', 'color:#fff',
        'user-select:none'
    ].join( ';' );

    // Collapsed bar — single small timeline: "LAP · 0:00.00 · ▲"
    const bar = document.createElement( 'div' );
    bar.style.cssText = [
        'display:flex', 'align-items:center', 'gap:8px',
        'padding:4px 10px', 'background:rgba(0,0,0,0.55)',
        'border-radius:4px', 'cursor:pointer'
    ].join( ';' );

    const labelEl = document.createElement( 'span' );
    labelEl.textContent = 'LAP';
    labelEl.style.cssText = 'opacity:0.6;letter-spacing:1px';

    const timeEl = document.createElement( 'span' );
    timeEl.textContent = '0:00.00';
    timeEl.style.cssText = 'color:#FFCB47;font-weight:bold;min-width:64px;text-align:left';

    const arrowEl = document.createElement( 'span' );
    arrowEl.textContent = '▲';
    arrowEl.style.cssText = 'margin-left:4px;opacity:0.6;font-size:10px';

    bar.append( labelEl, timeEl, arrowEl );

    // Drop-up panel — grows upward over the minimap area.
    const panel = document.createElement( 'div' );
    panel.style.cssText = [
        'display:none', 'position:absolute',
        'bottom:100%', 'left:0', 'margin-bottom:4px',
        'min-width:200px', 'padding:6px 10px',
        'background:rgba(0,0,0,0.78)',
        'border:1px solid rgba(255,255,255,0.15)',
        'border-radius:4px', 'font-size:11px',
        'max-height:240px', 'overflow-y:auto',
        'box-shadow:0 4px 12px rgba(0,0,0,0.5)'
    ].join( ';' );

    // Header: best / count / avg + clear button.
    const statsEl = document.createElement( 'div' );
    statsEl.style.cssText = [
        'display:flex', 'justify-content:space-between', 'align-items:center',
        'gap:8px', 'margin-bottom:4px', 'padding-bottom:4px',
        'border-bottom:1px solid rgba(255,255,255,0.12)'
    ].join( ';' );

    const clearBtn = document.createElement( 'span' );
    clearBtn.textContent = 'clear';
    clearBtn.style.cssText = 'cursor:pointer;opacity:0.55;font-size:10px;flex-shrink:0';
    clearBtn.addEventListener( 'mouseenter', () => { clearBtn.style.opacity = '1'; } );
    clearBtn.addEventListener( 'mouseleave', () => { clearBtn.style.opacity = '0.55'; } );
    clearBtn.addEventListener( 'click', ( e ) => { e.stopPropagation(); _lapTimerClearAll(); } );

    const listEl = document.createElement( 'div' );

    panel.append( statsEl, listEl );

    bar.addEventListener( 'click', () => _lapTimerToggleExpanded() );

    root.append( panel, bar );
    document.body.appendChild( root );

    lapTimer.root = root;
    lapTimer.bar = bar;
    lapTimer.timeEl = timeEl;
    lapTimer.arrowEl = arrowEl;
    lapTimer.panel = panel;
    lapTimer.listEl = listEl;
    lapTimer.statsEl = statsEl;
    lapTimer.clearBtn = clearBtn;

    _lapTimerLoadForMap();
    _lapTimerRefreshPanel();

    // Expose so you can call from anywhere (or test from devtools).
    window.completeLap = completeLap;
    window.lapTimer = lapTimer;

}

function _lapTimerStorageKey() { return LAP_STORAGE_PREFIX + currentMapId; }

function _lapTimerLoadForMap() {

    try {

        const raw = localStorage.getItem( _lapTimerStorageKey() );
        lapTimer.laps = raw ? JSON.parse( raw ) : [];
        if ( ! Array.isArray( lapTimer.laps ) ) lapTimer.laps = [];

    } catch {

        lapTimer.laps = [];

    }

    // Each map change = fresh, disarmed timer.
    lapTimer.running = false;
    lapTimer.armed = false;
    lapTimer.elapsed = 0;
    lapTimer.startTime = 0;
    _resetLapAccumulators();
    if ( lapTimer.timeEl ) lapTimer.timeEl.textContent = '0:00.00';
    _updateLapFinishForward();

}

function _lapTimerSave() {

    try {

        localStorage.setItem( _lapTimerStorageKey(), JSON.stringify( lapTimer.laps ) );

    } catch {}

}

function _lapTimerClearAll() {

    lapTimer.laps = [];
    _lapTimerSave();
    _lapTimerRefreshPanel();

}

function _lapTimerToggleExpanded() {

    lapTimer.expanded = ! lapTimer.expanded;
    lapTimer.panel.style.display = lapTimer.expanded ? 'block' : 'none';
    lapTimer.arrowEl.textContent = lapTimer.expanded ? '▼' : '▲';

}

function _lapTimerRefreshPanel() {

    const laps = lapTimer.laps;
    const best = laps.length ? Math.min( ...laps.map( l => l.time ) ) : null;
    const avg = laps.length ? laps.reduce( ( s, l ) => s + l.time, 0 ) / laps.length : null;

    // Stats row inside the panel.
    lapTimer.statsEl.innerHTML = '';
    const left = document.createElement( 'span' );
    left.innerHTML =
        `<span style="opacity:0.55">best </span><span style="color:#5DD68F">${ best != null ? _fmtLap( best ) : '—' }</span>` +
        `  <span style="opacity:0.4">·</span>  ` +
        `<span style="opacity:0.55">avg </span>${ avg != null ? _fmtLap( avg ) : '—' }` +
        `  <span style="opacity:0.4">·</span>  ` +
        `<span style="opacity:0.55">${ laps.length } lap${ laps.length === 1 ? '' : 's' }</span>`;
    lapTimer.statsEl.append( left, lapTimer.clearBtn );

    // List — newest first.
    lapTimer.listEl.innerHTML = '';
    if ( laps.length === 0 ) {

        const empty = document.createElement( 'div' );
        empty.textContent = 'no laps yet';
        empty.style.cssText = 'opacity:0.45;font-style:italic;padding:4px 0';
        lapTimer.listEl.appendChild( empty );

    } else {

        for ( let i = laps.length - 1; i >= 0; i -- ) {

            const lap = laps[ i ];
            const row = document.createElement( 'div' );
            row.style.cssText = 'display:flex;justify-content:space-between;padding:2px 0';
            const num = document.createElement( 'span' );
            num.textContent = `#${ i + 1 }`;
            num.style.opacity = '0.45';
            const t = document.createElement( 'span' );
            t.textContent = _fmtLap( lap.time );
            if ( lap.time === best ) t.style.color = '#5DD68F';
            row.append( num, t );
            lapTimer.listEl.appendChild( row );

        }

    }

}

// Finish line = a horizontal plane through spawnPoint, perpendicular to the
// car's spawn-forward heading. We treat each frame as a sign-flip test on
// the signed along-track distance + a lateral tolerance so we only count
// crossings near the actual spawn marker (not the infinite plane extension).
//
// Several gates layered on top so accidental + cheese crossings don't count:
//
//   1. directional (prev < 0 → curr ≥ 0): only forward crossings register.
//      A U-turn-and-drive-back approach has prev > 0 throughout, never fires.
//
//   2. lateral < FINISH_LATERAL_TOL: only crossings near the spawn marker
//      count — the line is a segment, not an infinite plane.
//
//   3. maxForward ≥ FINISH_MIN_MAX_FWD: car has to actually get DOWN the
//      track. A short forward-then-reverse trick fails this.
//
//   4. minForward ≤ FINISH_MIN_MIN_FWD (negative): the car had to come back
//      AROUND from the other side. Loitering near the line / hopping across
//      via reverse never goes far enough negative.
//
//   5. travelled path length ≥ FINISH_MIN_TRAVEL: integral of |Δpos|. Catches
//      drift-near-spawn loops that somehow pass the others.
//
//   6. teleport guard: if a single frame's Δsigned is huge, treat it as a
//      respawn / out-of-bounds snap and skip the crossing test that frame.
//
// No minimum lap time. Cruise at 10 km/h if you want — the position gates
// already make a sub-30s lap physically impossible to drive anyway.
const _lapFinishForward = new THREE.Vector3();
const _lapFinishQuat = new THREE.Quaternion();
const FINISH_LATERAL_TOL = 30;        // m
const FINISH_MIN_MAX_FWD = 500;       // m — must have driven this far past start
const FINISH_MIN_MIN_FWD = - 200;     // m — must have come back from this far behind
const FINISH_MIN_TRAVEL = 1500;       // m — path length
const FINISH_MAX_TELEPORT = 50;       // m per frame — bigger = treat as a snap

function _updateLapFinishForward() {

    _lapFinishQuat.copy( spawnQuaternion );
    _lapFinishForward.set( 0, 0, - 1 ).applyQuaternion( _lapFinishQuat );
    _lapFinishForward.y = 0;
    if ( _lapFinishForward.lengthSq() < 1e-4 ) _lapFinishForward.set( 0, 0, - 1 );
    _lapFinishForward.normalize();

}

function _resetLapAccumulators() {

    if ( ! lapTimer ) return;
    lapTimer.maxSignedDist = 0;
    lapTimer.minSignedDist = 0;
    lapTimer.travelled = 0;
    lapTimer.prevChassisPos = null;
    lapTimer.prevSignedDist = undefined;

}

function _checkFinishLineCross() {

    if ( ! lapTimer || ! lapTimer.running || ! chassis ) return;

    const t = chassis.translation();
    const dx = t.x - spawnPoint.x;
    const dz = t.z - spawnPoint.z;

    const fx = _lapFinishForward.x;
    const fz = _lapFinishForward.z;

    // along-track (signed) and cross-track (unsigned) distances to the line.
    const signed = dx * fx + dz * fz;
    const lateral = Math.abs( dx * ( - fz ) + dz * fx );

    // Per-frame path length — clipped against teleport-size steps so that
    // a fall-and-respawn doesn't inflate the travel budget.
    if ( lapTimer.prevChassisPos ) {

        const sx = t.x - lapTimer.prevChassisPos.x;
        const sy = t.y - lapTimer.prevChassisPos.y;
        const sz = t.z - lapTimer.prevChassisPos.z;
        const step = Math.sqrt( sx * sx + sy * sy + sz * sz );
        if ( step < FINISH_MAX_TELEPORT ) lapTimer.travelled += step;

    } else {

        lapTimer.prevChassisPos = { x: 0, y: 0, z: 0 };

    }

    lapTimer.prevChassisPos.x = t.x;
    lapTimer.prevChassisPos.y = t.y;
    lapTimer.prevChassisPos.z = t.z;

    // Extremes of along-track signed distance over the lap so far.
    if ( signed > lapTimer.maxSignedDist ) lapTimer.maxSignedDist = signed;
    if ( signed < lapTimer.minSignedDist ) lapTimer.minSignedDist = signed;

    const prev = lapTimer.prevSignedDist;

    // Teleport guard: a big jump in signed (R reset, off-map snap) is not a
    // physical crossing. Re-anchor prev and bail this frame.
    if ( prev !== undefined && Math.abs( signed - prev ) > FINISH_MAX_TELEPORT ) {

        lapTimer.prevSignedDist = signed;
        return;

    }

    const isForwardCrossing = prev !== undefined && prev < 0 && signed >= 0;
    const nearLine = lateral < FINISH_LATERAL_TOL;
    const wentFarEnough = lapTimer.maxSignedDist >= FINISH_MIN_MAX_FWD;
    const cameFromBehind = lapTimer.minSignedDist <= FINISH_MIN_MIN_FWD;
    const travelledEnough = lapTimer.travelled >= FINISH_MIN_TRAVEL;

    if ( isForwardCrossing && nearLine &&
         wentFarEnough && cameFromBehind && travelledEnough ) {

        completeLap();

    }

    lapTimer.prevSignedDist = signed;

}

// Returns true if ANY meaningful input has been seen this frame.
// Used to gate the lap timer from starting under pure rolling motion.
function _anyInputActive() {

    if ( input.keyW || input.keyS || input.keyA || input.keyD || input.keyE ||
         input.arrowUp || input.arrowDown || input.arrowLeft || input.arrowRight ||
         input.keySpace ) return true;

    if ( touch.enabled && ( touch.throttle > 0.05 || touch.brake > 0.05 ||
         Math.abs( touch.steer ) > 0.05 || touch.handbrake > 0.05 ) ) return true;

    // Gamepad — any button down or any axis past the deadzone.
    if ( gamepad.index >= 0 ) {

        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const pad = pads[ gamepad.index ];
        if ( pad ) {

            for ( let i = 0; i < pad.buttons.length; i ++ ) {

                if ( pad.buttons[ i ] && pad.buttons[ i ].pressed ) return true;

            }

            for ( let i = 0; i < pad.axes.length; i ++ ) {

                if ( Math.abs( pad.axes[ i ] ) > 0.2 ) return true;

            }

        }

    }

    return false;

}

function updateLapTimer() {

    if ( ! lapTimer ) return;

    // Arm on first real input. The chassis can creep on inclines under
    // gravity alone — we don't want that to start a phantom lap.
    if ( ! lapTimer.armed && _anyInputActive() ) {

        lapTimer.armed = true;
        lapTimer.running = true;
        lapTimer.startTime = performance.now();
        lapTimer.elapsed = 0;
        _resetLapAccumulators();

    }

    if ( lapTimer.running ) {

        lapTimer.elapsed = performance.now() - lapTimer.startTime;
        lapTimer.timeEl.textContent = _fmtLap( lapTimer.elapsed );
        _checkFinishLineCross();

    }

}

// Call this when the player crosses the start/finish line.
// Records the split, persists, refreshes the drop-up, restarts the clock
// from zero for the next lap. No-op if the timer hasn't been armed yet.
function completeLap() {

    if ( ! lapTimer || ! lapTimer.running ) return;
    const ms = performance.now() - lapTimer.startTime;
    if ( ms < 1000 ) return; // guard against double-triggering on the same line
    lapTimer.laps.push( { time: ms, ts: Date.now() } );
    _lapTimerSave();
    _lapTimerRefreshPanel();
    lapTimer.startTime = performance.now();
    lapTimer.elapsed = 0;
    _resetLapAccumulators();
    _onLocalLapCompleteForRace();

}

// Called from the R-reset path so the next lap starts fresh and re-armed.
function lapTimerResetCurrent() {

    if ( ! lapTimer ) return;
    lapTimer.running = false;
    lapTimer.armed = false;
    lapTimer.elapsed = 0;
    lapTimer.startTime = 0;
    _resetLapAccumulators();
    if ( lapTimer.timeEl ) lapTimer.timeEl.textContent = '0:00.00';

}

// ---------------- multiplayer ----------------
//
// Peer-to-peer via Trystero/nostr. No backend; works on GitHub Pages.
// Each peer owns its own physics; we broadcast position/rotation/velocity
// every ~50ms. Remote peers are rendered as translucent ghost cars —
// they pass through your chassis (no shared physics).
//
// UI lives bottom-left, above the lap pill. Two buttons by default:
//   [ make room ]  [ join room ]
// "make room" generates a 5-char code and shows it + waiting count.
// "join room" reveals an inline input. Anyone with the code joins.
//
// Race lifecycle:
//   lobby     — players in the room, no clock running
//   countdown — anyone clicks "start race"; 3-2-1 then everyone races
//   racing    — lap timer + finish-line detection are already armed
//   finished  — first peer to broadcast { type: 'finished' } wins
// Winner is announced via the existing car-toast plumbing.

const SNAP_INTERVAL_MS = 50;        // 20 Hz position broadcasts
const INTERP_DELAY_MS = 100;        // render remote cars 100ms in the past
const SPAWN_SLOT_OFFSET_M = 3;      // metres between adjacent spawn slots
const COUNTDOWN_MS = 3000;          // pre-race countdown
const MAX_BUFFERED_SNAPS = 30;

const multiplayer = {
    room: null,
    isHost: false,
    joinTime: 0,
    playerName: '',
    raceState: 'lobby',    // 'lobby' | 'ready_check' | 'countdown' | 'racing' | 'finished'
    raceStartAt: 0,        // ms (Date.now()) when racing actually begins
    raceWinner: null,      // peerId or 'self'
    raceWinnerName: '',
    remotes: new Map(),    // peerId -> RemoteCar
    metaByPeer: new Map(), // peerId -> { name, carIdx }
    readyMap: new Map(),   // peerId or 'self' -> { ready, carIdx }
    localReady: false,
    lastSnapAt: 0,
    // UI
    rootEl: null,
    primaryRow: null,
    joinForm: null,
    roomPanel: null,
    countdownEl: null
};

function _isCarLocked() {

    if ( ! multiplayer.room ) return false;
    const s = multiplayer.raceState;
    if ( s === 'countdown' || s === 'racing' ) return true;
    if ( s === 'ready_check' && multiplayer.localReady ) return true;
    return false;

}

// Solid cars during race-active states; ghost cars during lobby /
// finished so people can cruise around without bumping each other.
function _isCollidableRaceState() {

    const s = multiplayer.raceState;
    return s === 'ready_check' || s === 'countdown' || s === 'racing';

}

function _applyRaceModeToRemotes() {

    const on = _isCollidableRaceState();
    for ( const rc of multiplayer.remotes.values() ) rc.setCollidable( on );

}

function _localPlayerName() {

    let n = localStorage.getItem( 'playerName' );
    if ( ! n ) {

        n = 'P' + Math.floor( Math.random() * 9000 + 1000 );
        try { localStorage.setItem( 'playerName', n ); } catch {}

    }
    return n;

}

// Room codes are 5 chars of CODE_CHARS — the same charset net.js uses.
// We tolerate any case in the URL but uppercase when used.
const _ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/i;

// Look in the URL for a room code in this order: last path segment, then
// ?room=, then #. Returns the code (upper-cased) or null. This lets a
// share link like https://host/path/AB12X auto-join the room AB12X.
function _parseAutoJoinCode() {

    const segs = location.pathname.split( '/' ).filter( Boolean );
    const last = segs[ segs.length - 1 ];
    if ( last && _ROOM_CODE_RE.test( last ) ) return last.toUpperCase();

    const q = new URLSearchParams( location.search ).get( 'room' );
    if ( q && _ROOM_CODE_RE.test( q ) ) return q.toUpperCase();

    const h = location.hash.replace( /^#/, '' );
    if ( h && _ROOM_CODE_RE.test( h ) ) return h.toUpperCase();

    return null;

}

// Build the share URL for a room code by replacing the last path segment
// of the current location with the code. Examples:
//   /            + AB12X  ->  /AB12X
//   /foo/        + AB12X  ->  /foo/AB12X
//   /foo/AB12X   + 99WWW  ->  /foo/99WWW   (existing code swapped)
function _shareUrl( code ) {

    let base = location.origin + location.pathname;
    // Strip trailing slash, then strip any trailing existing code, then add /code
    base = base.replace( /\/+$/, '' );
    base = base.replace( /\/[A-HJ-NP-Z2-9]{5}$/i, '' );
    return base + '/' + code;

}

// Push the room code into the URL bar so refresh / share / copy works.
// null clears it back to the base path.
function _setUrlForRoom( code ) {

    let path = location.pathname.replace( /\/+$/, '' ).replace( /\/[A-HJ-NP-Z2-9]{5}$/i, '' );
    if ( code ) path += '/' + code;
    if ( path === '' ) path = '/';
    history.replaceState( null, '', path + location.search + location.hash );

}

// Try to auto-join the URL's room code, but only once the chassis and the
// multiplayer UI exist (initMultiplayer runs BEFORE initPhysics). Poll for
// ~2s before giving up.
function _tryAutoJoinFromUrl() {

    const code = _parseAutoJoinCode();
    if ( ! code ) return;

    let tries = 0;
    const attempt = () => {

        tries ++;
        if ( chassis && multiplayer.rootEl && ! multiplayer.room ) {

            _joinRoom( code );
            return;

        }
        if ( tries < 30 && ! multiplayer.room ) setTimeout( attempt, 100 );

    };
    attempt();

}

// Build a recognisable ghost-car visual without dragging in the physics
// pipeline. Box body sized like the chassis collider + 4 cylinder wheels
// + a name sprite floating overhead. Coloured by the remote's chosen car.
class RemoteCar {

    constructor( peerId, meta ) {

        this.peerId = peerId;
        this.carIdx = meta && Number.isInteger( meta.carIdx ) ? meta.carIdx : 0;
        this.name = ( meta && meta.name ) || peerId.slice( 0, 6 );
        this.snaps = [];                  // [{ time, pos, rot, vel }]
        this.group = new THREE.Group();
        this._buildVisual();
        scene.add( this.group );

    }

    _buildVisual() {

        // Use a hashed-per-peer color, NOT the remote's chosen car color.
        // Lets you visually tell friends apart at a glance regardless of
        // which car they actually picked.
        const color = _colorForPeer( this.peerId );

        const bodyMat = new THREE.MeshLambertMaterial( {
            color,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        } );
        const body = new THREE.Mesh( new THREE.BoxGeometry( 2, 1, 4 ), bodyMat );
        body.position.y = 0;
        this.group.add( body );
        this.bodyMat = bodyMat;

        // Subtle "roof" so direction is readable at a glance.
        const roofMat = new THREE.MeshLambertMaterial( {
            color: 0x111111,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        } );
        const roof = new THREE.Mesh( new THREE.BoxGeometry( 1.6, 0.6, 2 ), roofMat );
        roof.position.set( 0, 0.7, - 0.2 );
        this.group.add( roof );
        this.roofMat = roofMat;

        const wheelMat = new THREE.MeshLambertMaterial( {
            color: 0x080808,
            transparent: true,
            opacity: 0.7,
            depthWrite: false
        } );
        this.wheelMat = wheelMat;
        this.wheels = [];
        const wheelDX = 1.0, wheelDY = - 0.5, wheelDZ = 1.4;
        const wheelPositions = [
            [ - wheelDX, wheelDY, - wheelDZ ],
            [   wheelDX, wheelDY, - wheelDZ ],
            [ - wheelDX, wheelDY,   wheelDZ ],
            [   wheelDX, wheelDY,   wheelDZ ]
        ];
        for ( const p of wheelPositions ) {

            const w = new THREE.Mesh(
                new THREE.CylinderGeometry( 0.35, 0.35, 0.35, 16 ),
                wheelMat
            );
            w.rotation.z = Math.PI / 2;
            w.position.set( p[ 0 ], p[ 1 ], p[ 2 ] );
            this.group.add( w );
            this.wheels.push( w );

        }

        this._refreshNameSprite();

        // Hidden until the first snapshot arrives. Without this the group
        // sits at (0,0,0) — below the Nordschleife terrain — and you see
        // nothing until the first interpolated frame lands.
        this.group.visible = false;

        // Kinematic Rapier body shaped like the chassis collider. Disabled
        // by default (ghost cars), turned on when race state goes
        // ready_check / countdown / racing so our chassis can bounce off
        // remote cars. Asymmetric — they don't feel our hits locally
        // because each peer owns its own physics; the bounce is purely
        // visual on each side.
        this._buildPhysics();
        this._collidable = false;

    }

    _buildPhysics() {

        if ( ! physics || ! physics.RAPIER || ! physics.world ) return;
        const RAPIER = physics.RAPIER;
        const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        bodyDesc.setTranslation( 0, - 10000, 0 ); // park far below world until first snap
        this.body = physics.world.createRigidBody( bodyDesc );
        // chassis box is 2 × 1 × 4 (full extents) → half-extents 1 / 0.5 / 2
        const colliderDesc = RAPIER.ColliderDesc.cuboid( 1, 0.5, 2 );
        this.collider = physics.world.createCollider( colliderDesc, this.body );
        this.collider.setEnabled( false );

    }

    setCollidable( on ) {

        on = !! on;
        if ( this._collidable === on ) return;
        this._collidable = on;
        if ( this.collider ) this.collider.setEnabled( on );

        // Visual swap: opaque + writes depth when solid, translucent + no
        // depth write when ghost. The name sprite uses depthTest:false and
        // stays unchanged.
        const opacity = on ? 1.0 : 0.6;
        for ( const o of [ this.bodyMat, this.roofMat, this.wheelMat ] ) {

            if ( ! o ) continue;
            o.transparent = ! on;
            o.opacity = opacity;
            o.depthWrite = on;
            o.needsUpdate = true;

        }

    }

    _refreshNameSprite() {

        const carName = ( CARS[ this.carIdx ] || {} ).name || '';
        const tag = carName ? this.name + ' · ' + carName : this.name;
        if ( this.nameSprite ) {

            this.group.remove( this.nameSprite );
            if ( this.nameSprite.material ) {

                if ( this.nameSprite.material.map ) this.nameSprite.material.map.dispose();
                this.nameSprite.material.dispose();

            }

        }
        this.nameSprite = _makeNameSprite( tag );
        this.nameSprite.position.set( 0, 2.4, 0 );
        this.group.add( this.nameSprite );

    }

    setMeta( meta ) {

        if ( ! meta ) return;
        // Track carIdx for the ready-list UI but do NOT update the body
        // color — peer color is fixed per session by _colorForPeer.
        const prevCarIdx = this.carIdx;
        const carChanged = Number.isInteger( meta.carIdx ) && meta.carIdx !== prevCarIdx;
        if ( Number.isInteger( meta.carIdx ) ) this.carIdx = meta.carIdx;
        const nameChanged = meta.name && meta.name !== this.name;
        if ( nameChanged ) this.name = meta.name;

        if ( nameChanged || carChanged ) this._refreshNameSprite();

        // Live toast when a peer swaps cars mid-session — skip the very
        // first meta (no prior car to compare against). Reuses the car-
        // cycle toast so it looks consistent with your own swaps.
        if ( carChanged && Number.isInteger( prevCarIdx ) && CARS[ this.carIdx ] ) {

            if ( typeof showCarToast === 'function' ) {

                showCarToast( this.name + ' → ' + CARS[ this.carIdx ].name );

            }

        }

    }

    pushSnap( snap ) {

        const entry = {
            time: performance.now(),
            pos: snap.pos,
            rot: snap.rot,
            vel: snap.vel || [ 0, 0, 0 ]
        };
        this.snaps.push( entry );
        if ( this.snaps.length > MAX_BUFFERED_SNAPS ) this.snaps.shift();
        // First snap = peer is now visually placeable on the track.
        if ( ! this.group.visible ) {

            this._apply( entry );
            this.group.visible = true;

        }

    }

    // Snapshot interpolation: pick the two snaps straddling renderTime and
    // lerp/slerp between them. If renderTime is past the latest snap we
    // hold position (no extrapolation — feels better during lag spikes).
    update( renderTime, dt ) {

        const n = this.snaps.length;
        if ( n === 0 ) return;
        if ( n === 1 ) {

            this._apply( this.snaps[ 0 ], 1 );
            return;

        }

        let s0 = this.snaps[ 0 ];
        let s1 = this.snaps[ n - 1 ];
        for ( let i = 0; i < n - 1; i ++ ) {

            if ( this.snaps[ i ].time <= renderTime && this.snaps[ i + 1 ].time >= renderTime ) {

                s0 = this.snaps[ i ];
                s1 = this.snaps[ i + 1 ];
                break;

            }

        }

        const span = s1.time - s0.time;
        const t = span > 0 ? Math.max( 0, Math.min( 1, ( renderTime - s0.time ) / span ) ) : 0;

        this.group.position.set(
            s0.pos[ 0 ] + ( s1.pos[ 0 ] - s0.pos[ 0 ] ) * t,
            s0.pos[ 1 ] + ( s1.pos[ 1 ] - s0.pos[ 1 ] ) * t,
            s0.pos[ 2 ] + ( s1.pos[ 2 ] - s0.pos[ 2 ] ) * t
        );

        _qA.set( s0.rot[ 0 ], s0.rot[ 1 ], s0.rot[ 2 ], s0.rot[ 3 ] );
        _qB.set( s1.rot[ 0 ], s1.rot[ 1 ], s1.rot[ 2 ], s1.rot[ 3 ] );
        _qA.slerp( _qB, t );
        this.group.quaternion.copy( _qA );

        // Spin wheels from velocity so they don't look frozen.
        const v = s1.vel;
        const speed = Math.sqrt( v[ 0 ] * v[ 0 ] + v[ 2 ] * v[ 2 ] );
        const angularDelta = ( speed / 0.35 ) * dt;
        for ( const w of this.wheels ) w.rotation.x -= angularDelta;

        // When solid, drive the kinematic body to the rendered pose so the
        // local chassis can collide with it.
        if ( this.body && this._collidable && this.group.visible ) {

            const p = this.group.position;
            const q = this.group.quaternion;
            this.body.setNextKinematicTranslation( { x: p.x, y: p.y, z: p.z } );
            this.body.setNextKinematicRotation( { x: q.x, y: q.y, z: q.z, w: q.w } );

        }

    }

    _apply( snap ) {

        this.group.position.set( snap.pos[ 0 ], snap.pos[ 1 ], snap.pos[ 2 ] );
        this.group.quaternion.set( snap.rot[ 0 ], snap.rot[ 1 ], snap.rot[ 2 ], snap.rot[ 3 ] );

    }

    destroy() {

        scene.remove( this.group );
        this.group.traverse( ( o ) => {

            if ( o.geometry ) o.geometry.dispose();
            if ( o.material ) {

                if ( o.material.map ) o.material.map.dispose();
                o.material.dispose();

            }

        } );
        if ( this.body && physics && physics.world ) {

            physics.world.removeRigidBody( this.body );
            this.body = null;
            this.collider = null;

        }

    }

}

const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();

// Deterministic vivid color per peer. We hash the peerId so the same
// friend always shows up the same color for you within a session (the
// color is local to your client, though — they see you with a different
// random color in their game). HSL with high saturation + medium lightness
// keeps colors distinguishable against the asphalt and the sky.
function _colorForPeer( peerId ) {

    let h = 0;
    for ( let i = 0; i < peerId.length; i ++ ) {

        h = ( ( h << 5 ) - h + peerId.charCodeAt( i ) ) | 0;

    }
    const hue = ( ( h >>> 0 ) % 360 ) / 360;
    const c = new THREE.Color();
    c.setHSL( hue, 0.85, 0.55 );
    return c.getHex();

}

function _makeNameSprite( name ) {

    const canvas = document.createElement( 'canvas' );
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext( '2d' );
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect( 0, 0, canvas.width, canvas.height );
    ctx.font = 'bold 32px Monospace';
    ctx.fillStyle = '#FFCB47';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText( name, canvas.width / 2, canvas.height / 2 );
    const tex = new THREE.CanvasTexture( canvas );
    const mat = new THREE.SpriteMaterial( { map: tex, depthTest: false } );
    const sprite = new THREE.Sprite( mat );
    sprite.scale.set( 4, 1, 1 );
    sprite.renderOrder = 999;
    return sprite;

}

// Spawn slot = where you land when you join a room. Slot 0 stays at
// spawnPoint (the host); each subsequent slot shifts the local car one
// car-width to the right (perpendicular to spawn-forward, ground plane).
function _applySpawnSlot( slot ) {

    if ( ! chassis || slot <= 0 ) return;

    // Right vector = forward rotated 90° clockwise in the XZ plane.
    const fwdX = _lapFinishForward.x;
    const fwdZ = _lapFinishForward.z;
    const rightX = - fwdZ;
    const rightZ = fwdX;

    const offset = slot * SPAWN_SLOT_OFFSET_M;
    const x = spawnPoint.x + rightX * offset;
    const y = spawnPoint.y;
    const z = spawnPoint.z + rightZ * offset;

    chassis.setTranslation( new physics.RAPIER.Vector3( x, y, z ), true );
    chassis.setRotation( new physics.RAPIER.Quaternion( spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w ), true );
    chassis.setLinvel( new physics.RAPIER.Vector3( 0, 0, 0 ), true );
    chassis.setAngvel( new physics.RAPIER.Vector3( 0, 0, 0 ), true );
    chaseCam.initialized = false;
    input.handbrakeAfterReset = true;
    lapTimerResetCurrent();

}

function _hookRoomCallbacks( room ) {

    room.on( 'peerJoin', ( peerId ) => {

        // Pre-create a RemoteCar with no visuals-by-meta yet; meta will arrive
        // moments later and update it. Without this, the first few snaps
        // would arrive before we have a car to apply them to.
        if ( ! multiplayer.remotes.has( peerId ) ) {

            const rc = new RemoteCar( peerId, multiplayer.metaByPeer.get( peerId ) );
            rc.setCollidable( _isCollidableRaceState() );
            multiplayer.remotes.set( peerId, rc );

        }
        _renderMultiplayerUI();

    } );

    room.on( 'peerLeave', ( peerId ) => {

        const rc = multiplayer.remotes.get( peerId );
        if ( rc ) rc.destroy();
        multiplayer.remotes.delete( peerId );
        multiplayer.metaByPeer.delete( peerId );
        multiplayer.readyMap.delete( peerId );
        _renderMultiplayerUI();
        // If their leaving means the remaining players are all ready, kick
        // off the countdown — otherwise the race stalls forever.
        _maybeStartCountdown();

    } );

    room.on( 'meta', ( peerId, data ) => {

        multiplayer.metaByPeer.set( peerId, data );
        let rc = multiplayer.remotes.get( peerId );
        if ( ! rc ) {

            rc = new RemoteCar( peerId, data );
            rc.setCollidable( _isCollidableRaceState() );
            multiplayer.remotes.set( peerId, rc );

        } else {

            rc.setMeta( data );

        }
        // Map sync: if this peer is authoritative and we're on a different
        // map, hop to theirs. swapMap() is async; we rebroadcast meta after
        // it lands so peers know we're now on the right map.
        if ( _shouldSyncMapTo( data, peerId ) ) {

            const targetMap = data.mapId;
            swapMap( targetMap ).then( () => { _broadcastLocalMeta(); } );
            if ( typeof showCarToast === 'function' ) showCarToast( 'joining ' + ( MAPS[ targetMap ]?.label || targetMap ) );

        }
        _renderMultiplayerUI();

    } );

    room.on( 'snapshot', ( peerId, snap ) => {

        let rc = multiplayer.remotes.get( peerId );
        if ( ! rc ) {

            // Snapshot arrived before meta (race condition between actions
            // and the meta sent on peerJoin). Spawn with cached meta if any,
            // otherwise placeholder until meta lands.
            rc = new RemoteCar( peerId, multiplayer.metaByPeer.get( peerId ) );
            rc.setCollidable( _isCollidableRaceState() );
            multiplayer.remotes.set( peerId, rc );
            _renderMultiplayerUI();

        }
        rc.pushSnap( snap );

    } );

    room.on( 'race', ( peerId, evt ) => {

        if ( ! evt || ! evt.type ) return;

        if ( evt.type === 'start_race' ) {

            // Anyone in the room can press "start race"; everyone enters
            // ready-check together.
            _enterReadyCheck();

        } else if ( evt.type === 'ready' ) {

            multiplayer.readyMap.set( peerId, { ready: true, carIdx: evt.carIdx } );
            _renderMultiplayerUI();
            _maybeStartCountdown();

        } else if ( evt.type === 'countdown' ) {

            // Only the first countdown event wins; later ones are ignored.
            if ( multiplayer.raceState === 'countdown' || multiplayer.raceState === 'racing' ) return;
            _enterCountdown( evt.startAt );

        } else if ( evt.type === 'finished' ) {

            if ( ! multiplayer.raceWinner ) {

                multiplayer.raceWinner = peerId;
                multiplayer.raceWinnerName = ( multiplayer.metaByPeer.get( peerId ) || {} ).name || peerId.slice( 0, 6 );
                multiplayer.raceState = 'finished';
                _applyRaceModeToRemotes();
                _announceWinner( multiplayer.raceWinnerName + ' wins!' );
                _renderMultiplayerUI();

            }

        }

    } );

}

function _enterReadyCheck() {

    multiplayer.raceState = 'ready_check';
    multiplayer.readyMap = new Map();
    multiplayer.localReady = false;
    multiplayer.raceWinner = null;
    multiplayer.raceWinnerName = '';
    lapTimerResetCurrent();
    _applyRaceModeToRemotes();
    _renderMultiplayerUI();

}

function _toggleReady() {

    if ( ! multiplayer.room ) return;
    if ( multiplayer.raceState !== 'ready_check' ) return;
    if ( multiplayer.localReady ) return; // no un-ready in v1

    const carIdx = typeof currentCarIndex === 'number' ? currentCarIndex : 0;
    multiplayer.localReady = true;
    multiplayer.readyMap.set( 'self', { ready: true, carIdx } );
    multiplayer.room.sendRace( { type: 'ready', carIdx } );
    _renderMultiplayerUI();
    _maybeStartCountdown();

}

// Local decision: if every peer in the room (and us) has sent a ready
// event, broadcast the countdown. Duplicates are debounced inside the
// 'countdown' race handler so multiple clients triggering this in the
// same tick is harmless.
function _maybeStartCountdown() {

    if ( ! multiplayer.room ) return;
    if ( multiplayer.raceState !== 'ready_check' ) return;
    if ( ! multiplayer.localReady ) return;

    const peers = multiplayer.room.peers();
    if ( peers.length < 1 ) return; // need at least one opponent

    for ( const p of peers ) {

        const r = multiplayer.readyMap.get( p );
        if ( ! r || ! r.ready ) return;

    }

    const startAt = Date.now() + COUNTDOWN_MS;
    multiplayer.room.sendRace( { type: 'countdown', startAt } );
    _enterCountdown( startAt );

}

function _enterCountdown( startAt ) {

    multiplayer.raceState = 'countdown';
    multiplayer.raceStartAt = startAt;
    multiplayer.raceWinner = null;
    multiplayer.raceWinnerName = '';
    lapTimerResetCurrent();
    _renderMultiplayerUI();

}

function _tickRace() {

    if ( multiplayer.raceState === 'countdown' ) {

        const remaining = multiplayer.raceStartAt - Date.now();
        if ( multiplayer.countdownEl ) {

            if ( remaining <= 0 ) multiplayer.countdownEl.textContent = 'GO!';
            else multiplayer.countdownEl.textContent = String( Math.ceil( remaining / 1000 ) );

        }
        if ( remaining <= 0 ) {

            multiplayer.raceState = 'racing';
            lapTimerResetCurrent();
            _renderMultiplayerUI();

        }

    }

}

function _announceWinner( msg ) {

    // Reuse the existing car-toast: just write into it.
    if ( typeof showCarToast === 'function' ) showCarToast( msg );
    else console.log( '[race]', msg );

}

// Called by completeLap() when the player crosses the finish line. If
// we're mid-race, broadcast the finish so peers know we won (or we know
// we beat them to it).
function _onLocalLapCompleteForRace() {

    if ( ! multiplayer.room ) return;
    if ( multiplayer.raceState !== 'racing' || multiplayer.raceWinner ) return;
    multiplayer.raceWinner = 'self';
    multiplayer.raceWinnerName = multiplayer.playerName + ' (you)';
    multiplayer.raceState = 'finished';
    _applyRaceModeToRemotes();
    multiplayer.room.sendRace( { type: 'finished' } );
    _announceWinner( 'you win!' );
    _renderMultiplayerUI();

}

// 20 Hz position broadcast — runs from animate() after the physics step.
function _maybeBroadcastSnapshot( now ) {

    if ( ! multiplayer.room || ! chassis ) return;
    if ( now - multiplayer.lastSnapAt < SNAP_INTERVAL_MS ) return;
    multiplayer.lastSnapAt = now;

    const p = chassis.translation();
    const r = chassis.rotation();
    const v = chassis.linvel();
    multiplayer.room.sendSnapshot( {
        pos: [ p.x, p.y, p.z ],
        rot: [ r.x, r.y, r.z, r.w ],
        vel: [ v.x, v.y, v.z ]
    } );

}

function _updateRemoteCars( dt ) {

    if ( multiplayer.remotes.size === 0 ) return;
    const renderTime = performance.now() - INTERP_DELAY_MS;
    for ( const rc of multiplayer.remotes.values() ) rc.update( renderTime, dt );

}

// Whenever the player swaps car or starts up, push the meta to peers so
// their RemoteCar instance for us repaints in the right body colour.
function _broadcastLocalMeta() {

    if ( ! multiplayer.room ) return;
    multiplayer.room.meta = {
        name: multiplayer.playerName,
        carIdx: typeof currentCarIndex === 'number' ? currentCarIndex : 0,
        mapId: currentMapId,
        isHost: multiplayer.isHost,
        joinTime: multiplayer.joinTime
    };
    multiplayer.room.sendMeta();

}

// Decide whether to adopt a peer's map. The host is authoritative — they
// never adopt. Non-hosts adopt from any host; if no peer is a host (e.g.
// two URL-joiners), the earlier joiner wins. Local clocks can skew across
// machines but joinTime drifts by network latency at most a few ms in
// practice; we tie-break by peerId so the rule is at least deterministic.
function _shouldSyncMapTo( theirMeta, theirPeerId ) {

    if ( ! theirMeta || ! theirMeta.mapId ) return false;
    if ( ! MAPS[ theirMeta.mapId ] ) return false;
    if ( theirMeta.mapId === currentMapId ) return false;

    if ( multiplayer.isHost ) return false;
    if ( theirMeta.isHost ) return true;

    const theirTime = Number.isFinite( theirMeta.joinTime ) ? theirMeta.joinTime : Infinity;
    if ( theirTime < multiplayer.joinTime ) return true;
    if ( theirTime > multiplayer.joinTime ) return false;
    return theirPeerId < ( multiplayer.room?.selfId || '' );

}

// ----- UI -----

function initMultiplayer() {

    multiplayer.playerName = _localPlayerName();

    const root = document.createElement( 'div' );
    root.style.cssText = [
        'position:absolute', 'bottom:82px', 'left:10px',
        'z-index:5', 'font:12px Monospace', 'color:#fff',
        'user-select:none', 'min-width:200px',
        'pointer-events:auto'
    ].join( ';' );
    document.body.appendChild( root );
    multiplayer.rootEl = root;

    _renderMultiplayerUI();
    _tryAutoJoinFromUrl();

}

function _btnStyle() {

    return [
        'cursor:pointer', 'padding:4px 10px',
        'background:rgba(0,0,0,0.55)', 'border:none',
        'border-radius:4px', 'color:#fff',
        'font:12px Monospace'
    ].join( ';' );

}

function _renderMultiplayerUI() {

    if ( ! multiplayer.rootEl ) return;
    const root = multiplayer.rootEl;
    root.innerHTML = '';

    if ( ! multiplayer.room ) {

        // Default state — two buttons side by side.
        const row = document.createElement( 'div' );
        row.style.cssText = 'display:flex;gap:6px;align-items:center';

        const makeBtn = document.createElement( 'button' );
        makeBtn.textContent = 'make room';
        makeBtn.style.cssText = _btnStyle();
        makeBtn.addEventListener( 'click', () => _createRoom() );

        const joinBtn = document.createElement( 'button' );
        joinBtn.textContent = 'join room';
        joinBtn.style.cssText = _btnStyle();
        joinBtn.addEventListener( 'click', () => _showJoinForm() );

        row.append( makeBtn, joinBtn );
        root.append( row );

        if ( multiplayer.joinForm ) {

            root.append( multiplayer.joinForm );

        }
        return;

    }

    // In a room: panel with code, peer count, race controls.
    const panel = document.createElement( 'div' );
    panel.style.cssText = [
        'padding:6px 10px', 'background:rgba(0,0,0,0.7)',
        'border:1px solid rgba(255,255,255,0.15)',
        'border-radius:4px', 'display:flex',
        'flex-direction:column', 'gap:4px'
    ].join( ';' );

    const header = document.createElement( 'div' );
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';

    const codeWrap = document.createElement( 'div' );
    const codeLabel = document.createElement( 'span' );
    codeLabel.textContent = 'room ';
    codeLabel.style.opacity = '0.6';
    const code = document.createElement( 'span' );
    code.textContent = multiplayer.room.roomCode;
    code.style.cssText = 'color:#FFCB47;font-weight:bold;letter-spacing:1px';
    codeWrap.append( codeLabel, code );

    const copyBtn = document.createElement( 'span' );
    copyBtn.textContent = 'copy link';
    copyBtn.title = _shareUrl( multiplayer.room.roomCode );
    copyBtn.style.cssText = 'cursor:pointer;opacity:0.65;font-size:10px';
    copyBtn.addEventListener( 'mouseenter', () => { copyBtn.style.opacity = '1'; } );
    copyBtn.addEventListener( 'mouseleave', () => { copyBtn.style.opacity = '0.65'; } );
    copyBtn.addEventListener( 'click', () => {

        const url = _shareUrl( multiplayer.room.roomCode );
        navigator.clipboard?.writeText( url ).then( () => {

            copyBtn.textContent = 'copied';
            setTimeout( () => { copyBtn.textContent = 'copy link'; }, 1100 );

        } );

    } );

    const leaveBtn = document.createElement( 'span' );
    leaveBtn.textContent = 'leave';
    leaveBtn.style.cssText = 'cursor:pointer;opacity:0.65;font-size:10px';
    leaveBtn.addEventListener( 'mouseenter', () => { leaveBtn.style.opacity = '1'; } );
    leaveBtn.addEventListener( 'mouseleave', () => { leaveBtn.style.opacity = '0.65'; } );
    leaveBtn.addEventListener( 'click', () => _leaveRoom() );

    header.append( codeWrap, copyBtn, leaveBtn );
    panel.append( header );

    const urlLine = document.createElement( 'div' );
    urlLine.textContent = _shareUrl( multiplayer.room.roomCode );
    urlLine.style.cssText = [
        'font-size:10px', 'opacity:0.55', 'user-select:all',
        'cursor:text', 'overflow:hidden', 'text-overflow:ellipsis',
        'white-space:nowrap', 'max-width:240px'
    ].join( ';' );
    panel.append( urlLine );

    const peers = multiplayer.room.peers();
    const status = document.createElement( 'div' );
    status.style.cssText = 'font-size:11px;opacity:0.85';
    if ( multiplayer.raceState === 'lobby' ) {

        status.textContent = `players: ${ peers.length + 1 }${ peers.length === 0 ? ' · waiting for friends...' : '' }`;

    } else if ( multiplayer.raceState === 'ready_check' ) {

        let readyCount = multiplayer.localReady ? 1 : 0;
        for ( const p of peers ) if ( multiplayer.readyMap.get( p )?.ready ) readyCount ++;
        const total = peers.length + 1;
        status.textContent = `${ readyCount }/${ total } ready · pick your car (Q), then press READY`;

    } else if ( multiplayer.raceState === 'countdown' ) {

        status.textContent = 'starting in ';
        const ce = document.createElement( 'span' );
        ce.style.cssText = 'color:#FFCB47;font-weight:bold';
        ce.textContent = String( Math.ceil( ( multiplayer.raceStartAt - Date.now() ) / 1000 ) );
        status.appendChild( ce );
        multiplayer.countdownEl = ce;

    } else if ( multiplayer.raceState === 'racing' ) {

        status.innerHTML = `<span style="color:#5DD68F">● racing</span> · ${ peers.length + 1 } players`;

    } else if ( multiplayer.raceState === 'finished' ) {

        status.innerHTML = `<span style="color:#FFCB47">★ ${ multiplayer.raceWinnerName } wins</span>`;

    }
    panel.append( status );

    // Ready list during ready_check — one row per player with their pick.
    if ( multiplayer.raceState === 'ready_check' ) {

        const list = document.createElement( 'div' );
        list.style.cssText = 'font-size:11px;display:flex;flex-direction:column;gap:2px;margin-top:2px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.12)';
        list.append( _readyRow( 'you', multiplayer.readyMap.get( 'self' ) ) );
        for ( const p of peers ) {

            const meta = multiplayer.metaByPeer.get( p );
            const name = ( meta && meta.name ) || p.slice( 0, 6 );
            list.append( _readyRow( name, multiplayer.readyMap.get( p ) ) );

        }
        panel.append( list );

    }

    // Race controls.
    const controls = document.createElement( 'div' );
    controls.style.cssText = 'display:flex;gap:6px';

    if ( multiplayer.raceState === 'lobby' || multiplayer.raceState === 'finished' ) {

        const startBtn = document.createElement( 'button' );
        startBtn.textContent = multiplayer.raceState === 'finished' ? 'race again' : 'start race';
        startBtn.style.cssText = _btnStyle();
        startBtn.addEventListener( 'click', () => _startRace() );
        controls.append( startBtn );

    } else if ( multiplayer.raceState === 'ready_check' && ! multiplayer.localReady ) {

        const readyBtn = document.createElement( 'button' );
        readyBtn.textContent = 'READY';
        readyBtn.style.cssText = _btnStyle() + ';background:#5DD68F;color:#0c0c0c;font-weight:bold';
        readyBtn.addEventListener( 'click', () => _toggleReady() );
        controls.append( readyBtn );

    }

    if ( controls.children.length > 0 ) panel.append( controls );

    root.append( panel );

}

function _readyRow( name, entry ) {

    const row = document.createElement( 'div' );
    row.style.cssText = 'display:flex;justify-content:space-between;gap:8px';
    const left = document.createElement( 'span' );
    left.textContent = name;
    left.style.opacity = '0.85';
    const right = document.createElement( 'span' );
    if ( entry && entry.ready ) {

        const carName = ( CARS[ entry.carIdx ] || {} ).name || '?';
        right.innerHTML = `<span style="color:#5DD68F">✓</span> <span style="opacity:0.7">${ carName }</span>`;

    } else {

        right.textContent = 'choosing...';
        right.style.opacity = '0.5';

    }
    row.append( left, right );
    return row;

}

function _showJoinForm() {

    const form = document.createElement( 'div' );
    form.style.cssText = 'display:flex;gap:6px;align-items:center;margin-top:6px';

    const input = document.createElement( 'input' );
    input.type = 'text';
    input.placeholder = 'room code';
    input.maxLength = 5;
    input.style.cssText = [
        'padding:4px 8px', 'background:rgba(0,0,0,0.55)',
        'border:1px solid rgba(255,255,255,0.2)', 'color:#fff',
        'border-radius:4px', 'font:12px Monospace',
        'width:90px', 'text-transform:uppercase', 'letter-spacing:1px'
    ].join( ';' );

    const goBtn = document.createElement( 'button' );
    goBtn.textContent = 'join';
    goBtn.style.cssText = _btnStyle();

    const submit = () => {

        const code = input.value.trim().toUpperCase();
        if ( code.length < 3 ) return;
        _joinRoom( code );

    };
    goBtn.addEventListener( 'click', submit );
    input.addEventListener( 'keydown', ( e ) => {

        e.stopPropagation(); // don't let the driving keybinds eat the typing
        if ( e.key === 'Enter' ) submit();

    } );
    input.addEventListener( 'keyup', ( e ) => { e.stopPropagation(); } );

    form.append( input, goBtn );
    multiplayer.joinForm = form;
    _renderMultiplayerUI();
    setTimeout( () => input.focus(), 0 );

}

function _createRoom() {

    const code = generateRoomCode();
    _enterRoom( code, true );

}

function _joinRoom( code ) {

    _enterRoom( code, false );

}

function _enterRoom( code, isHost ) {

    if ( multiplayer.room ) return;
    multiplayer.isHost = isHost;
    multiplayer.joinForm = null;

    multiplayer.joinTime = Date.now();
    const room = openRoom( code, {
        name: multiplayer.playerName,
        carIdx: typeof currentCarIndex === 'number' ? currentCarIndex : 0,
        mapId: currentMapId,
        isHost,
        joinTime: multiplayer.joinTime
    } );
    multiplayer.room = room;
    _hookRoomCallbacks( room );
    _setUrlForRoom( code );

    // Joining? Wait a tick so peer-count is meaningful, then take a slot
    // beside the existing players. Hosts always stay in slot 0.
    if ( ! isHost ) {

        setTimeout( () => {

            const peerCount = room.peers().length;
            _applySpawnSlot( peerCount );

        }, 300 );

    }

    _renderMultiplayerUI();

}

function _leaveRoom() {

    if ( multiplayer.room ) {

        try { multiplayer.room.leave(); } catch {}
        multiplayer.room = null;

    }
    for ( const rc of multiplayer.remotes.values() ) rc.destroy();
    multiplayer.remotes.clear();
    multiplayer.metaByPeer.clear();
    multiplayer.readyMap = new Map();
    multiplayer.localReady = false;
    multiplayer.raceState = 'lobby';
    multiplayer.raceWinner = null;
    multiplayer.raceWinnerName = '';
    multiplayer.isHost = false;
    _setUrlForRoom( null );
    _renderMultiplayerUI();

}

function _startRace() {

    if ( ! multiplayer.room ) return;
    multiplayer.room.sendRace( { type: 'start_race' } );
    _enterReadyCheck();

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
    masterVolume: 0.4,  // user-controllable; survives AudioContext (re)creation
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

// ---------------- controls cheatsheet ----------------
//
// The #info panel in the top-right shows one set of bindings at a time.
// When a gamepad connects we swap to the controller scheme — otherwise we
// show the keyboard one. The scheme renders into #controlsList; the volume
// slider above and the minimap toggle below stay put as siblings.

const CONTROLS_KEYBOARD = [
    'W / ↑ · throttle',
    'Space · brake',
    'S / ↓ · brake · hold = reverse',
    'A D / ← → · steer',
    'E · handbrake',
    'M · auto / manual',
    'Q · cycle car',
    'L⇧ · upshift  ·  L⌃ · downshift',
    'R · reset',
    'C · cycle camera (chase / free / pov)',
    '1 / 2 · cycle map',
    'T · record 60s telemetry (input + output → JSON)'
];

const CONTROLS_GAMEPAD = [
    'LS · steer',
    'RT · throttle',
    'LT · brake · hold = reverse',
    'A · handbrake',
    'X · auto / manual',
    'Back · cycle car',
    'RB · upshift  ·  LB · downshift',
    'Start · reset',
    'Y · cycle camera (chase / free / pov)',
    'D-pad → · cycle map',
    'D-pad ← · toggle minimap',
    'D-pad ↑ · stats for nerds'
];

function renderControlsCheatsheet() {

    const list = document.getElementById( 'controlsList' );
    if ( ! list ) return;

    const scheme = gamepad.index >= 0 ? CONTROLS_GAMEPAD : CONTROLS_KEYBOARD;
    list.innerHTML = '';
    for ( const line of scheme ) {

        const p = document.createElement( 'p' );
        p.textContent = line;
        list.appendChild( p );

    }

    // Stats-for-nerds toggle position is anchored to #info's bottom edge,
    // and the panel's height just changed.
    if ( typeof _positionStatsBelowInfo === 'function' ) _positionStatsBelowInfo();

}

function initVolumeSlider() {

    const infoEl = document.getElementById( 'info' );
    if ( ! infoEl ) return;

    const saved = parseFloat( localStorage.getItem( 'masterVolume' ) );
    if ( Number.isFinite( saved ) && saved >= 0 && saved <= 1 ) audio.masterVolume = saved;

    const row = document.createElement( 'div' );
    row.className = 'volume-row';

    const label = document.createElement( 'span' );
    label.textContent = 'VOL';
    label.style.opacity = '0.85';

    const slider = document.createElement( 'input' );
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.value = String( audio.masterVolume );

    const readout = document.createElement( 'span' );
    readout.textContent = Math.round( audio.masterVolume * 100 );

    row.appendChild( label );
    row.appendChild( slider );
    row.appendChild( readout );
    infoEl.insertBefore( row, infoEl.firstChild );

    slider.addEventListener( 'input', () => {

        const v = parseFloat( slider.value );
        audio.masterVolume = v;
        if ( audio.masterGain ) audio.masterGain.gain.value = v;
        readout.textContent = Math.round( v * 100 );
        localStorage.setItem( 'masterVolume', String( v ) );

    } );

}

async function startAudio() {

    // Already initialized — just make sure the context is running. Browsers
    // can leave/return AudioContext to 'suspended' even after a successful
    // create (Safari especially), so re-call resume() on every gesture.
    if ( audio.started ) {

        if ( audio.ctx && audio.ctx.state === 'suspended' ) {

            audio.ctx.resume().catch( () => {} );

        }
        return;

    }
    audio.started = true;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if ( ! Ctx ) { audio.started = false; return; }
    const ctx = new Ctx();
    audio.ctx = ctx;
    if ( ctx.state === 'suspended' ) ctx.resume().catch( () => {} );

    audio.masterGain = ctx.createGain();
    audio.masterGain.gain.value = audio.masterVolume;
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
    // Pre-curve combined input (keyboard ∪ gamepad ∪ touch), for the joystick
    // map widget and telemetry. `steer` above is the post-curve / post-deadzone
    // value that actually drives the wheel target angle.
    steerRaw: 0,
    handbrake: 0,
    reset: false,
    // raw key states so we can hold + combine
    keyW: false, keyS: false, keyA: false, keyD: false, keyE: false,
    arrowUp: false, arrowDown: false, arrowLeft: false, arrowRight: false,
    keyR: false, keySpace: false,
    // S-held timer for long-press reverse engagement
    sHeldTime: 0,
    reverseEngaged: false,
    // Initial-spawn / post-R-reset handbrake lock — gravity can roll the
    // chassis on inclined spawns and we don't want the car drifting before
    // the player has even touched a key. Released by updateInput() the
    // first frame _anyInputActive() returns true.
    handbrakeAfterReset: true
};

// Steering tuning — non-linear curve + speed-sensitive max angle + dt-aware
// smoothing. The old pipeline was a flat lerp on a linear input which made
// the car spin out in high-speed corners because the full mechanical angle
// was available at any speed. The settings below are exposed at module
// scope so they can be tweaked live from the console.
const steeringCfg = {
    deadzone: 0.045,            // extra deadzone applied AFTER source merging
    curveExponent: 1.7,         // 1.0 = linear; >1 = softer near center
    // Speed-sensitive reduction. Max steering scales from 1.0 at standstill
    // down to `minFactor` at `vReduceMax` m/s and stays clamped above that.
    minFactor: 0.40,
    vReduceMax: 55,             // m/s ≈ 198 km/h
    // dt-aware smoothing rates. Return-to-center is faster than steer-in so
    // the car settles back to straight rather than asymptotically lingering.
    smoothInRate: 14,
    smoothReturnRate: 22,
    // Snap-to-zero threshold (radians) when the target is zero. Catches the
    // long tail of the exponential decay so the wheels actually reach 0.
    zeroSnapRad: 0.001
};

// Traction control — cuts engine force per-driven-wheel when the
// longitudinal slip ratio exceeds the peak-grip threshold. Without this,
// stomping the throttle mid-corner sends the drive tyres past peak slip and
// the car washes wide / spins. Live state is mirrored to `drivetrain.tc`
// for the stats panel.
const tcCfg = {
    enabled: true,
    slipThreshold: 0.16,        // peak Pacejka slip is ~0.14
    cutGain: 4.5,               // torque cut per unit of slip overshoot
    minMult: 0.18,              // never cut all the way to zero
    // Low-speed exemption: TC is annoying when crawling out of a spawn /
    // doing a hill-start, so disable below this speed (m/s).
    minActiveSpeed: 1.2
};

// Per-frame steering-pipeline telemetry — populated by applyVehicleForces,
// consumed by the joystick map widget and the stats-for-nerds diagnostics.
const steeringTelemetry = {
    target: 0,       // desired wheel angle this frame (rad)
    actual: 0,       // smoothed wheel angle written to the controller (rad)
    maxAngle: 0,     // speed-scaled max steering angle (rad)
    speedFactor: 1   // scale applied to maxSteeringAngle by speed reduction
};

// 60-second telemetry recording started by the T key. Snapshots are pushed
// each frame and dumped to a JSON download when the buffer fills, similar
// to Trackmania's input recorder.
const telemetry = {
    recording: false,
    startedAt: 0,
    durationMs: 60_000,
    samples: [],
    sampleHz: 60,
    lastSampleAt: 0,
    lastDownloadedSize: 0
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
    // Beginner-friendly, soft suspension (rolls), mild understeer, ~175 km/h top.
    {
        name: 'Hatchback',
        bodyColor: 0xFFCB47,
        soundFile: 'sounds/engines/hatchback.mp3', soundLoopStart: 3.0,
        pitchMin: 0.55, pitchMax: 2.8,
        mass: 10, chassisFriction: 0.8,
        maxEngineForce: 62, engineIdleRpm: 900, engineRedline: 7000,
        peakTorqueRpm: 4200, torqueCurveWidth: 2300,
        gearRatios: [ 3.5, 2.1, 1.4, 1.0, 0.78 ], reverseRatio: - 3.4, finalDrive: 3.7,
        autoUpshiftRpm: 5900, autoDownshiftRpm: 2200,
        wheelFrictionSlip: 2.1,
        suspensionStiffness: 22, suspensionCompression: 1.9, suspensionRelaxation: 2.3,
        suspensionRestLength: 0.42, wheelConnectionY: - 0.30,
        maxBrakeForce: 1.25, handbrakeMultiplier: 1.6, maxSteeringAngle: Math.PI / 4,
        brakeBias: 0.66,
        camberDeg: [ - 0.5, - 0.5, - 0.3, - 0.3 ], toeDeg: [ 0, 0, 0.1, 0.1 ],
        engineInertia: 0.14, clutchStiffness: 280, lsdLocking: 0.30,
        Cd: 0.0250, Cl: 0.0000,
        driveType: 'FWD'
    },
    // Muscle V8 — 1700 kg Mustang GT class; heavy nose, fat low-end torque.
    // Easy to oversteer on throttle, lazy revs, body-roll, ~230 km/h.
    {
        name: 'Muscle V8',
        bodyColor: 0xB42020,
        soundFile: 'sounds/engines/muscle.mp3', soundLoopStart: 3.0,
        pitchMin: 0.6, pitchMax: 2.2,
        mass: 14, chassisFriction: 0.8,
        maxEngineForce: 130, engineIdleRpm: 750, engineRedline: 6800,
        peakTorqueRpm: 3500, torqueCurveWidth: 3000,
        gearRatios: [ 3.66, 2.43, 1.69, 1.32, 1.0, 0.79 ], reverseRatio: - 3.5, finalDrive: 3.55,
        autoUpshiftRpm: 5700, autoDownshiftRpm: 1900,
        wheelFrictionSlip: 1.95,
        suspensionStiffness: 23, suspensionCompression: 1.95, suspensionRelaxation: 2.35,
        suspensionRestLength: 0.42, wheelConnectionY: - 0.32,
        maxBrakeForce: 1.5, handbrakeMultiplier: 1.7, maxSteeringAngle: Math.PI / 4.2,
        brakeBias: 0.62,
        camberDeg: [ - 1, - 1, - 0.5, - 0.5 ], toeDeg: [ 0, 0, 0.1, 0.1 ],
        engineInertia: 0.20, clutchStiffness: 340, lsdLocking: 0.55,
        Cd: 0.0235, Cl: 0.0000,
        driveType: 'RWD'
    },
    // Sport Flat-six — 1430 kg 911 GT3 class.
    // The driver's car: high-rev peaky power, sharp turn-in, rear rotation, ~290 km/h.
    {
        name: 'Sport Flat-six',
        bodyColor: 0xC8CDD2,
        soundFile: 'sounds/engines/sport.mp3', soundLoopStart: 3.0,
        pitchMin: 0.7, pitchMax: 3.2,
        mass: 11, chassisFriction: 0.88,
        maxEngineForce: 150, engineIdleRpm: 1100, engineRedline: 9200,
        peakTorqueRpm: 7000, torqueCurveWidth: 1900,
        gearRatios: [ 3.91, 2.29, 1.65, 1.30, 1.08, 0.88 ], reverseRatio: - 3.55, finalDrive: 3.97,
        autoUpshiftRpm: 8700, autoDownshiftRpm: 3400,
        wheelFrictionSlip: 3.1,
        suspensionStiffness: 38, suspensionCompression: 2.8, suspensionRelaxation: 3.0,
        suspensionRestLength: 0.28, wheelConnectionY: - 0.26,
        maxBrakeForce: 2.1, handbrakeMultiplier: 1.8, maxSteeringAngle: Math.PI / 4,
        brakeBias: 0.54,
        camberDeg: [ - 2.2, - 2.2, - 1.2, - 1.2 ], toeDeg: [ - 0.1, - 0.1, 0.2, 0.2 ],
        engineInertia: 0.07, clutchStiffness: 600, lsdLocking: 0.75,
        Cd: 0.0128, Cl: 0.0080,
        driveType: 'RWD'
    },
    // Rally Turbo — WRX STI class; AWD-feel grip, broad turbo plateau.
    // Strong AWD launch, soft long-travel for bumps, biggest handbrake for Scandi flicks, ~250 km/h.
    {
        name: 'Rally Turbo',
        bodyColor: 0x1F4DFF,
        soundFile: 'sounds/engines/rally.mp3', soundLoopStart: 3.0,
        pitchMin: 0.65, pitchMax: 2.9,
        mass: 11, chassisFriction: 0.9,
        maxEngineForce: 135, engineIdleRpm: 900, engineRedline: 7800,
        peakTorqueRpm: 3400, torqueCurveWidth: 3400,
        gearRatios: [ 3.64, 2.37, 1.76, 1.35, 1.06, 0.84 ], reverseRatio: - 3.55, finalDrive: 3.90,
        autoUpshiftRpm: 6700, autoDownshiftRpm: 2700,
        wheelFrictionSlip: 2.55,
        suspensionStiffness: 26, suspensionCompression: 2.1, suspensionRelaxation: 2.5,
        suspensionRestLength: 0.48, wheelConnectionY: - 0.34,
        maxBrakeForce: 1.8, handbrakeMultiplier: 2.4, maxSteeringAngle: Math.PI / 3.8,
        brakeBias: 0.58,
        camberDeg: [ - 1.2, - 1.2, - 1.0, - 1.0 ], toeDeg: [ 0, 0, 0.1, 0.1 ],
        engineInertia: 0.12, clutchStiffness: 460, lsdLocking: 0.90,
        Cd: 0.0290, Cl: 0.0030,
        driveType: 'AWD'
    },
    // Supercar V12 — Ferrari 812 class.
    // Broad NA V12, lazy spin-up (heavy crank), top-end heavy hitter, ~330 km/h.
    {
        name: 'Supercar V12',
        bodyColor: 0xFF6F1A,
        soundFile: 'sounds/engines/supercar.mp3', soundLoopStart: 3.0,
        pitchMin: 0.7, pitchMax: 3.4,
        mass: 12, chassisFriction: 0.88,
        maxEngineForce: 185, engineIdleRpm: 1000, engineRedline: 9000,
        peakTorqueRpm: 6500, torqueCurveWidth: 3200,
        gearRatios: [ 3.08, 2.19, 1.63, 1.29, 1.03, 0.84, 0.69 ], reverseRatio: - 2.9, finalDrive: 4.10,
        autoUpshiftRpm: 8500, autoDownshiftRpm: 3200,
        wheelFrictionSlip: 2.95,
        suspensionStiffness: 34, suspensionCompression: 2.6, suspensionRelaxation: 2.9,
        suspensionRestLength: 0.28, wheelConnectionY: - 0.25,
        maxBrakeForce: 2.2, handbrakeMultiplier: 1.8, maxSteeringAngle: Math.PI / 4,
        brakeBias: 0.57,
        camberDeg: [ - 1.8, - 1.8, - 1.0, - 1.0 ], toeDeg: [ - 0.1, - 0.1, 0.2, 0.2 ],
        engineInertia: 0.13, clutchStiffness: 620, lsdLocking: 0.80,
        Cd: 0.0182, Cl: 0.0140,
        driveType: 'RWD'
    },
    // F1 — 798 kg open-wheeler with V10-era 18000 rpm scream.
    // Terrifying at low speed (peaky power, no aero), sublime at high speed (multi-g
    // downforce grip). Stiff as a board, slick rubber, ~340 km/h.
    {
        name: 'F1',
        bodyColor: 0xD11A1A,
        soundFile: 'sounds/engines/f1.mp3', soundLoopStart: 3.0,
        pitchMin: 1.0, pitchMax: 4.0,
        mass: 5, chassisFriction: 0.92,
        maxEngineForce: 235, engineIdleRpm: 4500, engineRedline: 18500,
        peakTorqueRpm: 14000, torqueCurveWidth: 3200,
        gearRatios: [ 2.90, 2.20, 1.75, 1.42, 1.18, 1.0, 0.86, 0.74 ], reverseRatio: - 2.5, finalDrive: 4.4,
        autoUpshiftRpm: 18000, autoDownshiftRpm: 7000,
        wheelFrictionSlip: 4.4,
        suspensionStiffness: 58, suspensionCompression: 3.5, suspensionRelaxation: 3.7,
        suspensionRestLength: 0.16, wheelConnectionY: - 0.18,
        maxBrakeForce: 3.5, handbrakeMultiplier: 1.4, maxSteeringAngle: Math.PI / 4.5,
        brakeBias: 0.58,
        camberDeg: [ - 3.5, - 3.5, - 2.0, - 2.0 ], toeDeg: [ - 0.2, - 0.2, 0.25, 0.25 ],
        engineInertia: 0.04, clutchStiffness: 900, lsdLocking: 1.00,
        Cd: 0.0220, Cl: 0.0600,
        driveType: 'RWD'
    },
    // God Car — physically impossible: max grip, 10 gears, flat torque, near-instant stops.
    // Easy-mode tank, forgives every input, ~400+ km/h, perfect balance.
    {
        name: 'God Car',
        bodyColor: 0xF0F0F8,
        soundFile: 'sounds/engines/god.mp3', soundLoopStart: 3.0,
        pitchMin: 0.4, pitchMax: 4.5,
        mass: 5, chassisFriction: 1.0,
        maxEngineForce: 300, engineIdleRpm: 1000, engineRedline: 20000,
        peakTorqueRpm: 10000, torqueCurveWidth: 9000,
        gearRatios: [ 3.2, 2.6, 2.1, 1.75, 1.45, 1.2, 1.0, 0.85, 0.72, 0.6 ], reverseRatio: - 3.0, finalDrive: 4.0,
        autoUpshiftRpm: 19000, autoDownshiftRpm: 2500,
        wheelFrictionSlip: 5.0,
        suspensionStiffness: 48, suspensionCompression: 3.1, suspensionRelaxation: 3.3,
        suspensionRestLength: 0.28, wheelConnectionY: - 0.25,
        maxBrakeForce: 5.5, handbrakeMultiplier: 2.0, maxSteeringAngle: Math.PI / 4,
        brakeBias: 0.55,
        camberDeg: [ - 2, - 2, - 1, - 1 ], toeDeg: [ 0, 0, 0.05, 0.05 ],
        engineInertia: 0.04, clutchStiffness: 1300, lsdLocking: 1.00,
        Cd: 0.0165, Cl: 0.0700,
        driveType: 'AWD'
    }
];

let currentCarIndex = 0;
let currentCar = CARS[ 0 ];
let carVisualsGroup = null;
let carToastEl = null;
let carBadgeEl = null;

// Per-car cockpit / driver-POV configuration (from the planning subagent).
// Each entry maps the car name to:
//   cockpitOffset: chassis-local camera position (driver seat)
//   cockpitLookOffset: chassis-local point the camera looks at
//   steeringWheelOffset: chassis-local mount point of the wheel mesh
//   steeringWheelTilt: x-rotation of the wheel parent group (radians)
//   fov: degrees, used while POV is active (no speed-FOV boost in POV)
//   wheelRotationMultiplier: visual wheel spin per radian of front-tyre steer
const COCKPITS = {
    'Hatchback':      { cockpitOffset:{x:-0.38,y:0.32,z:0.10}, cockpitLookOffset:{x:-0.38,y:0.30,z:-1.10}, steeringWheelOffset:{x:-0.38,y:0.10,z:-0.55}, steeringWheelTilt:0.35, fov:78, wheelRotationMultiplier:7.0 },
    'Muscle V8':      { cockpitOffset:{x:-0.42,y:0.28,z:0.30}, cockpitLookOffset:{x:-0.42,y:0.26,z:-0.95}, steeringWheelOffset:{x:-0.42,y:0.05,z:-0.40}, steeringWheelTilt:0.30, fov:76, wheelRotationMultiplier:6.5 },
    'Sport Flat-six': { cockpitOffset:{x:-0.40,y:0.18,z:0.20}, cockpitLookOffset:{x:-0.40,y:0.16,z:-1.05}, steeringWheelOffset:{x:-0.40,y:-0.02,z:-0.50}, steeringWheelTilt:0.38, fov:77, wheelRotationMultiplier:7.0 },
    'Rally Turbo':    { cockpitOffset:{x:-0.40,y:0.42,z:0.15}, cockpitLookOffset:{x:-0.40,y:0.38,z:-1.20}, steeringWheelOffset:{x:-0.40,y:0.20,z:-0.55}, steeringWheelTilt:0.40, fov:80, wheelRotationMultiplier:7.5 },
    'Supercar V12':   { cockpitOffset:{x:-0.36,y:0.10,z:0.05}, cockpitLookOffset:{x:-0.36,y:0.08,z:-1.30}, steeringWheelOffset:{x:-0.36,y:-0.10,z:-0.55}, steeringWheelTilt:0.45, fov:79, wheelRotationMultiplier:6.0 },
    'F1':             { cockpitOffset:{x:0.00,y:0.08,z:0.40},  cockpitLookOffset:{x:0.00,y:0.05,z:-2.10},  steeringWheelOffset:{x:0.00,y:-0.05,z:-0.20}, steeringWheelTilt:1.22, fov:90, wheelRotationMultiplier:6.0 },
    'God Car':        { cockpitOffset:{x:0.00,y:0.25,z:0.00},  cockpitLookOffset:{x:0.00,y:0.22,z:-1.80},  steeringWheelOffset:{x:0.00,y:0.05,z:-0.65}, steeringWheelTilt:0.52, fov:85, wheelRotationMultiplier:8.0 }
};

let cameraMode = 'chase'; // 'chase' | 'pov' | 'free'
let steeringWheelGroup = null;   // tilted parent (chassis-local)
let steeringWheelMesh = null;    // rotates each frame on Z

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
// Mutated by swapMap() so the chassis-reset code path (input.reset) always
// reads the active map's spawn.
const spawnPoint = new THREE.Vector3( 3147.90, - 80.45, - 2733.54 );
const spawnQuaternion = new THREE.Quaternion( - 0.0046, - 0.5791, 0.0216, 0.8150 );

// Maps the player can hot-swap with the number keys 1 / 2. Each entry owns
// its own glb path + spawn pose; swapMap(id) copies that pose into
// spawnPoint / spawnQuaternion above and reloads the track.
const MAPS = {
    nurburgring: {
        label: 'Nürburgring (Nordschleife)',
        path: 'textures/models/nurburgring.glb',
        spawnPos: { x: 3147.90, y: - 80.45, z: - 2733.54 },
        spawnRot: { x: - 0.0046, y: - 0.5791, z: 0.0216, w: 0.8150 }
    },
    nurburgring_gp: {
        label: 'Nürburgring GP (2022 layout)',
        path: 'textures/models/nurburgring_gp.glb',
        // 2× — compact GP layout, car feels appropriately sized against it.
        scale: 2,
        // Captured pose from the 5.5× session, rescaled by 2/5.5 so the
        // car still lands on the same on-asphalt point at the new scale.
        // Press P on-track if you want a tighter spawn.
        spawnPos: { x: 26.04, y: 26.09, z: 1219.19 },
        spawnRot: { x: 0.0037, y: - 0.0176, z: 0.0121, w: - 0.9998 }
    }
};
let currentMapId = 'nurburgring';
let mapSwapInFlight = false;
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
    initJoystickMap();
    initTouchControls();
    initCarToast();
    initMinimap();
    initLapTimer();
    initMultiplayer();
    initSkidMarks();
    initVolumeSlider();
    renderControlsCheatsheet();
    _positionStatsBelowInfo();
    window.addEventListener( 'resize', _positionStatsBelowInfo );

    // Audio cannot autoplay without a user gesture — browsers block it. We
    // listen broadly so *any* interaction (key, click, tap, scroll, focus)
    // unlocks the AudioContext without forcing the user to find the slider.
    // startAudio() is idempotent and also re-resumes a suspended context, so
    // we don't use { once: true }.
    const unlockAudio = () => { startAudio(); };
    const unlockEvents = [ 'keydown', 'pointerdown', 'mousedown', 'click', 'touchstart', 'wheel' ];
    for ( const ev of unlockEvents ) window.addEventListener( ev, unlockAudio, { passive: true } );
    window.addEventListener( 'focus', unlockAudio );

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
        if ( k === '1' ) swapMap( 'nurburgring' );
        if ( k === '2' ) swapMap( 'nurburgring_gp' );
        if ( k === 'F3' ) { event.preventDefault(); toggleStatsForNerds(); }

        if ( k === 'c' || k === 'C' ) cycleCameraMode();

        if ( k === 'h' || k === 'H' ) {

            if ( physicsHelper ) physicsHelper.visible = ! physicsHelper.visible;

        }

        if ( k === 't' || k === 'T' ) {

            if ( ! telemetry.recording ) startTelemetryRecording();
            else stopTelemetryRecording( /* download */ true );

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
        renderControlsCheatsheet();
        console.log( '[gamepad] connected:', e.gamepad.id );

    } );

    window.addEventListener( 'gamepaddisconnected', ( e ) => {

        if ( e.gamepad.index === gamepad.index ) {

            gamepad.index = - 1;
            gamepad.id = '';
            if ( speedoControllerEl ) speedoControllerEl.style.display = 'none';
            if ( touch.enabled ) setTouchOverlayVisible( true );
            renderControlsCheatsheet();

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

    const mapCfg = MAPS[ currentMapId ];
    if ( fpsLabel ) fpsLabel.textContent = `loading ${ mapCfg.label }...`;

    const loader = new GLTFLoader();
    // Use BASE_URL so the path works both at /  (dev) and /race_in_progress/ (GH Pages).
    const gltf = await loader.loadAsync( import.meta.env.BASE_URL + mapCfg.path );

    track = gltf.scene;

    // Optional per-map scale (e.g. the GP layout glb is authored ~1/30 size
    // of the Nordschleife glb). Applied on the root so it flows through to
    // both chunkTrackMeshes and the trimesh collider extraction — both bake
    // matrixWorld into their output vertices.
    if ( mapCfg.scale && mapCfg.scale !== 1 ) track.scale.setScalar( mapCfg.scale );

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

// Hot-swap the active map. Tears down the current track mesh + static
// physics body, loads the requested map, applies its spawn pose to the
// shared spawnPoint/spawnQuaternion, then teleports the car onto it.
async function swapMap( id ) {

    if ( ! MAPS[ id ] || mapSwapInFlight || id === currentMapId ) return;
    mapSwapInFlight = true;

    // 1) Remove the existing visual track and free its geometry.
    if ( track ) {

        scene.remove( track );
        track.traverse( ( obj ) => {

            if ( obj.isMesh && obj.geometry ) obj.geometry.dispose();

        } );
        track = null;

    }

    // 2) Drop the static track rigid body (Rapier removes its colliders too).
    if ( trackBody && physics && physics.world ) {

        physics.world.removeRigidBody( trackBody );
        trackBody = null;

    }

    // 3) Skid marks were stuck to the old surface — wipe them.
    clearSkidMarks();

    // 4) Switch the active map id and copy its spawn pose into the shared
    //    spawnPoint / spawnQuaternion before loading, so the [track] log line
    //    and any reset-during-load read the right values.
    currentMapId = id;
    const cfg = MAPS[ id ];
    spawnPoint.set( cfg.spawnPos.x, cfg.spawnPos.y, cfg.spawnPos.z );
    spawnQuaternion.set( cfg.spawnRot.x, cfg.spawnRot.y, cfg.spawnRot.z, cfg.spawnRot.w );

    // Swap the lap-history bucket — each map has its own best times.
    if ( lapTimer ) { _lapTimerLoadForMap(); _lapTimerRefreshPanel(); }

    // Tell peers we moved (and pull them along if we're authoritative).
    if ( typeof _broadcastLocalMeta === 'function' && multiplayer.room ) _broadcastLocalMeta();

    // 5) Load the new track geometry + collider mesh.
    await loadTrack();

    // 6) Teleport the car onto the new spawn — reuses the same reset path
    //    the R key already uses, just inlined because we don't want to wait
    //    for the next physics tick to read input.reset.
    if ( chassis ) {

        chassis.setTranslation( new physics.RAPIER.Vector3( spawnPoint.x, spawnPoint.y, spawnPoint.z ), true );
        chassis.setRotation( new physics.RAPIER.Quaternion( spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w ), true );
        chassis.setLinvel( new physics.RAPIER.Vector3( 0, 0, 0 ), true );
        chassis.setAngvel( new physics.RAPIER.Vector3( 0, 0, 0 ), true );
        transmission.gear = 1;
        transmission.shiftCooldown = 0;
        engine.rpm = engine.idleRpm;
        input.reverseEngaged = false;
        input.sHeldTime = 0;
        input.handbrakeAfterReset = true;
        chaseCam.initialized = false;
        resetTires();
        resetDrivetrain();

    }

    mapSwapInFlight = false;

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

    // Toe baked into steering channel; driver input adds an offset on top
    // each frame in applyVehicleForces.
    applySuspensionGeometry();

    buildAndMountSteeringWheel( currentCar );

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
    const cam = _touchTapBtn( 'CAM', 11, () => cycleCameraMode() );
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

// Top-down rectangle of the four tires. Each tire shows its temperature, wear
// %, and a background colour ramped from blue (cold) → green (optimal 80 °C)
// → red (overheated 140 °C).
function _sTireWidget( panel ) {

    const wrap = document.createElement( 'div' );
    wrap.style.cssText = 'margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px';
    panel.appendChild( wrap );

    const labels = [ 'FL', 'FR', 'RL', 'RR' ];
    statsForNerds.tireBoxes = [];

    for ( let i = 0; i < 4; i ++ ) {

        const tire = document.createElement( 'div' );
        tire.style.cssText = [
            'padding:6px 8px', 'border-radius:5px',
            'background:hsl(220,65%,42%)', 'color:#fff',
            'display:flex', 'flex-direction:column', 'gap:1px',
            'transition:background 120ms linear',
            'box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)'
        ].join( ';' );

        const labelEl = document.createElement( 'div' );
        labelEl.textContent = labels[ i ];
        labelEl.style.cssText = 'font-size:9px;opacity:0.78;letter-spacing:1.8px;font-weight:600';

        const heatEl = document.createElement( 'div' );
        heatEl.style.cssText = 'font-size:16px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums';
        heatEl.textContent = '40°';

        const wearEl = document.createElement( 'div' );
        wearEl.style.cssText = 'font-size:11px;opacity:0.92;font-variant-numeric:tabular-nums';
        wearEl.textContent = '100%';

        tire.appendChild( labelEl );
        tire.appendChild( heatEl );
        tire.appendChild( wearEl );
        wrap.appendChild( tire );

        statsForNerds.tireBoxes.push( { el: tire, heatEl, wearEl } );

    }

}

function _heatToColor( heat ) {

    // 20 °C → hue 220 (deep blue, cold) · 80 °C → hue 120 (green, optimal)
    // 140 °C → hue 0 (red, overheated). Smooth HSL interpolation.
    const t = Math.max( 0, Math.min( 1, ( heat - 20 ) / 120 ) );
    const hue = 220 - t * 220;
    // Pull saturation up at the extremes so cold/hot read more strongly.
    const sat = 60 + Math.abs( t - 0.5 ) * 30;
    return `hsl(${ hue.toFixed( 0 ) },${ sat.toFixed( 0 ) }%,42%)`;

}

function updateTireWidget() {

    if ( ! statsForNerds.enabled || ! statsForNerds.tireBoxes ) return;
    for ( let i = 0; i < 4; i ++ ) {

        const box = statsForNerds.tireBoxes[ i ];
        const heat = tires.heat[ i ];
        const wear = tires.wear[ i ];
        box.heatEl.textContent = heat.toFixed( 0 ) + '°';
        box.wearEl.textContent = ( wear * 100 ).toFixed( 0 ) + '%';
        box.el.style.background = _heatToColor( heat );

    }

}

// 4-line graph for per-tire metrics. Each tire has its own colour line.
function _sMultiGraph( panel, label, id, w, h, colors, legendLabels, min, max ) {

    const wrap = document.createElement( 'div' );
    wrap.style.cssText = 'margin-top:6px';

    const lab = document.createElement( 'div' );
    lab.style.cssText = 'font-size:10px;opacity:0.62;margin-bottom:2px;display:flex;justify-content:space-between;align-items:center';
    const labTitle = document.createElement( 'span' );
    labTitle.textContent = label;
    lab.appendChild( labTitle );

    // Tiny inline legend on the right of the header — 4 colour dots + labels.
    const legend = document.createElement( 'span' );
    legend.style.cssText = 'display:inline-flex;gap:6px';
    for ( let i = 0; i < colors.length; i ++ ) {

        const item = document.createElement( 'span' );
        item.style.cssText = 'display:inline-flex;align-items:center;gap:3px;opacity:0.85';
        const dot = document.createElement( 'span' );
        dot.style.cssText = `display:inline-block;width:7px;height:7px;border-radius:2px;background:${ colors[ i ] }`;
        item.appendChild( dot );
        const lbl = document.createElement( 'span' );
        lbl.textContent = legendLabels[ i ];
        lbl.style.fontSize = '9px';
        item.appendChild( lbl );
        legend.appendChild( item );

    }
    lab.appendChild( legend );

    wrap.appendChild( lab );

    const canvas = document.createElement( 'canvas' );
    canvas.width = w;
    canvas.height = h;
    canvas.style.cssText = `width:${ w }px;height:${ h }px;background:rgba(255,255,255,0.05);border-radius:3px;display:block`;
    wrap.appendChild( canvas );
    panel.appendChild( wrap );

    statsForNerds.graphs[ id ] = {
        canvas, ctx: canvas.getContext( '2d' ),
        buffers: colors.map( () => [] ),
        capacity: w, colors, min, max, multi: true
    };

}

function pushAndDrawMultiGraph( id, values ) {

    const g = statsForNerds.graphs[ id ];
    if ( ! g || ! g.multi ) return;
    for ( let i = 0; i < g.buffers.length; i ++ ) {

        g.buffers[ i ].push( values[ i ] );
        if ( g.buffers[ i ].length > g.capacity ) g.buffers[ i ].shift();

    }
    if ( ! statsForNerds.enabled ) return;

    const { ctx, canvas, buffers, colors, min, max } = g;
    const w = canvas.width;
    const hh = canvas.height;
    ctx.clearRect( 0, 0, w, hh );
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect( 0, hh - 1, w, 1 );

    ctx.lineWidth = 1.2;
    for ( let line = 0; line < buffers.length; line ++ ) {

        const buf = buffers[ line ];
        if ( buf.length === 0 ) continue;
        ctx.strokeStyle = colors[ line ];
        ctx.beginPath();
        for ( let i = 0; i < buf.length; i ++ ) {

            const x = w - buf.length + i;
            const t = ( buf[ i ] - min ) / ( max - min );
            const y = hh - Math.max( 0, Math.min( 1, t ) ) * hh;
            if ( i === 0 ) ctx.moveTo( x, y ); else ctx.lineTo( x, y );

        }
        ctx.stroke();

    }

}

// ---------------- joystick directional map ----------------
//
// Always-visible 110×110 widget pinned top-left. X axis = steering, Y axis =
// throttle (up) / brake (down). Two dots overlap: a faint dot for the raw
// merged input (pre-shape) and a bright dot for the shaped value that the
// physics actually uses. Useful for spotting controller drift, asymmetric
// inputs, and the steering curve's reshaping at a glance.

const joystickMap = {
    el: null,
    canvas: null,
    ctx: null,
    subEl: null
};

function initJoystickMap() {

    const wrap = document.createElement( 'div' );
    wrap.id = 'joystickMap';
    wrap.style.cssText = [
        'position:absolute', 'top:10px', 'left:10px',
        'padding:6px 7px 4px', 'background:rgba(0,0,0,0.55)',
        'border:1px solid rgba(255,255,255,0.18)', 'border-radius:6px',
        'color:#fff', 'font:10px Monospace', 'z-index:3',
        'box-shadow:0 4px 16px rgba(0,0,0,0.45)',
        'user-select:none', 'pointer-events:none',
        'display:flex', 'flex-direction:column', 'align-items:center'
    ].join( ';' );

    const label = document.createElement( 'div' );
    label.textContent = 'INPUT';
    label.style.cssText = 'letter-spacing:1.5px;opacity:0.7;margin-bottom:3px;font-size:9px';
    wrap.appendChild( label );

    const canvas = document.createElement( 'canvas' );
    canvas.width = 108;
    canvas.height = 108;
    canvas.style.cssText = 'display:block;background:rgba(255,255,255,0.04);border-radius:4px';
    wrap.appendChild( canvas );

    const sub = document.createElement( 'div' );
    sub.style.cssText = 'margin-top:3px;font-size:9px;opacity:0.7;font-variant-numeric:tabular-nums;letter-spacing:0.3px';
    sub.textContent = 'S 0.00 · T 0.00';
    wrap.appendChild( sub );

    document.body.appendChild( wrap );
    joystickMap.el = wrap;
    joystickMap.canvas = canvas;
    joystickMap.ctx = canvas.getContext( '2d' );
    joystickMap.subEl = sub;

}

function renderJoystickMap() {

    if ( ! joystickMap.ctx ) return;
    const ctx = joystickMap.ctx;
    const w = joystickMap.canvas.width;
    const h = joystickMap.canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = w * 0.5 - 6;

    ctx.clearRect( 0, 0, w, h );

    // Crosshair axes.
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo( 0, cy ); ctx.lineTo( w, cy );
    ctx.moveTo( cx, 0 ); ctx.lineTo( cx, h );
    ctx.stroke();

    // Outer ring + deadzone ring (matches steeringCfg.deadzone visually).
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.arc( cx, cy, r, 0, Math.PI * 2 );
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc( cx, cy, r * steeringCfg.deadzone, 0, Math.PI * 2 );
    ctx.stroke();

    // Vertical axis is throttle (up) and brake (down). We map their
    // difference so the dot sits at the dominant pedal — brake-only goes
    // down, throttle-only goes up, both pressed cancels toward center.
    const sx = cx + input.steer * r;
    const verticalAxis = input.throttle - input.brake;
    const sy = cy - verticalAxis * r;

    // Raw merged input (pre-shape) — faint dot. When the wheel curve is
    // softening the input, this dot sits further from center than the
    // bright one, making the curve visible at a glance.
    const rx = cx + input.steerRaw * r;
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.arc( rx, sy, 3, 0, Math.PI * 2 );
    ctx.fill();

    // Shaped input — bright dot + trail from center.
    ctx.strokeStyle = 'rgba(255,203,71,0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo( cx, cy );
    ctx.lineTo( sx, sy );
    ctx.stroke();
    ctx.fillStyle = '#FFCB47';
    ctx.beginPath();
    ctx.arc( sx, sy, 4.5, 0, Math.PI * 2 );
    ctx.fill();

    // Status badges — TC (red) when traction control is biting, HB (cyan)
    // when handbrake is pulled, REC + countdown when telemetry is recording.
    ctx.font = 'bold 9px Monospace';
    if ( drivetrain.tc.engaged ) {

        ctx.fillStyle = 'rgba(255,90,90,0.90)';
        ctx.textAlign = 'right';
        ctx.fillText( 'TC', w - 4, 11 );

    }
    if ( input.handbrake > 0.5 ) {

        ctx.fillStyle = 'rgba(120,200,255,0.90)';
        ctx.textAlign = 'left';
        ctx.fillText( 'HB', 4, 11 );

    }
    if ( telemetry.recording ) {

        const remaining = Math.max( 0, ( telemetry.startedAt + telemetry.durationMs - performance.now() ) / 1000 );
        ctx.fillStyle = 'rgba(255,90,90,0.95)';
        ctx.textAlign = 'left';
        ctx.fillText( `● REC ${ remaining.toFixed( 0 ) }s`, 4, h - 4 );

    }

    if ( joystickMap.subEl ) {

        joystickMap.subEl.textContent = `S ${ input.steerRaw.toFixed( 2 ) } · T ${ verticalAxis.toFixed( 2 ) }`;

    }

}

// ---------------- T-key telemetry recorder (Trackmania-style) ----------------
//
// Press T to capture 60 s of per-frame input + output vectors at ~60 Hz.
// At the end (or on second T press) the buffer is downloaded as a single
// JSON file with header metadata + a samples array. Designed for offline
// inspection / replay tooling, not for live broadcast.

function startTelemetryRecording() {

    telemetry.recording = true;
    telemetry.startedAt = performance.now();
    telemetry.lastSampleAt = 0;
    telemetry.samples = [];
    console.log( '[telemetry] recording started — 60s' );

}

function stopTelemetryRecording( download ) {

    if ( ! telemetry.recording ) return;
    telemetry.recording = false;
    const sampleCount = telemetry.samples.length;
    if ( ! download ) {

        console.log( `[telemetry] aborted (${ sampleCount } samples discarded)` );
        telemetry.samples = [];
        return;

    }
    const elapsedMs = performance.now() - telemetry.startedAt;
    const payload = {
        format: 'race_in_progress.telemetry.v1',
        recordedAt: new Date().toISOString(),
        car: currentCar.name,
        driveType: currentCar.driveType,
        map: currentMapId,
        durationMs: Math.round( elapsedMs ),
        sampleCount,
        steeringCfg: { ...steeringCfg },
        tcCfg: { ...tcCfg },
        samples: telemetry.samples
    };
    const blob = new Blob( [ JSON.stringify( payload ) ], { type: 'application/json' } );
    const url = URL.createObjectURL( blob );
    const a = document.createElement( 'a' );
    const stamp = new Date().toISOString().replace( /[:.]/g, '-' );
    a.href = url;
    a.download = `telemetry_${ currentCar.name.replace( /\s+/g, '' ) }_${ stamp }.json`;
    document.body.appendChild( a );
    a.click();
    document.body.removeChild( a );
    setTimeout( () => URL.revokeObjectURL( url ), 1000 );
    telemetry.lastDownloadedSize = blob.size;
    console.log( `[telemetry] recorded ${ sampleCount } samples (${ ( elapsedMs / 1000 ).toFixed( 1 ) } s, ${ ( blob.size / 1024 ).toFixed( 1 ) } KiB) → downloaded` );
    telemetry.samples = [];

}

function captureTelemetrySample( now ) {

    if ( ! telemetry.recording || ! chassis || ! vehicleController ) return;

    // Auto-stop at the 60 s mark.
    if ( now - telemetry.startedAt >= telemetry.durationMs ) {

        stopTelemetryRecording( true );
        return;

    }

    // Throttle to the nominal sample rate so we don't bloat the buffer on
    // high-refresh displays. At 60 Hz this still gives ~3600 samples / minute.
    const minIntervalMs = 1000 / telemetry.sampleHz;
    if ( telemetry.lastSampleAt && now - telemetry.lastSampleAt < minIntervalMs ) return;
    telemetry.lastSampleAt = now;

    const t = chassis.translation();
    const v = chassis.linvel();
    const av = chassis.angvel();
    const q = chassis.rotation();
    const wheels = [];
    for ( let i = 0; i < 4; i ++ ) {

        wheels.push( {
            slipR: tires.slipRatio[ i ],
            slipA: tires.slipAngle[ i ],
            fwdI: vehicleController.wheelForwardImpulse( i ),
            sideI: vehicleController.wheelSideImpulse( i ),
            engineF: vehicleController.wheelEngineForce( i ),
            brake: vehicleController.wheelBrake( i ),
            contact: vehicleController.wheelIsInContact( i ) ? 1 : 0
        } );

    }
    telemetry.samples.push( {
        t: Math.round( now - telemetry.startedAt ),
        input: {
            steerRaw: input.steerRaw,
            steer: input.steer,
            throttle: input.throttle,
            brake: input.brake,
            handbrake: input.handbrake,
            reverse: input.reverseEngaged ? 1 : 0
        },
        output: {
            steerTarget: steeringTelemetry.target,
            steerActual: steeringTelemetry.actual,
            speedMs: vehicleController.currentVehicleSpeed(),
            gear: transmission.gear,
            rpm: engine.rpm,
            tcCutPct: drivetrain.tc.cutPct,
            pos: [ t.x, t.y, t.z ],
            rot: [ q.x, q.y, q.z, q.w ],
            vel: [ v.x, v.y, v.z ],
            angVel: [ av.x, av.y, av.z ],
            wheels
        }
    } );

}

function initStatsForNerds() {

    // Toggle button — small pill below the three.js Stats overlay. Top is
    // set dynamically in _positionStatsBelowInfo() so it tracks #info's
    // height as that panel grows (volume slider, minimap toggle, etc.).
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

    // Panel. Anchored top-and-bottom so it always leaves room for the
    // speedometer / pos-pill at the bottom and content scrolls within.
    const panel = document.createElement( 'div' );
    panel.style.cssText = [
        'position:absolute', 'top:240px', 'right:10px', 'bottom:110px',
        'padding:10px 12px 12px', 'background:rgba(0,0,0,0.72)', 'color:#fff',
        'font:11px Monospace', 'border-radius:6px', 'z-index:3',
        'min-width:300px', 'max-width:340px', 'overflow-y:auto',
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
    _sStat( drive, 'steer (raw)', 's_steer_raw', 'pre-curve merged input from keyboard / gamepad / touch' );
    _sStat( drive, 'steer (shaped)', 's_steer', 'after deadzone + curve — drives the wheel target' );
    _sStat( drive, 'deadzone state', 's_deadzone', 'IN means raw input is inside the deadzone and snapped to 0' );
    _sStat( drive, 'handbrake', 's_handbrake' );
    _sStat( drive, 'reverse engaged', 's_reverse' );

    const steer = _sSection( panel, 'STEERING PIPELINE' );
    _sStat( steer, 'max angle', 's_maxAngle', 'speed-scaled mechanical max steering angle' );
    _sStat( steer, 'speed factor', 's_speedFactor', '1.0 at standstill, drops to minFactor at vReduceMax' );
    _sStat( steer, 'target angle', 's_steerTarget', 'desired wheel angle this frame' );
    _sStat( steer, 'actual angle', 's_steerActual', 'smoothed angle written to the controller' );
    _sStat( steer, 'residual drift', 's_residual', 'absolute wheel offset when input is centered (should be ≈0)' );
    _sStat( steer, 'curve · dz', 's_curveCfg', 'live curve exponent · deadzone' );
    _sMultiGraph( panel, 'steer', 'g_steer', 280, 36,
        [ '#FFFFFFAA', '#FFCB47', '#7BD37F' ],
        [ 'raw', 'shaped', 'actual' ],
        - 1.1, 1.1 );

    const tc = _sSection( panel, 'TRACTION CONTROL' );
    _sStat( tc, 'status', 's_tc_status', 'ON / OFF / ENGAGED — engaged is sticky for ~120ms' );
    _sStat( tc, 'cut %', 's_tc_cut', 'largest fractional torque cut across driven wheels this frame' );
    _sStat( tc, 'events', 's_tc_count', 'number of distinct TC engagements since session start' );
    _sStat( tc, 'thresholds', 's_tc_cfg', 'slip threshold · cut gain · min mult' );
    _sGraph( panel, 'TC cut %', 'g_tc', 280, 28, '#FF6464', 0, 1 );

    const rec = _sSection( panel, 'TELEMETRY RECORDER (T)' );
    _sStat( rec, 'state', 's_rec_state' );
    _sStat( rec, 'remaining', 's_rec_remaining' );
    _sStat( rec, 'samples', 's_rec_samples' );
    _sStat( rec, 'last dump', 's_rec_last' );

    const drv = _sSection( panel, 'DRIVETRAIN' );
    _sStat( drv, 'mode', 's_mode' );
    _sStat( drv, 'layout', 's_layout', 'drivetrain layout: FWD / RWD / AWD' );
    _sStat( drv, 'gear', 's_gear' );
    _sStat( drv, 'engine RPM', 's_rpm' );
    _sStat( drv, 'norm. torque', 's_torque', 'torque curve value at current RPM' );
    _sStat( drv, 'wheel engine F', 's_engineF', 'total engine force summed across all driven wheels' );
    _sStat( drv, 'clutch', 's_clutch', 'open during shifts / neutral, otherwise closed with slip torque' );
    _sStat( drv, 'axle bias', 's_lsdbias', 'engine force split front : rear (FWD=100:0, RWD=0:100, AWD≈50:50)' );
    _sStat( drv, 'speed', 's_speed' );

    _sGraph( panel, 'RPM', 'g_rpm', 280, 36, '#F5D04A', 0, 7500 );
    _sGraph( panel, 'speed (km/h)', 'g_speed', 280, 36, '#7BD37F', 0, 220 );

    const wh = _sSection( panel, 'WHEELS · FL · FR · RL · RR' );
    _sStat( wh, 'contact', 's_w_contact' );
    _sStat( wh, 'susp. len', 's_w_susp' );
    _sStat( wh, 'susp. force', 's_w_suspF' );
    _sStat( wh, 'fwd impulse', 's_w_fwdI' );
    _sStat( wh, 'side impulse', 's_w_sideI' );
    _sStat( wh, 'slip ratio', 's_w_slipR', 'longitudinal slip — peak grip near ±0.14' );
    _sStat( wh, 'slip angle °', 's_w_slipA', 'lateral slip in degrees — peak grip near ±7°' );
    _sStat( wh, 'grip mult', 's_w_gripm', 'pacejka × heat × pressure × wear' );
    _sStat( wh, 'pressure kPa', 's_w_press', 'cold 200 kPa → optimal 230 kPa' );
    _sStat( wh, 'carcass °C', 's_w_carc', 'slow thermal reservoir' );
    _sStat( wh, 'brake', 's_w_brake' );
    _sTireWidget( wh );

    const aero = _sSection( panel, 'AERO' );
    _sStat( aero, 'downforce N', 's_downf', 'Cl × v² applied -Y' );
    _sStat( aero, 'drag N', 's_drag', 'Cd × v² opposite velocity' );
    _sStat( aero, 'Cd · Cl', 's_aerocoef' );

    const susp = _sSection( panel, 'SUSPENSION GEOMETRY' );
    _sStat( susp, 'camber FL/FR/RL/RR', 's_camber' );
    _sStat( susp, 'toe FL/FR/RL/RR', 's_toe' );

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

function _positionStatsBelowInfo() {

    const infoEl = document.getElementById( 'info' );
    if ( ! infoEl || ! statsForNerds.toggleBtn ) return;
    const top = Math.round( infoEl.getBoundingClientRect().bottom + 10 ) + 'px';
    // setProperty with 'important' beats the mobile media query rule that
    // pins the toggle to top:175px.
    statsForNerds.toggleBtn.style.setProperty( 'top', top, 'important' );
    if ( statsForNerds.panel ) statsForNerds.panel.style.setProperty( 'top', top, 'important' );

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
    // Steering pipeline + TC traces always log so the graph carries history.
    // Normalize the actual wheel angle by the per-car mechanical max so
    // raw / shaped / actual all share the same -1..+1 axis.
    const carMax = currentCar ? currentCar.maxSteeringAngle : 1;
    pushAndDrawMultiGraph( 'g_steer', [
        input.steerRaw,
        input.steer,
        carMax > 0 ? steeringTelemetry.actual / carMax : 0
    ] );
    pushAndDrawGraph( 'g_tc', drivetrain.tc.cutPct );
    updateTireWidget();

    if ( ! statsForNerds.enabled || ! chassis ) return;

    _sset( 's_throttle', input.throttle.toFixed( 2 ) );
    _sset( 's_brake', input.brake.toFixed( 2 ) );
    _sset( 's_steer_raw', input.steerRaw.toFixed( 3 ) );
    _sset( 's_steer', input.steer.toFixed( 3 ) );
    const inDeadzone = Math.abs( input.steerRaw ) > 0 && Math.abs( input.steerRaw ) <= steeringCfg.deadzone;
    _sset( 's_deadzone', inDeadzone ? 'IN (snapped)' : ( input.steerRaw === 0 ? '—' : 'out' ) );
    _sset( 's_handbrake', input.handbrake.toFixed( 2 ) );
    _sset( 's_reverse', input.reverseEngaged ? 'YES' : 'no' );

    // Steering pipeline diagnostics.
    _sset( 's_maxAngle', `${ ( steeringTelemetry.maxAngle * 180 / Math.PI ).toFixed( 1 ) }°` );
    _sset( 's_speedFactor', steeringTelemetry.speedFactor.toFixed( 2 ) );
    _sset( 's_steerTarget', `${ ( steeringTelemetry.target * 180 / Math.PI ).toFixed( 1 ) }°` );
    _sset( 's_steerActual', `${ ( steeringTelemetry.actual * 180 / Math.PI ).toFixed( 1 ) }°` );
    // Residual drift: how far the wheel is from 0 when the input is centered.
    // Anything below ~0.05° is effectively zero; we colour the value if it lingers.
    const residualDeg = input.steerRaw === 0 ? Math.abs( steeringTelemetry.actual * 180 / Math.PI ) : 0;
    _sset( 's_residual', input.steerRaw === 0 ? `${ residualDeg.toFixed( 3 ) }°` : '— (input active)' );
    _sset( 's_curveCfg', `${ steeringCfg.curveExponent.toFixed( 2 ) } · ${ steeringCfg.deadzone.toFixed( 3 ) }` );

    // Traction control diagnostics.
    const tcStatus = ! tcCfg.enabled ? 'OFF'
        : drivetrain.tc.engaged ? 'ENGAGED'
        : 'armed';
    _sset( 's_tc_status', tcStatus );
    _sset( 's_tc_cut', `${ ( drivetrain.tc.cutPct * 100 ).toFixed( 1 ) }%` );
    _sset( 's_tc_count', String( drivetrain.tc.eventCount ) );
    _sset( 's_tc_cfg', `${ tcCfg.slipThreshold.toFixed( 2 ) } · ${ tcCfg.cutGain.toFixed( 1 ) } · ${ tcCfg.minMult.toFixed( 2 ) }` );

    // Telemetry recorder.
    if ( telemetry.recording ) {

        const remaining = Math.max( 0, ( telemetry.startedAt + telemetry.durationMs - performance.now() ) / 1000 );
        _sset( 's_rec_state', '● RECORDING' );
        _sset( 's_rec_remaining', `${ remaining.toFixed( 1 ) } s` );

    } else {

        _sset( 's_rec_state', 'idle (press T)' );
        _sset( 's_rec_remaining', '—' );

    }
    _sset( 's_rec_samples', telemetry.samples.length.toString() );
    _sset( 's_rec_last', telemetry.lastDownloadedSize > 0
        ? `${ ( telemetry.lastDownloadedSize / 1024 ).toFixed( 1 ) } KiB`
        : '—' );

    _sset( 's_mode', transmission.mode.toUpperCase() );
    _sset( 's_layout', currentCar.driveType || 'FWD' );
    const g = transmission.gear;
    _sset( 's_gear', g === - 1 ? 'R' : g === 0 ? 'N' : g.toString() );
    _sset( 's_rpm', engine.rpm.toFixed( 0 ) );
    _sset( 's_torque', torqueAt( engine.rpm ).toFixed( 3 ) );
    // Total chassis engine force = sum across all wheels (zero on non-driven).
    let eTotal = 0;
    for ( let i = 0; i < 4; i ++ ) eTotal += Math.abs( vehicleController.wheelEngineForce( i ) );
    _sset( 's_engineF', eTotal.toFixed( 1 ) + ' N' );
    _sset( 's_speed', `${ ( Math.abs( speed ) * 3.6 ).toFixed( 1 ) } km/h · ${ Math.abs( speed ).toFixed( 2 ) } m/s` );

    // Clutch state + per-axle bias (display only — we use an even AWD split,
    // so AWD will show roughly 50:50 front:rear; FWD = 100:0, RWD = 0:100).
    _sset( 's_clutch', drivetrain.clutchOpen ? 'OPEN' : `slip ${ drivetrain.clutchTorque.toFixed( 1 ) }` );
    const eFront = Math.abs( vehicleController.wheelEngineForce( 0 ) ) + Math.abs( vehicleController.wheelEngineForce( 1 ) );
    const eRear  = Math.abs( vehicleController.wheelEngineForce( 2 ) ) + Math.abs( vehicleController.wheelEngineForce( 3 ) );
    const eAxle = Math.max( 0.01, eFront + eRear );
    _sset( 's_lsdbias', `F ${ ( eFront / eAxle * 100 ).toFixed( 0 ) } : R ${ ( eRear / eAxle * 100 ).toFixed( 0 ) }` );

    // Wheels — FL=0, FR=1, RL=2, RR=3 in our addWheel order.
    const wContact = [], wSusp = [], wSuspF = [], wFwdI = [], wSideI = [], wBrake = [];
    const wSlipR = [], wSlipA = [], wGripM = [], wPress = [], wCarc = [];
    for ( let i = 0; i < 4; i ++ ) {

        wContact.push( vehicleController.wheelIsInContact( i ) ? '✓' : '·' );
        wSusp.push( vehicleController.wheelSuspensionLength( i ).toFixed( 2 ) );
        wSuspF.push( vehicleController.wheelSuspensionForce( i ).toFixed( 0 ) );
        wFwdI.push( vehicleController.wheelForwardImpulse( i ).toFixed( 1 ) );
        wSideI.push( vehicleController.wheelSideImpulse( i ).toFixed( 1 ) );
        wBrake.push( vehicleController.wheelBrake( i ).toFixed( 2 ) );
        wSlipR.push( tires.slipRatio[ i ].toFixed( 2 ) );
        wSlipA.push( ( tires.slipAngle[ i ] * 180 / Math.PI ).toFixed( 1 ) );
        wGripM.push( tires.gripMult[ i ].toFixed( 2 ) );
        wPress.push( tires.pressure[ i ].toFixed( 0 ) );
        wCarc.push( tires.carcass[ i ].toFixed( 0 ) );

    }
    _sset( 's_w_contact', wContact.join( ' · ' ) );
    _sset( 's_w_susp', wSusp.join( ' · ' ) );
    _sset( 's_w_suspF', wSuspF.join( ' · ' ) );
    _sset( 's_w_fwdI', wFwdI.join( ' · ' ) );
    _sset( 's_w_sideI', wSideI.join( ' · ' ) );
    _sset( 's_w_slipR', wSlipR.join( ' · ' ) );
    _sset( 's_w_slipA', wSlipA.join( ' · ' ) );
    _sset( 's_w_gripm', wGripM.join( ' · ' ) );
    _sset( 's_w_press', wPress.join( ' · ' ) );
    _sset( 's_w_carc', wCarc.join( ' · ' ) );
    _sset( 's_w_brake', wBrake.join( ' · ' ) );

    // Aero + suspension geometry.
    const linv = chassis.linvel();
    const speed2 = linv.x * linv.x + linv.y * linv.y + linv.z * linv.z;
    const cd = currentCar.Cd || 0;
    const cl = currentCar.Cl || 0;
    _sset( 's_downf', ( cl * speed2 ).toFixed( 0 ) + ' N' );
    _sset( 's_drag', ( cd * speed2 ).toFixed( 0 ) + ' N' );
    _sset( 's_aerocoef', `${ cd.toFixed( 4 ) } · ${ cl.toFixed( 4 ) }` );
    const cm = currentCar.camberDeg || [ 0, 0, 0, 0 ];
    const tt = currentCar.toeDeg || [ 0, 0, 0, 0 ];
    _sset( 's_camber', cm.map( v => v.toFixed( 1 ) + '°' ).join( ' · ' ) );
    _sset( 's_toe', tt.map( v => v.toFixed( 2 ) + '°' ).join( ' · ' ) );

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

// Tag a taillight so the per-frame brake-light updater can find it. When
// `isReverse` is true we ALSO clone the material so we can swap that one
// taillight's colour to white in reverse without affecting the other.
function _addTaillight( parent, geom, mat, pos, isReverse ) {

    const material = isReverse ? mat.clone() : mat;
    const m = _addCarMesh( parent, geom, material, pos );
    m.userData.taillight = true;
    m.userData.baseEmissiveIntensity = material.emissiveIntensity;
    if ( isReverse ) {

        m.userData.reverseLight = true;
        m.userData.baseColor = material.color.getHex();
        m.userData.baseEmissiveColor = material.emissive.getHex();

    }
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
        _addTaillight( parent, _visLightGeom, taillightMat, [ x, - 0.02, 1.86 ], true );

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
        _addTaillight( parent, _visLightGeom, taillightMat, [ x, 0.05, 1.86 ], true );

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
        _addTaillight( parent, new THREE.BoxGeometry( 0.6, 0.1, 0.08 ), taillightMat, [ x, 0.05, 1.86 ], true );

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
        _addTaillight( parent, _visLightGeom, taillightMat, [ x, 0.1, 1.86 ], true );

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
        _addTaillight( parent, new THREE.BoxGeometry( 0.45, 0.1, 0.08 ), taillightMat, [ x, 0, 1.86 ], true );

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
    _addTaillight( parent, new THREE.BoxGeometry( 0.18, 0.18, 0.08 ), taillightMat, [ 0, 0.1, 1.86 ], true );

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
        _addTaillight( parent, _visLightGeom, taillightMat, [ x, 0, 1.86 ], true );

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

// Shape the merged steer input through deadzone → curve. Returns a value in
// [-1, 1]. The deadzone snaps small residual values (controller drift,
// floating-point noise from max-merging across sources) to exactly 0, fixing
// the "driving straight feels like it's drifting" problem visible on the
// joystick-map widget. The exponent flattens the response near center so
// fine corrections at speed aren't twitchy, while still reaching ±1 at full
// stick deflection.
function shapeSteer( raw ) {

    const a = Math.abs( raw );
    if ( a <= steeringCfg.deadzone ) return 0;
    const remapped = ( a - steeringCfg.deadzone ) / ( 1 - steeringCfg.deadzone );
    const curved = Math.pow( remapped, steeringCfg.curveExponent );
    return Math.sign( raw ) * curved;

}

// Scale the per-car mechanical maximum steering angle by speed so the car
// can't be ripped sideways at 200 km/h. Returns [minFactor, 1] — at
// standstill we get full lock, then it ramps down to minFactor at vReduceMax.
function steeringSpeedFactor( speed ) {

    const t = Math.min( 1, Math.abs( speed ) / steeringCfg.vReduceMax );
    return THREE.MathUtils.lerp( 1, steeringCfg.minFactor, t );

}

// Per-driven-wheel traction-control multiplier. Returns 1.0 when slip is in
// the safe range, then ramps down toward `minMult` as slip exceeds the
// threshold. Side-effect: bumps the drivetrain.tc telemetry so the stats
// panel can show when TC engaged.
function tractionCutFactor( slipRatio, speed ) {

    if ( ! tcCfg.enabled ) return 1;
    if ( Math.abs( speed ) < tcCfg.minActiveSpeed ) return 1;
    const excess = Math.abs( slipRatio ) - tcCfg.slipThreshold;
    if ( excess <= 0 ) return 1;
    return Math.max( tcCfg.minMult, 1 - excess * tcCfg.cutGain );

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
    const back = pad.buttons[ 8 ] && pad.buttons[ 8 ].pressed; // Back / Select / Share — cycle car
    const start = pad.buttons[ 9 ] && pad.buttons[ 9 ].pressed; // reset
    const dUp = pad.buttons[ 12 ] && pad.buttons[ 12 ].pressed; // D-pad up — stats for nerds
    const dLeft = pad.buttons[ 14 ] && pad.buttons[ 14 ].pressed; // D-pad left — minimap
    const dRight = pad.buttons[ 15 ] && pad.buttons[ 15 ].pressed; // D-pad right — cycle map

    if ( rb && ! prev[ 5 ] && transmission.mode === 'manual' ) manualShift( 1 );
    if ( lb && ! prev[ 4 ] && transmission.mode === 'manual' ) manualShift( - 1 );
    if ( x && ! prev[ 2 ] ) toggleTransmissionMode();
    if ( y && ! prev[ 3 ] ) cycleCameraMode();
    if ( back && ! prev[ 8 ] ) cycleCar( 1 );
    if ( dUp && ! prev[ 12 ] ) toggleStatsForNerds();
    if ( dLeft && ! prev[ 14 ] ) toggleMinimap();
    if ( dRight && ! prev[ 15 ] ) swapMap( currentMapId === 'nurburgring' ? 'nurburgring_gp' : 'nurburgring' );
    if ( start && ! prev[ 9 ] ) input.keyR = true; else if ( ! start && prev[ 9 ] ) input.keyR = false;

    // Any gamepad button press counts as a user gesture in modern browsers,
    // so we can also unlock audio from here — handy for players who jump
    // straight into driving with a controller and never touch the keyboard.
    if ( ! audio.started ) {

        for ( let i = 0; i < pad.buttons.length; i ++ ) {

            if ( pad.buttons[ i ] && pad.buttons[ i ].pressed ) { startAudio(); break; }

        }

    }

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

    // Capture the raw (pre-shape) merged steer so the joystick-map widget +
    // telemetry can show what the driver actually requested. The curve below
    // shapes the steer that the *physics* uses — small inputs become smaller
    // (softer near center) and a 4.5% deadzone snaps residual drift to 0 so
    // the car tracks straight when no one is touching the wheel.
    input.steerRaw = THREE.MathUtils.clamp( steer, - 1, 1 );
    input.steer = shapeSteer( input.steerRaw );
    input.throttle = throttle;
    input.brake = brake;
    input.handbrake = handbrake;
    input.reset = input.keyR;

    // Post-R handbrake lock — set by the reset block in applyVehicleForces.
    // Released the moment the player actually inputs anything (key, gamepad,
    // or touch). Until then we force handbrake = 1 so the chassis can't roll.
    if ( input.handbrakeAfterReset ) {

        if ( _anyInputActive() ) input.handbrakeAfterReset = false;
        else input.handbrake = 1;

    }

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

function applyVehicleForces( speed, dt ) {

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
        input.handbrakeAfterReset = true;
        chaseCam.initialized = false;
        resetTires();
        resetDrivetrain();
        clearSkidMarks();
        lapTimerResetCurrent();
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

    // Direct engine-force model (reverted from the clutch+flywheel drivetrain
    // because the clutch's engine-braking force was overpowering the tire
    // friction limit, locking the wheels at cruise and crashing the Pacejka
    // grip multiplier into a feedback loop). The clutch state used by the
    // stats panel is kept for telemetry but is now a thin signal.
    let engineForce = 0;
    if ( ratio !== 0 && throttleEffective > 0 ) {

        const torque = torqueAt( engine.rpm );
        const magnitude = throttleEffective * torque * currentCar.maxEngineForce;
        engineForce = - magnitude * Math.sign( ratio );

    }
    // Route engine force to the correct wheels for FWD/RWD/AWD. The original
    // tuning was 2 wheels × engineForce → 2·engineForce total chassis force.
    // Distribute the *same total* across however many driven wheels this car
    // has, so swapping driveType doesn't change acceleration: each driven
    // wheel gets (2·engineForce) / N. AWD therefore puts 50 % torque on each
    // wheel (even split, simple center "diff").
    const driven = drivenWheelIndices( currentCar.driveType );
    const perDriven = ( 2 * engineForce ) / driven.length;
    // Traction control: trim per-wheel torque whenever its slip ratio is
    // past the peak-grip threshold. Track the largest cut for the stats panel
    // and latch an "engaged" indicator for ~120ms so the UI light is readable.
    let frameMaxCut = 0;
    for ( let i = 0; i < 4; i ++ ) {

        const isDriven = driven.indexOf( i ) >= 0;
        if ( ! isDriven ) {

            vehicleController.setWheelEngineForce( i, 0 );
            continue;

        }
        const tcMult = tractionCutFactor( tires.slipRatio[ i ], speed );
        const cut = 1 - tcMult;
        if ( cut > frameMaxCut ) frameMaxCut = cut;
        vehicleController.setWheelEngineForce( i, perDriven * tcMult );

    }
    drivetrain.tc.cutPct = frameMaxCut;
    if ( frameMaxCut > 0.02 ) {

        if ( ! drivetrain.tc.engaged ) drivetrain.tc.eventCount += 1;
        drivetrain.tc.engaged = true;
        drivetrain.tc.engagedUntil = performance.now() + 120;

    } else if ( performance.now() > drivetrain.tc.engagedUntil ) {

        drivetrain.tc.engaged = false;

    }

    // Light cosmetic clutch state for the stats display.
    drivetrain.clutchOpen = transmission.shiftCooldown > 0 || ratio === 0;
    drivetrain.clutchTorque = drivetrain.clutchOpen ? 0 : engineForce;

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

    // STEERING — non-linear curve (in shapeSteer), speed-scaled mechanical
    // max, and dt-aware smoothing. Toe stays baked in as the *resting*
    // steering angle; driver input lerps an offset on top.
    const toe = currentCar.toeDeg || [ 0, 0, 0, 0 ];
    const toeFL = toe[ 0 ] * _DEG;
    const toeFR = toe[ 1 ] * _DEG;
    // Read current driver-steering offset by subtracting the toe contribution
    // off the wheel. Both front wheels share the same driver offset.
    const currentOffset = vehicleController.wheelSteering( 0 ) - toeFL;
    const speedFactor = steeringSpeedFactor( speed );
    const maxAngle = currentCar.maxSteeringAngle * speedFactor;
    const target = maxAngle * input.steer;
    // Return-to-center is faster than steer-in so the wheels actually settle
    // when input goes to 0 instead of asymptotically lingering off-axis.
    const returning = Math.abs( target ) < Math.abs( currentOffset );
    const rate = returning ? steeringCfg.smoothReturnRate : steeringCfg.smoothInRate;
    const alpha = 1 - Math.exp( - rate * dt );
    let steering = THREE.MathUtils.lerp( currentOffset, target, alpha );
    // Snap to zero when the input is centered and we're inside the
    // numerical noise floor. Catches the long tail of the exponential decay
    // — without this, the wheels never quite reach 0 and the chassis drifts.
    if ( input.steer === 0 && Math.abs( steering ) < steeringCfg.zeroSnapRad ) steering = 0;
    // Telemetry for the joystick map + stats panel.
    steeringTelemetry.target = target;
    steeringTelemetry.actual = steering;
    steeringTelemetry.maxAngle = maxAngle;
    steeringTelemetry.speedFactor = speedFactor;
    vehicleController.setWheelSteering( 0, toeFL + steering );
    vehicleController.setWheelSteering( 1, toeFR + steering );

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

        // Engine RPM is computed kinematically from wheel speed × gear ratio
        // × final drive. Smoothed slightly so gear shifts don't snap the gauge.
        const targetRpm = computeRpm( speed, transmission.gear );
        const rpmAlpha = 1 - Math.exp( - 12 * delta );
        engine.rpm += ( targetRpm - engine.rpm ) * rpmAlpha;

        updateTransmission( delta, speed );

        // Writes that the upcoming physics step will consume: engine force,
        // brakes, steering, and chassis aero impulse.
        applyVehicleForces( speed, delta );
        updateAerodynamics( delta );

        // updateVehicle applies suspension/engine forces TO the chassis body,
        // then world.step integrates one timestep with the same dt.
        vehicleController.updateVehicle( delta );
        physics.step( delta );

        // POST-STEP: read fresh sensor data (impulses, suspension force, wheel
        // angular position) and write friction values for the NEXT frame.
        updateSuspensionGeometry();
        updateTires( delta );

        updateWheels();
        updateSpeedometer( speed );
        updateBrakeLights();
        updateSkidMarks();

        statsForNerds.lastDelta = delta;
        updateStatsForNerds( speed );
        renderJoystickMap();
        captureTelemetrySample( performance.now() );

        updateAudio( delta );

        updateLapTimer();

        _maybeBroadcastSnapshot( performance.now() );

    }

    _updateRemoteCars( delta );
    _tickRace();

    if ( cameraMode === 'chase' ) {

        updateChaseCamera( delta );

    } else if ( cameraMode === 'pov' ) {

        updatePovCamera();

    } else if ( controls && car ) { // free

        controls.target.copy( car.position );
        controls.update();

    }

    // Steering wheel mesh tracks the front tyre steer angle every frame,
    // regardless of camera mode (so it animates the same in chase / free / pov).
    if ( steeringWheelMesh && vehicleController ) {

        const cockpit = COCKPITS[ currentCar.name ];
        if ( cockpit ) {

            steeringWheelMesh.rotation.z = - vehicleController.wheelSteering( 0 ) * cockpit.wheelRotationMultiplier;

        }

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
