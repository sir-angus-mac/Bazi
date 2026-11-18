// --- working.js ---
// Mang Pai BaZi (盲派命理) - 做功 (Zuo Gong) Simulation Engine

let isZuoGongMode = false;
let isSimulationRunning = false;
let currentSessionId = 0;
const activeZuoGongTooltips = new Map();
const activeWaitBadges = new Map(); // key: spotIndex -> { count: number, element: HTMLElement }
const exhaustedStartPoints = new Set(); // Tracks stem elements that have already spawned a moving card
let resolutionTimeout = null;
const bypassedQiShaElems = new Set();   // Tracks trapped 七殺 that ran out of rescue scenarios (red circle)

// 12 Life Stages Point Map (十二長生計分表)
const zuoGongScoreMap = {
    "長生": 2,
    "沐浴": 3,
    "冠帶": 5,
    "臨官": 6,
    "帝旺": 8,
    "衰": 5,
    "病": 4,
    "死": 1,
    "墓庫": 10,
    "絕": 0,
    "胎": 0,
    "養": 0
};

// 偏財 (Indirect Wealth) Mapping: Same-polarity element controlled (我剋者為偏財)
const zuoGongPianCaiDict = {
    '甲': '戊', '乙': '己',
    '丙': '庚', '丁': '辛',
    '戊': '壬', '己': '癸',
    '庚': '甲', '辛': '乙',
    '壬': '丙', '癸': '丁'
};

// 人元司令 Branch Multipliers (Rule 2)
const renyuanBranchMultiplierRules = {
    "甲": { normal: ["寅", "卯"], powerful: ["未"] },
    "乙": { normal: ["寅", "卯"], powerful: ["未"] },
    "丙": { normal: ["巳", "午"], powerful: ["戌"] },
    "丁": { normal: ["巳", "午"], powerful: ["戌"] },
    "戊": { normal: ["未", "丑", "辰"], powerful: ["戌"] },
    "己": { normal: ["未", "丑", "辰"], powerful: ["戌"] },
    "庚": { normal: ["申", "酉"], powerful: ["丑"] },
    "辛": { normal: ["申", "酉"], powerful: ["丑"] },
    "壬": { normal: ["子", "亥"], powerful: ["辰"] },
    "癸": { normal: ["子", "亥"], powerful: ["辰"] }
};

function getRenyuanBranchMultiplier(renyuanStem, branchChar) {
    if (!renyuanStem || !branchChar) return 1;
    const rule = renyuanBranchMultiplierRules[renyuanStem];
    if (!rule) return 1;
    if (rule.powerful.includes(branchChar)) return 1.5;
    if (rule.normal.includes(branchChar)) return 1.25;
    return 1;
}

/**
 * Background color helpers for starting-point and state cards
 */
function getLightGreyBg() {
    return (typeof isDarkMode === 'function' && isDarkMode()) ? '#4a4a4a' : '#dcdcdc';
}

function getLightGreenBg() {
    return (typeof isDarkMode === 'function' && isDarkMode()) ? '#1e4620' : '#c8e6c9';
}

function getLightRedBg() {
    return (typeof isDarkMode === 'function' && isDarkMode()) ? '#5c1d1d' : '#ffcdd2';
}

function getLightOrangeBg() {
    return (typeof isDarkMode === 'function' && isDarkMode()) ? '#663c00' : '#ffe0b2';
}

/**
 * Marks a card as light orange (background only; border remains unchanged)
 */
function setCardOrange(tooltip) {
    if (!tooltip) return;
    tooltip.dataset.cardState = 'orange';
    tooltip.style.setProperty('background-color', getLightOrangeBg(), 'important');
}

/**
 * Calculates the base 做功 score for a heavenly stem
 */
function getZuoGongScore(targetElem, stemChar) {
    if (!targetElem) return 0;

    if (targetElem.classList.contains('spawned-stem') || (targetElem.closest && targetElem.closest('#invisibleStemRelContainer'))) {
        return 5;
    }

    if (targetElem.classList.contains('main-pillar-stem')) {
        let colIdx = targetElem.getAttribute('data-col');
        if (colIdx === null) {
            const allStems = Array.from(document.querySelectorAll('.main-pillar-stem'));
            colIdx = allStems.indexOf(targetElem);
        }

        if (colIdx !== -1 && colIdx !== null) {
            const branchElem = document.querySelector(`.main-pillar-branch[data-col="${colIdx}"]`)
                || document.querySelectorAll('.main-pillar-branch')[colIdx];

            if (branchElem) {
                const branchChar = branchElem.textContent.trim();
                const stage = calculateLifeStage(branchChar, stemChar);
                if (stage && zuoGongScoreMap[stage] !== undefined) {
                    return zuoGongScoreMap[stage];
                }
            }
        }
    }

    return 0;
}

/**
 * Retrieves the live/active score of an element (checks existing tooltip first)
 */
function getEffectiveScore(targetElem, stemChar) {
    if (activeZuoGongTooltips.has(targetElem)) {
        const tooltip = activeZuoGongTooltips.get(targetElem);
        return parseInt(tooltip.dataset.score || '0', 10);
    }
    return getZuoGongScore(targetElem, stemChar);
}

/**
 * Toggles between '做功 mode' and 'Arrow Mode'
 */
function toggleZuoGongMode() {
    isZuoGongMode = !isZuoGongMode;
    const btn = document.getElementById('zuogongBtn');

    if (btn) {
        btn.textContent = isZuoGongMode ? "Arrow Mode" : "做功 mode";
        if (isZuoGongMode) {
            btn.classList.add('active-zuogong');
        } else {
            btn.classList.remove('active-zuogong');
        }
    }

    const invStemContainer = document.getElementById('invisibleStemRelContainer');
    const invBranchContainer = document.getElementById('invisibleBranchRelContainer');

    if (isZuoGongMode) {
        if (invStemContainer) {
            invStemContainer.classList.remove('collapsed');
            if (typeof relContainerStates !== 'undefined') {
                relContainerStates['invisibleStemRelContainer'] = false;
            }
        }
        if (invBranchContainer) {
            invBranchContainer.classList.remove('collapsed');
            if (typeof relContainerStates !== 'undefined') {
                relContainerStates['invisibleBranchRelContainer'] = false;
            }
        }
    } else {
        clearAllZuoGongTooltips();
    }
}

/**
 * Clears all active 做功 tooltips, orbs, waiting badges, and resets simulation state
 */
function clearAllZuoGongTooltips() {
    currentSessionId++;
    isSimulationRunning = false;

    if (resolutionTimeout) {
        clearTimeout(resolutionTimeout);
        resolutionTimeout = null;
    }

    const invBranchSvg = document.querySelector('#invisibleBranchRelContainer svg');
    if (invBranchSvg) {
        invBranchSvg.querySelectorAll('line, rect, circle, text').forEach(el => {
            if (el.getAnimations) el.getAnimations().forEach(anim => anim.cancel());
        });
    }

    const elementsToKill = document.querySelectorAll('.zuogong-tooltip, .zuogong-hopper, .zuogong-wait-badge, .zuogong-absorb-orb');
    elementsToKill.forEach(el => {
        if (el.getAnimations) {
            el.getAnimations().forEach(anim => anim.cancel());
        }
        el.remove();
    });

    activeZuoGongTooltips.clear();
    activeWaitBadges.clear();
    exhaustedStartPoints.clear();
    bypassedQiShaElems.clear();
}

/**
 * Helper to get the center coordinate of any element relative to document.body
 */
function getElemCenter(elem) {
    const r = elem.getBoundingClientRect();
    const b = document.body.getBoundingClientRect();
    return {
        x: (r.left - b.left) + r.width / 2,
        y: (r.top - b.top) + r.height / 2
    };
}

/**
 * Spawns or retrieves a tooltip card on a stem or branch element
 */
function spawnZuoGongTooltip(targetElem, char, customScore = null) {
    if (!targetElem || !char || char === '合') return null;

    if (activeZuoGongTooltips.has(targetElem)) {
        return activeZuoGongTooltips.get(targetElem);
    }

    const rect = targetElem.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;

    const center = getElemCenter(targetElem);
    const isLarge = targetElem.classList.contains('main-pillar-stem') || targetElem.classList.contains('main-pillar-branch');

    const tooltip = document.createElement('div');
    tooltip.className = `zuogong-tooltip ${isLarge ? 'large' : 'small'}`;
    tooltip.dataset.cardKind = 'stem';
    tooltip.style.left = `${center.x}px`;
    tooltip.style.top = `${center.y}px`;
    tooltip.style.zIndex = "2000";

    const initialScore = customScore !== null ? customScore : getZuoGongScore(targetElem, char);
    tooltip.dataset.score = initialScore;

    const numDiv = document.createElement('div');
    numDiv.className = 'zuogong-num';
    numDiv.textContent = initialScore;

    const charDiv = document.createElement('div');
    charDiv.className = 'zuogong-stem';
    charDiv.textContent = char;
    charDiv.style.color = getElementColor(char);

    tooltip.appendChild(numDiv);
    tooltip.appendChild(charDiv);

    tooltip.onclick = (e) => {
        e.stopPropagation();
        tooltip.remove();
        activeZuoGongTooltips.delete(targetElem);
    };

    document.body.appendChild(tooltip);
    activeZuoGongTooltips.set(targetElem, tooltip);
    return tooltip;
}

