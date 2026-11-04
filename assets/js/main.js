const root = document.documentElement;
root.classList.remove('no-js');

// Motion follows the OS "reduce motion" setting unless the visitor has chosen otherwise with the
// FX switch in the nav. Many Windows machines have animation effects off without the owner knowing.
const MOTION_KEY = 'rb-motion';
function readMotionChoice() {
    try { return localStorage.getItem(MOTION_KEY); } catch { return null; }
}
const motionChoice = readMotionChoice();
const osPrefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const reducedMotion = motionChoice ? motionChoice === 'off' : osPrefersReduced;
const finePointer = matchMedia('(pointer: fine)').matches;
// A phone or tablet with no mouse attached: the playable builds need one, and the copy talks about taps instead.
const touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
root.classList.add(reducedMotion ? 'reduced' : 'motion-on');
if (touchOnly) root.classList.add('touch-only');

const navHeight = () => parseFloat(getComputedStyle(root).getPropertyValue('--nav-h')) || 64;

// Scrolls through Lenis when it is running, so a programmatic scroll never fights the smooth scroll.
function scrollToElement(target, offset = -navHeight()) {
    if (motion?.lenis) motion.lenis.scrollTo(target, { offset });
    else target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
}

function onIdle(callback) {
    if ('requestIdleCallback' in window) requestIdleCallback(callback, { timeout: 1500 });
    else setTimeout(callback, 200);
}

function whenLoaded(callback) {
    if (document.readyState === 'complete') callback();
    else addEventListener('load', callback, { once: true });
}

// ---------- Text scramble: letters resolve from random glyphs, left to right ----------

const GLYPHS = '<>/\\[]{}=+*#01_';

