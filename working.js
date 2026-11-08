// --- working.js ---
// Mang Pai BaZi (盲派命理) - 做功 (Zuo Gong) Simulation Engine

let isZuoGongMode = false;
let isSimulationRunning = false;
const activeZuoGongTooltips = new Map();
const activeWaitBadges = new Map(); // key: spotIndex -> { count: number, element: HTMLElement }
const exhaustedStartPoints = new Set(); // Tracks stem elements that have already spawned a moving card
let resolutionTimeout = null;

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

/**
 * Calculates the base 做功 score for a heavenly stem
 */
function getZuoGongScore(targetElem, stemChar) {
    if (!targetElem) return 0;

    // Invisible stems spawned in the SVG container have a fixed base score of 5
    if (targetElem.classList.contains('spawned-stem') || (targetElem.closest && targetElem.closest('#invisibleStemRelContainer'))) {
        return 5;
    }

    // Main pillar stems calculate life stage vs. their branch
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

    if (isZuoGongMode) {
        if (invStemContainer) {
            invStemContainer.classList.remove('collapsed');
            if (typeof relContainerStates !== 'undefined') {
                relContainerStates['invisibleStemRelContainer'] = false;
            }
        }
    } else {
        clearAllZuoGongTooltips();
    }
}

/**
 * Clears all active 做功 tooltips, waiting badges, exhausted points, and resets simulation state
 */
