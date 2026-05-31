/*:
 * @target MZ
 * @plugindesc Character AI Menu — Script editor UI
 * @author AI Assistant
 *
 * @help character_ai_menu.js
 *
 * Adds a "Character AI" option to the main menu.
 * Opens a full script editor where the player can create, edit,
 * reorder, rename and activate AI scripts for each actor.
 *
 * Requires: character_ai.js
 *
 * Plugin commands:
 *   OpenCharacterAI          — open for all actors
 *   OpenCharacterAIForActor  — open for a specific actor
 *
 * @command OpenCharacterAI
 * @text Open Character AI (all actors)
 *
 * @command OpenCharacterAIForActor
 * @text Open Character AI (specific actor)
 * @arg actorId
 * @type actor
 * @text Actor
 */

(() => {
    "use strict";

    const PLUGIN_NAME = document.currentScript.src.match(/([^\/]+)\.js$/)[1];

// =============================================================================
// Constants
// =============================================================================

    const CAI = {
        // Condition targets
        COND_TARGETS: ["self", "ally", "ally_team", "enemy", "enemy_team"],
        COND_TARGET_LABELS: ["Self", "Any Ally", "Ally Team", "Any Enemy", "Enemy Team"],

        // Condition stats
        COND_STATS: ["always", "hp_percent", "mp_percent", "tp_percent",
            "status", "enemy_count", "turn"],
        COND_STAT_LABELS: ["Always", "HP %", "MP %", "TP %",
            "Status", "Enemy Count", "Turn"],

        // Operators
        OPERATORS: ["lt", "lte", "gt", "gte", "eq", "neq"],
        OPERATOR_LABELS: ["<", "<=", ">", ">=", "==", "!="],

        // Status types
        STATUS_TYPES: ["any", "positive", "negative", "specific"],
        STATUS_TYPE_LABELS: ["Any", "Positive", "Negative", "Specific"],

        // Command types
        CMD_TYPES: ["attack", "guard", "magic", "special", "item"],
        CMD_TYPE_LABELS: ["Attack", "Guard", "Magic", "Special", "Item"],

        // Target targets (action target)
        TGT_TARGETS: ["self", "ally", "ally_team", "enemy", "enemy_team"],
        TGT_TARGET_LABELS: ["Self", "Ally (single)", "All Allies", "Enemy (single)", "All Enemies"],

        // Target stats
        TGT_STATS: ["none", "hp_percent", "mp_percent", "tp_percent", "random"],
        TGT_STAT_LABELS: ["None", "HP %", "MP %", "TP %", "Random"],

        // Target priorities
        TGT_PRIORITIES: ["first", "lowest", "highest", "random", "none"],
        TGT_PRIORITY_LABELS: ["First", "Lowest", "Highest", "Random", "None"],

        // Default new rule
        DEFAULT_RULE: () => ({
            condition: {
                target: "self",
                stat: "always",
                operator: "lt",
                value: 50,
                statusId: 1,
                statusType: "any"
            },
            command: {
                type: "attack",
                skillId: 1,
                itemId: 1
            },
            target: {
                target: "enemy",
                stat: "random",
                priority: "random"
            }
        })
    };

// =============================================================================
// Game_Actor — multi-script storage
// =============================================================================

    const _Game_Actor_initMembers = Game_Actor.prototype.initMembers;
    Game_Actor.prototype.initMembers = function() {
        _Game_Actor_initMembers.call(this);
        this._aiScripts = [];
        this._activeScriptIndex = 0;
    };

    Game_Actor.prototype.getAiScript = function() {
        const s = this._aiScripts[this._activeScriptIndex];
        return s ? s.rules : [];
    };

    Game_Actor.prototype.setAiScript = function(rules) {
        if (this._aiScripts.length === 0) {
            this._aiScripts.push({ name: "Script 1", rules: [] });
            this._activeScriptIndex = 0;
        }
        this._aiScripts[this._activeScriptIndex].rules = rules;
    };

    Game_Actor.prototype.getAiScripts = function() {
        return this._aiScripts;
    };

    Game_Actor.prototype.addAiScript = function(name) {
        this._aiScripts.push({ name: name || "New Script", rules: [] });
        return this._aiScripts.length - 1;
    };

    Game_Actor.prototype.removeAiScript = function(index) {
        this._aiScripts.splice(index, 1);
        if (this._activeScriptIndex >= this._aiScripts.length) {
            this._activeScriptIndex = Math.max(0, this._aiScripts.length - 1);
        }
    };

    Game_Actor.prototype.renameAiScript = function(index, name) {
        if (this._aiScripts[index]) {
            this._aiScripts[index].name = name;
        }
    };

    Game_Actor.prototype.setActiveAiScript = function(index) {
        if (index >= 0 && index < this._aiScripts.length) {
            this._activeScriptIndex = index;
        }
    };

    Game_Actor.prototype.getActiveAiScriptIndex = function() {
        return this._activeScriptIndex;
    };

// =============================================================================
// Main Menu — add "Character AI" entry
// =============================================================================

    const _Window_MenuCommand_addOriginalCommands =
        Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function() {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand("Character AI", "characterAI", true);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("characterAI", () => {
            SceneManager.push(Scene_CharacterAI);
            Scene_CharacterAI.targetActorId = null;
        });
    };

// =============================================================================
// Plugin Commands
// =============================================================================

    PluginManager.registerCommand(PLUGIN_NAME, "OpenCharacterAI", () => {
        Scene_CharacterAI.targetActorId = null;
        SceneManager.push(Scene_CharacterAI);
    });

    PluginManager.registerCommand(PLUGIN_NAME, "OpenCharacterAIForActor", args => {
        Scene_CharacterAI.targetActorId = Number(args.actorId);
        SceneManager.push(Scene_CharacterAI);
    });

// =============================================================================
// Scene_CharacterAI — top level scene
// =============================================================================

    function Scene_CharacterAI() {
        this.initialize(...arguments);
    }

    Scene_CharacterAI.targetActorId = null;

    Scene_CharacterAI.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_CharacterAI.prototype.constructor = Scene_CharacterAI;

    Scene_CharacterAI.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_CharacterAI.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createActorWindow();
        this.createScriptListWindow();
    };

    Scene_CharacterAI.prototype.actorWindowWidth = function() {
        return 220;
    };

    Scene_CharacterAI.prototype.createActorWindow = function() {
        const rect = new Rectangle(
            0, 0,
            this.actorWindowWidth(),
            Graphics.boxHeight
        );
        this._actorWindow = new Window_CAI_ActorSelect(rect);
        this._actorWindow.setHandler("ok",     this.onActorOk.bind(this));
        this._actorWindow.setHandler("cancel", this.popScene.bind(this));

        // If launched for a specific actor, lock to that actor
        if (Scene_CharacterAI.targetActorId !== null) {
            const members = $gameParty.members();
            const idx = members.findIndex(
                a => a.actorId() === Scene_CharacterAI.targetActorId
            );
            this._actorWindow.select(idx >= 0 ? idx : 0);
            this._actorWindow.deactivate();
        }

        this.addWindow(this._actorWindow);
    };

    Scene_CharacterAI.prototype.createScriptListWindow = function() {
        const wx = this.actorWindowWidth();
        const rect = new Rectangle(
            wx, 0,
            Graphics.boxWidth - wx,
            Graphics.boxHeight
        );
        this._scriptListWindow = new Window_CAI_ScriptList(rect);
        this._scriptListWindow.setHandler("ok",        this.onScriptOk.bind(this));
        this._scriptListWindow.setHandler("cancel",    this.onScriptCancel.bind(this));
        this._scriptListWindow.setHandler("new",       this.onScriptNew.bind(this));
        this._scriptListWindow.setHandler("delete",    this.onScriptDelete.bind(this));
        this._scriptListWindow.setHandler("rename",    this.onScriptRename.bind(this));
        this._scriptListWindow.setHandler("activate",  this.onScriptActivate.bind(this));
        this._scriptListWindow.deactivate();
        this.addWindow(this._scriptListWindow);

        if (Scene_CharacterAI.targetActorId !== null) {
            const members = $gameParty.members();
            const actor = members.find(
                a => a.actorId() === Scene_CharacterAI.targetActorId
            );
            if (actor) {
                this._scriptListWindow.setActor(actor);
                this._scriptListWindow.activate();
                this._scriptListWindow.select(0);
            }
        }
    };

    Scene_CharacterAI.prototype.onActorOk = function() {
        const actor = this._actorWindow.selectedActor();
        this._scriptListWindow.setActor(actor);
        this._scriptListWindow.activate();
        this._scriptListWindow.select(0);
        this._actorWindow.deactivate();
    };

    Scene_CharacterAI.prototype.onScriptCancel = function() {
        this._scriptListWindow.deactivate();
        this._actorWindow.activate();
    };

    Scene_CharacterAI.prototype.onScriptOk = function() {
        const actor = this._actorWindow.selectedActor();
        const idx   = this._scriptListWindow.selectedScriptIndex();
        if (idx === null) return; // "New Script" row
        SceneManager.push(Scene_ScriptEditor);
        Scene_ScriptEditor.setup(actor, idx);
        this._scriptListWindow.deactivate();
    };

    Scene_CharacterAI.prototype.onScriptNew = function() {
        const actor = this._actorWindow.selectedActor();
        // Open name input then create
        this._pendingActor = actor;
        this._openNameInput("New Script", (name) => {
            const idx = actor.addAiScript(name);
            this._scriptListWindow.refresh();
            this._scriptListWindow.select(idx);
            this._scriptListWindow.activate();
        });
    };

    Scene_CharacterAI.prototype.onScriptDelete = function() {
        const actor = this._actorWindow.selectedActor();
        const idx   = this._scriptListWindow.selectedScriptIndex();
        if (idx === null) return;
        actor.removeAiScript(idx);
        this._scriptListWindow.refresh();
        this._scriptListWindow.select(
            Math.min(idx, actor.getAiScripts().length - 1)
        );
        this._scriptListWindow.activate();
    };

    Scene_CharacterAI.prototype.onScriptRename = function() {
        const actor = this._actorWindow.selectedActor();
        const idx   = this._scriptListWindow.selectedScriptIndex();
        if (idx === null) return;
        const current = actor.getAiScripts()[idx].name;
        this._openNameInput(current, (name) => {
            actor.renameAiScript(idx, name);
            this._scriptListWindow.refresh();
            this._scriptListWindow.activate();
        });
    };

    Scene_CharacterAI.prototype.onScriptActivate = function() {
        const actor = this._actorWindow.selectedActor();
        const idx   = this._scriptListWindow.selectedScriptIndex();
        if (idx === null) return;
        actor.setActiveAiScript(idx);
        this._scriptListWindow.refresh();
        this._scriptListWindow.activate();
    };

    Scene_CharacterAI.prototype._openNameInput = function(initialName, callback) {
        this._nameInputCallback = callback;
        // Temporarily store on a dummy actor-like object for Scene_Name
        this._nameInputTarget = { _name: initialName, name: () => initialName };
        SceneManager.push(Scene_CAI_NameInput);
        Scene_CAI_NameInput.setup(initialName, 16, (name) => {
            this._nameInputCallback(name);
        });
    };

// Re-activate script list when returning from script editor
    const _Scene_CharacterAI_start = Scene_CharacterAI.prototype.start;
    Scene_CharacterAI.prototype.start = function() {
        if (_Scene_CharacterAI_start) _Scene_CharacterAI_start.call(this);
        // Refresh in case rules changed
        if (this._scriptListWindow) {
            this._scriptListWindow.refresh();
            if (!this._actorWindow.active) {
                this._scriptListWindow.activate();
            }
        }
    };

// =============================================================================
// Scene_CAI_NameInput — thin wrapper around RPG Maker's name input
// =============================================================================

    function Scene_CAI_NameInput() {
        this.initialize(...arguments);
    }

    Scene_CAI_NameInput._callback = null;
    Scene_CAI_NameInput._initialName = "";
    Scene_CAI_NameInput._maxLength = 16;

    Scene_CAI_NameInput.setup = function(initialName, maxLength, callback) {
        this._initialName = initialName || "";
        this._maxLength   = maxLength   || 16;
        this._callback    = callback;
    };

    Scene_CAI_NameInput.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_CAI_NameInput.prototype.constructor = Scene_CAI_NameInput;

    Scene_CAI_NameInput.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_CAI_NameInput.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);

        // Fake actor object that Scene_Name / Window_NameEdit expect
        this._fakeActor = {
            name: () => Scene_CAI_NameInput._initialName,
            battlerName: () => "",
            faceName:    () => "",
            faceIndex:   () => 0,
            characterName: () => "",
            characterIndex: () => 0
        };

        const editBoxHeight = 72;
        const inputHeight   = Graphics.boxHeight - editBoxHeight - 8;

        const editRect  = new Rectangle(
            (Graphics.boxWidth - 480) / 2, 80, 480, editBoxHeight
        );
        const inputRect = new Rectangle(
            (Graphics.boxWidth - 480) / 2,
            80 + editBoxHeight + 8,
            480,
            inputHeight - 80
        );

        this._editWindow  = new Window_NameEdit(editRect);
        this._editWindow.setup(
            this._fakeActor,
            Scene_CAI_NameInput._maxLength
        );

        this._inputWindow = new Window_NameInput(inputRect);
        this._inputWindow.setEditWindow(this._editWindow);
        this._inputWindow.setHandler("ok", this.onInputOk.bind(this));

        this.addWindow(this._editWindow);
        this.addWindow(this._inputWindow);
    };

    Scene_CAI_NameInput.prototype.onInputOk = function() {
        const name = this._editWindow.name();
        if (Scene_CAI_NameInput._callback) {
            Scene_CAI_NameInput._callback(name);
        }
        SceneManager.pop();
    };

