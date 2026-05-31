/*:
 * @target MZ
 * @plugindesc Simple Autobattle Chain System
 *
 * @command StartChain
 * @text Start Chain
 *
 * @arg troopBaseId
 * @type troop
 * @text Troop ID
 *
 * @arg waves
 * @type number
 * @default 5
 * @text Waves
 *
 * @arg infinite
 * @type boolean
 * @default false
 * @text Infinite
 * @desc If true, waves continue until the party is wiped out.
 */


(() => {

const _Scene_Map_start = Scene_Map.prototype.start;
Scene_Map.prototype.start = function() {
    _Scene_Map_start.call(this);

    // Initialize global and current run variables if not already set
    if (typeof $gameVariables !== 'undefined') {
        // Initialize global totals (21, 22, 23)
        if (!$gameVariables.value(21)) $gameVariables.setValue(21, 0);
        if (!$gameVariables.value(22)) $gameVariables.setValue(22, 0);
        if (!$gameVariables.value(23)) $gameVariables.setValue(23, 0);

        // Initialize current run variables (31, 32, 33)
        if (!$gameVariables.value(31)) $gameVariables.setValue(31, 0);
        if (!$gameVariables.value(32)) $gameVariables.setValue(32, 0);
        if (!$gameVariables.value(33)) $gameVariables.setValue(33, 0);
    } else {
        // Fallback: delay initialization if $gameVariables is not yet available
        setTimeout(() => {
            if (typeof $gameVariables !== 'undefined') {
                if (!$gameVariables.value(21)) $gameVariables.setValue(21, 0);
                if (!$gameVariables.value(22)) $gameVariables.setValue(22, 0);
                if (!$gameVariables.value(23)) $gameVariables.setValue(23, 0);
                if (!$gameVariables.value(31)) $gameVariables.setValue(31, 0);
                if (!$gameVariables.value(32)) $gameVariables.setValue(32, 0);
                if (!$gameVariables.value(33)) $gameVariables.setValue(33, 0);
            }
        }, 1000); // 1 second delay (adjust as needed)
    }
};

let chainActive = false;
let currentWave = 0;
let maxWaves = 0;
let troopId = 0;
let infiniteMode = false;


let totalExp = 0;
let totalGold = 0;
let totalDrops = [];

// Snapshot of skill IDs per actor before the chain, keyed by actor ID
let skillSnapshots = {};

const _BattleManager_makeRewards = BattleManager.makeRewards;
BattleManager.makeRewards = function() {
    _BattleManager_makeRewards.call(this);

    if (chainActive) {
        totalExp += this._rewards.exp;
        totalGold += this._rewards.gold;
        totalDrops = totalDrops.concat(this._rewards.items);
        this._rewards = { exp: 0, gold: 0, items: [] };
    }
};

// Suppress gain during chain waves — we accumulate and grant manually
const _BattleManager_gainRewards = BattleManager.gainRewards;
BattleManager.gainRewards = function() {
    if (chainActive) return;
    _BattleManager_gainRewards.call(this);
};

BattleManager.displayVictoryMessage = function() {};
BattleManager.displayRewards = function() {};
BattleManager.displayStartMessages = function() {};

const _BattleManager_processVictory = BattleManager.processVictory;
BattleManager.processVictory = function() {
    if (chainActive) {
        $gameParty.removeBattleStates();
        this.makeRewards();
        this.gainRewards();
        this.endBattle(0);
        return;
    }
    _BattleManager_processVictory.call(this);
};

// Intercept updateBattleEnd to avoid popping the scene between waves
const _BattleManager_updateBattleEnd = BattleManager.updateBattleEnd;
BattleManager.updateBattleEnd = function() {
    if (chainActive) {
        this._phase = "";

        if (this._escaped || $gameParty.isAllDead()) {
            if (infiniteMode && $gameParty.isAllDead()) {
                for (const actor of $gameParty.members()) {
                    actor.recoverAll();
                }
                endChain();
            } else {
                chainActive = false;
                SceneManager.pop();
            }
            return;
        }

        currentWave++;

        if (infiniteMode || currentWave < maxWaves) {
            const spriteset = BattleManager._spriteset;
            const logWindow = BattleManager._logWindow;

            BattleManager.setup(troopId, true, false);

            BattleManager._spriteset = spriteset;
            BattleManager._logWindow = logWindow;

            // Rebuild enemy sprites for the new troop
            for (const sprite of spriteset._enemySprites) {
                spriteset._battleField.removeChild(sprite);
            }
            spriteset._enemySprites = [];
            spriteset.createEnemies();

            // Force visibility reset — bitmap may not be loaded yet so
            // initVisibility won't have fired via updateBitmap
            for (const sprite of spriteset._enemySprites) {
                sprite.opacity = 255;
                sprite._appeared = true;
            }

            BattleManager.playBattleBgm();
            BattleManager.startBattle();
        } else {
            endChain();
        }

        return;
    }

    _BattleManager_updateBattleEnd.call(this);
};

function snapshotSkills() {
    skillSnapshots = {};
    for (const actor of $gameParty.members()) {
        skillSnapshots[actor.actorId()] = actor.skills().map(s => s.id);
    }
}

function collectNewSkills() {
    const newSkills = {};
    for (const actor of $gameParty.members()) {
        const before = skillSnapshots[actor.actorId()] || [];
        const after = actor.skills().map(s => s.id);
        const learned = after.filter(id => !before.includes(id));
        newSkills[actor.actorId()] = learned.map(id => $dataSkills[id]);
    }
    return newSkills;
}

function endChain() {
    chainActive = false;

    $gameParty.gainGold(totalGold);

    // Grant exp and then diff skills to find what was learned
    const _shouldDisplay = Game_Actor.prototype.shouldDisplayLevelUp;
    Game_Actor.prototype.shouldDisplayLevelUp = function() { return false; };
    $gameParty.members().forEach(actor => actor.gainExp(totalExp));
    Game_Actor.prototype.shouldDisplayLevelUp = _shouldDisplay;
    const newSkills = collectNewSkills();

    totalDrops.forEach(item => $gameParty.gainItem(item, 1));

    // Pop back to map first, then push results scene
    SceneManager.pop();

    const wavesCompleted = infiniteMode ? currentWave : maxWaves;

    // Update best performance if current results are better
    if (wavesCompleted > $gameVariables.value(1)) {
        $gameVariables.setValue(1, wavesCompleted);
    }
    if (totalGold > $gameVariables.value(2)) {
        $gameVariables.setValue(2, totalGold);
    }
    if (totalExp > $gameVariables.value(3)) {
        $gameVariables.setValue(3, totalExp);
    }

    // Pass results data to the scene via a static property
    Scene_ChainResults.resultsData = {
        waves: wavesCompleted,
        exp: totalExp,
        gold: totalGold,
        drops: totalDrops.slice(),
        newSkills: newSkills
    };

    SceneManager.push(Scene_ChainResults);
}

PluginManager.registerCommand(
    document.currentScript.src.match(/([^\/]+)\.js$/)[1],
    "StartChain",
    args => {
        troopId = Number(args.troopBaseId);
        maxWaves = infiniteMode ? Infinity : Number(args.waves);
        infiniteMode = args.infinite === "true";

        currentWave = 0;
        totalExp = 0;
        totalGold = 0;
        totalDrops = [];

        chainActive = true;

        snapshotSkills();

        BattleManager.setup(troopId, true, false);
        SceneManager.push(Scene_Battle);
    }
);

})();