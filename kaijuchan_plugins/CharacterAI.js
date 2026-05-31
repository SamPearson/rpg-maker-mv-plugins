/*:
 * @target MZ
 * @plugindesc Character AI Script System
 * @author AI Assistant
 *
 * @help CharacterAI.js
 *
 * Provides a per-actor AI scripting system. When an actor has autobattle
 * active and a non-empty AI script, their script is evaluated instead of
 * the default autobattle scoring.
 *
 * Each rule has three parts:
 *   condition  - when to trigger (target, stat, operator, value)
 *   command    - what to do (attack, guard, magic, special, item)
 *   target     - who to aim at (target, stat, priority)
 *
 * Scripts are stored on Game_Actor and persist in save data.
 *
 * API:
 *   CharacterAI.setScript(actorId, rules)
 *   CharacterAI.getScript(actorId)
 *   CharacterAI.clearScript(actorId)
 *
 * Rule shape:
 *   {
 *     condition: {
 *       target:     "self" | "ally" | "ally_team" | "enemy" | "enemy_team",
 *       stat:       "hp_percent" | "mp_percent" | "tp_percent" |
 *                   "status" | "enemy_count" | "turn" | "always",
 *       operator:   "lt" | "lte" | "gt" | "gte" | "eq" | "neq",
 *       value:      Number,
 *       statusId:   Number,       // for stat "status", specific state ID
 *       statusType: "any" | "positive" | "negative" | "specific"
 *     },
 *     command: {
 *       type:    "attack" | "guard" | "magic" | "special" | "item",
 *       skillId: Number,   // for magic / special
 *       itemId:  Number    // for item
 *     },
 *     target: {
 *       target:   "self" | "ally" | "ally_team" | "enemy" | "enemy_team",
 *       stat:     "hp_percent" | "mp_percent" | "tp_percent" | "random" | "none",
 *       priority: "lowest" | "highest" | "random" | "first" | "none"
 *     }
 *   }
 */