// =============================================================================
// Window_CAI_ActorSelect
// =============================================================================

    function Window_CAI_ActorSelect() {
        this.initialize(...arguments);
    }

    Window_CAI_ActorSelect.prototype = Object.create(Window_Selectable.prototype);
    Window_CAI_ActorSelect.prototype.constructor = Window_CAI_ActorSelect;

    Window_CAI_ActorSelect.prototype.initialize = function(rect) {
        Window_Selectable.prototype.initialize.call(this, rect);
        this.refresh();
        this.select(0);
        this.activate();
    };

    Window_CAI_ActorSelect.prototype.maxItems = function() {
        return $gameParty.members().length;
    };

    Window_CAI_ActorSelect.prototype.itemHeight = function() {
        return 72;
    };

    Window_CAI_ActorSelect.prototype.drawItem = function(index) {
        const actor = $gameParty.members()[index];
        if (!actor) return;
        const rect = this.itemLineRect(index);
        const pad  = this.itemPadding();
        const faceSize = 48;
        const faceY = rect.y + Math.floor((rect.height - faceSize) / 2);

        this.drawFace(actor.faceName(), actor.faceIndex(),
            rect.x, faceY, faceSize, faceSize);

        const textX = rect.x + faceSize + pad;
        const textW = rect.width - faceSize - pad;

        this.changeTextColor(ColorManager.normalColor());
        this.contents.fontSize = 16;
        // Name: upper half of the item
        this.drawText(actor.name(), textX, rect.y + 6, textW);

        const scripts = actor.getAiScripts();
        const activeIdx = actor.getActiveAiScriptIndex();
        const activeScript = scripts[activeIdx];
        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = 13;
        // Active script name: lower half of the item
        this.drawText(
            activeScript ? `▶ ${activeScript.name}` : "No script",
            textX, rect.y + 28, textW
        );

        this.resetFontSettings();
    };

    Window_CAI_ActorSelect.prototype.selectedActor = function() {
        return $gameParty.members()[this.index()];
    };

