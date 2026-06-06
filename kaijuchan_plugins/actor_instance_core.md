# Actor Instance Core — Quickstart Guide

## What It Does

This plugin replaces RPG Maker's static actor system with a runtime instance
system. Instead of actors being permanent database entries, they become generated
copies of template actors ("species") that can have unique stats, natures, run
countdowns, and independent progression. The engine sees them as normal actors
everywhere — menus, battle, map sprites, all work without modification.

---

## Core Concepts

**Species** — a normal actor defined in the RPG Maker database. Think of it as
a blueprint. You never add a species to the party directly; you create an
instance of it.

**Instance** — a live copy of a species, injected into the game at runtime. It
has its own level, stats, equips, and metadata. Multiple instances of the same
species can exist simultaneously.

**Storage** — instances that exist but are not in the active party. Like the
Pokémon PC box. They persist in save data and can be moved back into the party
at any time.

---

## Setup

### 1. Define your species in the database

Create actors in the RPG Maker editor as you normally would. Set their class,
starting level, equipment, skills, and stats. These are your templates. They
never appear in the game directly.

### 2. Set your starting party

In the RPG Maker database under **System**, set your starting party members as
normal. On new game, the plugin automatically converts them to permanent
instances. You do not need to call any plugin commands for this.

### 3. Install the plugin

Place `actor_instance_core.js` in your project's `js/plugins` folder and enable
it in the Plugin Manager.

---

## Plugin Commands

### Create

Creates a new instance of a species. Does **not** add it to the party
automatically.

| Parameter     | Type    | Description                                                    |
|---------------|---------|----------------------------------------------------------------|
| Species       | Actor   | The template actor to copy                                     |
| Key           | String  | Optional name for referencing this instance later in events    |
| Nature        | String  | Optional nature label — stored for use by future plugins       |
| Runs Remaining| Number  | How many chain runs before this instance expires               |
| Permanent     | Boolean | If true, the instance never expires regardless of Runs         |

### AddToParty

Moves an instance from storage into the active party. Respects the party size
limit.

| Parameter   | Type   | Description                              |
|-------------|--------|------------------------------------------|
| Key         | String | The key assigned at creation             |
| Instance ID | Number | Numeric ID if no key was assigned        |

### RemoveFromParty

Moves an instance from the active party into storage. The instance is **not**
deleted.

### SendToStorage

Alias for RemoveFromParty. Use whichever reads more clearly in your events.

### DecrementRuns

Subtracts 1 from runsRemaining on every non-permanent instance. Instances at 0
are **not** removed yet — call ExpireAll after this.

### ExpireAll

Removes all non-permanent instances where runsRemaining has reached 0.
On expiry:

- The instance is removed from the party if present
- Their equipped items are returned to the party inventory
- Their $dataActors slot is freed for reuse
- The expire hook fires for any listening plugins

---

## Common Event Patterns

### Recruiting a named story ally

    Plugin Command: ActorInstance.Create
        Species:       Knight
        Key:           sir_valen
        Permanent:     true

    Plugin Command: ActorInstance.AddToParty
        Key:           sir_valen

### Releasing a story ally at a specific story beat

    Plugin Command: ActorInstance.RemoveFromParty
        Key: sir_valen

### End of autobattle chain cleanup

    Plugin Command: ActorInstance.DecrementRuns
    Plugin Command: ActorInstance.ExpireAll

---

## Accessing Instances from Other Plugins

The manager is available globally as `window.ActorInstanceManager`.
Other plugins can call it directly:

    // Get all instances
    ActorInstanceManager.all()

    // Find by key
    const entry = ActorInstanceManager.find("sir_valen")

    // Get the live Game_Actor for an instance
    const actor = ActorInstanceManager.actor("sir_valen")

    // Get only party members
    ActorInstanceManager.inParty()

    // Get stored instances not currently in the party
    ActorInstanceManager.inStorage()

    // Get all instances of a particular species
    ActorInstanceManager.bySpecies(5)

---

## Extending Instances at Creation

The create() API accepts an applyToData function for plugins that need to modify
the actor's database entry before it is constructed. This is the hook for stat
variance, name generation, trait injection, and anything else:

    ActorInstanceManager.create(speciesId, {
        isPermanent:   false,
        runsRemaining: 3,
        applyToData:   (data) => {
            // data is a deep copy of the species template
            // mutate it freely — the original template is untouched
            data.name         = "Fiery Slime"
            data.params[2][1] += 10  // +10 ATK at level 1
        }
    })

---

## Listening for Instance Events

Other plugins can register callbacks for instance lifecycle events:

    ActorInstanceManager.on("create", (entry) => {
        console.log("Instance created:", entry.instanceId)
    })

    ActorInstanceManager.on("expire", (entry) => {
        console.log("Instance expired:", entry.instanceId)
    })

Available events: `create`, `add`, `remove`, `expire`

---

## Tips

- **Permanent instances** such as your hero and story characters should always
  use a key so events can reference them reliably.

- **Dynamic instances** such as random recruits and shop purchases do not need
  keys — they are always accessed through player selection in menus, which hands
  you the Game_Actor object directly.

- The species templates in the database are never added to the party and never
  modified at runtime. Treat them as read-only configuration.

- DecrementRuns and ExpireAll are intentionally separate commands so you can
  add result screen events or animations between them if needed.