function scrambleText(element, seconds = 0.8) {
    if (!element || reducedMotion || element.dataset.scrambled) return;
    element.dataset.scrambled = 'true';
    const finalText = element.textContent;
    element.setAttribute('aria-label', finalText);
    const start = performance.now();
    const frame = (now) => {
        const progress = Math.min(1, (now - start) / (seconds * 1000));
        const settled = Math.floor(progress * finalText.length);
        let output = '';
        for (let i = 0; i < finalText.length; i++) {
            const char = finalText[i];
            output += i < settled || char === ' ' ? char : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        element.textContent = output;
        if (progress < 1) requestAnimationFrame(frame);
        else element.textContent = finalText;
    };
    requestAnimationFrame(frame);
}

// "Lights" a section: draws its lines, expands its HUD corners and decodes its headings.
function lightUp(element) {
    if (element.classList.contains('is-lit')) return;
    element.classList.add('is-lit');
    element.querySelectorAll('[data-scramble]').forEach((heading) => scrambleText(heading));
    if (element.matches('[data-scramble]')) scrambleText(element);
}

// ---------- Smooth scroll and reveals ----------

function setUpMotion() {
    const { gsap, ScrollTrigger, Lenis } = window;
    if (!gsap || !ScrollTrigger) return null;
    gsap.registerPlugin(ScrollTrigger);

    let lenis = null;
    if (!reducedMotion && Lenis) {
        lenis = new Lenis({ lerp: 0.1 });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
    }

    if (!reducedMotion) {
        root.classList.add('motion');
        scrambleText(document.querySelector('.hero__title'), 1);
        gsap.from(['.hero__content .eyebrow', '.hero__role', '.hero__lede', '.hero__actions', '.hero__hud'], {
            y: 18, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08, delay: 0.15,
        });
        gsap.to('.hero__content', {
            yPercent: -18, opacity: 0, ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 25%', scrub: true },
        });

        gsap.utils.toArray('.bay, .feature__head, .sector-head, .init__grid, .video-facade').forEach((element) => {
            gsap.from(element, {
                y: 48, opacity: 0, duration: 1, ease: 'power3.out',
                scrollTrigger: { trigger: element, start: 'top 88%', once: true },
            });
        });
        gsap.utils.toArray('.bay__systems li, .init__terminal > *').forEach((element) => {
            gsap.from(element, {
                x: -16, opacity: 0, duration: 0.6, ease: 'power2.out',
                scrollTrigger: { trigger: element, start: 'top 92%', once: true },
            });
        });
    }

    return { gsap, ScrollTrigger, lenis };
}

function setUpMagneticButtons(gsap) {
    if (!gsap || reducedMotion || !finePointer) return;
    document.querySelectorAll('[data-magnetic]').forEach((button) => {
        const toX = gsap.quickTo(button, 'x', { duration: 0.4, ease: 'power3.out' });
        const toY = gsap.quickTo(button, 'y', { duration: 0.4, ease: 'power3.out' });
        button.addEventListener('pointermove', (event) => {
            const rect = button.getBoundingClientRect();
            toX((event.clientX - rect.left - rect.width / 2) * 0.25);
            toY((event.clientY - rect.top - rect.height / 2) * 0.35);
        });
        button.addEventListener('pointerleave', () => { toX(0); toY(0); });
    });
}

// ---------- Navigation: anchors, mobile menu, scroll-spy and progress bar ----------

// FX switch: stores the visitor's choice and reloads so every system starts in the right mode.
function setUpFxToggle() {
    const button = document.querySelector('[data-fx-toggle]');
    if (!button) return;
    const label = button.querySelector('[data-fx-state]');
    button.setAttribute('aria-pressed', String(!reducedMotion));
    if (label) label.textContent = reducedMotion ? 'OFF' : 'ON';
    button.title = reducedMotion ? 'Turn on animations and live demos' : 'Turn off animations';
    button.addEventListener('click', () => {
        try { localStorage.setItem(MOTION_KEY, reducedMotion ? 'on' : 'off'); } catch { /* storage blocked: the reload still applies the OS default */ }
        location.reload();
    });
}

function setUpNavigation(motion) {
    const toggle = document.querySelector('[data-nav-toggle]');
    // While the menu is open the page behind it holds still, so a swipe scrolls the menu, not the page.
    const setMenuOpen = (open) => {
        if (open === root.classList.contains('nav-open')) return;
        root.classList.toggle('nav-open', open);
        toggle?.setAttribute('aria-expanded', String(open));
        if (open) motion?.lenis?.stop();
        else motion?.lenis?.start();
    };
    const closeMenu = () => setMenuOpen(false);
    toggle?.addEventListener('click', () => setMenuOpen(!root.classList.contains('nav-open')));
    matchMedia('(min-width: 901px)').addEventListener('change', (event) => { if (event.matches) closeMenu(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });

    document.addEventListener('click', (event) => {
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        const id = link.getAttribute('href');
        const target = id === '#top' ? document.body : document.querySelector(id);
        if (!target) return;
        event.preventDefault();
        closeMenu();
        if (motion?.lenis) motion.lenis.scrollTo(target, { offset: id === '#top' ? 0 : -navHeight() });
        else target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
        history.replaceState(null, '', id);
        if (id !== '#top') {
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        }
    });

    const links = [...document.querySelectorAll('[data-nav-link]')];
    const sections = links.map((link) => document.querySelector(link.getAttribute('href'))).filter(Boolean);
    const spy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            links.forEach((link) => link.setAttribute('aria-current', String(link.getAttribute('href') === `#${entry.target.id}`)));
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((section) => spy.observe(section));

    const nav = document.querySelector('.site-nav');
    const updateProgress = () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        nav?.style.setProperty('--scroll-progress', `${max > 0 ? (scrollY / max) * 100 : 0}%`);
    };
    addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
}

// ---------- Slideshows: auto-cycle while visible, dots to jump, click to enlarge ----------

const slideshows = [];

function setUpSlideshows(openLightbox) {
    document.querySelectorAll('[data-slideshow]').forEach((element) => {
        const images = [...element.querySelectorAll('img')];
        if (!images.length) return;
        const label = document.createElement('span');
        label.className = 'slideshow__label';
        const dots = document.createElement('div');
        dots.className = 'slideshow__dots';
        element.append(label, dots);

        let index = 0;
        let timer = 0;
        let running = false;
        const SLIDE_TIME = 3600;

        const show = (i) => {
            index = (i + images.length) % images.length;
            images.forEach((image, n) => image.classList.toggle('is-current', n === index));
            [...dots.children].forEach((dot, n) => {
                dot.classList.remove('is-current');
                if (n === index) { void dot.offsetWidth; dot.classList.add('is-current'); }
            });
            label.textContent = images[index].dataset.label || '';
        };

        images.forEach((image, n) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.setAttribute('aria-label', `Show image ${n + 1} of ${images.length}`);
            dot.addEventListener('click', () => { show(n); restart(); });
            dots.append(dot);
            image.addEventListener('click', () => openLightbox(images, n));
        });

        const restart = () => {
            clearInterval(timer);
            if (running && images.length > 1) timer = setInterval(() => show(index + 1), SLIDE_TIME);
        };

        const controller = {
            element,
            setRunning(value) {
                const next = value && !reducedMotion;
                if (next === running) return;
                running = next;
                element.classList.toggle('is-paused', !running);
                if (running) show(index);
                restart();
            },
        };
        element.style.setProperty('--slide-time', `${SLIDE_TIME / 1000}s`);
        element.classList.add('is-paused');
        show(0);
        slideshows.push(controller);
    });
}

