/*:
 * @target MZ
 * @plugindesc Actor Instance Core - manages runtime instances of species actor templates
 * @author
 *
 * @command Create
 * @text Create Instance
 *
 * @arg speciesId
 * @type actor
 * @text Species (Actor Template)
 *
 * @arg key
 * @type string
 * @text Key (optional)
 * @default
 *
 * @arg nature
 * @type string
 * @text Nature (optional)
 * @default
 *
 * @arg runsRemaining
 * @type number
 * @text Runs Remaining
 * @default 1
 *
 * @arg isPermanent
 * @type boolean
 * @text Permanent (ignores Runs Remaining)
 * @default false
 *
 * @command AddToParty
 * @text Add Instance to Party
 *
 * @arg key
 * @type string
 * @text Key
 *
 * @arg instanceId
 * @type number
 * @text Instance ID (if no key)
 * @default 0
 *
 * @command CreateAndAddToParty
 * @text Create Instance and Add to Party
 *
 * @arg speciesId
 * @type actor
 * @text Species (Actor Template)
 *
 * @arg key
 * @type string
 * @text Key (optional)
 * @default
 *
 * @arg nature
 * @type string
 * @text Nature (optional)
 * @default
 *
 * @arg runsRemaining
 * @type number
 * @text Runs Remaining
 * @default 1
 *
 * @arg isPermanent
 * @type boolean
 * @text Permanent (ignores Runs Remaining)
 * @default false
 *
 * @command RemoveFromParty
 * @text Remove Instance from Party
 *
 * @arg key
 * @type string
 * @text Key
 *
 * @arg instanceId
 * @type number
 * @text Instance ID (if no key)
 * @default 0
 *
 * @command SendToStorage
 * @text Send Instance to Storage
 *
 * @arg key
 * @type string
 * @text Key
 *
 * @arg instanceId
 * @type number
 * @text Instance ID (if no key)
 * @default 0
 *
 * @command RetrieveFromStorage
 * @text Retrieve Instance from Storage
 *
 * @arg key
 * @type string
 * @text Key
 *
 * @arg instanceId
 * @type number
 * @text Instance ID (if no key)
 * @default 0
 *
 * @command ListStoredInstances
 * @text List Stored Instances
 *
 * @arg key
 * @type string
 * @text Key (optional)
 * @default
 *
 * @command IsInstanceInStorage
 * @text Is Instance in Storage?
 *
 * @arg key
 * @type string
 * @text Key
 *
 * @arg instanceId
 * @type number
 * @text Instance ID (if no key)
 * @default 0
 *
 * @command DecrementRuns
 * @text Decrement Runs Remaining
 *
 * @command ExpireAll
 * @text Expire All Zero-Run Instances
 */


