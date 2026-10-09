// A short playable version of House of History. Rooms, items and the sanity rules follow the
// original console game: -5 sanity per turn in the dark, -1 with a lit candle, pills restore 20,
// and the electronic door needs both the fuse and the iron key.

const ART = {
    HALLWAY: [
        '┌──────────────────────────┐',
        '│         HALLWAY          │',
        '│   ║      ║      ║     ▲  │',
        '│  door   door   door  ATTIC│',
        '└──────────────────────────┘',
    ],
    KITCHEN: [
        '┌──────────────────────────┐',
        '│          KITCHEN         │',
        '│   _______      _______   │',
        '│  |  ___  |    | ___   |  │',
        '│  |_______|    |_______|  │',
        '│ Pots and pans sway gently│',
        '│ on their hooks.          │',
        '└──────────────────────────┘',
    ],
    BEDROOM: [
        '┌──────────────────────────┐',
        '│          BEDROOM         │',
        '│   ┌─────────┐   ▓▓▓      │',
        '│   │  bed    │   ▓▓▓ ward │',
        '│   └─────────┘   ▓▓▓ robe │',
        '└──────────────────────────┘',
    ],
    STUDY: [
        '┌──────────────────────────┐',
        '│           STUDY          │',
        '│  ═══════   ┌──────┐      │',
        '│  books     │ SAFE │      │',
        '│  ═══════   └──────┘      │',
        '└──────────────────────────┘',
    ],
    ATTIC: [
        '┌──────────────────────────┐',
        '│           ATTIC          │',
        '│  ╱╲    boxes     ☐ ☐     │',
        '│  ││  mannequin   ☐       │',
        '└──────────────────────────┘',
    ],
    DOOR: [
        '┌──────────────────────────┐',
        '│    ELECTRONIC  DOOR      │',
        '│    ┌──────────────┐      │',
        '│    │ [FUSE] [KEY] │      │',
        '│    └──────────────┘      │',
        '└──────────────────────────┘',
    ],
};

const DESCRIPTIONS = {
    HALLWAY: 'A long hallway. Doors lead off in every direction.',
    KITCHEN: 'A strong smell of rot hangs in the air.',
    BEDROOM: 'A cold draft blows from under the bed.',
    STUDY: 'Books and scrolls litter the desk.',
    ATTIC: 'Cobwebs hang from every beam.',
    DOOR: 'A heavy electronic door stands before you.',
};