// =============================================================================
// Window_CAI_ScriptList
// =============================================================================

    function Window_CAI_ScriptList() {
        this.initialize(...arguments);
    }

    Window_CAI_ScriptList.prototype = Object.create(Window_Selectable.prototype);
    Window_CAI_ScriptList.prototype.constructor = Window_CAI_ScriptList;

    Window_CAI_ScriptList.prototype.initialize = function(rect) {
        this._actor = null;
        Window_Selectable.prototype.initialize.call(this, rect);
    };

    Window_CAI_ScriptList.prototype.setActor = function(actor) {
        this._actor = actor;
        this.refresh();
    };

    Window_CAI_ScriptList.prototype.maxItems = function() {
        if (!this._actor) return 0;
        return this._actor.getAiScripts().length + 1; // +1 for "New Script"
    };

    Window_CAI_ScriptList.prototype.itemHeight = function() {
        return 48;
    };

// Title takes up the first 36px; all items render below it
    Window_CAI_ScriptList.prototype.titleHeight = function() {
        return 36;
    };

    Window_CAI_ScriptList.prototype.overallHeight = function() {
        return this.maxItems() * this.itemHeight();
    };

// Push all item rects down below the title
    Window_CAI_ScriptList.prototype.itemRect = function(index) {
        const rect = Window_Selectable.prototype.itemRect.call(this, index);
        rect.y += this.titleHeight();
        return rect;
    };

    Window_CAI_ScriptList.prototype.drawItem = function(index) {
        if (!this._actor) return;
        const scripts   = this._actor.getAiScripts();
        const activeIdx = this._actor.getActiveAiScriptIndex();
        const rect = this.itemRect(index);
        const pad  = this.itemPadding();

        if (index === scripts.length) {
            // "New Script" row — vertically centre text in the item rect
            this.changeTextColor(ColorManager.textColor(14));
            this.contents.fontSize = 16;
            const textY = rect.y + Math.floor((rect.height - 16) / 2);
            this.drawText(
                "[+ New Script]",
                rect.x + pad,
                textY,
                rect.width - pad * 2
            );
            this.resetFontSettings();
            return;
        }

        const script   = scripts[index];
        const isActive = index === activeIdx;
        // Split the 48px row into two text lines
        const lineOneY = rect.y + 6;
        const lineTwoY = rect.y + 26;

        if (isActive) {
            this.changeTextColor(ColorManager.textColor(6));
            this.drawText("▶", rect.x + pad, lineOneY, 24);
        }

        this.changeTextColor(ColorManager.normalColor());
        this.contents.fontSize = 16;
        this.drawText(
            script.name,
            rect.x + pad + (isActive ? 28 : 4),
            lineOneY,
            rect.width - pad - (isActive ? 28 : 4)
        );

        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = 13;
        const ruleCount = script.rules.length;
        this.drawText(
            `${ruleCount} rule${ruleCount !== 1 ? "s" : ""}`,
            rect.x + pad + 4,
            lineTwoY,
            rect.width - pad * 2
        );

        this.resetFontSettings();
    };

    Window_CAI_ScriptList.prototype.selectedScriptIndex = function() {
        if (!this._actor) return null;
        const scripts = this._actor.getAiScripts();
        const idx = this.index();
        if (idx === scripts.length) return null;
        return idx;
    };

    Window_CAI_ScriptList.prototype.isCurrentItemEnabled = function() {
        return true;
    };

    Window_CAI_ScriptList.prototype.processOk = function() {
        if (!this._actor) return;
        const scripts = this._actor.getAiScripts();
        if (this.index() === scripts.length) {
            this.callHandler("new");
        } else {
            this.callHandler("ok");
        }
    };

    Window_CAI_ScriptList.prototype.drawTitle = function() {
        if (!this._actor) return;
        const fontSize = 18;
        const textY    = Math.floor((this.titleHeight() - fontSize) / 2);
        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = fontSize;
        this.drawText(
            `${this._actor.name()} — Scripts`,
            this.itemPadding(), textY, this.innerWidth - this.itemPadding() * 2
        );
        this.resetFontSettings();
    };


    Window_CAI_ScriptList.prototype.refresh = function() {
        if (this.contents) {
            this.contents.clear();
            this.drawTitle();
        }
        Window_Selectable.prototype.refresh.call(this);
    };

    Window_CAI_ScriptList.prototype.processHandling = function() {
        Window_Selectable.prototype.processHandling.call(this);
        if (this.active && this.selectedScriptIndex() !== null) {
            if (Input.isTriggered("shift"))    this.callHandler("rename");
            if (Input.isTriggered("pagedown")) this.callHandler("delete");
            if (Input.isTriggered("pageup"))   this.callHandler("activate");
        }
    };