// A slideshow runs only while it is on screen and its layer or panel is the visible one.
function syncSlideshows() {
    slideshows.forEach((slideshow) => {
        const layer = slideshow.element.closest('.media-layer, .hud__panel');
        const layerActive = !layer || layer.classList.contains('is-active');
        slideshow.setRunning(layerActive && slideshow.element.dataset.onScreen === 'true');
    });
}

function watchSlideshowVisibility() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { entry.target.dataset.onScreen = String(entry.isIntersecting); });
        syncSlideshows();
    });
    slideshows.forEach((slideshow) => observer.observe(slideshow.element));
}

// ---------- Demos: loaded the first time their container nears the viewport ----------

const DEMO_LOADERS = {
    targeting: () => import('./demos/targeting.js').then((m) => m.createTargetingDemo),
    lod: () => import('./demos/lod.js').then((m) => m.createLodDemo),
    gravity: () => import('./demos/gravity.js').then((m) => m.createGravityDemo),
    pursuit: () => import('./demos/pursuit.js').then((m) => m.createPursuitDemo),
    ghost: () => import('./demos/ghost.js').then((m) => m.createGhostDemo),
    drift: () => import('./demos/drift.js').then((m) => m.createDriftDemo),
    pooling: () => import('./demos/pooling.js').then((m) => m.createPoolingDemo),
    monster: () => import('./demos/monster.js').then((m) => m.createMonsterDemo),
    terminal: () => import('./demos/terminal.js').then((m) => m.createTerminalDemo),
    strike: () => import('./demos/strike.js').then((m) => m.createStrikeDemo),
    veil: () => import('./demos/veil.js').then((m) => m.createVeilDemo),
    replay: () => import('./demos/replay.js').then((m) => m.createReplayDemo),
};

// Every host's sync, so a game starting or stopping can pause or wake the demos.
const demoHosts = [];