/**
 * Increments the score on a tooltip card with a golden bounce animation
 */
function addScoreToTooltip(tooltip, pointsToAdd) {
    if (!tooltip) return;
    const currentScore = parseInt(tooltip.dataset.score || '0', 10);
    const newScore = currentScore + pointsToAdd;
    tooltip.dataset.score = newScore;

    const numDiv = tooltip.querySelector('.zuogong-num');
    if (numDiv) {
        numDiv.textContent = newScore;
        numDiv.animate([
            { transform: 'scale(1.5)', color: '#ffd700' },
            { transform: 'scale(1)', color: '#e67e22' }
        ], { duration: 350, easing: 'ease-out' });
    }
}

/**
 * Multiplies the score on a tooltip card and rounds up (Math.ceil)
 */
function multiplyTooltipScore(tooltip, multiplier) {
    if (!tooltip || multiplier === 1) return false;
    const currentScore = parseInt(tooltip.dataset.score || '0', 10);
    if (currentScore === 0) return false;

    const newScore = Math.ceil(currentScore * multiplier);
    tooltip.dataset.score = newScore;

    const numDiv = tooltip.querySelector('.zuogong-num');
    if (numDiv && newScore !== currentScore) {
        numDiv.textContent = newScore;
        numDiv.animate([
            { transform: 'scale(1.5)', color: '#ffd700' },
            { transform: 'scale(1)', color: '#e67e22' }
        ], { duration: 350, easing: 'ease-out' });
        return true;
    }
    return false;
}

function clearStemZuoGongTooltips() {
    if (resolutionTimeout) {
        clearTimeout(resolutionTimeout);
        resolutionTimeout = null;
    }

    document.querySelectorAll('.zuogong-hopper, .zuogong-wait-badge').forEach(el => {
        if (el.getAnimations) el.getAnimations().forEach(anim => anim.cancel());
        el.remove();
    });

    for (const [elem, tooltip] of activeZuoGongTooltips.entries()) {
        if (tooltip.dataset.cardKind !== 'branch') {
            if (tooltip.getAnimations) tooltip.getAnimations().forEach(anim => anim.cancel());
            tooltip.remove();
            activeZuoGongTooltips.delete(elem);
        }
    }

    activeWaitBadges.clear();
    exhaustedStartPoints.clear();
    bypassedQiShaElems.clear();
}

function clearBranchZuoGongTooltips() {
    const invBranchSvg = document.querySelector('#invisibleBranchRelContainer svg');
    if (invBranchSvg) {
        invBranchSvg.querySelectorAll('line, rect, circle, text').forEach(el => {
            if (el.getAnimations) el.getAnimations().forEach(anim => anim.cancel());
        });
    }

    document.querySelectorAll('.zuogong-absorb-orb').forEach(el => {
        if (el.getAnimations) el.getAnimations().forEach(anim => anim.cancel());
        el.remove();
    });

    for (const [elem, tooltip] of activeZuoGongTooltips.entries()) {
        if (tooltip.dataset.cardKind === 'branch') {
            if (tooltip.getAnimations) tooltip.getAnimations().forEach(anim => anim.cancel());
            tooltip.remove();
            activeZuoGongTooltips.delete(elem);
        }
    }
}