(() => {
    "use strict";

    const PLUGIN_NAME = document.currentScript.src.match(/([^\/]+)\.js$/)[1];

// ─────────────────────────────────────────────
//  $dataActors slot pool
//
//  Indices 0..N are the designer's templates and are never touched.
//  Instances are written into indices beyond that range.
//  Freed slots are recycled by the next create() call.
// ─────────────────────────────────────────────

// Populated once on first use, after $dataActors has loaded.
    let _templateCount = 0;
    let _freeSlots     = [];  // recycled dataActorIds available for reuse

    function _ensureTemplateCount() {
        if (_templateCount === 0) {
            // $dataActors is 1-indexed; index 0 is null by convention
            _templateCount = $dataActors.length;
        }
    }

    function _claimSlot() {
        _ensureTemplateCount();
        if (_freeSlots.length > 0) {
            return _freeSlots.pop();
        }
        // Append a new slot
        const id = $dataActors.length;
        $dataActors.push(null); // placeholder; will be overwritten immediately
        return id;
    }

    function _releaseSlot(dataActorId) {
        $dataActors[dataActorId] = null;
        _freeSlots.push(dataActorId);
    }

    function _deepCopyTemplate(speciesId) {
        // JSON round-trip is sufficient — $dataActors entries are plain data
        return JSON.parse(JSON.stringify($dataActors[speciesId]));
    }

// ─────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────

    let _nextInstanceId = 1;

    function _generateInstanceId() {
        return _nextInstanceId++;
    }

    function _resolveEntry(key, instanceId) {
        if (key && key.trim() !== "") {
            return ActorInstanceManager.find(key);
        }
        if (instanceId && instanceId !== 0) {
            return ActorInstanceManager.find(instanceId);
        }
        return null;
    }

// ─────────────────────────────────────────────
//  Game_Party — data init
// ─────────────────────────────────────────────

    const _Game_Party_initialize = Game_Party.prototype.initialize;
    Game_Party.prototype.initialize = function() {
        _Game_Party_initialize.call(this);
        this._actorInstances   = [];
        this._nextInstanceId   = 1;
        this._freeSlots        = [];
    };

// ─────────────────────────────────────────────
//  New game hook — convert starting actors to instances
// ─────────────────────────────────────────────

    const _DataManager_setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        _DataManager_setupNewGame.call(this);
        _convertStartingActors();
    };

    function _convertStartingActors() {
        const startingActorIds = $gameParty._actors.slice();
        $gameParty._actors = [];

        for (const actorId of startingActorIds) {
            const entry = ActorInstanceManager.create(actorId, {
                isPermanent: true,
                key: $dataActors[actorId].name
            });
            $gameParty.addActor(entry.dataActorId);
        }
    }

// ─────────────────────────────────────────────
//  Save / load
// ─────────────────────────────────────────────

    const _DataManager_makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _DataManager_makeSaveContents.call(this);
        // Persist the slot pool state so we reconstruct the same IDs on load
        contents.actorInstanceSlots = {
            nextInstanceId: _nextInstanceId,
            freeSlots:      _freeSlots.slice()
        };
        return contents;
    };

    const _DataManager_extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _DataManager_extractSaveContents.call(this, contents);

        // Restore slot pool state before rehydrating instances
        if (contents.actorInstanceSlots) {
            _nextInstanceId = contents.actorInstanceSlots.nextInstanceId || 1;
            _freeSlots      = contents.actorInstanceSlots.freeSlots      || [];
        }

        _rehydrateActorInstances();
    };

    function _rehydrateActorInstances() {
        if (!$gameParty._actorInstances) {
            $gameParty._actorInstances = [];
            $gameParty._nextInstanceId = 1;
            return;
        }

        _nextInstanceId = $gameParty._nextInstanceId || 1;

        for (const entry of $gameParty._actorInstances) {
            // Migrate saves that predate isPermanent
            if (entry.isPermanent === undefined) entry.isPermanent = false;

            // Re-inject the actor data entry into $dataActors at the same slot
            $dataActors[entry.dataActorId] = JSON.parse(entry.dataActorSnapshot);

            // Reconstruct the live Game_Actor object at that ID
            // $gameActors._data is the internal array Game_Actors uses
            const actor = new Game_Actor(entry.dataActorId);
            $gameActors._data[entry.dataActorId] = actor;
        }
    }