// Each container owns a set of "slots" (layers or tab panels). A demo runs only when its slot
// is the active one, the container is on screen and no game is playing.
function setUpDemoHost(container, slotSelector) {
    const slots = [...container.querySelectorAll(slotSelector)];
    const demos = new Map();
    let visible = false;
    let loaded = false;

    // With reduced motion, a demo shows a still preview until the visitor presses Run.
    const userStarted = (slot) => !reducedMotion || slot.dataset.userRun === 'true';
    const sync = () => {
        const live = visible && runningGames.size === 0;
        demos.forEach((demo, slot) => demo?.setActive(live && slot.classList.contains('is-active') && userStarted(slot)));
        syncSlideshows();
    };
    demoHosts.push(sync);

    if (reducedMotion) {
        slots.forEach((slot) => {
            const target = slot.querySelector('canvas[data-demo]');
            if (!target) return;
            const run = document.createElement('button');
            run.type = 'button';
            run.className = 'demo-run';
            run.innerHTML = '<span aria-hidden="true">&#9654;</span> Run sim';
            run.addEventListener('click', () => {
                slot.dataset.userRun = 'true';
                run.remove();
                target.focus({ preventScroll: true });
                sync();
            });
            slot.append(run);
        });
    }

    // Demos load a little before they scroll in, but only run once they are actually on screen.
    const loadObserver = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !loaded) {
            loaded = true;
            loadObserver.disconnect();
            slots.forEach((slot) => {
                const target = slot.querySelector('[data-demo]');
                if (!target) return;
                demos.set(slot, null);
                DEMO_LOADERS[target.dataset.demo]?.()
                    .then((create) => {
                        demos.set(slot, create(target, { reducedMotion: false, controls: slot }));
                        sync();
                    })
                    .catch((error) => console.warn(`Demo "${target.dataset.demo}" failed to load`, error));
            });
        }
    }, { rootMargin: '250px 0px' });
    loadObserver.observe(container);
    new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        sync();
    }).observe(container);

    return { slots, sync };
}

function setUpFeatures() {
    document.querySelectorAll('[data-feature]').forEach((feature) => {
        const steps = [...feature.querySelectorAll('.step')];
        const host = setUpDemoHost(feature, '.media-layer');
        const caption = feature.querySelector('[data-media-caption]');

        const activate = (index) => {
            steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
            host.slots.forEach((layer, i) => layer.classList.toggle('is-active', i === index));
            if (caption) caption.textContent = host.slots[index]?.dataset.caption || '';
            host.sync();
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => { if (entry.isIntersecting) activate(steps.indexOf(entry.target)); });
        }, { rootMargin: '-45% 0px -45% 0px' });
        steps.forEach((step) => observer.observe(step));
    });
}

function setUpBays() {
    document.querySelectorAll('[data-bay]').forEach((bay) => {
        const host = setUpDemoHost(bay, '.hud__panel');
        const tabs = [...bay.querySelectorAll('[role="tab"]')];
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((other) => other.setAttribute('aria-selected', String(other === tab)));
                host.slots.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === tab.dataset.tab));
                host.sync();
            });
        });
    });
}

// ---------- Soundtrack: a quiet ambient loop that steps aside whenever a game or the reel is playing ----------

const SOUND_KEY = 'rb-sound';
const audibleSources = new Set();
let soundtrack = null;

function readSoundChoice() {
    try { return localStorage.getItem(SOUND_KEY); } catch { return null; }
}

function setAudible(source, audible) {
    if (audible) audibleSources.add(source);
    else audibleSources.delete(source);
    soundtrack?.sync();
}

// Browsers only allow sound after the visitor interacts, so the loop starts on the first click or key press.
function setUpSoundtrack() {
    const button = document.querySelector('[data-sound-toggle]');
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!button || !AudioContextType) {
        button?.closest('li')?.remove();
        return;
    }
    const label = button.querySelector('[data-sound-state]');
    let enabled = readSoundChoice() !== 'off';
    let ambient = null;
    let starting = false;

    const shouldPlay = () => enabled && audibleSources.size === 0 && !document.hidden;
    const render = () => {
        button.setAttribute('aria-pressed', String(enabled));
        if (label) label.textContent = enabled ? 'ON' : 'OFF';
        button.title = enabled ? 'Mute the background music' : 'Play the background music';
        button.classList.toggle('is-playing', Boolean(ambient) && shouldPlay());
    };
    const sync = () => {
        ambient?.setPlaying(shouldPlay());
        render();
    };
    const begin = () => {
        if (ambient || starting) return;
        starting = true;
        const context = new AudioContextType();
        context.resume();
        import('./ambient.js').then(({ createGridAmbient }) => {
            ambient = createGridAmbient(context);
            sync();
        });
    };

    const onFirstGesture = (event) => {
        if (enabled && !button.contains(event.target)) begin();
    };
    window.addEventListener('pointerdown', onFirstGesture, { once: true, capture: true });
    window.addEventListener('keydown', onFirstGesture, { once: true, capture: true });

    button.addEventListener('click', () => {
        if (enabled && !ambient && !starting) {
            begin();
            return;
        }
        enabled = !enabled;
        try { localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off'); } catch { /* storage blocked: the choice lasts for this visit */ }
        if (enabled) begin();
        sync();
    });
    document.addEventListener('visibilitychange', sync);

    soundtrack = { sync };
    render();
}

