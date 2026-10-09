import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';

const CELL = 2;
const MAJOR_EVERY = 4;
const GRID_SIZE = 260;
const VIEW_DISTANCE = 110;
const TRAIL_CORNERS = 40;
const TRAIL_LENGTH = 70;
const WALL_HEIGHT = 0.85;
const REBASE_DISTANCE = 2000;

const CYAN = new THREE.Color('#00f3ff');
const ORANGE = new THREE.Color('#ff8c00');

const FORWARD = 0;
const LEFT = 1;
const RIGHT = 2;
const DIRECTIONS = [[0, -1], [-1, 0], [1, 0]];

const lerp = (a, b, t) => a + (b - a) * t;
const snap = (value, step) => Math.round(value / step) * step;

// The grid is drawn entirely in the fragment shader from world-space coordinates,
// so the plane can follow the camera forever without the lines ever sliding.
function createGrid() {
    const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            uColor: { value: CYAN.clone() },
            uCamera: { value: new THREE.Vector3() },
            uCell: { value: CELL },
            uMajor: { value: CELL * MAJOR_EVERY },
            uFar: { value: VIEW_DISTANCE },
        },
        vertexShader: /* glsl */ `
            varying vec3 vWorld;
            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                vWorld = world.xyz;
                gl_Position = projectionMatrix * viewMatrix * world;
            }
        `,
        fragmentShader: /* glsl */ `
            uniform vec3 uColor;
            uniform vec3 uCamera;
            uniform float uCell;
            uniform float uMajor;
            uniform float uFar;
            varying vec3 vWorld;

            // Distance to the nearest line in screen pixels, so lines stay one pixel wide at any depth.
            float lineMask(vec2 coord, float width) {
                vec2 pixels = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
                return 1.0 - clamp(min(pixels.x, pixels.y) - width + 1.0, 0.0, 1.0);
            }

            void main() {
                vec2 p = vWorld.xz;
                float minor = lineMask(p / uCell, 1.0);
                float major = lineMask(p / uMajor, 1.6);
                float distanceToCamera = length(p - uCamera.xz);
                float fade = 1.0 - smoothstep(uFar * 0.2, uFar, distanceToCamera);
                float intensity = (minor * 0.45 + major * 0.9) * fade;
                gl_FragColor = vec4(uColor * (0.6 + major * 0.8), intensity);
            }
        `,
    });
    const geometry = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return { mesh, material, geometry };
}

// A Tron light wall: a vertical ribbon through the trail's corner points.
// All buffers are allocated once; each frame only rewrites their contents.
class LightWall {
    constructor(color) {
        const vertexCount = (TRAIL_CORNERS + 1) * 2;
        this.positions = new Float32Array(vertexCount * 3);
        this.heights = new Float32Array(vertexCount);
        this.distances = new Float32Array(vertexCount);

        for (let i = 0; i < vertexCount; i++) this.heights[i] = i % 2;

        const indices = new Uint16Array(TRAIL_CORNERS * 6);
        for (let i = 0; i < TRAIL_CORNERS; i++) {
            const bottom = i * 2;
            indices.set([bottom, bottom + 2, bottom + 1, bottom + 1, bottom + 2, bottom + 3], i * 6);
        }

        this.geometry = new THREE.BufferGeometry();
        this.positionAttribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
        this.distanceAttribute = new THREE.BufferAttribute(this.distances, 1).setUsage(THREE.DynamicDrawUsage);
        this.geometry.setAttribute('position', this.positionAttribute);
        this.geometry.setAttribute('aHeight', new THREE.BufferAttribute(this.heights, 1));
        this.geometry.setAttribute('aDistance', this.distanceAttribute);
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        this.material = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uColor: { value: color },
                uLength: { value: TRAIL_LENGTH },
            },
            vertexShader: /* glsl */ `
                attribute float aHeight;
                attribute float aDistance;
                varying float vHeight;
                varying float vDistance;
                void main() {
                    vHeight = aHeight;
                    vDistance = aDistance;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 uColor;
                uniform float uLength;
                varying float vHeight;
                varying float vDistance;
                void main() {
                    float tailFade = 1.0 - smoothstep(uLength * 0.5, uLength, vDistance);
                    float topEdge = smoothstep(0.82, 1.0, vHeight);
                    float body = mix(0.08, 0.45, vHeight);
                    vec3 color = uColor * (body + topEdge * 1.4) + vec3(topEdge * 0.5);
                    gl_FragColor = vec4(color * tailFade, 1.0);
                }
            `,
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;
    }

    // Corners are stored oldest first; the live head position is appended as the last point.
    update(cornersX, cornersZ, count, headX, headZ) {
        const total = count + 1;
        let travelled = 0;
        let previousX = headX;
        let previousZ = headZ;

        for (let i = total - 1; i >= 0; i--) {
            const x = i === count ? headX : cornersX[i];
            const z = i === count ? headZ : cornersZ[i];
            travelled += Math.hypot(x - previousX, z - previousZ);
            previousX = x;
            previousZ = z;

            const v = i * 2;
            const p = v * 3;
            this.positions[p] = x;
            this.positions[p + 1] = 0;
            this.positions[p + 2] = z;
            this.positions[p + 3] = x;
            this.positions[p + 4] = WALL_HEIGHT;
            this.positions[p + 5] = z;
            this.distances[v] = travelled;
            this.distances[v + 1] = travelled;
        }

        this.geometry.setDrawRange(0, Math.max(0, total - 1) * 6);
        this.positionAttribute.needsUpdate = true;
        this.distanceAttribute.needsUpdate = true;
    }

    dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }
}