function clearAllZuoGongTooltips() {
    if (resolutionTimeout) {
        clearTimeout(resolutionTimeout);
        resolutionTimeout = null;
    }
    isSimulationRunning = false;
    document.querySelectorAll('.zuogong-tooltip').forEach(el => el.remove());
    document.querySelectorAll('.zuogong-wait-badge').forEach(el => el.remove());
    activeZuoGongTooltips.clear();
    activeWaitBadges.clear();
    exhaustedStartPoints.clear();
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
 * Spawns or retrieves a tooltip card on a stem element
 */
function spawnZuoGongTooltip(targetElem, stemChar, customScore = null) {
    if (!targetElem || !stemChar || stemChar === '合') return null;

    if (activeZuoGongTooltips.has(targetElem)) {
        return activeZuoGongTooltips.get(targetElem);
    }

    const rect = targetElem.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;

    const center = getElemCenter(targetElem);
    const isLarge = targetElem.classList.contains('main-pillar-stem');

    const tooltip = document.createElement('div');
    tooltip.className = `zuogong-tooltip ${isLarge ? 'large' : 'small'}`;
    tooltip.style.left = `${center.x}px`;
    tooltip.style.top = `${center.y}px`;
    tooltip.style.zIndex = "2000";

    const initialScore = customScore !== null ? customScore : getZuoGongScore(targetElem, stemChar);
    tooltip.dataset.score = initialScore;

    const numDiv = document.createElement('div');
    numDiv.className = 'zuogong-num';
    numDiv.textContent = initialScore;

    const stemDiv = document.createElement('div');
    stemDiv.className = 'zuogong-stem';
    stemDiv.textContent = stemChar;
    stemDiv.style.color = getElementColor(stemChar);

    tooltip.appendChild(numDiv);
    tooltip.appendChild(stemDiv);

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
 * Manages the blue waiting count badge below cards pausing at a spot
 */
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
        badge.style.color = '#2563eb'; // Blue font
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

/**
 * Builds the geometric spot array (1 to 2N - 1) with left and right wall coordinates
 */
function getSpotGridInfo() {
    const mainStems = Array.from(document.querySelectorAll('.main-pillar-stem'));
    mainStems.sort((a, b) => parseInt(a.getAttribute('data-col') || 0, 10) - parseInt(b.getAttribute('data-col') || 0, 10));

    const N = mainStems.length;
    if (N === 0) return null;

    const pillarPositions = mainStems.map(el => getElemCenter(el));

    // Representative Y altitude for SVG invisible realm
    const firstSvg = document.querySelector('#invisibleStemRelContainer text.spawned-stem');
    const svgAltitudeY = firstSvg ? getElemCenter(firstSvg).y : (pillarPositions[0].y - 45);

    const spots = [];
    spots[0] = null;

    for (let s = 1; s <= (2 * N - 1); s++) {
        if (s % 2 === 1) {
            // Odd spot: Pillar index c = (s - 1) / 2
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
            // Even spot: Midpoint between pillar c1 and c2
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

/**
 * Returns all stems (main and invisible) situated at a given spot
 */
function getStemsAtSpot(spotIndex, gridInfo) {
    const spot = gridInfo.spots[spotIndex];
    if (!spot) return [];

    const results = [];

    // 1. Main pillar stem at odd spot
    if (spot.isPillar) {
        const mainEl = gridInfo.mainStems[spot.col];
        if (mainEl) {
            const char = mainEl.textContent.trim();
            if (char && char !== '合') {
                results.push({
                    elem: mainEl,
                    char: char,
                    isMain: true,
                    spotIndex: spotIndex
                });
            }
        }
    }

    // 2. Invisible stems spawned at this spot's horizontal column
    const svgStems = document.querySelectorAll('#invisibleStemRelContainer text.spawned-stem');
    svgStems.forEach(svgEl => {
        const char = svgEl.textContent.trim();
        if (!char || char === '合') return;
        const center = getElemCenter(svgEl);

        if (Math.abs(center.x - spot.x) <= 30) {
            results.push({
                elem: svgEl,
                char: char,
                isMain: false,
                spotIndex: spotIndex
            });
        }
    });

    return results;
}

/**
 * Finds the starting spot index for any clicked or triggered stem element
 */
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

/**
 * Checks whether a stem is trapped:
 * 1. All invisible stems are trapped by default.
 * 2. Any main stem linked by a normal (solid, non-dotted) line in invisibleStemRelContainer is trapped.
 */
function isStemTrapped(elem, char, isMain, gridInfo) {
    if (!isMain) return true; // Invisible stems are trapped until rescued

    const col = parseInt(elem.getAttribute('data-col'), 10);
    const mainStems = gridInfo.mainStems.map(el => el.textContent.trim());

    if (typeof findInvisibleStemRelationships === 'function') {
        const rels = findInvisibleStemRelationships(mainStems);
        for (const rel of rels) {
            const isCase1 = (rel.type === 'same_neighbor');
            const isCase2 = (rel.type === 'neighbor');
            const isCase3 = (rel.type === 'he_yin');
            const isBoldSolid = isCase1 || isCase2 || isCase3;

            if (isBoldSolid && rel.indices && rel.indices.includes(col)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Finds all stem candidates on the board matching targetChar
 */
function findStemCandidates(targetChar, gridInfo) {
    const list = [];

    // Check main stems
    gridInfo.mainStems.forEach(el => {
        if (el.textContent.trim() === targetChar) {
            list.push({ elem: el, char: targetChar, isMain: true });
        }
    });

    // Check invisible stems
    const svgStems = document.querySelectorAll('#invisibleStemRelContainer text.spawned-stem');
    svgStems.forEach(el => {
        if (el.textContent.trim() === targetChar) {
            list.push({ elem: el, char: targetChar, isMain: false });
        }
    });

    return list;
}

/**
 * Flashes the moving card's border green for 1.0 second upon conquering its 七殺
 */
async function flashGreenVictory(element) {
    const anim = element.animate([
        { borderColor: '#2ecc71', boxShadow: '0 0 25px rgba(46, 204, 113, 0.95)', transform: 'translate(-50%, -50%) scale(1.12)', offset: 0 },
        { borderColor: '#2ecc71', boxShadow: '0 0 35px rgba(46, 204, 113, 1)', transform: 'translate(-50%, -50%) scale(1.16)', offset: 0.35 },
        { borderColor: '#2ecc71', boxShadow: '0 0 25px rgba(46, 204, 113, 0.9)', transform: 'translate(-50%, -50%) scale(1.12)', offset: 0.7 },
        { borderColor: '', boxShadow: '', transform: 'translate(-50%, -50%) scale(1)', offset: 1 }
    ], {
        duration: 1000,
        easing: 'ease-in-out'
    });
    await anim.finished;
}

/**
 * Dramatic Knockout Animation (Topple):
 * ONLY triggers when a MAIN moving card steps onto an active MAIN non-moving 七殺 whose score is >= its own.
 */
async function bounceAwayAndFade(element, fromX, fromY, targetX, targetY) {
    const dx = fromX - targetX;
    const dy = fromY - targetY;

    element.style.left = `${targetX}px`;
    element.style.top = `${targetY}px`;

    // 1. Approach impact point
    const approachAnim = element.animate([
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(1)`, offset: 0 },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2}px, -10px) scale(1.1)`, offset: 1 }
    ], { duration: 200, easing: 'ease-in' });
    await approachAnim.finished;

    // 2. Impact flash & shudder
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

    // 3. High dramatic knockout arc backwards and tumbling down
    const recoilAnim = element.animate([
        {
            transform: `translate(-50%, -50%) translate(${dx * 0.2}px, -10px) rotate(0deg) scale(1.1)`,
            opacity: 1,
            offset: 0
        },
        {
            transform: `translate(-50%, -50%) translate(${dx * 0.2 + 50}px, -100px) rotate(45deg) scale(1.05)`,
            opacity: 0.95,
            offset: 0.45
        },
        {
            transform: `translate(-50%, -50%) translate(${dx * 0.2 + 95}px, -20px) rotate(90deg) scale(0.85)`,
            opacity: 0.7,
            offset: 0.75
        },
        {
            transform: `translate(-50%, -50%) translate(${dx * 0.2 + 130}px, 60px) rotate(140deg) scale(0.35)`,
            opacity: 0,
            offset: 1
        }
    ], {
        duration: 650,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        fill: 'forwards'
    });
    await recoilAnim.finished;
    element.remove();
}

/**
 * Creates the moving hopper card:
 * Explicitly sets SOLID border (not dotted), and z-index 5000 (always on top).
 */
function createHopperElement(char, score, x, y, isLarge) {
    const hopper = document.createElement('div');
    hopper.className = `zuogong-tooltip ${isLarge ? 'large' : 'small'} zuogong-hopper`;
    hopper.style.zIndex = "5000";
    hopper.style.left = `${x}px`;
    hopper.style.top = `${y}px`;

    // Ensure moving card's border is strictly SOLID (never dotted)
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

/**
 * Performs a single parabolic bunny hop from (fromX, fromY) to (toX, toY)
 */
async function hopStep(element, fromX, fromY, toX, toY, duration = 380) {
    const deltaX = fromX - toX;
    const deltaY = fromY - toY;

    element.style.left = `${toX}px`;
    element.style.top = `${toY}px`;

    const anim = element.animate([
        { transform: `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px) scale(1)`, offset: 0 },
        { transform: `translate(-50%, -50%) translate(${deltaX * 0.5}px, ${deltaY * 0.5 - 32}px) scale(1.08)`, offset: 0.5 },
        { transform: `translate(-50%, -50%) translate(0px, 0px) scale(1)`, offset: 1 }
    ], {
        duration: duration,
        easing: 'ease-in-out'
    });

    await anim.finished;
}

/**
 * Fades out and removes an element
 */
async function fadeOutAndRemove(element) {
    const fade = element.animate([
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.6)' }
    ], { duration: 320, fill: 'forwards' });
    await fade.finished;
    element.remove();
}

/**
 * Checks spot interactions for a moving card:
 * 1. 七殺 encounter:
 *    - Moving cards spawned from invisible stems NEVER interact with 七殺.
 *    - ONLY main non-moving stems on the board can topple main moving cards.
 *    - Once a start point spawns a moving card, it CANNOT topple any moving cards!
 * 2. 偏財 encounter:
 *    - Once a start point spawns a moving card, it CANNOT spawn a moving card a second time!
 */
async function handleSpotInteractions(curSpot, hopper, walkerScore, stemChar, isMain, originTooltip, fromX, yPos, toX, gridInfo) {
    const targetPianCaiChar = zuoGongPianCaiDict[stemChar];
    const targetQiShaChar = (typeof qiShaDict !== 'undefined') ? qiShaDict[stemChar] : null;

    const stemsHere = getStemsAtSpot(curSpot, gridInfo);

    // --- CONDITION 1: CHECK 七殺 ENCOUNTER ---
    // ONLY main moving cards ever interact with 七殺!
    if (isMain && targetQiShaChar) {
        const mainQishaCandidate = stemsHere.find(st => st.char === targetQiShaChar && st.isMain);

        if (mainQishaCandidate) {
            // RULE: If this start point has already spawned a moving card, it CANNOT topple any moving cards!
            const isExhausted = exhaustedStartPoints.has(mainQishaCandidate.elem);

            if (!isExhausted) {
                const qishaScore = getEffectiveScore(mainQishaCandidate.elem, mainQishaCandidate.char);

                if (qishaScore >= walkerScore) {
                    spawnZuoGongTooltip(mainQishaCandidate.elem, mainQishaCandidate.char);
                    await bounceAwayAndFade(hopper, fromX, yPos, toX, yPos);
                    return true; // Main walker toppled!
                } else if (walkerScore > qishaScore) {
                    // Main walker successfully conquered the main 七殺: Flash green for 1 second!
                    spawnZuoGongTooltip(mainQishaCandidate.elem, mainQishaCandidate.char);
                    await flashGreenVictory(hopper);
                }
            }
        }
    }

    // --- CONDITION 2: CHECK 偏財 HIT & TRIGGER ---
    if (targetPianCaiChar) {
        const piancaiTargets = stemsHere.filter(st => st.char === targetPianCaiChar);

        for (const pc of piancaiTargets) {
            // When 偏財 is successfully hit, starting-point card turns LIGHT GREEN (keeps dotted border)!
            if (originTooltip) {
                originTooltip.style.backgroundColor = getLightGreenBg();
                originTooltip.style.borderColor = isDarkMode() ? '#2ecc71' : '#27ae60';
                originTooltip.style.borderStyle = 'dotted';
            }

            // Reveal/update 偏財 card
            let pcTooltip = activeZuoGongTooltips.get(pc.elem) || spawnZuoGongTooltip(pc.elem, pc.char);
            addScoreToTooltip(pcTooltip, walkerScore);

            // If this 偏財 was trapped (light red), it is now FREED by its 七殺!
            pcTooltip.style.backgroundColor = getLightGreyBg();

            // RULE: Once a start point spawns a moving card, it CANNOT spawn a moving card a second time!
            if (!exhaustedStartPoints.has(pc.elem)) {
                incrementWaitingSpot(curSpot, toX, yPos, isMain);
                try {
                    await walkWord(pc.elem, pc.char, pc.isMain, curSpot, gridInfo);
                } finally {
                    decrementWaitingSpot(curSpot);
                }
            }
        }
    }

    return false;
}

/**
 * Core Movement Engine:
 * Moves Left -> Bounces off Left Wall -> Moves Right -> Finishes at Right Wall
 */
async function walkWord(stemElem, stemChar, isMain, startSpot, gridInfo) {
    // RULE: If this start point has already spawned a moving card, prevent spawning a second time!
    if (exhaustedStartPoints.has(stemElem)) {
        return;
    }
    exhaustedStartPoints.add(stemElem); // Mark as spent/exhausted

    // Starting-point non-moving card setup: DOTTED BORDER, solid light grey
    const originTooltip = spawnZuoGongTooltip(stemElem, stemChar);
    if (originTooltip) {
        originTooltip.style.opacity = '1';
        originTooltip.style.filter = 'none';
        originTooltip.style.backgroundColor = getLightGreyBg();
        originTooltip.style.borderStyle = 'dotted'; // Dotted border for non-moving starting card
        originTooltip.style.borderWidth = '2.5px';
        originTooltip.style.borderColor = isDarkMode() ? '#94a3b8' : '#64748b';
        originTooltip.style.transition = 'background-color 0.4s ease, border-color 0.4s ease';
        originTooltip.style.zIndex = '1800';
    }

    const walkerScore = getEffectiveScore(stemElem, stemChar);
    const startSpotObj = gridInfo.spots[startSpot];
    const currentY = isMain ? startSpotObj.mainY : startSpotObj.svgY;

    // Create the moving hopper: SOLID BORDER, always on top
    const hopper = createHopperElement(stemChar, walkerScore, startSpotObj.x, currentY, isMain);
    document.body.appendChild(hopper);

    let curSpot = startSpot;

    // ==========================================
    // PHASE 1: MOVE LEFTWARD TOWARDS SPOT 1
    // ==========================================
    while (curSpot > 1) {
        const nextSpot = curSpot - 1;
        const curSpotObj = gridInfo.spots[curSpot];
        const nextSpotObj = gridInfo.spots[nextSpot];

        const fromX = curSpotObj.x;
        const toX = nextSpotObj.x;
        const yPos = isMain ? nextSpotObj.mainY : nextSpotObj.svgY;

        await hopStep(hopper, fromX, yPos, toX, yPos, 380);
        curSpot = nextSpot;

        const toppled = await handleSpotInteractions(curSpot, hopper, walkerScore, stemChar, isMain, originTooltip, fromX, yPos, toX, gridInfo);
        if (toppled) return;
    }

    // ==========================================
    // PHASE 2: BOUNCE OFF THE LEFT WALL
    // ==========================================
    const spot1Obj = gridInfo.spots[1];
    const yPos = isMain ? spot1Obj.mainY : spot1Obj.svgY;

    // Hop to left wall
    await hopStep(hopper, spot1Obj.x, yPos, gridInfo.leftWallX, yPos, 280);

    // Bounce off left wall back to spot 1
    await hopStep(hopper, gridInfo.leftWallX, yPos, spot1Obj.x, yPos, 280);
    curSpot = 1;

    // ==========================================
    // PHASE 3: MOVE RIGHTWARD TOWARDS RIGHT WALL
    // ==========================================
    while (curSpot < gridInfo.totalSpots) {
        const nextSpot = curSpot + 1;
        const curSpotObj = gridInfo.spots[curSpot];
        const nextSpotObj = gridInfo.spots[nextSpot];

        const fromX = curSpotObj.x;
        const toX = nextSpotObj.x;
        const yPosCurrent = isMain ? nextSpotObj.mainY : nextSpotObj.svgY;

        await hopStep(hopper, fromX, yPosCurrent, toX, yPosCurrent, 380);
        curSpot = nextSpot;

        const toppled = await handleSpotInteractions(curSpot, hopper, walkerScore, stemChar, isMain, originTooltip, fromX, yPosCurrent, toX, gridInfo);
        if (toppled) return;
    }

    // ==========================================
    // PHASE 4: FINISH JOURNEY AT THE RIGHT WALL
    // ==========================================
    const lastSpotObj = gridInfo.spots[gridInfo.totalSpots];
    const yPosFinal = isMain ? lastSpotObj.mainY : lastSpotObj.svgY;

    await hopStep(hopper, lastSpotObj.x, yPosFinal, gridInfo.rightWallX, yPosFinal, 320);
    await fadeOutAndRemove(hopper);
}

/**
 * Recursive Rescue Engine:
 * - If free, walks immediately.
 * - If trapped, turns light red and recursively summons its 七殺 to come rescue it.
 */
async function requestRescueOrWalk(stemElem, stemChar, isMain, gridInfo, visited = new Set()) {
    if (visited.has(stemElem) || exhaustedStartPoints.has(stemElem)) return;
    visited.add(stemElem);

    const trapped = isStemTrapped(stemElem, stemChar, isMain, gridInfo);

    if (!trapped) {
        // Free to move!
        const startSpot = findStartingSpot(stemElem, isMain, gridInfo);
        await walkWord(stemElem, stemChar, isMain, startSpot, gridInfo);
    } else {
        // Trapped! Mark with light red card
        const tooltip = spawnZuoGongTooltip(stemElem, stemChar);
        if (tooltip) {
            tooltip.style.opacity = '1';
            tooltip.style.filter = 'none';
            tooltip.style.backgroundColor = getLightRedBg();
            tooltip.style.transition = 'background-color 0.4s ease';
        }

        // Search for this stem's 七殺 to come rescue it
        const neededQiSha = (typeof qiShaDict !== 'undefined') ? qiShaDict[stemChar] : null;
        if (!neededQiSha) return;

        const candidates = findStemCandidates(neededQiSha, gridInfo);

        // Recursively trigger rescuers
        for (const rescuer of candidates) {
            if (!visited.has(rescuer.elem) && !exhaustedStartPoints.has(rescuer.elem)) {
                await requestRescueOrWalk(rescuer.elem, rescuer.char, rescuer.isMain, gridInfo, visited);
            }
        }
    }
}

/**
 * Main click handler called when clicking a stem in 做功 Mode
 */
async function handleZuoGongClick(clickedElement, stemChar) {
    if (!clickedElement || !stemChar || stemChar === '合') return;

    // Prevent multiple overlapping simulations
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

        // Pause 2.5s after the entire sequence resolves so final scores can be inspected
        if (resolutionTimeout) clearTimeout(resolutionTimeout);
        resolutionTimeout = setTimeout(async () => {
            if (isSimulationRunning) return;

            const allTooltips = Array.from(document.querySelectorAll('.zuogong-tooltip'));
            const fadePromises = allTooltips.map(t => {
                const anim = t.animate([
                    { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
                    { opacity: 0, transform: 'translate(-50%, -50%) scale(0.8)' }
                ], { duration: 500, fill: 'forwards' });
                return anim.finished;
            });

            await Promise.all(fadePromises);
            clearAllZuoGongTooltips();
        }, 2500);
    }
} //ok 