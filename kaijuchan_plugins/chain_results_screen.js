/*:
 * @target MZ
 * @plugindesc Chain Battle Results Screen
 */


// ---------------------------------------------------------------------------
// Scene_ChainResults
// ---------------------------------------------------------------------------

function Scene_ChainResults() {
    this.initialize(...arguments);
}

Scene_ChainResults.resultsData = null;

Scene_ChainResults.prototype = Object.create(Scene_MenuBase.prototype);
Scene_ChainResults.prototype.constructor = Scene_ChainResults;

Scene_ChainResults.prototype.initialize = function() {
    Scene_MenuBase.prototype.initialize.call(this);
};

Scene_ChainResults.prototype.create = function() {
    Scene_MenuBase.prototype.create.call(this);
    this._data = Scene_ChainResults.resultsData || {};
    this.createActorWindow();
    this.createRewardsWindow();
    this.createSkillsWindow();
    this.createBestStatsWindow(); // New line
    console.log("Scene_ChainResults created, actorWindow handlers:", 
        this._actorWindow._handlers);
};

Scene_ChainResults.prototype.needsCancelButton = function() {
    return false;
};

Scene_ChainResults.prototype.actorWindowHeight = function() {
    return Math.floor(Graphics.boxHeight * 0.58);
};

Scene_ChainResults.prototype.rewardsWindowHeight = function() {
    return Graphics.boxHeight - this.actorWindowHeight();
};

Scene_ChainResults.prototype.createActorWindow = function() {
    const rect = new Rectangle(
        0, 0,
        Graphics.boxWidth,
        this.actorWindowHeight()
    );
    this._actorWindow = new Window_ChainActors(rect, this._data);
    this._actorWindow.setHandler("ok", this.onActorOk.bind(this));
    this._actorWindow.setHandler("cancel", this.onActorCancel.bind(this));
    this._actorWindow.select(0);
    this._actorWindow.activate();
    this.addWindow(this._actorWindow);
};

Scene_ChainResults.prototype.createRewardsWindow = function() {
    const rect = new Rectangle(
        0, this.actorWindowHeight(),
        Graphics.boxWidth,
        this.rewardsWindowHeight()
    );
    this._rewardsWindow = new Window_ChainRewards(rect, this._data);
    this.addWindow(this._rewardsWindow);
};

Scene_ChainResults.prototype.createSkillsWindow = function() {
    const ww = 360;
    const wh = 300;
    const wx = (Graphics.boxWidth - ww) / 2;
    const wy = (Graphics.boxHeight - wh) / 2;
    const rect = new Rectangle(wx, wy, ww, wh);
    this._skillsWindow = new Window_ChainSkills(rect);
    this._skillsWindow.setHandler("ok", this.onSkillsClose.bind(this));
    this._skillsWindow.setHandler("cancel", this.onSkillsClose.bind(this));
    this._skillsWindow.hide();
    this.addWindow(this._skillsWindow);
};

Scene_ChainResults.prototype.createBestStatsWindow = function() {
    const rect = new Rectangle(
        0, this.actorWindowHeight(),
        Graphics.boxWidth,
        this.rewardsWindowHeight()
    );
    this._bestStatsWindow = new Window_BestStats(rect);
    this.addWindow(this._bestStatsWindow);
};

Scene_ChainResults.prototype.onSkillsClose = function() {
    this._skillsWindow.hide();
    this._skillsWindow.deactivate();
    this._actorWindow.activate();
};

Scene_ChainResults.prototype.onActorOk = function() {
    console.log("onActorOk fired");
    const actor = $gameParty.members()[this._actorWindow.index()];
    if (!actor) return;

    const newSkills = (this._data.newSkills || {})[actor.actorId()] || [];
    if (newSkills.length === 0) {
        this._actorWindow.activate();
        return;
    }

    this._skillsWindow.setData(actor, newSkills);
    this._skillsWindow.show();
    this._skillsWindow.activate();
    this._actorWindow.deactivate();
};

Scene_ChainResults.prototype.onActorCancel = function() {
    console.log("onActorCancel fired");
    this._actorWindow.deactivate();
    console.log("deactivated, calling goto");
    SceneManager.goto(Scene_Map);
    console.log("goto called");
};

// ---------------------------------------------------------------------------
// Window_ChainActors
// ---------------------------------------------------------------------------

function Window_ChainActors() {
    this.initialize(...arguments);
}

Window_ChainActors.prototype = Object.create(Window_Selectable.prototype);
Window_ChainActors.prototype.constructor = Window_ChainActors;

Window_ChainActors.prototype.initialize = function(rect, data) {
    this._data = data || {};
    Window_Selectable.prototype.initialize.call(this, rect);
    this.refresh();
};

