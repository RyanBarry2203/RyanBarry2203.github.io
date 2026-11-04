// Runs inside every playable build's page (SangueFrio/, LastKnownLocation/, SplitShift/, Tallow/, WrongHouse/,
// Project300/). It lets the portfolio quieten a game it has scrolled away from (sound and the Unity main loop), hands
// focus back to the game after Fullscreen, and does two things a page opts into on this script tag:
//   data-pointer-lock  the game aims from mouse movement, so a click captures the mouse and Esc frees it again.
//                      Without it the arrow cursor and the game's crosshair drift apart and the cursor leaves the frame.
//   data-wheel="page"  the game has no use for the wheel, so a wheel turn over it scrolls the portfolio instead.
// It must load before the Unity loader starts, so it sees every AudioContext. The loader calls
// portfolioFrame.ready(instance, canvas) once the game is running.
(function () {
    var script = document.currentScript;
    var embedded = window.self !== window.top;
    var wantsLock = 'pointerLock' in script.dataset && 'requestPointerLock' in Element.prototype;
    var wheelToPage = embedded && script.dataset.wheel === 'page';

    var Native = window.AudioContext || window.webkitAudioContext;
    var contexts = [];
    if (Native) {
        var Tracked = function (options) {
            var context = new Native(options);
            contexts.push(context);
            return context;
        };
        Tracked.prototype = Native.prototype;
        window.AudioContext = window.webkitAudioContext = Tracked;
    }

    var instance = null;
    var canvas = null;
    var hint = null;
    var paused = false;
    var releasing = false;

    // A game that keeps its cursor locked asks for the lock again every frame, and the browser refuses any request that
    // doesn't come from a click or key press. Unity's loader treats an uncaught refusal as a crash and shows an error
    // box, so every refusal is caught here, before the loader runs. A release the game asks for itself (its pause menu
    // freeing the mouse) is noted, so it isn't mistaken for the player pressing Esc.
    var pointerLockError = /pointer ?lock/i;
    if ('requestPointerLock' in Element.prototype) {
        var nativeRequest = Element.prototype.requestPointerLock;
        Element.prototype.requestPointerLock = function () {
            var request = nativeRequest.apply(this, arguments);
            if (request && request.catch) request.catch(function () { refused(); });
            return request;
        };
    }
    if (Document.prototype.exitPointerLock) {
        var nativeExit = Document.prototype.exitPointerLock;
        Document.prototype.exitPointerLock = function () {
            if (document.pointerLockElement) releasing = true;
            return nativeExit.apply(this, arguments);
        };
    }
    window.addEventListener('unhandledrejection', function (event) {
        var reason = event.reason;
        var text = String((reason && (reason.message || reason.name)) || reason);
        if (!pointerLockError.test(text) && !(reason && reason.name === 'WrongDocumentError')) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }, true);
    window.portfolioUnityError = function (message) {
        return pointerLockError.test(String(message));
    };
    var lastRealEscape = -Infinity;

    function locked() {
        return Boolean(canvas) && document.pointerLockElement === canvas;
    }

    function setMainLoop(running) {
        var module = instance && instance.Module;
        if (!module) return;
        if (running && module.resumeMainLoop) module.resumeMainLoop();
        if (!running && module.pauseMainLoop) module.pauseMainLoop();
    }

    function release() {
        if (!locked()) return;
        document.exitPointerLock();
    }

    // Some browsers refuse pointer lock outright (embedded browsers, some policies). If it has never worked, clicks go
    // straight to the game again and the hint goes away. A refusal after it has worked is only the short cooldown
    // after Esc, so the next click asks again.
    var lockWorked = false;
    var lockRefused = false;
    function refused() {
        if (lockWorked) return;
        lockRefused = true;
        showHint();
    }

    function showHint() {
        if (hint) hint.hidden = !instance || paused || lockRefused || locked();
    }

    function setPaused(value) {
        if (value === paused) return;
        paused = value;
        contexts.forEach(function (context) { if (paused) context.suspend(); else context.resume(); });
        setMainLoop(!paused);
        if (paused) release();
        showHint();
    }

    function focusGame() {
        if (!canvas) return;
        window.focus();
        canvas.focus();
    }

    window.addEventListener('message', function (event) {
        if (event.origin !== location.origin) return;
        if (event.data === 'portfolio:pause') setPaused(true);
        if (event.data === 'portfolio:resume') setPaused(false);
        if (event.data === 'portfolio:focus') focusGame();
    });

    if (wheelToPage) {
        window.addEventListener('wheel', function (event) {
            if (locked() || event.ctrlKey) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            window.parent.postMessage({ type: 'game:wheel', dx: event.deltaX, dy: event.deltaY, mode: event.deltaMode }, location.origin);
        }, { capture: true, passive: false });
    }

    // The click that captures the mouse is only for that: the game never sees it, so it can't fire a shot or pick a
    // menu item where the crosshair happened to be.
    function setUpPointerLock() {
        var swallowing = false;
        var swallow = function (event) {
            if (event.button !== 0 && event.type !== 'click') return;
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        window.addEventListener('pointerdown', function (event) {
            if (!instance || lockRefused || locked() || event.button !== 0) return;
            swallowing = true;
            swallow(event);
            var request = null;
            try { request = canvas.requestPointerLock(); } catch (error) { refused(); }
            if (request && request.catch) request.catch(refused);
            focusGame();
        }, true);
        document.addEventListener('pointerlockerror', refused);
        ['mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
            window.addEventListener(type, function (event) {
                if (!swallowing) return;
                swallow(event);
                if (type === 'click') swallowing = false;
            }, true);
        });

        window.addEventListener('keydown', function (event) {
            if (event.isTrusted && event.key === 'Escape') lastRealEscape = performance.now();
        }, true);

        // Losing the mouse (Esc, alt-tab) while playing should pause the game like Esc would. Most browsers keep the
        // Esc that frees the mouse to themselves, so the game is sent one, unless it already got the real key. When the
        // game or this bridge freed the mouse itself (exitPointerLock, flagged above) nothing is sent, so a pause menu
        // that frees the cursor as it opens isn't closed again by a made-up Esc.
        document.addEventListener('pointerlockchange', function () {
            var wasReleasing = releasing;
            releasing = false;
            if (locked()) lockWorked = true;
            showHint();
            if (locked() || wasReleasing || paused) return;
            setTimeout(function () {
                if (locked() || performance.now() - lastRealEscape < 300) return;
                ['keydown', 'keyup'].forEach(function (type) {
                    canvas.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
                });
            }, 60);
        });

        hint = document.createElement('p');
        hint.className = 'frame-hint';
        hint.hidden = true;
        hint.textContent = 'Click to aim · Esc frees the mouse';
        var style = document.createElement('style');
        // Top centre, clear of the games' own footer lines, and it fades once read. It comes back (and the fade starts
        // over) every time the mouse is freed, because display: none restarts the animation.
        style.textContent = '.frame-hint { position: fixed; left: 50%; top: 12px; z-index: 9; margin: 0; padding: 7px 12px;'
            + ' transform: translateX(-50%); pointer-events: none; white-space: nowrap; font: 600 0.68rem/1 var(--mono, monospace);'
            + ' letter-spacing: 0.14em; text-transform: uppercase; color: inherit; background: rgba(0, 0, 0, 0.72);'
            + ' border: 1px solid currentColor; opacity: 0.85; animation: frame-hint-fade 0.6s ease 4s forwards; }'
            + ' @keyframes frame-hint-fade { to { opacity: 0; } }'
            + ' .frame-hint[hidden] { display: none; }';
        document.head.appendChild(style);
        document.body.appendChild(hint);
    }

    window.portfolioFrame = {
        ready: function (unityInstance, gameCanvas) {
            instance = unityInstance;
            canvas = gameCanvas;
            if (wantsLock) setUpPointerLock();
            if (paused) setMainLoop(false);
            showHint();
        }
    };
})();