async function dismissAllZuoGongTooltips() {
    if (isSimulationRunning) return; // Prevent dismissing mid-animation

    const branchTooltips = Array.from(
        document.querySelectorAll('.zuogong-tooltip[data-card-kind="branch"]')
    );
    const fadePromises = branchTooltips.map(t => {
        const anim = t.animate([
            { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
            { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' }
        ], { duration: 250, fill: 'forwards' });
        return anim.finished.catch(() => {});
    });

    await Promise.all(fadePromises);
    clearBranchZuoGongTooltips();
}

/**
 * Schedules the final fade-out of Heavenly Stem 做功 cards only
 */
function scheduleZuoGongFadeOut(delayMs = 2500) {
    if (resolutionTimeout) clearTimeout(resolutionTimeout);
    resolutionTimeout = setTimeout(async () => {
        if (isSimulationRunning) return;

        const stemTooltips = Array.from(
            document.querySelectorAll('.zuogong-tooltip:not([data-card-kind="branch"])')
        );
        const fadePromises = stemTooltips.map(t => {
            const anim = t.animate([
                { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
                { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' }
            ], { duration: 500, fill: 'forwards' });
            return anim.finished.catch(() => {});
        });

        await Promise.all(fadePromises);
        if (isSimulationRunning) return;
        clearStemZuoGongTooltips();
    }, delayMs);
}

// ============================================================================
// EARTHLY BRANCH (地支) 做功 SIMULATION
// ============================================================================

function getSolidInvisibleBranchRelationships() {
    const container = document.getElementById('invisibleBranchRelContainer');
    const svg = container ? container.querySelector('svg') : null;

    const branchElems = Array.from(document.querySelectorAll('#baziGrid .main-pillar-branch'))
        .sort((a, b) => parseInt(a.getAttribute('data-col') || 0, 10) - parseInt(b.getAttribute('data-col') || 0, 10));
    const headers = Array.from(document.querySelectorAll('#baziGrid .bazi-header'))
        .map(el => el.textContent.trim());

    const branches = branchElems.map(el => el.textContent.trim());
    const N = branches.length;
    if (N === 0 || typeof findInvisibleBranchRelationships !== 'function') return [];

    let rels = findInvisibleBranchRelationships(branches);

    if (headers.length === N) {
        rels = rels.filter(rel => !rel.indices.some(idx =>
            headers[idx] === "命宮" || headers[idx] === "胎元" || headers[idx] === "胎息" || headers[idx] === "身宮"
        ));

        if (typeof isSplitMode !== 'undefined' && isSplitMode) {
            const groupA = ["命宮", "胎元", "胎息", "身宮", "時", "日", "月", "年", "元運"];
            const groupB = ["大運", "流年", "流月", "流日", "流時"];
            rels = rels.filter(rel => {
                const hasA = rel.indices.some(idx => groupA.includes(headers[idx]));
                const hasB = rel.indices.some(idx => groupB.includes(headers[idx]));
                return !(hasA && hasB);
            });
        }
    }

    const solidTypes = new Set(['liuhe', 'half_combo', 'neighbor', 'anhe', 'arch_combo', 'doubles_neighbor']);
    const luckPillars = ["大運", "流年", "流月", "流日", "流時"];

    const xCoords = Array.from({ length: N }, (_, i) => 45 + i * 98);
    const viewBoxWidth = N * 90 + (N - 1) * 8;
    const layerHeight = 45;

    const { packedRels, totalLayers } = packRelationships(rels, xCoords, 12);
    const totalHeight = totalLayers * layerHeight + 8;

    const svgRect = svg ? svg.getBoundingClientRect() : null;
    const bodyRect = document.body.getBoundingClientRect();
    const scaleX = svgRect && viewBoxWidth ? (svgRect.width / viewBoxWidth) : 1;
    const scaleY = svgRect && totalHeight ? (svgRect.height / totalHeight) : 1;

    const solidRels = [];

    packedRels.forEach(rel => {
        const isBetweenLuckPillars = headers.length === N && rel.indices.every(idx => luckPillars.includes(headers[idx]));
        const isBoldSolid = !isBetweenLuckPillars && solidTypes.has(rel.type);
        if (!isBoldSolid) return;

        const sortedIndices = [...rel.indices].sort((a, b) => a - b);
        const isCloseNeighbors = (sortedIndices[sortedIndices.length - 1] - sortedIndices[0] === 1);
        const isHeRel = (rel.hiddenBranch === '合');
        const isFaded = !isCloseNeighbors && !isHeRel;

        const yTop = rel.layer * layerHeight + 6;
        const yBar = yTop + 24;
        const midX = (rel.minX + rel.maxX) / 2;

        const centerX = svgRect
            ? (svgRect.left - bodyRect.left) + midX * scaleX
            : getElemCenter(branchElems[sortedIndices[0]]).x;
        const centerY = svgRect
            ? (svgRect.top - bodyRect.top) + yBar * scaleY
            : getElemCenter(branchElems[sortedIndices[0]]).y + 60;

        const orbColor = rel.color
            ? getRelColor(rel.color)
            : getRelColor(getElementColor(branches[sortedIndices[0]]));

        solidRels.push({
            indices: rel.indices,
            isFaded,
            minX: rel.minX,
            maxX: rel.maxX,
            yTop,
            centerX,
            centerY,
            orbColor
        });
    });

    return solidRels;
}

function getSvgElementsForRel(svg, rel) {
    if (!svg) return [];
    const matched = [];
    const xMin = rel.minX - 2;
    const xMax = rel.maxX + 2;
    const yMin = rel.yTop - 2;
    const yMax = rel.yTop + 38;

    svg.querySelectorAll('line, rect, circle, text').forEach(el => {
        const tag = el.tagName.toLowerCase();
        if (tag === 'line') {
            const x1 = parseFloat(el.getAttribute('x1'));
            const x2 = parseFloat(el.getAttribute('x2'));
            const y1 = parseFloat(el.getAttribute('y1'));
            const y2 = parseFloat(el.getAttribute('y2'));
            if (
                Math.min(x1, x2) >= xMin && Math.max(x1, x2) <= xMax &&
                Math.min(y1, y2) >= yMin && Math.max(y1, y2) <= yMax
            ) {
                matched.push(el);
            }
        } else if (tag === 'rect') {
            const cx = parseFloat(el.getAttribute('x')) + parseFloat(el.getAttribute('width')) / 2;
            const cy = parseFloat(el.getAttribute('y')) + parseFloat(el.getAttribute('height')) / 2;
            if (cx >= xMin && cx <= xMax && cy >= yMin && cy <= yMax) {
                matched.push(el);
            }
        } else if (tag === 'circle') {
            const cx = parseFloat(el.getAttribute('cx'));
            const cy = parseFloat(el.getAttribute('cy'));
            if (cx >= xMin && cx <= xMax && cy >= yMin && cy <= yMax) {
                matched.push(el);
            }
        } else if (tag === 'text') {
            const x = parseFloat(el.getAttribute('x'));
            const y = parseFloat(el.getAttribute('y'));
            if (x >= xMin && x <= xMax && y >= yMin && y <= yMax) {
                matched.push(el);
            }
        }
    });

    return matched;
}

async function blinkOrbSourceRel(rel, sessionId) {
    if (!rel || !isZuoGongMode || sessionId !== currentSessionId) return;

    const svg = document.querySelector('#invisibleBranchRelContainer svg');
    if (!svg) return;

    const elements = getSvgElementsForRel(svg, rel);
    if (elements.length === 0) return;

    const glowColor = rel.orbColor || '#e67e22';

    const anims = elements.map(el => {
        const tag = el.tagName.toLowerCase();

        if (rel.isFaded) {
            if (tag === 'line' || tag === 'rect') {
                return el.animate([
                    { strokeOpacity: 0.3, filter: 'none', offset: 0 },
                    { strokeOpacity: 1, filter: `drop-shadow(0 0 8px ${glowColor})`, offset: 0.2 },
                    { strokeOpacity: 0.3, filter: 'none', offset: 0.45 },
                    { strokeOpacity: 1, filter: `drop-shadow(0 0 8px ${glowColor})`, offset: 0.7 },
                    { strokeOpacity: 0.3, filter: 'none', offset: 1 }
                ], {
                    duration: 500,
                    easing: 'ease-in-out'
                }).finished.catch(() => {});
            } else if (tag === 'circle') {
                return el.animate([
                    { opacity: 0.3, filter: 'none', offset: 0 },
                    { opacity: 1, filter: `drop-shadow(0 0 8px ${glowColor})`, offset: 0.2 },
                    { opacity: 0.3, filter: 'none', offset: 0.45 },
                    { opacity: 1, filter: `drop-shadow(0 0 8px ${glowColor})`, offset: 0.7 },
                    { opacity: 0.3, filter: 'none', offset: 1 }
                ], {
                    duration: 500,
                    easing: 'ease-in-out'
                }).finished.catch(() => {});
            } else {
                return el.animate([
                    { filter: 'none', offset: 0 },
                    { filter: `drop-shadow(0 0 8px ${glowColor})`, offset: 0.2 },
                    { filter: 'none', offset: 0.45 },
                    { filter: `drop-shadow(0 0 8px ${glowColor})`, offset: 0.7 },
                    { filter: 'none', offset: 1 }
                ], {
                    duration: 500,
                    easing: 'ease-in-out'
                }).finished.catch(() => {});
            }
        } else {
            return el.animate([
                { opacity: 1, filter: 'none', offset: 0 },
                { opacity: 0.4, filter: `drop-shadow(0 0 6px ${glowColor})`, offset: 0.25 },
                { opacity: 1, filter: `drop-shadow(0 0 8px ${glowColor})`, offset: 0.55 },
                { opacity: 1, filter: 'none', offset: 1 }
            ], {
                duration: 420,
                easing: 'ease-in-out'
            }).finished.catch(() => {});
        }
    });

    await Promise.all(anims);
}

async function blinkBlockingSvgRelationships(blockingRels, sessionId) {
    if (!blockingRels || blockingRels.length === 0) return;
    if (!isZuoGongMode || sessionId !== currentSessionId) return;

    const svg = document.querySelector('#invisibleBranchRelContainer svg');
    if (!svg) return;

    const elementsToBlink = [];
    blockingRels.forEach(rel => {
        elementsToBlink.push(...getSvgElementsForRel(svg, rel));
    });

    if (elementsToBlink.length === 0) return;

    const anims = elementsToBlink.map(el =>
        el.animate([
            { opacity: 1, filter: 'drop-shadow(0 0 0px #ff4d4f)', offset: 0 },
            { opacity: 0.15, filter: 'drop-shadow(0 0 8px #ff4d4f)', offset: 0.25 },
            { opacity: 1, filter: 'drop-shadow(0 0 10px #ff4d4f)', offset: 0.5 },
            { opacity: 0.15, filter: 'drop-shadow(0 0 8px #ff4d4f)', offset: 0.75 },
            { opacity: 1, filter: 'drop-shadow(0 0 0px #ff4d4f)', offset: 1 }
        ], {
            duration: 650,
            easing: 'ease-in-out'
        }).finished.catch(() => {})
    );

    await Promise.all(anims);
}

async function flyCircleToCard(fromX, fromY, toX, toY, color, sessionId) {
    if (!isZuoGongMode || sessionId !== currentSessionId) return false;

    const orb = document.createElement('div');
    orb.className = 'zuogong-absorb-orb';
    orb.style.position = 'absolute';
    orb.style.left = `${fromX}px`;
    orb.style.top = `${fromY}px`;
    orb.style.width = '18px';
    orb.style.height = '18px';
    orb.style.borderRadius = '50%';
    orb.style.backgroundColor = color || '#e67e22';
    orb.style.border = '2px solid #ffffff';
    orb.style.boxShadow = `0 0 12px ${color || '#e67e22'}`;
    orb.style.transform = 'translate(-50%, -50%) scale(0.4)';
    orb.style.zIndex = '5500';
    orb.style.pointerEvents = 'none';

    document.body.appendChild(orb);

    const dx = toX - fromX;
    const dy = toY - fromY;

    const anim = orb.animate([
        { transform: 'translate(-50%, -50%) translate(0px, 0px) scale(0.4)', opacity: 0.4, offset: 0 },
        { transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1.2)', opacity: 1, offset: 0.2 },
        { transform: `translate(-50%, -50%) translate(${dx * 0.5}px, ${dy * 0.5 - 24}px) scale(1.05)`, opacity: 1, offset: 0.6 },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.15, offset: 1 }
    ], {
        duration: 420,
        easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
        fill: 'forwards'
    });

    try {
        await anim.finished;
    } catch (e) {
        orb.remove();
        return false;
    }

    orb.remove();
    return isZuoGongMode && sessionId === currentSessionId;
}

/**
 * Checks if activatorChar can activate targetChar via 沖 (bidirectional),
 * 刑 (directional punishMap), 無禮之刑 (子 <-> 卯), or 自刑 (same character).
 * Returns 'chong', 'punish', or null
 */
function getBranchActivationType(activatorChar, targetChar) {
    // 1. 沖 (Flush - bidirectional from constants.js six_rel["沖"])
    if (typeof six_rel !== 'undefined' && six_rel["沖"]) {
        for (const pair of Object.values(six_rel["沖"])) {
            if ((pair[0] === activatorChar && pair[1] === targetChar) ||
                (pair[1] === activatorChar && pair[0] === targetChar)) {
                return 'chong';
            }
        }
    }

    // 2. 刑 (Punish - directional from constants.js punishMap)
    if (typeof punishMap !== 'undefined' && punishMap[activatorChar] === targetChar) {
        return 'punish';
    }

    // 3. 無禮之刑 (子 <-> 卯 mutually activate each other)
    if (typeof 無禮之刑 !== 'undefined' &&
        無禮之刑.includes(activatorChar) &&
        無禮之刑.includes(targetChar) &&
        activatorChar !== targetChar) {
        return 'punish';
    }

    // 4. 自刑 (辰, 午, 酉, 亥 activate another card of the exact same character)
    if (typeof 自刑 !== 'undefined' &&
        自刑.includes(activatorChar) &&
        activatorChar === targetChar) {
        return 'punish';
    }

    return null;
}

/**
 * Rule 4 helper: Finds the main branch(es) directly above an invisible branch B:
 * 1) In between two adjacent main branches [A][C]
 * 2) Directly below a main branch [A]
 */
function getAboveMainBranchesForInvisible(bEntry, mainEntries, colSpacing) {
    const tolerance = Math.max(15, colSpacing * 0.2);

    // Case 2: Directly below a single main branch [A]
    const directMatch = mainEntries.find(m => Math.abs(m.x - bEntry.x) <= tolerance);
    if (directMatch) {
        return [directMatch];
    }

    // Case 1: In between two adjacent main branches [A][C]
    for (let i = 0; i < mainEntries.length - 1; i++) {
        const left = mainEntries[i];
        const right = mainEntries[i + 1];
        if (right.colIdx - left.colIdx !== 1) continue;

        const midX = (left.x + right.x) / 2;
        if (Math.abs(midX - bEntry.x) <= tolerance) {
            return [left, right];
        }
    }

    return [];
}

/**
 * Animates the activator's own card along a U-curve (∪) path to strike
 * a target card, triggers onImpact(), then swoops back home.
 */
async function animateUCurveAttack(activatorTooltip, fromX, fromY, toX, toY, glowColor, sessionId, onImpact) {
    if (!isZuoGongMode || sessionId !== currentSessionId) return false;

    const dxTotal = toX - fromX;
    const dist = Math.abs(dxTotal);
    const dip = Math.max(85, Math.min(150, dist * 0.45));
    const bottomY = Math.max(fromY, toY) + dip;

    // Build cubic Bezier control points forming a U-curve (∪)
    const p0 = { x: fromX, y: fromY };
    const p3 = { x: toX, y: toY };

    let p1, p2;
    if (dist < 35) {
        // Target is directly below/above activator: swing slightly sideways so the U-loop stays visible
        const swing = 55;
        p1 = { x: fromX + swing, y: bottomY };
        p2 = { x: toX + swing, y: bottomY };
    } else {
        p1 = { x: fromX + dxTotal * 0.12, y: bottomY };
        p2 = { x: fromX + dxTotal * 0.88, y: bottomY };
    }

    function cubicBezierPoint(t) {
        const u = 1 - t;
        return {
            x: (u * u * u) * p0.x + 3 * (u * u) * t * p1.x + 3 * u * (t * t) * p2.x + (t * t * t) * p3.x,
            y: (u * u * u) * p0.y + 3 * (u * u) * t * p1.y + 3 * u * (t * t) * p2.y + (t * t * t) * p3.y
        };
    }

    const steps = 24;
    const outboundKeyframes = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const pt = cubicBezierPoint(t);
        const relX = pt.x - fromX;
        const relY = pt.y - fromY;
        const scale = (t < 0.85) ? (1 + 0.08 * Math.sin(t * Math.PI)) : 1.12;
        outboundKeyframes.push({
            transform: `translate(-50%, -50%) translate(${relX}px, ${relY}px) scale(${scale})`,
            offset: t
        });
    }

    const returnKeyframes = [];
    for (let i = 0; i <= steps; i++) {
        const t = 1 - (i / steps);
        const pt = cubicBezierPoint(t);
        const relX = pt.x - fromX;
        const relY = pt.y - fromY;
        const scale = 1 + 0.05 * Math.sin(t * Math.PI);
        returnKeyframes.push({
            transform: `translate(-50%, -50%) translate(${relX}px, ${relY}px) scale(${scale})`,
            offset: i / steps
        });
    }

    const origZ = activatorTooltip.style.zIndex;
    const origBorder = activatorTooltip.style.borderColor;
    const origShadow = activatorTooltip.style.boxShadow;

    activatorTooltip.style.zIndex = '5000';
    activatorTooltip.style.borderColor = glowColor;
    activatorTooltip.style.boxShadow = `0 8px 24px ${glowColor}`;

    // 1. Fly out along the U-curve to attack the target card
    const outAnim = activatorTooltip.animate(outboundKeyframes, {
        duration: 540,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards'
    });

    try {
        await outAnim.finished;
    } catch (e) {
        return false;
    }

    if (!isZuoGongMode || sessionId !== currentSessionId) return false;

    // 2. Strike impact!
    if (typeof onImpact === 'function') {
        onImpact();
    }

    // Brief hold at strike contact
    await new Promise(r => setTimeout(r, 110));
    if (!isZuoGongMode || sessionId !== currentSessionId) return false;

    // 3. Swoop back along the U-curve to home position
    const backAnim = activatorTooltip.animate(returnKeyframes, {
        duration: 440,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
    });

    try {
        await backAnim.finished;
    } catch (e) {
        return false;
    }

    outAnim.cancel(); // Clear forwards hold so card rests cleanly at home
    activatorTooltip.style.zIndex = origZ || '2000';
    activatorTooltip.style.borderColor = origBorder;
    activatorTooltip.style.boxShadow = origShadow;

    // Ensure activator keeps its orange background if it became orange
    if (activatorTooltip.dataset.cardState === 'orange') {
        activatorTooltip.style.setProperty('background-color', getLightOrangeBg(), 'important');
    }

    return isZuoGongMode && sessionId === currentSessionId;
}

async function handleBranchZuoGongClick(clickedElement, clickedChar) {
    if (!isZuoGongMode || isSimulationRunning) return;

    clearAllZuoGongTooltips();

    const invBranchContainer = document.getElementById('invisibleBranchRelContainer');
    if (invBranchContainer) {
        invBranchContainer.classList.remove('collapsed');
    }

    const sessionId = currentSessionId;
    isSimulationRunning = true;

    const onBranchCardClick = (e) => {
        e.stopPropagation();
        if (!isSimulationRunning) {
            dismissAllZuoGongTooltips();
        }
    };

    try {
        const mainBranches = Array.from(document.querySelectorAll('#baziGrid .main-pillar-branch'))
            .sort((a, b) => parseInt(a.getAttribute('data-col') || 0, 10) - parseInt(b.getAttribute('data-col') || 0, 10));

        if (mainBranches.length === 0) return;

        const headers = Array.from(document.querySelectorAll('#baziGrid .bazi-header'))
            .map(el => el.textContent.trim());

        // Rule 2: Always check the 人元司令 element at the beginning of the score counting phase
        const renyuanInfo = (typeof calculateRenyuanSiling === 'function') ? calculateRenyuanSiling() : null;
        const renyuanStem = renyuanInfo ? renyuanInfo.X : null;

        const solidRels = getSolidInvisibleBranchRelationships();
        const branchCardEntries = []; // Stores { elem, char, tooltip, isMain, colIdx, x }

        // ====================================================================
        // PHASE 1: Ready every main-pillar-branch moving card (left to right)
        // ====================================================================
        for (const branchElem of mainBranches) {
            if (!isZuoGongMode || sessionId !== currentSessionId) return;

            const branchChar = branchElem.textContent.trim();
            if (!branchChar) continue;

            const colIdx = parseInt(branchElem.getAttribute('data-col') || 0, 10);
            const pillarHeader = headers[colIdx] || '';

            const cardTooltip = spawnZuoGongTooltip(branchElem, branchChar, 0);
            if (!cardTooltip) continue;
            cardTooltip.dataset.cardKind = 'branch';
            cardTooltip.dataset.cardState = 'normal';
            cardTooltip.style.transition = 'background-color 0.35s ease, border-color 0.35s ease';
            cardTooltip.onclick = onBranchCardClick;

            const targetCenter = getElemCenter(branchElem);

            await new Promise(r => setTimeout(r, 180));
            if (!isZuoGongMode || sessionId !== currentSessionId) return;

            const linkedSolidRels = solidRels.filter(rel => rel.indices.includes(colIdx));

            for (const rel of linkedSolidRels) {
                if (!isZuoGongMode || sessionId !== currentSessionId) return;

                const blinkPromise = blinkOrbSourceRel(rel, sessionId);
                const absorbed = await flyCircleToCard(
                    rel.centerX,
                    rel.centerY,
                    targetCenter.x,
                    targetCenter.y,
                    rel.orbColor,
                    sessionId
                );
                await blinkPromise;

                if (!absorbed) return;
                addScoreToTooltip(cardTooltip, 1);
            }

            // Rule 2: Apply 人元司令 multiplier (rounded up)
            const renyuanMult = getRenyuanBranchMultiplier(renyuanStem, branchChar);
            if (multiplyTooltipScore(cardTooltip, renyuanMult)) {
                await new Promise(r => setTimeout(r, 180));
                if (!isZuoGongMode || sessionId !== currentSessionId) return;
            }

            // Rule 3: Multiply Month branch by 2 and Time branch by 1.5 (rounded up)
            let pillarMult = 1;
            if (pillarHeader === '月') pillarMult = 2;
            else if (pillarHeader === '時') pillarMult = 1.5;

            if (multiplyTooltipScore(cardTooltip, pillarMult)) {
                await new Promise(r => setTimeout(r, 180));
                if (!isZuoGongMode || sessionId !== currentSessionId) return;
            }

            const blockingRels = linkedSolidRels.filter(rel => !rel.isFaded);
            if (blockingRels.length > 0) {
                await blinkBlockingSvgRelationships(blockingRels, sessionId);
                if (!isZuoGongMode || sessionId !== currentSessionId) return;

                cardTooltip.dataset.cardState = 'red';
                cardTooltip.style.backgroundColor = getLightRedBg();
                await new Promise(r => setTimeout(r, 220));
            }

            branchCardEntries.push({
                elem: branchElem,
                char: branchChar,
                tooltip: cardTooltip,
                isMain: true,
                colIdx,
                x: targetCenter.x
            });
        }

        // ====================================================================
        // PHASE 2: Ready invisibleBranchRelContainer moving cards (score 5, light red)
        // ====================================================================
        if (invBranchContainer && invBranchContainer.style.display !== 'none') {
            const spawnedBranchElems = Array.from(invBranchContainer.querySelectorAll('text.spawned-branch'))
                .filter(el => {
                    const txt = el.textContent.trim();
                    return txt && txt !== '合';
                })
                .sort((a, b) => getElemCenter(a).x - getElemCenter(b).x);

            for (const svgBranchElem of spawnedBranchElems) {
                if (!isZuoGongMode || sessionId !== currentSessionId) return;

                const branchChar = svgBranchElem.textContent.trim();
                const tooltip = spawnZuoGongTooltip(svgBranchElem, branchChar, 5);
                if (!tooltip) continue;

                tooltip.dataset.cardKind = 'branch';
                tooltip.dataset.cardState = 'red';
                tooltip.style.backgroundColor = getLightRedBg();
                tooltip.style.transition = 'background-color 0.35s ease, border-color 0.35s ease';
                tooltip.onclick = onBranchCardClick;

                // Rule 2: Apply 人元司令 multiplier to hidden branch cards too
                const renyuanMult = getRenyuanBranchMultiplier(renyuanStem, branchChar);
                multiplyTooltipScore(tooltip, renyuanMult);

                branchCardEntries.push({
                    elem: svgBranchElem,
                    char: branchChar,
                    tooltip: tooltip,
                    isMain: false,
                    colIdx: null,
                    x: getElemCenter(svgBranchElem).x
                });

                await new Promise(r => setTimeout(r, 120));
            }
        }

        if (!isZuoGongMode || sessionId !== currentSessionId) return;
        await new Promise(r => setTimeout(r, 220));

        // ====================================================================
        // RULE 4 CHECK: Hidden branch B directly below [A] or between [A][C]
        // If B can 沖 or 刑 (A or/and C), B can untrap itself without activation
        // ====================================================================
        const mainEntries = branchCardEntries
            .filter(entry => entry.isMain)
            .sort((a, b) => a.colIdx - b.colIdx);

        const colSpacing = (mainEntries.length >= 2)
            ? Math.abs(mainEntries[1].x - mainEntries[0].x) / Math.max(1, mainEntries[1].colIdx - mainEntries[0].colIdx)
            : 98;

        for (const entry of branchCardEntries) {
            if (entry.isMain) continue;

            const aboveTargets = getAboveMainBranchesForInvisible(entry, mainEntries, colSpacing);
            const attackableAboveTargets = aboveTargets.filter(
                tgt => getBranchActivationType(entry.char, tgt.char) !== null
            );

            if (attackableAboveTargets.length > 0) {
                entry.canSelfUntrap = true;
                entry.selfUntrapTargets = new Set(attackableAboveTargets);
            }
        }

        // ====================================================================
        // PHASE 3: Free-move cards (right to left) hit targets and cascade
        // ====================================================================
        const triggeredActivators = new Set();
        // Rule 1: Maps each card -> Set of cards that have already hit it
        const hitByMap = new Map();

        function recordHit(attacker, target) {
            if (!hitByMap.has(target)) {
                hitByMap.set(target, new Set());
            }
            hitByMap.get(target).add(attacker);
        }

        function hasBeenHitBy(victim, attacker) {
            const attackers = hitByMap.get(victim);
            return Boolean(attackers && attackers.has(attacker));
        }

        async function runActivatorAttacks(activator) {
            if (!isZuoGongMode || sessionId !== currentSessionId) return;
            if (triggeredActivators.has(activator)) return;
            triggeredActivators.add(activator);

            const actCenter = getElemCenter(activator.elem);
            let candidateTargets = branchCardEntries.filter(
                entry => entry !== activator && !hasBeenHitBy(activator, entry)
            );

            // If B untrapped itself via Rule 4, prioritize its above [A]/[C] targets first
            if (activator.canSelfUntrap && activator.selfUntrapTargets) {
                candidateTargets.sort((a, b) => {
                    const aPri = activator.selfUntrapTargets.has(a) ? 0 : 1;
                    const bPri = activator.selfUntrapTargets.has(b) ? 0 : 1;
                    return aPri - bPri;
                });
            }

            for (const target of candidateTargets) {
                if (!isZuoGongMode || sessionId !== currentSessionId) return;

                // Rule 1: Re-check in case target hit activator during an intermediate cascade
                if (hasBeenHitBy(activator, target)) continue;

                const actType = getBranchActivationType(activator.char, target.char);
                if (!actType) continue;

                // Record the hit before executing so target cannot hit activator back
                recordHit(activator, target);

                // If B was still red while self-untrapping, mark it orange as it launches
                if (activator.canSelfUntrap && activator.tooltip.dataset.cardState === 'red') {
                    setCardOrange(activator.tooltip);
                }

                const tgtCenter = getElemCenter(target.elem);
                const pulseColor = (actType === 'chong') ? '#ff9800' : '#a855f7';

                const completed = await animateUCurveAttack(
                    activator.tooltip,
                    actCenter.x,
                    actCenter.y,
                    tgtCenter.x,
                    tgtCenter.y,
                    pulseColor,
                    sessionId,
                    () => {
                        const activatorScore = parseInt(activator.tooltip.dataset.score || '0', 10);
                        const targetScore = parseInt(target.tooltip.dataset.score || '0', 10);
                        const halfActivatorScore = Math.ceil(activatorScore / 2);

                        const isUnactivatedMainRed =
                            target.isMain && target.tooltip.dataset.cardState === 'red';

                        if (isUnactivatedMainRed) {
                            // New score = (targetScore * 2) + Math.ceil(activatorScore / 2)
                            addScoreToTooltip(target.tooltip, targetScore + halfActivatorScore);
                        } else {
                            // Add half of the hitting card's score (rounded up)
                            addScoreToTooltip(target.tooltip, halfActivatorScore);
                        }

                        setCardOrange(target.tooltip);
                        setCardOrange(activator.tooltip);

                        target.tooltip.animate([
                            { transform: 'translate(-50%, -50%) scale(1)' },
                            { transform: 'translate(-50%, -50%) translate(6px, -4px) scale(1.14)' },
                            { transform: 'translate(-50%, -50%) translate(-4px, 3px) scale(1.08)' },
                            { transform: 'translate(-50%, -50%) scale(1)' }
                        ], { duration: 320, easing: 'ease-out' });
                    }
                );

                if (!completed) return;
                await new Promise(r => setTimeout(r, 150));

                await runActivatorAttacks(target);
            }
        }

        const initialFreeActivators = branchCardEntries
            .filter(entry => entry.tooltip.dataset.cardState === 'normal' || entry.canSelfUntrap)
            .sort((a, b) => {
                if (Math.abs(b.x - a.x) > 1) return b.x - a.x; // Right to left
                return (a.isMain ? -1 : 1) - (b.isMain ? -1 : 1);
            });

        for (const activator of initialFreeActivators) {
            if (!isZuoGongMode || sessionId !== currentSessionId) return;
            await runActivatorAttacks(activator);
        }
    } catch (err) {
        console.error("Branch Zuo Gong simulation error:", err);
    } finally {
        isSimulationRunning = false;
    }
}

// ============================================================================
// HEAVENLY STEM (天干) 做功 SIMULATION (Existing Logic Preserved)
// ============================================================================

function markQiShaBypassed(qishaElem, qishaChar) {
    bypassedQiShaElems.add(qishaElem);
    const tooltip = activeZuoGongTooltips.get(qishaElem) || spawnZuoGongTooltip(qishaElem, qishaChar);
    if (!tooltip) return;

    tooltip.style.backgroundColor = getLightRedBg();

    if (!tooltip.querySelector('.zuogong-red-circle')) {
        const circle = document.createElement('div');
        circle.className = 'zuogong-red-circle';
        circle.style.position = 'absolute';
        circle.style.left = '50%';
        circle.style.top = '50%';
        circle.style.width = '78px';
        circle.style.height = '78px';
        circle.style.transform = 'translate(-50%, -50%)';
        circle.style.border = '3.5px solid #ff4d4f';
        circle.style.borderRadius = '50%';
        circle.style.boxShadow = '0 0 10px rgba(255, 77, 79, 0.65)';
        circle.style.pointerEvents = 'none';
        circle.style.boxSizing = 'border-box';
        tooltip.appendChild(circle);

        circle.animate([
            { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
            { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: 0.7 },
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }
        ], { duration: 350, easing: 'ease-out', fill: 'forwards' });
    }
}

function incrementWaitingSpot(spotIndex, x, y, isMain) {
    const badgeY = y + (isMain ? 44 : 32);
    let data = activeWaitBadges.get(spotIndex);

    if (!data) {
        const badge = document.createElement('div');
        badge.className = 'zuogong-wait-badge';
        badge.style.position = 'absolute';
        badge.style.left = `${x}px`;
        badge.style.top = `${badgeY}px`;
        badge.style.transform = 'translate(-50%, 0)';
        badge.style.zIndex = '6000';
        badge.style.backgroundColor = (typeof isDarkMode === 'function' && isDarkMode()) ? '#0f172a' : '#ffffff';
        badge.style.border = '2px solid #2563eb';
        badge.style.borderRadius = '12px';
        badge.style.padding = '1px 8px';
        badge.style.fontSize = '14px';
        badge.style.fontWeight = '900';
        badge.style.color = '#2563eb';
        badge.style.boxShadow = '0 3px 10px rgba(37, 99, 235, 0.4)';
        badge.style.pointerEvents = 'none';
        badge.style.lineHeight = '1.3';
        badge.textContent = '1';

        document.body.appendChild(badge);
        data = { count: 1, element: badge };
        activeWaitBadges.set(spotIndex, data);
    } else {
        data.count++;
        data.element.textContent = data.count;
        data.element.animate([
            { transform: 'translate(-50%, 0) scale(1.3)' },
            { transform: 'translate(-50%, 0) scale(1)' }
        ], { duration: 220, easing: 'ease-out' });
    }
}

function decrementWaitingSpot(spotIndex) {
    const data = activeWaitBadges.get(spotIndex);
    if (!data) return;

    data.count--;
    if (data.count <= 0) {
        data.element.remove();
        activeWaitBadges.delete(spotIndex);
    } else {
        data.element.textContent = data.count;
        data.element.animate([
            { transform: 'translate(-50%, 0) scale(0.8)' },
            { transform: 'translate(-50%, 0) scale(1)' }
        ], { duration: 200, easing: 'ease-out' });
    }
}

function getSpotGridInfo() {
    const mainStems = Array.from(document.querySelectorAll('.main-pillar-stem'));
    mainStems.sort((a, b) => parseInt(a.getAttribute('data-col') || 0, 10) - parseInt(b.getAttribute('data-col') || 0, 10));

    const N = mainStems.length;
    if (N === 0) return null;

    const pillarPositions = mainStems.map(el => getElemCenter(el));
    const firstSvg = document.querySelector('#invisibleStemRelContainer text.spawned-stem');
    const svgAltitudeY = firstSvg ? getElemCenter(firstSvg).y : (pillarPositions[0].y - 45);

    const spots = [];
    spots[0] = null;

    for (let s = 1; s <= (2 * N - 1); s++) {
        if (s % 2 === 1) {
            const c = (s - 1) / 2;
            spots[s] = {
                spotIndex: s,
                isPillar: true,
                col: c,
                x: pillarPositions[c].x,
                mainY: pillarPositions[c].y,
                svgY: svgAltitudeY
            };
        } else {
            const c1 = (s / 2) - 1;
            const c2 = s / 2;
            spots[s] = {
                spotIndex: s,
                isPillar: false,
                col: null,
                x: (pillarPositions[c1].x + pillarPositions[c2].x) / 2,
                mainY: (pillarPositions[c1].y + pillarPositions[c2].y) / 2,
                svgY: svgAltitudeY
            };
        }
    }

    const totalSpots = 2 * N - 1;
    const leftWallX = spots[1].x - 70;
    const rightWallX = spots[totalSpots].x + 70;

    return { spots, N, totalSpots, leftWallX, rightWallX, mainStems };
}

function getStemsAtSpot(spotIndex, gridInfo) {
    const spot = gridInfo.spots[spotIndex];
    if (!spot) return [];

    const results = [];

    if (spot.isPillar) {
        const mainEl = gridInfo.mainStems[spot.col];
        if (mainEl) {
            const char = mainEl.textContent.trim();
            if (char && char !== '合') {
                results.push({ elem: mainEl, char, isMain: true, spotIndex });
            }
        }
    }

    const svgStems = document.querySelectorAll('#invisibleStemRelContainer text.spawned-stem');
    svgStems.forEach(svgEl => {
        const char = svgEl.textContent.trim();
        if (!char || char === '合') return;
        const center = getElemCenter(svgEl);

        if (Math.abs(center.x - spot.x) <= 30) {
            results.push({ elem: svgEl, char, isMain: false, spotIndex });
        }
    });

    return results;
}

function findStartingSpot(elem, isMain, gridInfo) {
    if (isMain) {
        const col = parseInt(elem.getAttribute('data-col') || 0, 10);
        return (col * 2) + 1;
    }

    const center = getElemCenter(elem);
    let bestSpot = 1;
    let minDiff = Infinity;

    for (let s = 1; s <= gridInfo.totalSpots; s++) {
        const diff = Math.abs(gridInfo.spots[s].x - center.x);
        if (diff < minDiff) {
            minDiff = diff;
            bestSpot = s;
        }
    }
    return bestSpot;
}

function isStemTrapped(elem, char, isMain, gridInfo) {
    if (!isMain) return true;

    const col = parseInt(elem.getAttribute('data-col'), 10);
    const mainStems = gridInfo.mainStems.map(el => el.textContent.trim());
    const headers = Array.from(document.querySelectorAll('#baziGrid .bazi-header')).map(el => el.textContent.trim());

    if (typeof findInvisibleStemRelationships === 'function') {
        let rels = findInvisibleStemRelationships(mainStems);

        if (headers.length === mainStems.length) {
            rels = rels.filter(rel => !rel.indices.some(idx =>
                headers[idx] === "命宮" || headers[idx] === "胎元" || headers[idx] === "胎息" || headers[idx] === "身宮"
            ));

            if (typeof isSplitMode !== 'undefined' && isSplitMode) {
                const groupA = ["命宮", "胎元", "胎息", "身宮", "時", "日", "月", "年", "元運"];
                const groupB = ["大運", "流年", "流月", "流日", "流時"];
                rels = rels.filter(rel => {
                    const hasA = rel.indices.some(idx => groupA.includes(headers[idx]));
                    const hasB = rel.indices.some(idx => groupB.includes(headers[idx]));
                    return !(hasA && hasB);
                });
            }
        }

        for (const rel of rels) {
            const isBoldSolid = (rel.type === 'same_neighbor' || rel.type === 'neighbor' || rel.type === 'he_yin');
            if (isBoldSolid && rel.indices && rel.indices.includes(col)) {
                return true;
            }
        }
    }

    return false;
}

function findStemCandidates(targetChar, gridInfo) {
    const list = [];

    gridInfo.mainStems.forEach(el => {
        if (el.textContent.trim() === targetChar) {
            list.push({ elem: el, char: targetChar, isMain: true });
        }
    });

    const svgStems = document.querySelectorAll('#invisibleStemRelContainer text.spawned-stem');
    svgStems.forEach(el => {
        if (el.textContent.trim() === targetChar) {
            list.push({ elem: el, char: targetChar, isMain: false });
        }
    });

    return list;
}

async function flashGreenVictory(element) {
    const anim = element.animate([
        { borderColor: '#2ecc71', boxShadow: '0 0 25px rgba(46, 204, 113, 0.95)', transform: 'translate(-50%, -50%) scale(1.12)', offset: 0 },
        { borderColor: '#2ecc71', boxShadow: '0 0 35px rgba(46, 204, 113, 1)', transform: 'translate(-50%, -50%) scale(1.16)', offset: 0.35 },
        { borderColor: '#2ecc71', boxShadow: '0 0 25px rgba(46, 204, 113, 0.9)', transform: 'translate(-50%, -50%) scale(1.12)', offset: 0.7 },
        { borderColor: '', boxShadow: '', transform: 'translate(-50%, -50%) scale(1)', offset: 1 }
    ], { duration: 1000, easing: 'ease-in-out' });
    await anim.finished;
}

async function pushReverseBump(element, fromX, yPos, toX) {
    const pushDir = (fromX >= toX) ? 1 : -1;
    const origBorder = element.style.borderColor;
    const origShadow = element.style.boxShadow;

    element.style.borderColor = '#f59e0b';
    element.style.boxShadow = '0 0 28px rgba(245, 158, 11, 0.9)';

    const anim = element.animate([
        { transform: 'translate(-50%, -50%) scale(1)', offset: 0 },
        { transform: `translate(-50%, -50%) translate(${pushDir * 14}px, -12px) scale(1.12)`, offset: 0.4 },
        { transform: 'translate(-50%, -50%) scale(1)', offset: 1 }
    ], { duration: 320, easing: 'ease-out' });

    try {
        await anim.finished;
    } catch (e) {}

    element.style.borderColor = origBorder;
    element.style.boxShadow = origShadow;
}

async function bounceAwayAndFade(element, fromX, fromY, targetX, targetY) {
    const dx = fromX - targetX;
    const dy = fromY - targetY;
    const recoilDir = dx >= 0 ? 1 : -1;

    element.style.left = `${targetX}px`;
    element.style.top = `${targetY}px`;

    const approachAnim = element.animate([
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(1)`, offset: 0 },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2}px, -10px) scale(1.1)`, offset: 1 }
    ], { duration: 200, easing: 'ease-in' });
    await approachAnim.finished;

    element.style.borderColor = '#ff4d4f';
    element.style.boxShadow = '0 0 35px rgba(255, 77, 79, 0.95)';
    const numEl = element.querySelector('.zuogong-num');
    if (numEl) numEl.style.color = '#ff4d4f';

    const impactShake = element.animate([
        { transform: `translate(-50%, -50%) translate(${dx * 0.2 - 8}px, -14px) scale(1.18)` },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2 + 8}px, -6px) scale(1.14)` },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2}px, -10px) scale(1.1)` }
    ], { duration: 130, easing: 'linear' });
    await impactShake.finished;

    const recoilAnim = element.animate([
        { transform: `translate(-50%, -50%) translate(${dx * 0.2}px, -10px) rotate(0deg) scale(1.1)`, opacity: 1, offset: 0 },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2 + recoilDir * 50}px, -100px) rotate(${recoilDir * 45}deg) scale(1.05)`, opacity: 0.95, offset: 0.45 },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2 + recoilDir * 95}px, -20px) rotate(${recoilDir * 90}deg) scale(0.85)`, opacity: 0.7, offset: 0.75 },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2 + recoilDir * 130}px, 60px) rotate(${recoilDir * 140}deg) scale(0.35)`, opacity: 0, offset: 1 }
    ], { duration: 650, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' });
    await recoilAnim.finished;
    element.remove();
}

function createHopperElement(char, score, x, y, isLarge) {
    const hopper = document.createElement('div');
    hopper.className = `zuogong-tooltip ${isLarge ? 'large' : 'small'} zuogong-hopper`;
    hopper.style.zIndex = "5000";
    hopper.style.left = `${x}px`;
    hopper.style.top = `${y}px`;
    hopper.style.borderStyle = 'solid';
    hopper.style.borderWidth = '2px';
    hopper.style.borderColor = isDarkMode() ? '#e2e8f0' : '#475569';

    const numDiv = document.createElement('div');
    numDiv.className = 'zuogong-num';
    numDiv.textContent = score;

    const stemDiv = document.createElement('div');
    stemDiv.className = 'zuogong-stem';
    stemDiv.textContent = char;
    stemDiv.style.color = getElementColor(char);

    hopper.appendChild(numDiv);
    hopper.appendChild(stemDiv);
    return hopper;
}

async function hopStep(element, fromX, fromY, toX, toY, duration = 380, sessionId = currentSessionId) {
    if (!isZuoGongMode || sessionId !== currentSessionId) {
        if (element) element.remove();
        return false;
    }

    const deltaX = fromX - toX;
    const deltaY = fromY - toY;

    element.style.left = `${toX}px`;
    element.style.top = `${toY}px`;

    const anim = element.animate([
        { transform: `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px) scale(1)`, offset: 0 },
        { transform: `translate(-50%, -50%) translate(${deltaX * 0.5}px, ${deltaY * 0.5 - 32}px) scale(1.08)`, offset: 0.5 },
        { transform: `translate(-50%, -50%) translate(0px, 0px) scale(1)`, offset: 1 }
    ], { duration, easing: 'ease-in-out' });

    try {
        await anim.finished;
    } catch (e) {
        return false;
    }

    if (!isZuoGongMode || sessionId !== currentSessionId) {
        if (element) element.remove();
        return false;
    }
    return true;
}

async function fadeOutAndRemove(element) {
    const fade = element.animate([
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' }
    ], { duration: 320, fill: 'forwards' });
    await fade.finished;
    element.remove();
}

async function handleSpotInteractions(curSpot, hopper, walkerScore, stemChar, isMain, originTooltip, fromX, yPos, toX, gridInfo, direction, hasVisitedOpposite) {
    const targetPianCaiChar = zuoGongPianCaiDict[stemChar];
    const targetQiShaChar = (typeof qiShaDict !== 'undefined') ? qiShaDict[stemChar] : null;
    const stemsHere = getStemsAtSpot(curSpot, gridInfo);

    if (isMain && targetQiShaChar) {
        const mainQishaCandidate = stemsHere.find(st => st.char === targetQiShaChar && st.isMain);

        if (mainQishaCandidate) {
            const isExhausted = exhaustedStartPoints.has(mainQishaCandidate.elem);
            const isBypassed = bypassedQiShaElems.has(mainQishaCandidate.elem);

            if (!isExhausted && !isBypassed) {
                const qishaScore = getEffectiveScore(mainQishaCandidate.elem, mainQishaCandidate.char);

                if (qishaScore >= walkerScore) {
                    spawnZuoGongTooltip(mainQishaCandidate.elem, mainQishaCandidate.char);

                    if (!hasVisitedOpposite) {
                        await pushReverseBump(hopper, fromX, yPos, toX);
                        return 'reverse';
                    } else {
                        await bounceAwayAndFade(hopper, fromX, yPos, toX, yPos);
                        return 'toppled';
                    }
                } else if (walkerScore > qishaScore) {
                    spawnZuoGongTooltip(mainQishaCandidate.elem, mainQishaCandidate.char);
                    await flashGreenVictory(hopper);
                }
            }
        }
    }

    if (targetPianCaiChar) {
        const piancaiTargets = stemsHere.filter(st => st.char === targetPianCaiChar);

        for (const pc of piancaiTargets) {
            if (originTooltip) {
                originTooltip.style.backgroundColor = getLightGreenBg();
                originTooltip.style.borderColor = isDarkMode() ? '#2ecc71' : '#27ae60';
                originTooltip.style.borderStyle = 'dotted';
            }

            let pcTooltip = activeZuoGongTooltips.get(pc.elem) || spawnZuoGongTooltip(pc.elem, pc.char);
            addScoreToTooltip(pcTooltip, walkerScore);

            if (!exhaustedStartPoints.has(pc.elem)) {
                pcTooltip.style.backgroundColor = getLightGreyBg();

                incrementWaitingSpot(curSpot, toX, yPos, isMain);
                try {
                    const isInvisibleOrNormalLine = isStemTrapped(pc.elem, pc.char, pc.isMain, gridInfo);
                    const pushedDir = (direction === 'right' && isInvisibleOrNormalLine)
                        ? 'left'
                        : (pc.isMain ? direction : 'left');
                    await walkWord(pc.elem, pc.char, pc.isMain, curSpot, gridInfo, pushedDir);
                } finally {
                    decrementWaitingSpot(curSpot);
                }
            }
        }
    }

    return 'none';
}

async function walkWord(stemElem, stemChar, isMain, startSpot, gridInfo, initialDirection = 'left') {
    const sessionId = currentSessionId;

    if (exhaustedStartPoints.has(stemElem)) return;
    exhaustedStartPoints.add(stemElem);

    const originTooltip = spawnZuoGongTooltip(stemElem, stemChar);
    if (originTooltip) {
        originTooltip.style.opacity = '1';
        originTooltip.style.filter = 'none';
        originTooltip.style.backgroundColor = getLightGreyBg();
        originTooltip.style.borderStyle = 'dotted';
        originTooltip.style.borderWidth = '2.5px';
        originTooltip.style.borderColor = isDarkMode() ? '#94a3b8' : '#64748b';
        originTooltip.style.transition = 'background-color 0.4s ease, border-color 0.4s ease';
        originTooltip.style.zIndex = '1800';
    }

    const walkerScore = getEffectiveScore(stemElem, stemChar);
    const startSpotObj = gridInfo.spots[startSpot];
    const currentY = isMain ? startSpotObj.mainY : startSpotObj.svgY;

    const hopper = createHopperElement(stemChar, walkerScore, startSpotObj.x, currentY, isMain);
    document.body.appendChild(hopper);

    let curSpot = startSpot;
    let currentDirection = initialDirection;
    let hasVisitedLeft = false;
    let hasVisitedRight = false;

    const shouldAbort = () => !isZuoGongMode || sessionId !== currentSessionId;

    while (true) {
        if (currentDirection === 'left') {
            hasVisitedLeft = true;
        } else {
            hasVisitedRight = true;
        }

        const step = (currentDirection === 'left') ? -1 : 1;
        const limit = (currentDirection === 'left') ? 1 : gridInfo.totalSpots;
        const hasVisitedOpposite = (currentDirection === 'left') ? hasVisitedRight : hasVisitedLeft;

        let outcome = 'wall';

        while (currentDirection === 'left' ? curSpot > limit : curSpot < limit) {
            if (shouldAbort()) { hopper.remove(); return; }

            const nextSpot = curSpot + step;
            const curSpotObj = gridInfo.spots[curSpot];
            const nextSpotObj = gridInfo.spots[nextSpot];

            const fromX = curSpotObj.x;
            const toX = nextSpotObj.x;
            const curY = isMain ? curSpotObj.mainY : curSpotObj.svgY;
            const yPos = isMain ? nextSpotObj.mainY : nextSpotObj.svgY;

            let justBypassed = false;
            const targetQiShaChar = (typeof qiShaDict !== 'undefined') ? qiShaDict[stemChar] : null;

            if (isMain && targetQiShaChar && nextSpotObj.isPillar) {
                const nextStems = getStemsAtSpot(nextSpot, gridInfo);
                const nextQiSha = nextStems.find(st => st.char === targetQiShaChar && st.isMain);

                if (
                    nextQiSha &&
                    !exhaustedStartPoints.has(nextQiSha.elem) &&
                    !bypassedQiShaElems.has(nextQiSha.elem)
                ) {
                    const qishaScore = getEffectiveScore(nextQiSha.elem, nextQiSha.char);

                    if (qishaScore >= walkerScore && isStemTrapped(nextQiSha.elem, nextQiSha.char, true, gridInfo)) {
                        incrementWaitingSpot(curSpot, fromX, curY, isMain);
                        try {
                            await requestRescueOrWalk(nextQiSha.elem, nextQiSha.char, true, gridInfo);
                        } finally {
                            decrementWaitingSpot(curSpot);
                        }

                        if (shouldAbort()) { hopper.remove(); return; }

                        if (exhaustedStartPoints.has(nextQiSha.elem)) {
                            if (currentDirection === 'left') {
                                await pushReverseBump(hopper, fromX, curY, toX);
                                if (shouldAbort()) { hopper.remove(); return; }
                                outcome = 'reversed';
                                break;
                            } else {
                                await bounceAwayAndFade(hopper, fromX, curY, toX, yPos);
                                return;
                            }
                        } else {
                            markQiShaBypassed(nextQiSha.elem, nextQiSha.char);
                            justBypassed = true;
                            await new Promise(r => setTimeout(r, 380));
                            if (shouldAbort()) { hopper.remove(); return; }
                        }
                    }
                }
            }

            const success = await hopStep(hopper, fromX, curY, toX, yPos, 380, sessionId);
            if (!success || shouldAbort()) { hopper.remove(); return; }
            curSpot = nextSpot;

            if (justBypassed) {
                await new Promise(r => setTimeout(r, 280));
                if (shouldAbort()) { hopper.remove(); return; }
            }

            const result = await handleSpotInteractions(
                curSpot, hopper, walkerScore, stemChar, isMain, originTooltip,
                fromX, yPos, toX, gridInfo, currentDirection, hasVisitedOpposite
            );
            if (shouldAbort()) { hopper.remove(); return; }
            if (result === 'toppled') return;
            if (result === 'reverse') {
                outcome = 'reversed';
                break;
            }
        }

        if (outcome === 'reversed') {
            currentDirection = (currentDirection === 'left') ? 'right' : 'left';
            continue;
        }

        if (currentDirection === 'left') {
            if (shouldAbort()) { hopper.remove(); return; }
            const spot1Obj = gridInfo.spots[1];
            const wallY = isMain ? spot1Obj.mainY : spot1Obj.svgY;

            await hopStep(hopper, spot1Obj.x, wallY, gridInfo.leftWallX, wallY, 280, sessionId);
            if (shouldAbort()) { hopper.remove(); return; }
            await hopStep(hopper, gridInfo.leftWallX, wallY, spot1Obj.x, wallY, 280, sessionId);
            if (shouldAbort()) { hopper.remove(); return; }

            curSpot = 1;
            currentDirection = 'right';
            continue;
        }

        if (shouldAbort()) { hopper.remove(); return; }
        const lastSpotObj = gridInfo.spots[gridInfo.totalSpots];
        const endY = isMain ? lastSpotObj.mainY : lastSpotObj.svgY;

        await hopStep(hopper, lastSpotObj.x, endY, gridInfo.rightWallX, endY, 320, sessionId);
        if (!shouldAbort()) {
            await fadeOutAndRemove(hopper);
        } else {
            hopper.remove();
        }
        return;
    }
}

async function requestRescueOrWalk(stemElem, stemChar, isMain, gridInfo, visited = new Set()) {
    if (visited.has(stemElem) || exhaustedStartPoints.has(stemElem)) return;
    visited.add(stemElem);

    const trapped = isStemTrapped(stemElem, stemChar, isMain, gridInfo);

    if (!trapped) {
        const startSpot = findStartingSpot(stemElem, isMain, gridInfo);
        await walkWord(stemElem, stemChar, isMain, startSpot, gridInfo);
    } else {
        const tooltip = spawnZuoGongTooltip(stemElem, stemChar);
        if (tooltip) {
            tooltip.style.opacity = '1';
            tooltip.style.filter = 'none';
            tooltip.style.backgroundColor = getLightRedBg();
            tooltip.style.transition = 'background-color 0.4s ease';
        }

        const neededQiSha = (typeof qiShaDict !== 'undefined') ? qiShaDict[stemChar] : null;
        if (!neededQiSha) return;

        const candidates = findStemCandidates(neededQiSha, gridInfo);

        for (const rescuer of candidates) {
            if (!visited.has(rescuer.elem) && !exhaustedStartPoints.has(rescuer.elem)) {
                await requestRescueOrWalk(rescuer.elem, rescuer.char, rescuer.isMain, gridInfo, visited);
            }
        }
    }
}

async function handleZuoGongClick(clickedElement, stemChar) {
    if (!clickedElement || !stemChar || stemChar === '合') return;

    if (clickedElement.closest && (clickedElement.closest('.bazi-rect-hidden') || clickedElement.closest('[id^="rect_h_r"]'))) {
        return;
    }

    if (isSimulationRunning) return;

    if (resolutionTimeout) {
        clearTimeout(resolutionTimeout);
        resolutionTimeout = null;
    }

    const gridInfo = getSpotGridInfo();
    if (!gridInfo) return;

    isSimulationRunning = true;
    const isMain = clickedElement.classList.contains('main-pillar-stem');

    try {
        await requestRescueOrWalk(clickedElement, stemChar, isMain, gridInfo);
    } catch (err) {
        console.error("Zuo Gong simulation error:", err);
    } finally {
        isSimulationRunning = false;
        scheduleZuoGongFadeOut(2500);
    }
}

// Capture-phase click handler so .main-pillar-branch always triggers in 做功 mode
document.addEventListener('click', (event) => {
    if (typeof isZuoGongMode === 'undefined' || !isZuoGongMode) return;

    const target = event.target.nodeType === 3 ? event.target.parentElement : event.target;
    const branchElem = target && target.closest ? target.closest('.main-pillar-branch') : null;

    if (branchElem) {
        event.stopPropagation();
        event.preventDefault();
        handleBranchZuoGongClick(branchElem, branchElem.textContent.trim());
    }
}, true); 