Window_ChainActors.prototype.maxItems = function() {
    return $gameParty.members().length;
};

// Each actor gets an equal share of the window height
Window_ChainActors.prototype.itemHeight = function() {
    const members = $gameParty.members().length || 1;
    return Math.floor((this.innerHeight / members) * 1.25);
};

Window_ChainActors.prototype.drawItem = function(index) {
    const actor = $gameParty.members()[index];
    if (!actor) return;

    const rect = this.itemLineRect(index);
    const ih = this.itemHeight();
    const iy = index * ih;
    const padding = this.itemPadding();

    // Section divider
    if (index > 0) {
        this.contents.fillRect(rect.x, iy, rect.width, 1,
            ColorManager.textColor(8));
    }

    // Header row: face, name, level
    const faceSize = ih - padding * 2;
    const faceX = rect.x;
    const faceY = iy + padding;

    this.drawFace(actor.faceName(), actor.faceIndex(),
        faceX, faceY, faceSize, faceSize);

    const textX = faceX + faceSize + padding * 2;
    const nameY = iy + padding;

    // Name
    this.changeTextColor(ColorManager.normalColor());
    this.contents.fontSize = 20;
    this.drawText(actor.name(), textX, nameY, 160);

    // Level label + value
    const lvY = nameY + 26;
    this.changeTextColor(ColorManager.systemColor());
    this.contents.fontSize = 16;
    this.drawText("LV", textX, lvY, 30);
    this.changeTextColor(ColorManager.normalColor());
    this.drawText(actor.level, textX + 30, lvY, 40);

    // New skills badge
    const newSkills =
        (this._data.newSkills || {})[actor.actorId()] || [];
    if (newSkills.length > 0) {
        this.changeTextColor(ColorManager.textColor(14)); // yellow
        this.contents.fontSize = 15;
        this.drawText(
            `★ ${newSkills.length} new skill${newSkills.length > 1 ? "s" : ""}`,
            textX + 80, lvY, 180
        );
    }

    // EXP bar
    const barX = textX;
    const barY = iy + ih - padding - 22;
    const barW = this.innerWidth - textX - padding;
    this.drawExpBar(actor, barX, barY, barW);

    this.resetFontSettings();
};

Window_ChainActors.prototype.drawExpBar = function(actor, x, y, width) {
    const barH = 10;
    const labelY = y - 18;

    const currentExp = actor.currentExp() - actor.currentLevelExp();
    const nextExp = actor.nextLevelExp() - actor.currentLevelExp();
    const rate = nextExp > 0 ? currentExp / nextExp : 1;

    // Labels
    this.changeTextColor(ColorManager.systemColor());
    this.contents.fontSize = 14;
    this.drawText("EXP", x, labelY, 36);
    this.changeTextColor(ColorManager.normalColor());
    this.drawText(`${currentExp} / ${nextExp}`, x + 36, labelY, width - 36, "right");

    // Bar background
    this.contents.fillRect(x + 36, y, width*0.75, barH,
        ColorManager.textColor(19));
    // Bar fill (now narrower and offset)
    const barW = Math.floor(width*0.75 *rate); // Reduced width
    this.contents.fillRect(x + 36, y, barW, barH,
        ColorManager.textColor(14)); // yellow, FF7-ish
};

// ---------------------------------------------------------------------------
// Window_ChainRewards
// ---------------------------------------------------------------------------

function Window_ChainRewards() {
    this.initialize(...arguments);
}

Window_ChainRewards.prototype = Object.create(Window_Base.prototype);
Window_ChainRewards.prototype.constructor = Window_ChainRewards;

Window_ChainRewards.prototype.initialize = function(rect, data) {
    this._data = data || {};
    Window_Base.prototype.initialize.call(this, rect);
    this.refresh();
};