// =============================================================================
// Scene_ScriptEditor
// =============================================================================

    function Scene_ScriptEditor() {
        this.initialize(...arguments);
    }

    Scene_ScriptEditor._actor       = null;
    Scene_ScriptEditor._scriptIndex = 0;

    Scene_ScriptEditor.setup = function(actor, scriptIndex) {
        this._actor       = actor;
        this._scriptIndex = scriptIndex;
    };

    Scene_ScriptEditor.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_ScriptEditor.prototype.constructor = Scene_ScriptEditor;

    Scene_ScriptEditor.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
    };

    Scene_ScriptEditor.prototype.actor = function() {
        return Scene_ScriptEditor._actor;
    };

    Scene_ScriptEditor.prototype.scriptIndex = function() {
        return Scene_ScriptEditor._scriptIndex;
    };

    Scene_ScriptEditor.prototype.currentScript = function() {
        const actor = this.actor();
        if (!actor) return null;
        return actor.getAiScripts()[this.scriptIndex()];
    };

    Scene_ScriptEditor.prototype.headerHeight = function() {
        return 48;
    };

    Scene_ScriptEditor.prototype.footerHeight = function() {
        return 48;
    };

    Scene_ScriptEditor.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHeaderWindow();
        this.createRuleListWindow();
        this.createRuleEditorWindow();
        this.createFooterWindow();
    };

    Scene_ScriptEditor.prototype.createHeaderWindow = function() {
        const rect = new Rectangle(0, 0, Graphics.boxWidth, this.headerHeight());
        this._headerWindow = new Window_CAI_EditorHeader(rect);
        this.addWindow(this._headerWindow);
        this._headerWindow.setScript(this.currentScript(), this.actor());
    };

    Scene_ScriptEditor.prototype.ruleListHeight = function() {
        return Graphics.boxHeight - this.headerHeight() - this.footerHeight();
    };

    Scene_ScriptEditor.prototype.createRuleListWindow = function() {
        const rect = new Rectangle(
            0, this.headerHeight(),
            Graphics.boxWidth,
            this.ruleListHeight()
        );
        this._ruleListWindow = new Window_CAI_RuleList(rect);
        this._ruleListWindow.setScript(this.currentScript());
        this._ruleListWindow.setHandler("ok",       this.onRuleOk.bind(this));
        this._ruleListWindow.setHandler("cancel",   this.onRuleCancel.bind(this));
        this._ruleListWindow.setHandler("new",      this.onRuleNew.bind(this));
        this._ruleListWindow.setHandler("delete",   this.onRuleDelete.bind(this));
        this._ruleListWindow.setHandler("moveUp",   this.onRuleMoveUp.bind(this));
        this._ruleListWindow.setHandler("moveDown", this.onRuleMoveDown.bind(this));
        this._ruleListWindow.activate();
        this._ruleListWindow.select(0);
        this.addWindow(this._ruleListWindow);
    };

    Scene_ScriptEditor.prototype.createRuleEditorWindow = function() {
        const rect = new Rectangle(
            0, this.headerHeight(),
            Graphics.boxWidth,
            this.ruleListHeight()
        );
        this._ruleEditorWindow = new Window_CAI_RuleEditor(rect);
        this._ruleEditorWindow.setHandler("cancel", this.onEditorCancel.bind(this));
        this._ruleEditorWindow.hide();
        this._ruleEditorWindow.deactivate();
        this.addWindow(this._ruleEditorWindow);
    };

    Scene_ScriptEditor.prototype.createFooterWindow = function() {
        const rect = new Rectangle(
            0, Graphics.boxHeight - this.footerHeight(),
            Graphics.boxWidth,
            this.footerHeight()
        );
        this._footerWindow = new Window_CAI_EditorFooter(rect);
        this.addWindow(this._footerWindow);
        this._footerWindow.setMode("list");
    };

    Scene_ScriptEditor.prototype.onRuleOk = function() {
        const script = this.currentScript();
        const idx    = this._ruleListWindow.selectedRuleIndex();
        if (idx === null) return; // "Add Rule" row — handled by "new"
        this._ruleEditorWindow.setRule(script.rules[idx], script, idx);
        this._ruleEditorWindow.show();
        this._ruleEditorWindow.activate();
        this._ruleListWindow.hide();
        this._ruleListWindow.deactivate();
        this._footerWindow.setMode("editor");
    };

    Scene_ScriptEditor.prototype.onRuleNew = function() {
        const script = this.currentScript();
        const newRule = CAI.DEFAULT_RULE();
        script.rules.push(newRule);
        const idx = script.rules.length - 1;
        this._ruleListWindow.refresh();
        this._ruleEditorWindow.setRule(newRule, script, idx);
        this._ruleEditorWindow.show();
        this._ruleEditorWindow.activate();
        this._ruleListWindow.hide();
        this._ruleListWindow.deactivate();
        this._footerWindow.setMode("editor");
    };

    Scene_ScriptEditor.prototype.onRuleDelete = function() {
        const script = this.currentScript();
        const idx    = this._ruleListWindow.selectedRuleIndex();
        if (idx === null) return;
        script.rules.splice(idx, 1);
        this._ruleListWindow.refresh();
        this._ruleListWindow.select(
            Math.min(idx, script.rules.length)
        );
        this._ruleListWindow.activate();
    };

    Scene_ScriptEditor.prototype.onRuleMoveUp = function() {
        const script = this.currentScript();
        const idx    = this._ruleListWindow.selectedRuleIndex();
        if (idx === null || idx === 0) {
            this._ruleListWindow.activate();
            return;
        }
        [script.rules[idx - 1], script.rules[idx]] =
            [script.rules[idx], script.rules[idx - 1]];
        this._ruleListWindow.refresh();
        this._ruleListWindow.select(idx - 1);
        this._ruleListWindow.activate();
    };

    Scene_ScriptEditor.prototype.onRuleMoveDown = function() {
        const script = this.currentScript();
        const idx    = this._ruleListWindow.selectedRuleIndex();
        if (idx === null || idx >= script.rules.length - 1) {
            this._ruleListWindow.activate();
            return;
        }
        [script.rules[idx], script.rules[idx + 1]] =
            [script.rules[idx + 1], script.rules[idx]];
        this._ruleListWindow.refresh();
        this._ruleListWindow.select(idx + 1);
        this._ruleListWindow.activate();
    };

    Scene_ScriptEditor.prototype.onRuleCancel = function() {
        SceneManager.pop();
    };

    Scene_ScriptEditor.prototype.onEditorCancel = function() {
        this._ruleEditorWindow.hide();
        this._ruleEditorWindow.deactivate();
        this._ruleListWindow.refresh();
        this._ruleListWindow.show();
        this._ruleListWindow.activate();
        this._footerWindow.setMode("list");
    };