// ─────────────────────────────────────────────
//  ActorInstanceManager
// ─────────────────────────────────────────────

    const ActorInstanceManager = (() => {

        const _listeners = { create: [], add: [], remove: [], expire: [] };

        function on(event, fn) {
            if (_listeners[event]) _listeners[event].push(fn);
        }

        function _emit(event, entry) {
            for (const fn of (_listeners[event] || [])) fn(entry);
        }

        function _instances() {
            return $gameParty._actorInstances;
        }

        // ── Factory ──────────────────────────────

        function create(speciesId, options = {}) {
            const instanceId  = _generateInstanceId();
            const dataActorId = _claimSlot();

            // Deep copy the template and assign it a unique ID
            const dataEntry   = _deepCopyTemplate(speciesId);
            dataEntry.id      = dataActorId;

            // Future extension point: options.applyToData(dataEntry) could
            // let a species plugin mutate name, params, traits, etc. before
            // the Game_Actor is constructed from it
            if (typeof options.applyToData === "function") {
                options.applyToData(dataEntry);
            }

            // Write into $dataActors so the engine can resolve it normally
            $dataActors[dataActorId] = dataEntry;

            // Register with $gameActors so $gameActors.actor(id) works
            const actor = new Game_Actor(dataActorId);
            $gameActors._data[dataActorId] = actor;

            const entry = {
                instanceId:       instanceId,
                speciesId:        speciesId,
                dataActorId:      dataActorId,
                // Snapshot the data entry for save/load reconstruction
                dataActorSnapshot: JSON.stringify(dataEntry),
                key:              options.key     || null,
                nature:           options.nature  || null,
                isPermanent:      options.isPermanent === true,
                runsRemaining:    options.runsRemaining ?? 1
            };

            $gameParty._actorInstances.push(entry);
            $gameParty._nextInstanceId = _nextInstanceId;

            _emit("create", entry);
            return entry;
        }

        // ── Lookup ───────────────────────────────

        function find(idOrKey) {
            if (typeof idOrKey === "string") {
                return _instances().find(e => e.key === idOrKey) || null;
            }
            return _instances().find(e => e.instanceId === idOrKey) || null;
        }

        // Convenience — get the live Game_Actor for an entry
        function actor(idOrKey) {
            const entry = find(idOrKey);
            if (!entry) return null;
            return $gameActors.actor(entry.dataActorId);
        }

        function all() {
            return _instances().slice();
        }

        function inParty() {
            return _instances().filter(
                e => $gameParty._actors.includes(e.dataActorId)
            );
        }

        function inStorage() {
            return _instances().filter(
                e => !$gameParty._actors.includes(e.dataActorId)
            );
        }

        function bySpecies(speciesId) {
            return _instances().filter(e => e.speciesId === speciesId);
        }

        // ── Party management ─────────────────────

        function addToParty(idOrKey) {
            const entry = find(idOrKey);
            if (!entry) {
                console.warn(`ActorInstanceManager.addToParty: no instance found for`, idOrKey);
                return;
            }

            if ($gameParty._actors.includes(entry.dataActorId)) return;

            const maxMembers = $gameParty.maxBattleMembers();
            if ($gameParty._actors.length >= maxMembers) {
                console.warn(`ActorInstanceManager.addToParty: party is full (max ${maxMembers})`);
                return;
            }

            $gameParty.addActor(entry.dataActorId);
            _emit("add", entry);
        }

        function removeFromParty(idOrKey) {
            const entry = find(idOrKey);
            if (!entry) {
                console.warn(`ActorInstanceManager.removeFromParty: no instance found for`, idOrKey);
                return;
            }

            if (!$gameParty._actors.includes(entry.dataActorId)) return;

            $gameParty.removeActor(entry.dataActorId);
            _emit("remove", entry);
        }

        function sendToStorage(idOrKey) {
            removeFromParty(idOrKey);
        }

        // ── Equipment cleanup on expiry ──────────

        function _handleExpiredActorEquipment(gameActor) {
            for (const gameItem of gameActor._equips) {
                if (gameItem.isNull()) continue;
                const item = gameItem.object();
                if (!item) continue;
                $gameParty.gainItem(item, 1);
                gameItem.setObject(null);
            }
            gameActor.refresh();
        }

        // ── Lifecycle ────────────────────────────

        function decrementRuns() {
            for (const entry of _instances()) {
                if (!entry.isPermanent) {
                    entry.runsRemaining = Math.max(0, entry.runsRemaining - 1);
                }
            }
        }

        function expireAll() {
            const toExpire = _instances().filter(
                e => !e.isPermanent && e.runsRemaining <= 0
            );

            for (const entry of toExpire) {
                removeFromParty(entry.instanceId);

                const gameActor = $gameActors.actor(entry.dataActorId);
                if (gameActor) _handleExpiredActorEquipment(gameActor);

                // Free the $dataActors slot for reuse
                _releaseSlot(entry.dataActorId);

                // Remove from $gameActors registry
                $gameActors._data[entry.dataActorId] = undefined;

                _emit("expire", entry);
            }

            const expiredIds = new Set(toExpire.map(e => e.instanceId));
            $gameParty._actorInstances = _instances().filter(
                e => !expiredIds.has(e.instanceId)
            );
        }

        return {
            on,
            create,
            find,
            actor,
            all,
            inParty,
            inStorage,
            bySpecies,
            addToParty,
            removeFromParty,
            sendToStorage,
            decrementRuns,
            expireAll
        };

    })();

    window.ActorInstanceManager = ActorInstanceManager;