(() => {
    "use strict";

// =============================================================================
// CharacterAI — public API namespace
// =============================================================================

    const CharacterAI = {};
    window.CharacterAI = CharacterAI;

    CharacterAI.setScript = function(actorId, rules) {
        const actor = $gameActors.actor(actorId);
        if (actor) actor.setAiScript(rules);
    };

    CharacterAI.getScript = function(actorId) {
        const actor = $gameActors.actor(actorId);
        return actor ? actor.getAiScript() : [];
    };

    CharacterAI.clearScript = function(actorId) {
        const actor = $gameActors.actor(actorId);
        if (actor) actor.setAiScript([]);
    };

// =============================================================================
// Game_Actor — script storage
// =============================================================================

    const _Game_Actor_initMembers = Game_Actor.prototype.initMembers;
    Game_Actor.prototype.initMembers = function() {
        _Game_Actor_initMembers.call(this);
        this._aiScript = [];
    };

    Game_Actor.prototype.setAiScript = function(rules) {
        this._aiScript = Array.isArray(rules) ? rules : [];
    };

    Game_Actor.prototype.getAiScript = function() {
        return this._aiScript || [];
    };

// =============================================================================
// Game_Actor — autobattle hook
// =============================================================================

    const _Game_Actor_makeAutoBattleActions = Game_Actor.prototype.makeAutoBattleActions;
    Game_Actor.prototype.makeAutoBattleActions = function() {
        const script = this.getAiScript();
        if (script.length > 0) {
            const applied = CharacterAI.Interpreter.evaluate(this, script);
            if (applied) return;
        }
        // Fallback to default RPG Maker autobattle scoring
        _Game_Actor_makeAutoBattleActions.call(this);
    };

// =============================================================================
// CharacterAI.Interpreter
// =============================================================================

    CharacterAI.Interpreter = {};

    /**
     * Walk the script rules top-to-bottom.
     * Return true if a rule was successfully applied, false if we fell through.
     */
    CharacterAI.Interpreter.evaluate = function(actor, rules) {
        for (const rule of rules) {
            if (!rule || !rule.condition || !rule.command || !rule.target) continue;
            if (!this.checkCondition(actor, rule.condition)) continue;
            if (!this.canExecuteCommand(actor, rule.command)) continue;
            const resolved = this.resolveTarget(actor, rule.target, rule.command);
            if (resolved === null) continue;
            this.applyCommand(actor, rule.command, resolved);
            return true;
        }
        return false;
    };

// =============================================================================
// Condition Evaluation
// =============================================================================

    CharacterAI.Interpreter.checkCondition = function(actor, cond) {
        if (cond.stat === "always") return true;

        switch (cond.stat) {
            case "hp_percent":
            case "mp_percent":
            case "tp_percent":
                return this.checkStatCondition(actor, cond);
            case "status":
                return this.checkStatusCondition(actor, cond);
            case "enemy_count":
                return this.compare(
                    $gameTroop.aliveMembers().length,
                    cond.operator,
                    cond.value
                );
            case "turn":
                return this.compare(
                    $gameTroop.turnCount(),
                    cond.operator,
                    cond.value
                );
            default:
                return false;
        }
    };

    CharacterAI.Interpreter.checkStatCondition = function(actor, cond) {
        const members = this.getMembersForConditionTarget(actor, cond.target);
        if (!members || members.length === 0) return false;

        if (cond.target === "ally_team" || cond.target === "enemy_team") {
            // Use group average
            const avg = this.averageStat(members, cond.stat);
            return this.compare(avg, cond.operator, cond.value);
        } else {
            // "self", "ally", "enemy" — any individual passes
            return members.some(m =>
                this.compare(this.getStat(m, cond.stat), cond.operator, cond.value)
            );
        }
    };

    CharacterAI.Interpreter.checkStatusCondition = function(actor, cond) {
        const members = this.getMembersForConditionTarget(actor, cond.target);
        if (!members || members.length === 0) return false;

        const check = (member) => {
            switch (cond.statusType) {
                case "specific":
                    return member.isStateAffected(cond.statusId);
                case "any":
                    return member.states().length > 0;
                case "positive":
                    return member.states().some(s => s.restriction === 0);
                case "negative":
                    return member.states().some(s => s.restriction > 0);
                default:
                    return false;
            }
        };

        if (cond.target === "ally_team" || cond.target === "enemy_team") {
            return members.every(check);
        } else {
            return members.some(check);
        }
    };

    CharacterAI.Interpreter.getMembersForConditionTarget = function(actor, target) {
        switch (target) {
            case "self":
                return [actor];
            case "ally":
            case "ally_team":
                return $gameParty.aliveMembers();
            case "enemy":
            case "enemy_team":
                return $gameTroop.aliveMembers();
            default:
                return [];
        }
    };

    CharacterAI.Interpreter.getStat = function(member, stat) {
        switch (stat) {
            case "hp_percent": return (member.hp / member.mhp) * 100;
            case "mp_percent": return member.mmp > 0 ? (member.mp / member.mmp) * 100 : 100;
            case "tp_percent": return (member.tp / member.maxTp()) * 100;
            default: return 0;
        }
    };

    CharacterAI.Interpreter.averageStat = function(members, stat) {
        if (members.length === 0) return 0;
        const total = members.reduce((sum, m) => sum + this.getStat(m, stat), 0);
        return total / members.length;
    };

    CharacterAI.Interpreter.compare = function(a, operator, b) {
        switch (operator) {
            case "lt":  return a <  b;
            case "lte": return a <= b;
            case "gt":  return a >  b;
            case "gte": return a >= b;
            case "eq":  return a === b;
            case "neq": return a !== b;
            default:    return false;
        }
    };

// =============================================================================
// Command Validation
// =============================================================================

    CharacterAI.Interpreter.canExecuteCommand = function(actor, command) {
        switch (command.type) {
            case "attack":
                return actor.canAttack();
            case "guard":
                return actor.canGuard();
            case "magic":
            case "special": {
                const skill = $dataSkills[command.skillId];
                if (!skill) return false;
                if (!actor.hasSkill(command.skillId)) return false;
                return actor.canUse(skill);
            }
            case "item": {
                const item = $dataItems[command.itemId];
                if (!item) return false;
                return $gameParty.hasItem(item) && actor.canUse(item);
            }
            default:
                return false;
        }
    };

// =============================================================================
// Target Resolution
// =============================================================================

    /**
     * Returns a resolved Game_Battler target, or null if none is valid.
     * For "ally_team" and "enemy_team" we return a representative member;
     * the skill's own scope (all allies / all enemies) handles the rest.
     */
    CharacterAI.Interpreter.resolveTarget = function(actor, targetDef, command) {
        const candidates = this.getCandidates(actor, targetDef.target);
        if (!candidates || candidates.length === 0) return null;

        // AoE scopes: just return the first alive candidate as a placeholder;
        // Game_Action will apply to all via its own scope logic
        if (this.isAoeCommand(command)) {
            return candidates[0];
        }

        switch (targetDef.priority) {
            case "lowest":
                return this.pickByStat(candidates, targetDef.stat, "lowest");
            case "highest":
                return this.pickByStat(candidates, targetDef.stat, "highest");
            case "random":
                return candidates[Math.floor(Math.random() * candidates.length)];
            case "first":
            case "none":
            default:
                return candidates[0];
        }
    };

    CharacterAI.Interpreter.getCandidates = function(actor, target) {
        switch (target) {
            case "self":
                return [actor];
            case "ally":
            case "ally_team":
                return $gameParty.aliveMembers();
            case "enemy":
            case "enemy_team":
                return $gameTroop.aliveMembers();
            default:
                return [];
        }
    };

    CharacterAI.Interpreter.isAoeCommand = function(command) {
        if (command.type === "attack" || command.type === "guard") return false;
        if (command.type === "item") {
            const item = $dataItems[command.itemId];
            return item ? this.isAoeScope(item.scope) : false;
        }
        const skill = $dataSkills[command.skillId];
        return skill ? this.isAoeScope(skill.scope) : false;
    };

// RPG Maker MZ scope IDs for multi-target
// 2=all enemies, 4=random enemies, 8=all allies, 10=all allies(incl.dead), 11=everyone
    CharacterAI.Interpreter.isAoeScope = function(scope) {
        return [2, 4, 8, 10, 11].includes(scope);
    };

    CharacterAI.Interpreter.pickByStat = function(candidates, stat, priority) {
        if (stat === "random" || stat === "none") {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }
        return candidates.reduce((best, m) => {
            const mVal = this.getStat(m, stat);
            const bVal = this.getStat(best, stat);
            if (priority === "lowest") return mVal < bVal ? m : best;
            if (priority === "highest") return mVal > bVal ? m : best;
            return best;
        });
    };

// =============================================================================
// Command Application
// =============================================================================

    CharacterAI.Interpreter.applyCommand = function(actor, command, target) {
        const action = new Game_Action(actor, false);

        switch (command.type) {
            case "attack":
                action.setAttack();
                break;
            case "guard":
                action.setGuard();
                break;
            case "magic":
            case "special":
                action.setSkill(command.skillId);
                break;
            case "item":
                action.setItem(command.itemId);
                break;
            default:
                return;
        }

        // Set the target using Game_Action's built-in target index resolution
        this.applyTarget(action, actor, target);

        // Assign to the actor's first action slot
        actor.setAction(0, action);
    };

    CharacterAI.Interpreter.applyTarget = function(action, actor, target) {
        // For skills/items that target all, RPG Maker resolves targets automatically
        // We only need to set a specific index for single-target scopes
        const item = action.item();
        if (!item) return;

        const scope = item.scope;

        // Single enemy targets (scope 1 = one enemy, 3 = random enemy)
        if (scope === 1 || scope === 3) {
            const enemies = $gameTroop.aliveMembers();
            const idx = enemies.indexOf(target);
            if (idx >= 0) action.setTarget(idx);
            else action.setTarget(0);
            return;
        }

        // Single ally targets (scope 7 = one ally, 9 = one ally incl. dead)
        if (scope === 7 || scope === 9) {
            const allies = $gameParty.aliveMembers();
            const idx = allies.indexOf(target);
            if (idx >= 0) action.setTarget(idx);
            else action.setTarget(0);
            return;
        }

        // Self (scope 11 is everyone, scope for "user" is handled by the skill)
        if (scope === 11) {
            action.setTarget(0);
            return;
        }

        // All other scopes (AoE, etc.) — no index needed
    };

})();