// =============================================================================
// Window_CAI_EditorHeader
// =============================================================================

    function Window_CAI_EditorHeader() {
        this.initialize(...arguments);
    }

    Window_CAI_EditorHeader.prototype = Object.create(Window_Base.prototype);
    Window_CAI_EditorHeader.prototype.constructor = Window_CAI_EditorHeader;

    Window_CAI_EditorHeader.prototype.initialize = function(rect) {
        this._script = null;
        this._actor  = null;
        Window_Base.prototype.initialize.call(this, rect);
    };

    Window_CAI_EditorHeader.prototype.setScript = function(script, actor) {
        this._script = script;
        this._actor  = actor;
        this.refresh();
    };

    Window_CAI_EditorHeader.prototype.refresh = function() {
        this.contents.clear();
        if (!this._actor || !this._script) return;
        const pad    = this.itemPadding();
        const fontSize = 18;
        const textY  = Math.floor((this.innerHeight - fontSize) / 2);
        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = fontSize;
        this.drawText(
            `${this._actor.name()}  —  ${this._script.name}`,
            pad, textY, this.innerWidth - pad * 2
        );
        this.resetFontSettings();
    };



// =============================================================================
// Window_CAI_EditorFooter — hints bar
// =============================================================================

    function Window_CAI_EditorFooter() {
        this.initialize(...arguments);
    }

    Window_CAI_EditorFooter.prototype = Object.create(Window_Base.prototype);
    Window_CAI_EditorFooter.prototype.constructor = Window_CAI_EditorFooter;

    Window_CAI_EditorFooter.prototype.initialize = function(rect) {
        this._mode = "list";
        Window_Base.prototype.initialize.call(this, rect);
        this.refresh();
    };

    Window_CAI_EditorFooter.prototype.setMode = function(mode) {
        this._mode = mode;
        this.refresh();
    };

    Window_CAI_EditorFooter.prototype.refresh = function() {
        this.contents.clear();
        const pad      = this.itemPadding();
        const fontSize = 13;
        const textY    = Math.floor((this.innerHeight - fontSize) / 2);
        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = fontSize;
        if (this._mode === "list") {
            this.drawText(
                "[OK] Edit    [PgDn] Delete    [Q/W] Move    [Shift] Rename    [B] Back",
                pad, textY, this.innerWidth - pad * 2
            );
        } else {
            this.drawText(
                "[←→] Switch column    [↑↓] Change value    [B] Done",
                pad, textY, this.innerWidth - pad * 2
            );
        }
        this.resetFontSettings();
    };