// ─────────────────────────────────────────────
//  Plugin Commands
// ─────────────────────────────────────────────

    PluginManager.registerCommand(PLUGIN_NAME, "Create", args => {
        const speciesId     = Number(args.speciesId);
        const runsRemaining = Number(args.runsRemaining) ?? 1;
        const isPermanent   = args.isPermanent === "true";
        const key           = args.key    && args.key.trim()    !== "" ? args.key.trim()    : null;
        const nature        = args.nature && args.nature.trim() !== "" ? args.nature.trim() : null;

        ActorInstanceManager.create(speciesId, { key, nature, runsRemaining, isPermanent });
    });

    PluginManager.registerCommand(PLUGIN_NAME, "AddToParty", args => {
        const entry = _resolveEntry(args.key, Number(args.instanceId));
        if (entry) ActorInstanceManager.addToParty(entry.instanceId);
    });

    PluginManager.registerCommand(PLUGIN_NAME, "CreateAndAddToParty", args => {
        const speciesId     = Number(args.speciesId);
        const runsRemaining = Number(args.runsRemaining) ?? 1;
        const isPermanent   = args.isPermanent === "true";
        const key           = args.key    && args.key.trim()    !== "" ? args.key.trim()    : null;
        const nature        = args.nature && args.nature.trim() !== "" ? args.nature.trim() : null;

        const entry = ActorInstanceManager.create(speciesId, { key, nature, runsRemaining, isPermanent });
        ActorInstanceManager.addToParty(entry.instanceId);
    });

    PluginManager.registerCommand(PLUGIN_NAME, "RemoveFromParty", args => {
        const entry = _resolveEntry(args.key, Number(args.instanceId));
        if (entry) ActorInstanceManager.removeFromParty(entry.instanceId);
    });

    PluginManager.registerCommand(PLUGIN_NAME, "SendToStorage", args => {
        const entry = _resolveEntry(args.key, Number(args.instanceId));
        if (entry) ActorInstanceManager.sendToStorage(entry.instanceId);
    });

    PluginManager.registerCommand(PLUGIN_NAME, "DecrementRuns", () => {
        ActorInstanceManager.decrementRuns();
    });

    PluginManager.registerCommand(PLUGIN_NAME, "ExpireAll", () => {
        ActorInstanceManager.expireAll();
    });

    PluginManager.registerCommand(PLUGIN_NAME, "SendToStorage", args => {
        const idOrKey = args.idOrKey;
        const instance = ActorInstanceManager.find(idOrKey);
        if (instance) {
            ActorInstanceManager.removeFromParty(idOrKey);
        } else {
            console.warn(`ActorInstanceManager.SendToStorage: no instance found for`, idOrKey);
        }
    });

    PluginManager.registerCommand(PLUGIN_NAME, "RetrieveFromStorage", args => {
        const idOrKey = args.idOrKey;
        const instance = ActorInstanceManager.find(idOrKey);
        if (instance) {
            ActorInstanceManager.addToParty(idOrKey);
        } else {
            console.warn(`ActorInstanceManager.RetrieveFromStorage: no instance found for`, idOrKey);
        }
    });

    PluginManager.registerCommand(PLUGIN_NAME, "ListStoredInstances", args => {
        const storedInstances = ActorInstanceManager.inStorage();
        console.log("Stored Instances:", storedInstances);
    });

    PluginManager.registerCommand(PLUGIN_NAME, "IsInstanceInStorage", args => {
        const idOrKey = args.idOrKey;
        const instance = ActorInstanceManager.find(idOrKey);
        const isInStorage = !instance || !instance.dataActorId || !$gameParty._actors.includes(instance.dataActorId);
        console.log("Is in storage:", isInStorage);
    });




})();