// One rider. It only ever turns on a grid intersection, which is what keeps the trails crisp and Tron-like.
class LightCycle {
    constructor(scene, color, laneX, startZ, seed) {
        this.x = snap(laneX, CELL);
        this.z = snap(startZ, CELL);
        this.direction = FORWARD;
        this.sideCellsLeft = 0;
        this.sinceNode = 0;
        this.seed = seed;

        this.cornersX = new Float32Array(TRAIL_CORNERS);
        this.cornersZ = new Float32Array(TRAIL_CORNERS);
        this.cornerCount = 0;
        this.pushCorner();

        this.wall = new LightWall(color);
        scene.add(this.wall.mesh);

        const bodyMaterial = new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.55) });
        this.body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 1.0), bodyMaterial);
        this.body.position.y = 0.17;
        const glowMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
        this.glow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 1.4), glowMaterial);
        this.body.add(this.glow);
        scene.add(this.body);
    }

    pushCorner() {
        if (this.cornerCount === TRAIL_CORNERS) {
            this.cornersX.copyWithin(0, 1);
            this.cornersZ.copyWithin(0, 1);
            this.cornerCount--;
        }
        this.cornersX[this.cornerCount] = this.x;
        this.cornersZ[this.cornerCount] = this.z;
        this.cornerCount++;
    }

    turn(direction) {
        this.pushCorner();
        this.direction = direction;
    }

    // Called each time the rider lands exactly on an intersection.
    chooseAtNode(steerX, distanceAhead) {
        if (this.direction !== FORWARD) {
            this.sideCellsLeft--;
            if (this.sideCellsLeft <= 0) this.turn(FORWARD);
            return;
        }
        if (distanceAhead < 13) return;

        const offset = steerX - this.x;
        if (Math.abs(offset) > CELL * 1.5 && Math.random() < 0.4) {
            this.sideCellsLeft = Math.min(4, Math.round(Math.abs(offset) / CELL));
            this.turn(offset < 0 ? LEFT : RIGHT);
        } else if (Math.random() < 0.1) {
            this.sideCellsLeft = 1 + Math.floor(Math.random() * 3);
            this.turn(Math.random() < 0.5 ? LEFT : RIGHT);
        }
    }

    update(dt, cameraZ, cameraSpeed, steerX) {
        // Positive when the rider is in front of the camera (the camera looks down -Z).
        const distanceAhead = cameraZ - this.z;
        let speed = cameraSpeed * 1.25;
        if (this.direction === FORWARD) {
            if (distanceAhead < 15) speed = cameraSpeed * 1.7;
            else if (distanceAhead > 34) speed = cameraSpeed * 0.7;
            else speed = cameraSpeed * 1.05;
        }

        let remaining = speed * dt;
        while (remaining > 0) {
            const step = Math.min(remaining, CELL - this.sinceNode);
            const [dx, dz] = DIRECTIONS[this.direction];
            this.x += dx * step;
            this.z += dz * step;
            this.sinceNode += step;
            remaining -= step;
            if (this.sinceNode >= CELL - 1e-4) {
                this.sinceNode = 0;
                this.x = snap(this.x, CELL);
                this.z = snap(this.z, CELL);
                this.chooseAtNode(steerX, cameraZ - this.z);
            }
        }

        // Drop corners once the segment after them is fully behind the camera.
        while (this.cornerCount > 1 && this.cornersZ[1] > cameraZ + 4) {
            this.cornersX.copyWithin(0, 1);
            this.cornersZ.copyWithin(0, 1);
            this.cornerCount--;
        }

        this.wall.update(this.cornersX, this.cornersZ, this.cornerCount, this.x, this.z);
        this.body.position.x = this.x;
        this.body.position.z = this.z;
        this.body.rotation.y = this.direction === FORWARD ? 0 : Math.PI / 2;
    }

    // Moves everything by the same amount so coordinates stay small and float precision stays high.
    shiftZ(amount) {
        this.z += amount;
        for (let i = 0; i < this.cornerCount; i++) this.cornersZ[i] += amount;
    }

    dispose() {
        this.wall.dispose();
        this.body.geometry.dispose();
        this.body.material.dispose();
        this.glow.geometry.dispose();
        this.glow.material.dispose();
    }
}