export function createTerminalDemo(root) {
    root.innerHTML = `
        <div class="terminal__stats" aria-live="polite"></div>
        <div class="terminal__log" role="log" aria-live="polite"></div>
        <div class="terminal__options"></div>
        <label class="terminal__input">&gt;<input type="text" inputmode="numeric" autocomplete="off" aria-label="Type an option number and press Enter"></label>`;
    const stats = root.querySelector('.terminal__stats');
    const log = root.querySelector('.terminal__log');
    const optionsBox = root.querySelector('.terminal__options');
    const input = root.querySelector('input');

    let state;

    function reset() {
        state = { room: 'HALLWAY', sanity: 100, health: 100, candleLit: false, items: new Set(), over: false, searched: new Set() };
        log.innerHTML = '';
        print('HORROR ESCAPE v1.0  //  C# console original, rebuilt for the web');
        print('You wake in a house you do not recognise. Find a way out.');
        enter('HALLWAY');
    }

    function print(text, kind = '') {
        const line = document.createElement('p');
        if (kind) line.className = kind;
        line.textContent = text;
        log.append(line);
        log.scrollTop = log.scrollHeight;
    }

    function updateStats() {
        stats.textContent = `[ HEALTH: ${state.health}% ]  [ LIGHT: ${state.candleLit ? 'CANDLE' : 'OFF'} ]  [ SANITY: ${state.sanity}% ]  [ BAG: ${state.items.size ? [...state.items].join(', ') : 'empty'} ]`;
    }

    // One turn passes per action: darkness eats at your sanity, a candle slows it.
    function passTurn() {
        if (state.over) return;
        state.sanity = Math.max(0, state.sanity - (state.candleLit ? 1 : 5));
        if (!state.candleLit) print('   (The darkness presses in... Sanity -5)', 'is-warn');
        if (state.sanity <= 0) {
            state.over = true;
            print('Your mind gives way. The house keeps you forever.', 'is-warn');
        }
    }

    function take(item, message) {
        if (state.items.has(item)) { print('Nothing else here.'); return; }
        state.items.add(item);
        print(message);
    }

    function enter(room) {
        state.room = room;
        print('');
        ART[room].forEach((line) => print(line));
        print(DESCRIPTIONS[room]);
        render();
    }

    function optionsFor() {
        const list = [];
        const back = ['Return to the hallway', () => enter('HALLWAY')];
        switch (state.room) {
            case 'HALLWAY':
                list.push(['Go to the Kitchen', () => enter('KITCHEN')], ['Go to the Bedroom', () => enter('BEDROOM')], ['Go to the Study', () => enter('STUDY')]);
                list.push(['Climb to the Attic', () => {
                    if (!state.candleLit) { print('It is too dark! Something touches your face...', 'is-warn'); state.sanity = Math.max(0, state.sanity - 10); return; }
                    enter('ATTIC');
                }]);
                list.push(['Try the electronic door', () => enter('DOOR')]);
                break;
            case 'KITCHEN':
                list.push(['Check behind the fridge', () => { print('You check behind the fridge... something skitters away.'); take('Fuse', 'You find a Fuse!'); }]);
                list.push(['Search the drawer', () => take('Scary Note', 'The drawer sticks... inside is a creepy note: "IT LIVES UNDER THE BED".')]);
                list.push(['Search the cupboard', () => take('Matches', 'Behind the tins you find a Box of Matches.')]);
                list.push(back);
                break;
            case 'BEDROOM':
                list.push(['Look under the bed (risky)', () => {
                    print('You look under the bed...');
                    if (!state.items.has('Iron Key')) { state.sanity = Math.max(0, state.sanity - 10); print('Cold fingers brush your hand. (Sanity -10)', 'is-warn'); take('Iron Key', 'You grab a heavy Iron Key and pull back.'); }
                    else print('Only dust. You do not look again.');
                }]);
                list.push(['Check the wardrobe', () => take('Candle', 'Hidden in a coat pocket, you find a Candle!')]);
                list.push(['Check the nightstand', () => take('Sanity Pills', 'In the drawer, you find a bottle of pills.')]);
                list.push(back);
                break;
            case 'STUDY':
                list.push(['Read the history books (hint)', () => print('A margin note: "The fuse box was moved to the kitchen. The key? Ask the bed."')]);
                list.push(['Try to open the safe', () => {
                    if (state.items.has('Scary Note')) take('Mysterious Page', 'CLICK. The note had the code scrawled on the back. Inside: a Mysterious Page.');
                    else { print('ERROR. The lock does not budge. The frustration eats at you. (Sanity -5)', 'is-warn'); state.sanity = Math.max(0, state.sanity - 5); }
                }]);
                list.push(back);
                break;
            case 'ATTIC':
                list.push(['Dig through old boxes', () => take('Rusty Knife', 'Buried under old rags, you find a Rusty Knife.')]);
                list.push(['Inspect the mannequin', () => { print('The mannequin moved!! No... it is a Wraith! You run away in terror. (Sanity -15)', 'is-warn'); state.sanity = Math.max(0, state.sanity - 15); enter('HALLWAY'); }]);
                list.push(back);
                break;
            case 'DOOR':
                list.push(['Try to open the door', () => {
                    if (state.items.has('Iron Key') && state.items.has('Fuse')) {
                        print('You insert the fuse. The power hums to life.');
                        print('You turn the iron key. The heavy bolts slide back.');
                        print(`THE DOOR OPENS. YOU ARE FREE! You escaped with ${state.sanity}% sanity remaining.`, 'is-cmd');
                        state.over = true;
                    } else print(`The door is dead. ${state.items.has('Fuse') ? 'It needs a key.' : 'There is no power. A fuse is missing.'}`);
                }]);
                list.push(back);
                break;
            default:
                break;
        }
        if (state.items.has('Candle') && state.items.has('Matches') && !state.candleLit) {
            list.push(['Light the candle', () => { state.candleLit = true; print('The candle flickers to life. The shadows retreat.'); }]);
        }
        if (state.items.has('Sanity Pills')) {
            list.push(['Take a sanity pill', () => { state.items.delete('Sanity Pills'); state.sanity = Math.min(100, state.sanity + 20); print('You swallow a pill. Your mind feels clearer. (+20 Sanity)'); }]);
        }
        return list;
    }

    function choose(option, label) {
        print(`> ${label}`, 'is-cmd');
        const roomBefore = state.room;
        option();
        if (!state.over && state.room === roomBefore) passTurn();
        render();
    }

    function render() {
        updateStats();
        optionsBox.innerHTML = '';
        if (state.over) {
            const restart = document.createElement('button');
            restart.type = 'button';
            restart.textContent = '[R] Play again';
            restart.addEventListener('click', reset);
            optionsBox.append(restart);
            return;
        }
        optionsFor().forEach(([label, action], i) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `[${i + 1}] ${label}`;
            button.addEventListener('click', () => choose(action, label));
            optionsBox.append(button);
        });
    }

    input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const value = input.value.trim().toLowerCase();
        input.value = '';
        if (state.over && value === 'r') { reset(); return; }
        const option = optionsFor()[Number(value) - 1];
        if (option) choose(option[1], option[0]);
        else print(`Unknown command: ${value || '(blank)'}`, 'is-warn');
    });

    reset();
    return { setActive() {} };
}