// =============================================================================
// Window_CAI_RuleList
// =============================================================================

    function Window_CAI_RuleList() {
        this.initialize(...arguments);
    }

    Window_CAI_RuleList.prototype = Object.create(Window_Selectable.prototype);
    Window_CAI_RuleList.prototype.constructor = Window_CAI_RuleList;

    Window_CAI_RuleList.prototype.initialize = function(rect) {
        this._script = null;
        Window_Selectable.prototype.initialize.call(this, rect);
    };

    Window_CAI_RuleList.prototype.setScript = function(script) {
        this._script = script;
        this.refresh();
    };

    Window_CAI_RuleList.prototype.maxItems = function() {
        if (!this._script) return 0;
        return this._script.rules.length + 1; // +1 for "Add Rule"
    };

    Window_CAI_RuleList.prototype.itemHeight = function() {
        return 40;
    };

    Window_CAI_RuleList.prototype.drawItem = function(index) {
        if (!this._script) return;
        const rules = this._script.rules;
        const rect  = this.itemRect(index);
        const pad   = this.itemPadding();
        // Vertically centre within the 40px row
        const lineH   = 20;
        const centreY = rect.y + Math.floor((rect.height - lineH) / 2);

        if (index === rules.length) {
            this.changeTextColor(ColorManager.textColor(14));
            this.contents.fontSize = 15;
            this.drawText("[+ Add Rule]", rect.x + pad, centreY, rect.width - pad * 2);
            this.resetFontSettings();
            return;
        }

        const rule = rules[index];
        const summary = this.buildSummary(rule);

        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = 13;
        this.drawText(`${index + 1}.`, rect.x + pad, centreY, 24);

        this.changeTextColor(ColorManager.normalColor());
        this.contents.fontSize = 14;
        this.drawText(summary, rect.x + pad + 28, centreY,
            rect.width - pad - 28);

        this.resetFontSettings();
    };

    Window_CAI_RuleList.prototype.buildSummary = function(rule) {
        const cond = this.summariseCondition(rule.condition);
        const cmd  = this.summariseCommand(rule.command);
        const tgt  = this.summariseTarget(rule.target);
        return `${cond}  ▸  ${cmd}  ▸  ${tgt}`;
    };

    Window_CAI_RuleList.prototype.summariseCondition = function(c) {
        if (!c) return "?";
        if (c.stat === "always") return "Always";

        const tgt = CAI.COND_TARGET_LABELS[CAI.COND_TARGETS.indexOf(c.target)] || c.target;

        if (c.stat === "enemy_count") {
            const op = CAI.OPERATOR_LABELS[CAI.OPERATORS.indexOf(c.operator)] || c.operator;
            return `Enemies ${op} ${c.value}`;
        }
        if (c.stat === "turn") {
            const op = CAI.OPERATOR_LABELS[CAI.OPERATORS.indexOf(c.operator)] || c.operator;
            return `Turn ${op} ${c.value}`;
        }
        if (c.stat === "status") {
            return `${tgt} has ${c.statusType} status`;
        }

        const statLabel = CAI.COND_STAT_LABELS[CAI.COND_STATS.indexOf(c.stat)] || c.stat;
        const op = CAI.OPERATOR_LABELS[CAI.OPERATORS.indexOf(c.operator)] || c.operator;
        return `${tgt} ${statLabel} ${op} ${c.value}%`;
    };

    Window_CAI_RuleList.prototype.summariseCommand = function(c) {
        if (!c) return "?";
        switch (c.type) {
            case "attack":  return "Attack";
            case "guard":   return "Guard";
            case "magic": {
                const s = $dataSkills[c.skillId];
                return s ? `Magic: ${s.name}` : "Magic: ?";
            }
            case "special": {
                const s = $dataSkills[c.skillId];
                return s ? `Special: ${s.name}` : "Special: ?";
            }
            case "item": {
                const it = $dataItems[c.itemId];
                return it ? `Item: ${it.name}` : "Item: ?";
            }
            default: return "?";
        }
    };

    Window_CAI_RuleList.prototype.summariseTarget = function(t) {
        if (!t) return "?";
        const tgtLabel = CAI.TGT_TARGET_LABELS[CAI.TGT_TARGETS.indexOf(t.target)] || t.target;
        if (t.stat === "none" || t.stat === "random" || t.priority === "none") {
            return tgtLabel;
        }
        const statLabel = CAI.TGT_STAT_LABELS[CAI.TGT_STATS.indexOf(t.stat)] || t.stat;
        const priLabel  = CAI.TGT_PRIORITY_LABELS[CAI.TGT_PRIORITIES.indexOf(t.priority)]
            || t.priority;
        return `${tgtLabel} (${priLabel} ${statLabel})`;
    };

    Window_CAI_RuleList.prototype.selectedRuleIndex = function() {
        if (!this._script) return null;
        const idx = this.index();
        if (idx === this._script.rules.length) return null;
        return idx;
    };

    Window_CAI_RuleList.prototype.processOk = function() {
        if (!this._script) return;
        if (this.index() === this._script.rules.length) {
            this.callHandler("new");
        } else {
            this.callHandler("ok");
        }
    };

    Window_CAI_RuleList.prototype.processHandling = function() {
        Window_Selectable.prototype.processHandling.call(this);
        if (!this.active) return;
        if (this.selectedRuleIndex() !== null) {
            if (Input.isTriggered("pagedown")) this.callHandler("delete");
            if (Input.isTriggered("pageup"))   this.callHandler("moveUp");
            if (Input.isTriggered("shift"))    this.callHandler("moveDown");
        }
    };

// =============================================================================
// Window_CAI_RuleEditor — three-column inline editor
// =============================================================================

    function Window_CAI_RuleEditor() {
        this.initialize(...arguments);
    }