// ---------- Game players: the real build, loaded into the HUD frame only when asked ----------

// Below this share of the player on screen, the game counts as scrolled away and goes quiet.
const GAME_VISIBLE_RATIO = 0.3;
// A build hosted elsewhere can't be paused, so it is unloaded once it has been fully off screen for this long.
const FOREIGN_UNLOAD_DELAY = 20000;
const STOPPED_NOTE = 'Stopped when you scrolled away, so it wouldn’t play in the background.';
const SWITCHED_NOTE = 'Closed when you started another game, so the two wouldn’t share your computer.';
// Wheel deltas from a frame can be in lines or pages (deltaMode 1 and 2); the page scrolls in pixels.
const WHEEL_LINE = 16;

// Our builds run in same-origin frames, which share this page's main thread: while any game is on screen, the page's
// always-on animation (the scroll rider and the demos) stops so the game gets the whole frame.
const runningGames = new Set();
const gamePlayers = [];
let scrollRider = null;

function setGameRunning(player, running) {
    if (running) runningGames.add(player);
    else runningGames.delete(player);
    scrollRider?.setPaused(runningGames.size > 0);
    demoHosts.forEach((sync) => sync());
}

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

function scrollPageBy(delta, mode) {
    const pixels = mode === 1 ? delta * WHEEL_LINE : mode === 2 ? delta * innerHeight : delta;
    if (motion?.lenis) motion.lenis.scrollTo(motion.lenis.targetScroll + pixels);
    else scrollBy(0, pixels);
}