export function createHeroGrid(container, { lowPower = false, reducedMotion = false } = {}) {
    const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, VIEW_DISTANCE + 20);
    const grid = createGrid();
    scene.add(grid.mesh);

    const cycles = [new LightCycle(scene, CYAN.clone(), 2 * CELL, -26, 0)];
    if (!lowPower) cycles.push(new LightCycle(scene, ORANGE.clone(), 6 * CELL, -34, 1));

    const raycaster = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pointerNdc = new THREE.Vector2();
    const pointerHit = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();

    const state = {
        cameraZ: 0,
        cameraX: 0,
        pointerX: 0,
        pointerY: 0,
        pointerActive: false,
        scroll: 0,
        smoothScroll: 0,
        time: 0,
        visible: true,
        running: false,
    };

    function resize() {
        const width = container.clientWidth || 1;
        const height = container.clientHeight || 1;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    }

    function steerTargetFor(cycle) {
        if (state.pointerActive) {
            pointerNdc.set(state.pointerX, -state.pointerY);
            raycaster.setFromCamera(pointerNdc, camera);
            if (raycaster.ray.intersectPlane(floor, pointerHit)) return pointerHit.x;
        }
        return state.cameraX + 7 + Math.sin(state.time * 0.25 + cycle.seed * 2.4) * 7;
    }

    function step(dt) {
        state.time += dt;
        state.smoothScroll = lerp(state.smoothScroll, state.scroll, 1 - Math.pow(0.001, dt));
        const s = state.smoothScroll;

        const speed = lerp(9, 22, s);
        state.cameraZ -= speed * dt;
        state.cameraX = lerp(state.cameraX, state.pointerActive ? state.pointerX * 5 : 0, 1 - Math.pow(0.05, dt));

        if (state.cameraZ < -REBASE_DISTANCE) {
            state.cameraZ += REBASE_DISTANCE;
            cycles.forEach((cycle) => cycle.shiftZ(REBASE_DISTANCE));
        }

        // Scrolling lowers the camera toward the floor and tips it down, as if the page sinks into the grid.
        camera.position.set(state.cameraX, lerp(2.6, 1.0, s), state.cameraZ);
        lookTarget.set(
            state.cameraX * 0.5 + state.pointerX * 1.5,
            lerp(0.6, -1.6, s) - state.pointerY * 0.4,
            state.cameraZ - lerp(14, 7, s),
        );
        camera.lookAt(lookTarget);
        camera.updateMatrixWorld();

        grid.mesh.position.set(snap(state.cameraX, CELL * MAJOR_EVERY), 0, snap(state.cameraZ, CELL * MAJOR_EVERY));
        grid.material.uniforms.uCamera.value.copy(camera.position);

        cycles.forEach((cycle) => cycle.update(dt, state.cameraZ, speed, steerTargetFor(cycle)));
    }

    let last = performance.now();
    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        step(dt);
        renderer.render(scene, camera);
    }

    function updateLoop() {
        const shouldRun = state.visible && !document.hidden && !reducedMotion;
        if (shouldRun === state.running) return;
        state.running = shouldRun;
        last = performance.now();
        renderer.setAnimationLoop(shouldRun ? frame : null);
    }

    const resizeObserver = new ResizeObserver(() => {
        resize();
        if (!state.running) renderer.render(scene, camera);
    });
    resizeObserver.observe(container);

    const visibilityObserver = new IntersectionObserver(([entry]) => {
        state.visible = entry.isIntersecting;
        updateLoop();
    });
    visibilityObserver.observe(container);
    document.addEventListener('visibilitychange', updateLoop);

    resize();
    if (reducedMotion) {
        // Simulate a few seconds so the still frame already has trails in it.
        for (let i = 0; i < 240; i++) step(1 / 60);
        renderer.render(scene, camera);
    } else {
        updateLoop();
    }

    let contextLostHandler = null;
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        renderer.setAnimationLoop(null);
        renderer.domElement.style.display = 'none';
        contextLostHandler?.();
    });

    return {
        setScroll(progress) {
            state.scroll = progress;
            if (reducedMotion) {
                state.smoothScroll = progress;
                step(0);
                renderer.render(scene, camera);
            }
        },
        setPointer(x, y) {
            state.pointerX = x;
            state.pointerY = y;
            state.pointerActive = true;
        },
        clearPointer() {
            state.pointerActive = false;
            state.pointerX = 0;
            state.pointerY = 0;
        },
        onContextLost(handler) {
            contextLostHandler = handler;
        },
        dispose() {
            renderer.setAnimationLoop(null);
            resizeObserver.disconnect();
            visibilityObserver.disconnect();
            document.removeEventListener('visibilitychange', updateLoop);
            cycles.forEach((cycle) => cycle.dispose());
            grid.geometry.dispose();
            grid.material.dispose();
            renderer.dispose();
            renderer.domElement.remove();
        },
    };
}
