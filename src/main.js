import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
const engine = {
    rpm: 900,
    idleRpm: 900,
    redline: 7500,
    autoUpshiftRpm: 6200,
    autoDownshiftRpm: 2300
};

// Gear ratios indexed by gear number (key is gear number).
// Reverse = -3.4, neutral = 0, 5 forward gears tuned for a hot hatch.
const GEAR_RATIOS = { '-1': - 3.4, '0': 0, '1': 3.5, '2': 2.1, '3': 1.4, '4': 1.0, '5': 0.78 };
const FINAL_DRIVE = 3.6;
const WHEEL_RADIUS = 0.3;
const MAX_ENGINE_FORCE = 60; // peak force we'll apply to a single drive wheel
const MAX_BRAKE_FORCE = 1.2;

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
const sunOffset = new THREE.Vector3( 60, 120, 60 );

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
    scene.background = new THREE.Color( 0xbfd1e5 );

    // Far plane bumped from 200 → 12000 because the track is ~6km across.
    camera = new THREE.PerspectiveCamera( chaseCam.baseFov, window.innerWidth / window.innerHeight, 0.1, 12000 );
    camera.position.set( 0, 4, 10 );

    const ambient = new THREE.HemisphereLight( 0x555555, 0xFFFFFF );
    scene.add( ambient );

    sunLight = new THREE.DirectionalLight( 0xffffff, 4 );
    sunLight.position.copy( sunOffset );
    sunLight.castShadow = true;
    // Note: `shadow.radius` and `shadow.blurSamples` only apply to VSMShadowMap.
    // Under the default PCFShadowMap they were dead code, so dropped.
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;

    // Tight shadow frustum: ~120m wide around the car. We move the light + target
    // with the car every frame so shadows stay sharp anywhere on the 6km track.
    // Tight near/far bracket the actual caster (the car) for better depth precision.
    const shadowSize = 60;
    sunLight.shadow.camera.left = - shadowSize;
    sunLight.shadow.camera.bottom = - shadowSize;
    sunLight.shadow.camera.right = shadowSize;
    sunLight.shadow.camera.top = shadowSize;
    sunLight.shadow.camera.near = 80;
    sunLight.shadow.camera.far = 220;
    sunLight.shadow.bias = - 0.0005;
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
        console.log( '[gamepad] connected:', e.gamepad.id );

    } );

    window.addEventListener( 'gamepaddisconnected', ( e ) => {

        if ( e.gamepad.index === gamepad.index ) {

            gamepad.index = - 1;
            gamepad.id = '';
            if ( speedoControllerEl ) speedoControllerEl.style.display = 'none';

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
    const margin = 75; // ±60m shadow extent + small slack

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

    physics.addMesh( mesh, 10, 0.8 );
    chassis = mesh.userData.physics.body;
    chassis.setRotation( new physics.RAPIER.Quaternion( spawnQuaternion.x, spawnQuaternion.y, spawnQuaternion.z, spawnQuaternion.w ), true );

    buildCarVisuals( mesh );

    vehicleController = physics.world.createVehicleController( chassis );

    wheels = [];

    addWheel( 0, { x: - 1, y: - 0.3, z: - 1.5 }, mesh );
    addWheel( 1, { x: 1, y: - 0.3, z: - 1.5 }, mesh );
    addWheel( 2, { x: - 1, y: - 0.3, z: 1.5 }, mesh );
    addWheel( 3, { x: 1, y: - 0.3, z: 1.5 }, mesh );

    vehicleController.setWheelSteering( 0, Math.PI / 4 );
    vehicleController.setWheelSteering( 1, Math.PI / 4 );

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
        'position:absolute', 'top:200px', 'right:10px',
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
        'position:absolute', 'top:200px', 'right:10px',
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

function buildCarVisuals( chassisMesh ) {

    // Yellow body + dark cabin + tiny headlight/taillight boxes. Six draw calls
    // total. Forward of the car is -Z (matches the front-wheel steering setup).
    const bodyMat = new THREE.MeshStandardMaterial( { color: 0xFFCB47, roughness: 0.55, metalness: 0.15 } );
    const cabinMat = new THREE.MeshStandardMaterial( { color: 0x202830, roughness: 0.3, metalness: 0.4 } );
    const headlightMat = new THREE.MeshStandardMaterial( { color: 0xFFEEB0, emissive: 0xFFCC55, emissiveIntensity: 0.6, roughness: 0.3 } );
    const taillightMat = new THREE.MeshStandardMaterial( { color: 0xCC1818, emissive: 0xFF2222, emissiveIntensity: 0.7, roughness: 0.3 } );

    // Body now extends almost all the way down to the chassis floor so the
    // wheels poke up into the body sides (wheel-arch look) instead of dangling
    // in mid-air below it.
    const body = new THREE.Mesh( new THREE.BoxGeometry( 1.85, 0.7, 3.7 ), bodyMat );
    body.position.y = - 0.15;
    body.castShadow = true;
    body.receiveShadow = true;
    chassisMesh.add( body );

    const cabin = new THREE.Mesh( new THREE.BoxGeometry( 1.55, 0.5, 1.9 ), cabinMat );
    cabin.position.set( 0, 0.45, 0.05 );
    cabin.castShadow = true;
    chassisMesh.add( cabin );

    const lightGeom = new THREE.BoxGeometry( 0.35, 0.18, 0.08 );

    for ( const x of [ - 0.6, 0.6 ] ) {

        const head = new THREE.Mesh( lightGeom, headlightMat );
        head.position.set( x, - 0.08, - 1.86 );
        chassisMesh.add( head );

        const tail = new THREE.Mesh( lightGeom, taillightMat );
        tail.position.set( x, - 0.02, 1.86 );
        chassisMesh.add( tail );

    }

}

function addWheel( index, pos, carMesh ) {

    const wheelRadius = 0.3;
    const wheelWidth = 0.4;
    // Was 0.8 — the long spring let wheels dangle visibly below the body. With
    // 0.4 the wheels stay tucked up in the wheel wells. Stiffness unchanged so
    // ride/handling feel is the same.
    const suspensionRestLength = 0.4;
    const wheelDirection = { x: 0.0, y: - 1.0, z: 0.0 };
    const wheelAxle = { x: - 1.0, y: 0.0, z: 0.0 };

    vehicleController.addWheel(
        pos,
        wheelDirection,
        wheelAxle,
        suspensionRestLength,
        wheelRadius
    );

    vehicleController.setWheelSuspensionStiffness( index, 24.0 );
    // Moderate damping — enough to kill the violent flicker on the trimesh
    // track without flattening the suspension into a rigid stick. Spring bounce
    // is preserved so the simulation still feels alive.
    vehicleController.setWheelSuspensionCompression( index, 2.0 );
    vehicleController.setWheelSuspensionRelaxation( index, 2.4 );
    vehicleController.setWheelFrictionSlip( index, 2.0 );
    vehicleController.setWheelSteering( index, pos.z < 0 );

    const geometry = new THREE.CylinderGeometry( wheelRadius, wheelRadius, wheelWidth, 16 );
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

    input.steer = steer;
    input.throttle = throttle;
    input.brake = brake;
    input.handbrake = handbrake;
    input.reset = input.keyR;

    // Long-press reverse: ONLY S / ↓ trigger this — Space is a pure brake.
    // Also requires the car to be essentially stopped.
    const speed = vehicleController ? Math.abs( vehicleController.currentVehicleSpeed() ) : 0;
    const reverseTrigger = ( input.keyS || input.arrowDown ) ? 1 : 0;
    if ( reverseTrigger > 0.5 && speed < 0.6 ) {

        input.sHeldTime += dt;
        if ( input.sHeldTime > 0.3 ) input.reverseEngaged = true;

    } else if ( reverseTrigger < 0.1 ) {

        input.sHeldTime = 0;
        if ( throttle > 0.1 && transmission.mode === 'auto' ) input.reverseEngaged = false;

    }

}

function gearRatio( gear ) {

    return GEAR_RATIOS[ gear.toString() ] || 0;

}

function manualShift( direction ) {

    if ( transmission.shiftCooldown > 0 ) return;
    const next = transmission.gear + direction;
    if ( next < - 1 || next > 5 ) return;
    transmission.gear = next;
    transmission.shiftCooldown = 0.15;

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
    const rpm = wheelRpm * Math.abs( ratio ) * FINAL_DRIVE;
    return Math.max( engine.idleRpm, rpm );

}

// Bell-shaped torque curve, normalized to [0,1]. Peak around 4500 RPM,
// limits past redline.
function torqueAt( rpm ) {

    if ( rpm >= engine.redline ) return 0.15; // rev limiter cut
    const x = ( rpm - 4500 ) / 2400;
    return Math.max( 0.18, Math.exp( - x * x ) );

}

function updateTransmission( dt, speed ) {

    if ( transmission.shiftCooldown > 0 ) transmission.shiftCooldown -= dt;

    if ( transmission.mode === 'manual' ) return; // user shifts in manual

    // Auto reverse handling.
    if ( input.reverseEngaged && transmission.gear !== - 1 ) {

        transmission.gear = - 1;
        transmission.shiftCooldown = 0.2;
        return;

    }
    if ( ! input.reverseEngaged && transmission.gear === - 1 && input.throttle > 0.1 ) {

        transmission.gear = 1;
        transmission.shiftCooldown = 0.2;
        return;

    }

    if ( transmission.shiftCooldown > 0 ) return;

    // From a standing start, auto shifts into 1st when throttle is pressed.
    if ( transmission.gear === 0 && input.throttle > 0.05 ) {

        transmission.gear = 1;
        transmission.shiftCooldown = 0.15;
        return;

    }

    // Upshift when RPM crosses threshold and we're under throttle.
    if ( transmission.gear >= 1 && transmission.gear < 5 && engine.rpm > engine.autoUpshiftRpm && input.throttle > 0.4 ) {

        transmission.gear += 1;
        transmission.shiftCooldown = 0.25;
        return;

    }

    // Downshift on low RPM.
    if ( transmission.gear > 1 && engine.rpm < engine.autoDownshiftRpm ) {

        transmission.gear -= 1;
        transmission.shiftCooldown = 0.25;

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
        const magnitude = throttleEffective * torque * MAX_ENGINE_FORCE;
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
        serviceBrake = input.brake * MAX_BRAKE_FORCE;

    }
    const handbrake = input.handbrake * MAX_BRAKE_FORCE * 1.6;

    // Service brake on all 4, handbrake biased to rear wheels (indices 2,3).
    vehicleController.setWheelBrake( 0, serviceBrake );
    vehicleController.setWheelBrake( 1, serviceBrake );
    vehicleController.setWheelBrake( 2, Math.max( serviceBrake, handbrake ) );
    vehicleController.setWheelBrake( 3, Math.max( serviceBrake, handbrake ) );

    // STEERING — smoothed.
    const currentSteering = vehicleController.wheelSteering( 0 );
    const steerAngle = Math.PI / 4;
    const steering = THREE.MathUtils.lerp( currentSteering, steerAngle * input.steer, 0.25 );
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

    stats.update();

}