function setUpGamePlayer(player) {
    const { gameSrc: src, gameTitle: title, gameSize: size, gameWatch: watch } = player.dataset;
    const view = player.querySelector('[data-game-view]');
    const play = player.querySelector('[data-game-play]');
    const fullscreen = player.querySelector('[data-game-fullscreen]');
    const cover = view.firstElementChild;
    const content = cover.querySelector('.game-cover__content');
    // Our own builds listen for pause/resume messages. A build hosted elsewhere can't be reached, so it is unloaded.
    const ownBuild = new URL(src, location.href).origin === location.origin;
    // A build with no sound of its own (data-game-silent) leaves the soundtrack playing.
    const silent = 'gameSilent' in player.dataset;
    const canFullscreen = Boolean(view.requestFullscreen || view.webkitRequestFullscreen);
    // On a phone or tablet the first tap explains the build needs a mouse and keyboard before it downloads.
    let confirmed = !touchOnly;
    let frame = null;
    let visibleRatio = 0;
    let unloadTimer = 0;
    let wasFullscreen = false;

    const post = (message) => frame?.contentWindow?.postMessage(message, location.origin);
    const focusGame = () => {
        frame?.focus({ preventScroll: true });
        post('portfolio:focus');
    };

    const showNote = (text) => {
        let note = cover.querySelector('[data-game-stopped]');
        if (!note) {
            note = document.createElement('p');
            note.className = 'game-cover__note';
            note.dataset.gameStopped = '';
            play.after(note);
        }
        note.textContent = text;
    };

    // note: why the game was closed. The game's own QUIT asked for the cover back, so it has nothing to explain.
    const unload = (note = null) => {
        clearTimeout(unloadTimer);
        unloadTimer = 0;
        if (fullscreenElement() === view) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
        frame = null;
        view.replaceChildren(cover);
        player.classList.remove('is-playing');
        setGameRunning(player, false);
        if (fullscreen) fullscreen.hidden = true;
        if (note) showNote(note);
        setAudible(player, false);
    };

    const update = () => {
        if (!frame || player.contains(fullscreenElement())) return;
        if (ownBuild) {
            const active = visibleRatio >= GAME_VISIBLE_RATIO && !document.hidden;
            post(active ? 'portfolio:resume' : 'portfolio:pause');
            setAudible(player, active && !silent);
            setGameRunning(player, active);
        } else if (visibleRatio > 0) {
            clearTimeout(unloadTimer);
            unloadTimer = 0;
        } else if (!unloadTimer) {
            unloadTimer = setTimeout(() => unload(STOPPED_NOTE), FOREIGN_UNLOAD_DELAY);
        }
    };

    const load = () => {
        // One game at a time: each one wants the whole machine, and a second heap can run a laptop out of memory.
        gamePlayers.forEach((other) => { if (other !== controller && other.loaded()) other.unload(SWITCHED_NOTE); });
        content.classList.remove('is-asking');
        content.querySelector('.game-ask')?.remove();
        frame = document.createElement('iframe');
        frame.src = src;
        frame.title = `${title}, playable`;
        frame.allow = 'fullscreen; autoplay; gamepad';
        frame.allowFullscreen = true;
        view.replaceChildren(frame);
        player.classList.add('is-playing');
        if (ownBuild) setGameRunning(player, true);
        // Frame the whole game below the nav, so nothing it draws is hidden while it boots.
        scrollToElement(player, -(navHeight() + 12));
        frame.focus({ preventScroll: true });
        if (fullscreen && canFullscreen) fullscreen.hidden = false;
        setAudible(player, !silent);
    };

    const ask = () => {
        if (content.querySelector('.game-ask')) return;
        const panel = document.createElement('div');
        panel.className = 'game-ask';
        const text = document.createElement('p');
        text.className = 'game-ask__text';
        text.textContent = `Made for a mouse and keyboard${size ? `, and about ${size} MB to download` : ''}. It plays best on a computer.`;
        const actions = document.createElement('div');
        actions.className = 'game-ask__actions';
        const target = watch && document.querySelector(watch);
        if (target) {
            const see = document.createElement('button');
            see.type = 'button';
            see.className = 'game-cover__play';
            see.textContent = 'See it in action';
            see.addEventListener('click', () => scrollToElement(target));
            actions.append(see);
        }
        const anyway = document.createElement('button');
        anyway.type = 'button';
        anyway.className = 'game-ask__anyway';
        anyway.textContent = 'Load it anyway';
        anyway.addEventListener('click', () => {
            confirmed = true;
            load();
        });
        actions.append(anyway);
        panel.append(text, actions);
        content.classList.add('is-asking');
        content.append(panel);
        actions.firstElementChild.focus({ preventScroll: true });
    };

    play?.addEventListener('click', () => {
        if (confirmed) load();
        else ask();
    });

    fullscreen?.addEventListener('click', () => {
        const request = view.requestFullscreen ? view.requestFullscreen() : view.webkitRequestFullscreen?.();
        // Focus goes to the game, so the first key press reaches it rather than this button.
        Promise.resolve(request).then(focusGame).catch(() => window.open(src, '_blank', 'noopener'));
    });

    const onFullscreenChange = () => {
        const isFullscreen = player.contains(fullscreenElement());
        if (wasFullscreen && !isFullscreen) focusGame();
        wasFullscreen = isFullscreen;
        update();
    };

    // The Arkade builds talk back through their PageBridge: QUIT puts the cover back, and A Sangue Frio's library card
    // for the other game hands over to that game's player further down the page.
    if (ownBuild) {
        window.addEventListener('message', (event) => {
            if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
            const { type, id } = event.data ?? {};
            if (type === 'game:quit') {
                unload();
                play.focus({ preventScroll: true });
            } else if (type === 'game:open') {
                const next = document.querySelector(`[data-game-player][data-game-id="${CSS.escape(String(id))}"]`);
                if (!next) return;
                unload();
                next.querySelector('[data-game-play]')?.click();
            }
        });
    }

    new IntersectionObserver(([entry]) => {
        visibleRatio = entry.isIntersecting ? entry.intersectionRatio : 0;
        update();
    }, { threshold: [0, GAME_VISIBLE_RATIO] }).observe(player);
    document.addEventListener('visibilitychange', update);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);

    const controller = { loaded: () => Boolean(frame), unload, source: () => frame?.contentWindow ?? null };
    return controller;
}