Window_ChainRewards.prototype.refresh = function() {
    this.contents.clear();

    const lh = this.lineHeight();
    const pad = this.itemPadding();
    let y = pad;

    // Title
    this.changeTextColor(ColorManager.systemColor());
    this.contents.fontSize = 18;
    this.drawText("RESULTS", pad, y, this.innerWidth);
    y += lh;

    // Divider
    this.contents.fillRect(pad, y, this.innerWidth - pad * 2, 1,
        ColorManager.textColor(8));
    y += 8;

    const col2X = Math.floor(this.innerWidth / 2);

    // Waves + Gold on same row
    this.contents.fontSize = 16;
    this.changeTextColor(ColorManager.systemColor());
    this.drawText("WAVES", pad, y, 80);
    this.changeTextColor(ColorManager.normalColor());
    this.drawText(String(this._data.waves || 0), pad + 80, y, 60);

    this.changeTextColor(ColorManager.systemColor());
    this.drawText("GOLD", col2X, y, 60);
    this.changeTextColor(ColorManager.normalColor());
    this.drawText(String(this._data.gold || 0), col2X + 60, y, 100);
    y += lh;

    // Items
    const drops = this._data.drops || [];
    if (drops.length > 0) {
        this.changeTextColor(ColorManager.systemColor());
        this.contents.fontSize = 16;
        this.drawText("ITEMS", pad, y, 80);
        y += lh;

        // Deduplicate and count
        const itemCounts = new Map();
        for (const item of drops) {
            itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
        }

        let col = 0;
        for (const [item, count] of itemCounts) {
            const ix = col === 0 ? pad : col2X;
            this.drawItemName(item, ix, y, col2X - pad * 2);
            if (count > 1) {
                this.changeTextColor(ColorManager.systemColor());
                this.contents.fontSize = 14;
                this.drawText(`x${count}`,
                    ix + col2X - pad * 2 - 40, y, 40, "right");
            }
            col = 1 - col;
            if (col === 0) y += lh;
        }
    }

    this.resetFontSettings();
};

// ---------------------------------------------------------------------------
// Window_ChainSkills
// ---------------------------------------------------------------------------

function Window_ChainSkills() {
    this.initialize(...arguments);
}

Window_ChainSkills.prototype = Object.create(Window_Selectable.prototype);
Window_ChainSkills.prototype.constructor = Window_ChainSkills;

Window_ChainSkills.prototype.initialize = function(rect) {
    this._actor = null;
    this._skills = [];
    Window_Selectable.prototype.initialize.call(this, rect);
};

Window_ChainSkills.prototype.maxItems = function() {
    return 0;
};

Window_ChainSkills.prototype.setData = function(actor, skills) {
    this._actor = actor;
    this._skills = skills;
    this.refresh();
};

Window_ChainSkills.prototype.refresh = function() {
    this.contents.clear();
    if (!this._actor || !this._skills) return;

    const lh = this.lineHeight();
    const pad = this.itemPadding();
    let y = pad;

    // Title
    this.changeTextColor(ColorManager.systemColor());
    this.contents.fontSize = 18;
    this.drawText(`${this._actor.name()} — New Skills`, pad, y,
        this.innerWidth - pad * 2);
    y += lh;

    this.contents.fillRect(pad, y, this.innerWidth - pad * 2, 1,
        ColorManager.textColor(8));
    y += 8;

    this.contents.fontSize = 16;
    for (const skill of this._skills) {
        if (!skill) continue;
        this.drawItemName(skill, pad, y, this.innerWidth - pad * 2);
        y += lh;
    }

    this.changeTextColor(ColorManager.textColor(8));
    this.contents.fontSize = 14;
    this.drawText("[ OK ] Close", pad, this.innerHeight - lh - pad,
        this.innerWidth - pad * 2, "center");

    this.resetFontSettings();
};

// ---------------------------------------------------------------------------
// Window_BestStats
// ---------------------------------------------------------------------------

function Window_BestStats() {
    this.initialize(...arguments);
}

Window_BestStats.prototype = Object.create(Window_Base.prototype);
Window_BestStats.prototype.constructor = Window_BestStats;

Window_BestStats.prototype.initialize = function(rect) {
    Window_Base.prototype.initialize.call(this, rect);
    this.refresh();
};

Window_BestStats.prototype.refresh = function() {
    this.contents.clear();

    const lh = this.lineHeight();
    const pad = this.itemPadding();
    let y = pad;

    // Title
    this.changeTextColor(ColorManager.systemColor());
    this.contents.fontSize = 18;
    this.drawText("BEST PERFORMANCE", pad, y, this.innerWidth - pad * 2);
    y += lh;

    // Divider
    this.contents.fillRect(pad, y, this.innerWidth - pad * 2, 1,
        ColorManager.textColor(8));
    y += 8;

    // Best waves
    this.changeTextColor(ColorManager.normalColor());
    this.contents.fontSize = 16;
    this.drawText("Most Waves:", pad, y, 100);
    this.drawText($gameVariables.value(1) || 0, pad + 100, y, 100);
    y += lh;

    // Best gold
    this.drawText("Most Gold:", pad, y, 100);
    this.drawText($gameVariables.value(2) || 0, pad + 100, y, 100);
    y += lh;

    // Best exp
    this.drawText("Most EXP:", pad, y, 100);
    this.drawText($gameVariables.value(3) || 0, pad + 100, y, 100);
    y += lh;
};

Window_BestStats.prototype.maxLines = function() {
    return 6;
};