// Extend Window_Selectable so setHandler is available
    Window_CAI_RuleEditor.prototype = Object.create(Window_Selectable.prototype);
    Window_CAI_RuleEditor.prototype.constructor = Window_CAI_RuleEditor;

    Window_CAI_RuleEditor.COLUMNS = ["condition", "command", "target"];

    Window_CAI_RuleEditor.prototype.initialize = function(rect) {
        this._rule        = null;
        this._script      = null;
        this._ruleIndex   = 0;
        this._activeCol   = 0;
        this._fieldIndex  = 0;
        Window_Selectable.prototype.initialize.call(this, rect);
    };

    Window_CAI_RuleEditor.prototype.setRule = function(rule, script, index) {
        this._rule      = rule;
        this._script    = script;
        this._ruleIndex = index;
        this._activeCol = 0;
        this._fieldIndex = 0;
        this.refresh();
    };

// ---- Field definitions per column ----

    Window_CAI_RuleEditor.prototype.conditionFields = function() {
        const c = this._rule.condition;
        const fields = [
            {
                label: "Target",
                options: CAI.COND_TARGETS,
                labels:  CAI.COND_TARGET_LABELS,
                get: () => c.target,
                set: v  => { c.target = v; }
            },
            {
                label: "Stat",
                options: CAI.COND_STATS,
                labels:  CAI.COND_STAT_LABELS,
                get: () => c.stat,
                set: v  => { c.stat = v; }
            }
        ];
        if (c.stat !== "always") {
            if (c.stat === "status") {
                fields.push({
                    label: "Status Type",
                    options: CAI.STATUS_TYPES,
                    labels:  CAI.STATUS_TYPE_LABELS,
                    get: () => c.statusType,
                    set: v  => { c.statusType = v; }
                });
                if (c.statusType === "specific") {
                    fields.push({
                        label: "State ID",
                        type:  "number",
                        min: 1, max: $dataStates ? $dataStates.length - 1 : 99,
                        get: () => c.statusId,
                        set: v  => { c.statusId = v; }
                    });
                }
            } else {
                fields.push({
                    label: "Operator",
                    options: CAI.OPERATORS,
                    labels:  CAI.OPERATOR_LABELS,
                    get: () => c.operator,
                    set: v  => { c.operator = v; }
                });
                fields.push({
                    label: "Value",
                    type:  "number",
                    min: 0,
                    max: (c.stat === "enemy_count" || c.stat === "turn") ? 999 : 100,
                    get: () => c.value,
                    set: v  => { c.value = v; }
                });
            }
        }
        return fields;
    };

    Window_CAI_RuleEditor.prototype.commandFields = function(actor) {
        const c = this._rule.command;
        const fields = [
            {
                label: "Type",
                options: CAI.CMD_TYPES,
                labels:  CAI.CMD_TYPE_LABELS,
                get: () => c.type,
                set: v  => { c.type = v; }
            }
        ];
        if (c.type === "magic" || c.type === "special") {
            const skills = actor ? actor.skills() : [];
            const filtered = skills.filter(s => {
                if (!s) return false;
                // Magic = stypeId 1, Special = stypeId 2 (default MZ setup)
                // Adjust these IDs to match your database
                if (c.type === "magic")   return s.stypeId === 1;
                if (c.type === "special") return s.stypeId === 2;
                return true;
            });
            if (filtered.length > 0) {
                fields.push({
                    label: "Skill",
                    options: filtered.map(s => s.id),
                    labels:  filtered.map(s => s.name),
                    get: () => c.skillId,
                    set: v  => { c.skillId = v; }
                });
            }
        }
        if (c.type === "item") {
            const items = $dataItems
                ? $dataItems.filter(it => it && it.itypeId === 1)
                : [];
            if (items.length > 0) {
                fields.push({
                    label: "Item",
                    options: items.map(it => it.id),
                    labels:  items.map(it => it.name),
                    get: () => c.itemId,
                    set: v  => { c.itemId = v; }
                });
            }
        }
        return fields;
    };

    Window_CAI_RuleEditor.prototype.targetFields = function() {
        const t = this._rule.target;
        const fields = [
            {
                label: "Target",
                options: CAI.TGT_TARGETS,
                labels:  CAI.TGT_TARGET_LABELS,
                get: () => t.target,
                set: v  => { t.target = v; }
            },
            {
                label: "By Stat",
                options: CAI.TGT_STATS,
                labels:  CAI.TGT_STAT_LABELS,
                get: () => t.stat,
                set: v  => { t.stat = v; }
            }
        ];
        if (t.stat !== "none" && t.stat !== "random") {
            fields.push({
                label: "Priority",
                options: CAI.TGT_PRIORITIES,
                labels:  CAI.TGT_PRIORITY_LABELS,
                get: () => t.priority,
                set: v  => { t.priority = v; }
            });
        }
        return fields;
    };

    Window_CAI_RuleEditor.prototype.getFields = function(col) {
        const actor = Scene_ScriptEditor._actor;
        switch (col) {
            case 0: return this.conditionFields();
            case 1: return this.commandFields(actor);
            case 2: return this.targetFields();
            default: return [];
        }
    };