function setUpGamePlayers() {
    document.querySelectorAll('[data-game-player]').forEach((player) => gamePlayers.push(setUpGamePlayer(player)));

    // A build that has no use for the wheel sends it here (frame-bridge.js), so the page still scrolls over a game.
    window.addEventListener('message', (event) => {
        if (event.origin !== location.origin || event.data?.type !== 'game:wheel') return;
        if (!gamePlayers.some((player) => player.source() === event.source)) return;
        const { dy, mode } = event.data;
        if (Number.isFinite(dy)) scrollPageBy(dy, mode);
    });
}

// ---------- Showreel facade ----------

const YOUTUBE_ORIGIN = 'https://www.youtube-nocookie.com';
const YOUTUBE_PLAYING = 1;
const YOUTUBE_BUFFERING = 3;

// The embed's JS API reports play state (so the music steps aside only while the reel is playing),
// and takes a pause command when the reel scrolls out of view.
function setUpVideoFacades() {
    document.querySelectorAll('[data-youtube]').forEach((facade) => {
        let iframe = null;
        const command = (message) => iframe?.contentWindow?.postMessage(JSON.stringify(message), YOUTUBE_ORIGIN);

        window.addEventListener('message', (event) => {
            if (!iframe || event.origin !== YOUTUBE_ORIGIN || event.source !== iframe.contentWindow) return;
            let data;
            try { data = JSON.parse(event.data); } catch { return; }
            const state = data.event === 'onStateChange' ? data.info : data.info?.playerState;
            if (typeof state === 'number') setAudible(facade, state === YOUTUBE_PLAYING || state === YOUTUBE_BUFFERING);
        });

        new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) command({ event: 'command', func: 'pauseVideo', args: [] });
        }).observe(facade);

        facade.querySelector('a')?.addEventListener('click', (event) => {
            event.preventDefault();
            iframe = document.createElement('iframe');
            iframe.src = `${YOUTUBE_ORIGIN}/embed/${facade.dataset.youtube}?autoplay=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
            iframe.title = 'Ryan Barry showreel';
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
            iframe.allowFullscreen = true;
            iframe.addEventListener('load', () => command({ event: 'listening', id: 'showreel' }));
            facade.querySelector('img')?.remove();
            facade.querySelector('a')?.remove();
            facade.append(iframe);
            iframe.focus();
            setAudible(facade, true);
        });
    });
}

// ---------- Lightbox ----------

function setUpLightbox(lenis) {
    const dialog = document.querySelector('[data-lightbox]');
    if (!dialog || typeof dialog.showModal !== 'function') return () => {};
    const image = dialog.querySelector('[data-lightbox-img]');
    const caption = dialog.querySelector('[data-lightbox-caption]');
    const count = dialog.querySelector('[data-lightbox-count]');
    let items = [];
    let index = 0;

    const show = (i) => {
        index = (i + items.length) % items.length;
        const source = items[index];
        image.src = source.currentSrc || source.src;
        image.alt = source.alt;
        caption.textContent = source.alt;
        count.textContent = `${index + 1} / ${items.length}`;
    };

    dialog.querySelector('[data-lightbox-prev]').addEventListener('click', () => show(index - 1));
    dialog.querySelector('[data-lightbox-next]').addEventListener('click', () => show(index + 1));
    dialog.querySelector('[data-lightbox-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => lenis?.start());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') show(index - 1);
        if (event.key === 'ArrowRight') show(index + 1);
    });

    return (images, start) => {
        items = images;
        show(start);
        dialog.showModal();
        lenis?.stop();
    };
}

// ---------- Hero scene and the page rider ----------

function canUseWebGL2() {
    if (navigator.connection?.saveData) return false;
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
}

const lowPower = matchMedia('(max-width: 768px)').matches
    || matchMedia('(pointer: coarse)').matches
    || (navigator.hardwareConcurrency || 8) <= 4;

// Phones keep the CSS grid floor in the hero instead of the 3D scene: it saves the three.js download and leaves the
// GPU to the scroll rider and the demos.
const phoneSized = matchMedia('(pointer: coarse) and (max-width: 768px), (pointer: coarse) and (max-height: 500px)').matches;

async function startHero(motion) {
    const hero = document.querySelector('.hero');
    const stage = document.querySelector('[data-hero-stage]');
    if (!hero || !stage || phoneSized || !canUseWebGL2()) return;

    let scene;
    try {
        const { createHeroGrid } = await import('./hero-grid.js');
        scene = createHeroGrid(stage, { lowPower, reducedMotion, hud: hero.querySelector('.hero__hud') });
    } catch (error) {
        console.warn('Hero scene unavailable, keeping the CSS grid.', error);
        return;
    }

    root.classList.add('has-webgl');
    scene.onContextLost(() => root.classList.remove('has-webgl'));

    if (finePointer) {
        hero.addEventListener('pointermove', (event) => {
            const rect = hero.getBoundingClientRect();
            scene.setPointer(((event.clientX - rect.left) / rect.width) * 2 - 1, ((event.clientY - rect.top) / rect.height) * 2 - 1);
        });
        hero.addEventListener('pointerleave', () => scene.clearPointer());
    }

    if (motion?.ScrollTrigger) {
        motion.ScrollTrigger.create({
            trigger: hero, start: 'top top', end: 'bottom top',
            onUpdate: (self) => scene.setScroll(self.progress),
        });
    } else {
        const update = () => scene.setScroll(Math.min(1, Math.max(0, scrollY / hero.offsetHeight)));
        addEventListener('scroll', update, { passive: true });
        update();
    }
}

async function startRider() {
    const stops = [...document.querySelectorAll('[data-rider-stop]')];
    const canvas = document.querySelector('[data-rider]');

    // Without the rider (or with reduced motion), sections still light up as they scroll into view.
    const lightOnView = () => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) { lightUp(entry.target); observer.unobserve(entry.target); }
            });
        }, { rootMargin: '0px 0px -25% 0px' });
        stops.forEach((stop) => observer.observe(stop));
    };

    if (reducedMotion) {
        canvas?.remove();
        stops.forEach(lightUp);
        return;
    }
    if (!canvas) {
        lightOnView();
        return;
    }
    try {
        const { createScrollRider } = await import('./scroll-rider.js');
        scrollRider = createScrollRider(canvas, { stops, hero: document.querySelector('.hero'), lowPower, onPass: lightUp });
        scrollRider.setPaused(runningGames.size > 0);
    } catch (error) {
        console.warn('Scroll rider unavailable.', error);
        canvas.remove();
        lightOnView();
    }
}

// ---------- Touch devices: copy that talks about taps, and links that don't start a desktop download ----------

function useTouchCopy() {
    if (!touchOnly) return;
    document.querySelectorAll('[data-touch-text]').forEach((element) => { element.textContent = element.dataset.touchText; });
    document.querySelectorAll('[data-touch-href]').forEach((link) => { link.setAttribute('href', link.dataset.touchHref); });
}

// ---------- Boot ----------

const motion = setUpMotion();
useTouchCopy();
setUpFxToggle();
setUpSoundtrack();
setUpNavigation(motion);
setUpMagneticButtons(motion?.gsap);
setUpSlideshows(setUpLightbox(motion?.lenis));
setUpFeatures();
setUpBays();
watchSlideshowVisibility();
setUpVideoFacades();
setUpGamePlayers();
startRider();
whenLoaded(() => onIdle(() => startHero(motion)));