// ---- Input handling ----

    Window_CAI_RuleEditor.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (!this.active || !this._rule) return;

        const fields = this.getFields(this._activeCol);
        const clampedField = Math.min(this._fieldIndex, fields.length - 1);
        if (clampedField !== this._fieldIndex) {
            this._fieldIndex = clampedField;
            this.refresh();
            return;
        }

        let dirty = false;

        // Left/right: switch column
        if (Input.isTriggered("left") && this._activeCol > 0) {
            this._activeCol--;
            this._fieldIndex = 0;
            dirty = true;
        } else if (Input.isTriggered("right") && this._activeCol < 2) {
            this._activeCol++;
            this._fieldIndex = 0;
            dirty = true;
        }
        // Up/down: move between fields
        else if (Input.isTriggered("up") && this._fieldIndex > 0) {
            this._fieldIndex--;
            dirty = true;
        } else if (Input.isTriggered("down") &&
            this._fieldIndex < fields.length - 1) {
            this._fieldIndex++;
            dirty = true;
        }
        // OK / left-right on active field: cycle value
        else if (Input.isTriggered("ok") ||
            Input.isRepeated("right") ||
            Input.isRepeated("left")) {

            // Only act on right/left if no column change was triggered above
            if (!Input.isTriggered("left") && !Input.isTriggered("right") ||
                Input.isTriggered("ok")) {
                const field = fields[this._fieldIndex];
                if (field) {
                    if (field.type === "number") {
                        const delta = Input.isTriggered("left") ||
                        (Input.isRepeated("left") && !Input.isTriggered("ok"))
                            ? -1 : 1;
                        const newVal = Math.min(
                            field.max,
                            Math.max(field.min, field.get() + delta)
                        );
                        field.set(newVal);
                        dirty = true;
                    } else {
                        const opts = field.options;
                        const cur  = opts.indexOf(field.get());
                        const delta = Input.isTriggered("left") ||
                        (Input.isRepeated("left") && !Input.isTriggered("ok"))
                            ? -1 : 1;
                        const next = (cur + delta + opts.length) % opts.length;
                        field.set(opts[next]);
                        dirty = true;
                    }
                }
            }
        }

        if (Input.isTriggered("cancel")) {
            this.callHandler("cancel");
            return;
        }

        if (dirty) this.refresh();
    };

// ---- Drawing ----

    Window_CAI_RuleEditor.prototype.colWidth = function() {
        return Math.floor(this.innerWidth / 3);
    };

    Window_CAI_RuleEditor.prototype.refresh = function() {
        this.contents.clear();
        if (!this._rule) return;
        this.drawPreview();
        this.drawColumns();
    };

    Window_CAI_RuleEditor.prototype.previewHeight = function() {
        return 36;
    };

    Window_CAI_RuleEditor.prototype.drawPreview = function() {
        const pad = this.itemPadding();
        const summary = this.buildPreviewText();
        this.changeTextColor(ColorManager.textColor(14));
        this.contents.fontSize = 14;
        this.drawText(summary, pad, 4, this.innerWidth - pad * 2);
        // Divider
        this.contents.fillRect(
            pad, this.previewHeight() - 4,
            this.innerWidth - pad * 2, 1,
            ColorManager.textColor(8)
        );
        this.resetFontSettings();
    };

    Window_CAI_RuleEditor.prototype.buildPreviewText = function() {
        // Reuse the rule list summariser
        const dummy = new Window_CAI_RuleList(new Rectangle(0,0,1,1));
        const cond = dummy.summariseCondition(this._rule.condition);
        const cmd  = dummy.summariseCommand(this._rule.command);
        const tgt  = dummy.summariseTarget(this._rule.target);
        return `${cond}  ▸  ${cmd}  ▸  ${tgt}`;
    };

    Window_CAI_RuleEditor.prototype.drawColumns = function() {
        let colW     = this.colWidth();  // Use `let` for reassignment
        const previewH = this.previewHeight();
        const topY     = previewH + 8;  // Start after the preview section
        const pad      = this.itemPadding();
        const colNames = ["CONDITION", "COMMAND", "TARGET"];
        const rowH     = 30;            // Increased row height to avoid clipping
        const headerH  = 20;            // Height of the column header
        const fontSize = 14;            // Base font size for headers

        // Ensure the total column width + dividers matches the inner width
        const totalColWidth = colW * 3 + 2; // 2px for the two column dividers
        if (totalColWidth > this.innerWidth) {
            colW = Math.floor(this.innerWidth / 3);
        }

        for (let col = 0; col < 3; col++) {
            const cx     = col * colW;
            const fields = this.getFields(col);
            const isActive = col === this._activeCol;

            // Column header — vertically center within its 20px band
            const headerTextY = topY + Math.floor((headerH - fontSize) / 2);
            this.changeTextColor(
                isActive ? ColorManager.textColor(14) : ColorManager.systemColor()
            );
            this.contents.fontSize = fontSize;
            this.drawText(colNames[col], cx + pad, headerTextY, colW - pad * 2);

            // Underline header — draw at the bottom of the header
            this.contents.fillRect(
                cx + pad, topY + headerH,
                colW - pad * 2, 1,
                isActive ? ColorManager.textColor(14) : ColorManager.textColor(8)
            );

            // Fields
            let fy = topY + headerH + 2; // Start after the header (2px padding)
            for (let fi = 0; fi < fields.length; fi++) {
                const field    = fields[fi];
                const isSelRow = isActive && fi === this._fieldIndex;
                // Vertically center text within the rowH band
                const textY    = fy + Math.floor((rowH - 13) / 2); // 13 is font size for value

                // Row highlight
                if (isSelRow) {
                    this.contents.fillRect(
                        cx, fy, colW, rowH,
                        ColorManager.dimColor1()
                    );
                }

                // Label
                this.changeTextColor(
                    isSelRow ? ColorManager.textColor(14) : ColorManager.systemColor()
                );
                this.contents.fontSize = 12;
                const labelW = Math.floor(colW * 0.45);
                const labelY = fy + Math.floor((rowH - 12) / 2);
                this.drawText(field.label, cx + pad, labelY, labelW - pad);

                // Value
                let valStr;
                if (field.type === "number") {
                    valStr = String(field.get());
                } else {
                    const cur = field.options.indexOf(field.get());
                    valStr = field.labels[cur >= 0 ? cur : 0] || "?";
                }

                this.changeTextColor(ColorManager.normalColor());
                this.contents.fontSize = 13;
                this.drawText(
                    valStr,
                    cx + labelW + pad, textY,
                    colW - labelW - pad * 2
                );

                fy += rowH;
            }

            // Column divider
            if (col < 2) {
                this.contents.fillRect(
                    cx + colW - 1, topY,
                    1, this.innerHeight - topY,
                    ColorManager.textColor(8)
                );
            }
        }
    };

// Input cycling needs more nuanced left/right handling — override to
// prevent Window_Base eating left/right as cursor movement
    Window_CAI_RuleEditor.prototype.processTouch = function() {};

})();