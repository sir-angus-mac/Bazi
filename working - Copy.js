// --- working.js ---
// Mang Pai BaZi (盲派命理) - 做功 (Zuo Gong) Simulation Engine

let isZuoGongMode = false;
let isSimulationRunning = false;
const activeZuoGongTooltips = new Map();
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
 * Background color helpers for starting-point cards
 */
function getLightGreyBg() {
    return (typeof isDarkMode === 'function' && isDarkMode()) ? '#4a4a4a' : '#dcdcdc';
}

function getLightGreenBg() {
    return (typeof isDarkMode === 'function' && isDarkMode()) ? '#1e4620' : '#c8e6c9';
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
 * Clears all active 做功 tooltips and resets simulation state
 */
function clearAllZuoGongTooltips() {
    if (resolutionTimeout) {
        clearTimeout(resolutionTimeout);
        resolutionTimeout = null;
    }
    isSimulationRunning = false;
    document.querySelectorAll('.zuogong-tooltip').forEach(el => el.remove());
    activeZuoGongTooltips.clear();
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
    tooltip.style.zIndex = "2000"; // Stationary cards stay below moving cards

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
 * Builds the geometric spot array (1 to 2N - 1) and despawn wall coordinate
 */
function getSpotGridInfo() {
    const mainStems = Array.from(document.querySelectorAll('.main-pillar-stem'));
    mainStems.sort((a, b) => parseInt(a.getAttribute('data-col') || 0, 10) - parseInt(b.getAttribute('data-col') || 0, 10));

    const N = mainStems.length;
    if (N === 0) return null;

    const pillarPositions = mainStems.map(el => getElemCenter(el));

    // Determine representative Y altitude for SVG invisible realm
    const firstSvg = document.querySelector('#invisibleStemRelContainer text.spawned-stem');
    const svgAltitudeY = firstSvg ? getElemCenter(firstSvg).y : (pillarPositions[0].y - 45);

    const spots = []; // 1-indexed (spots[1] is leftmost pillar)
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

    const wallX = spots[1].x - 70; // Despawn wall past spot 1

    return { spots, N, totalSpots: 2 * N - 1, wallX, mainStems };
}

/**
 * Returns all stems (main and invisible) situated at a given spot
 */
function getStemsAtSpot(spotIndex, gridInfo) {
    const spot = gridInfo.spots[spotIndex];
    if (!spot) return [];

    const results = [];

    // 1. If it's a pillar spot, check for a main pillar stem
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

    // 2. Check for invisible stems spawned at this horizontal spot
    const svgStems = document.querySelectorAll('#invisibleStemRelContainer text.spawned-stem');
    svgStems.forEach(svgEl => {
        const char = svgEl.textContent.trim();
        if (!char || char === '合') return;
        const center = getElemCenter(svgEl);

        // Matches spot if within 30px horizontally
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
 * Triggers when a main word steps onto a 七殺 whose score is greater than or equal to its own.
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
 * Creates the moving hopper card (z-index 5000: always on top of non-moving cards)
 */
function createHopperElement(char, score, x, y, isLarge) {
    const hopper = document.createElement('div');
    hopper.className = `zuogong-tooltip ${isLarge ? 'large' : 'small'} zuogong-hopper`;
    hopper.style.zIndex = "5000"; // Always in front of any non-moving cards
    hopper.style.left = `${x}px`;
    hopper.style.top = `${y}px`;

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
 * Core Step-by-Step Movement Engine:
 * Moves exactly one card one spot at a time leftward.
 * Pauses and waits if a 偏財 is activated until that 偏財 hits the wall.
 */
async function walkWord(stemElem, stemChar, isMain, startSpot, gridInfo) {
    const targetPianCaiChar = zuoGongPianCaiDict[stemChar];
    const targetQiShaChar = (typeof qiShaDict !== 'undefined') ? qiShaDict[stemChar] : null;

    // 1. Reveal origin card: Solid (opaque) with light grey background
    const originTooltip = spawnZuoGongTooltip(stemElem, stemChar);
    if (originTooltip) {
        originTooltip.style.opacity = '1';
        originTooltip.style.filter = 'none';
        originTooltip.style.backgroundColor = getLightGreyBg();
        originTooltip.style.transition = 'background-color 0.4s ease';
        originTooltip.style.zIndex = '1800'; // Stay behind moving hopper
    }

    const walkerScore = getEffectiveScore(stemElem, stemChar);
    const startSpotObj = gridInfo.spots[startSpot];
    const currentY = isMain ? startSpotObj.mainY : startSpotObj.svgY;

    // 2. Create the moving hopper (always on top with z-index 5000)
    const hopper = createHopperElement(stemChar, walkerScore, startSpotObj.x, currentY, isMain);
    document.body.appendChild(hopper);

    let curSpot = startSpot;

    // Move leftward one discrete spot at a time
    while (curSpot > 1) {
        const nextSpot = curSpot - 1;
        const curSpotObj = gridInfo.spots[curSpot];
        const nextSpotObj = gridInfo.spots[nextSpot];

        const fromX = curSpotObj.x;
        const toX = nextSpotObj.x;
        const yPos = isMain ? nextSpotObj.mainY : nextSpotObj.svgY;

        // Execute one single step hop
        await hopStep(hopper, fromX, yPos, toX, yPos, 380);
        curSpot = nextSpot;

        const stemsHere = getStemsAtSpot(curSpot, gridInfo);

        // --- CONDITION 1: CHECK 七殺 ENCOUNTER ---
        if (targetQiShaChar) {
            const qishaCandidate = stemsHere.find(st => st.char === targetQiShaChar);
            if (qishaCandidate) {
                const qishaScore = getEffectiveScore(qishaCandidate.elem, qishaCandidate.char);

                // If walker is a MAIN stem and 七殺 score >= walker score: Topple!
                if (isMain && qishaScore >= walkerScore) {
                    spawnZuoGongTooltip(qishaCandidate.elem, qishaCandidate.char);
                    await bounceAwayAndFade(hopper, fromX, yPos, toX, yPos);
                    return; // Journey ends immediately
                } else if (walkerScore > qishaScore) {
                    // Walker successfully conquers 七殺: Reveal defeated card and flash green for 1 second!
                    spawnZuoGongTooltip(qishaCandidate.elem, qishaCandidate.char);
                    await flashGreenVictory(hopper);
                }
            }
        }

        // --- CONDITION 2: CHECK 偏財 HIT & TRIGGER ---
        if (targetPianCaiChar) {
            const piancaiTargets = stemsHere.filter(st => st.char === targetPianCaiChar);

            for (const pc of piancaiTargets) {
                // When 偏財 is successfully hit, starting-point card turns LIGHT GREEN!
                if (originTooltip) {
                    originTooltip.style.backgroundColor = getLightGreenBg();
                }

                // Reveal/update 偏財 card
                let pcTooltip = activeZuoGongTooltips.get(pc.elem) || spawnZuoGongTooltip(pc.elem, pc.char);
                addScoreToTooltip(pcTooltip, walkerScore);

                // Walker pauses at curSpot and waits for this 偏財 to complete its journey!
                await walkWord(pc.elem, pc.char, pc.isMain, curSpot, gridInfo);

                // Once child 偏財 finishes hitting the wall, the walker resumes moving
            }
        }
    }

    // --- REACHED SPOT 1: ONE FINAL HOP PAST SPOT 1 TO THE WALL ---
    const spot1Obj = gridInfo.spots[1];
    const yPos = isMain ? spot1Obj.mainY : spot1Obj.svgY;
    await hopStep(hopper, spot1Obj.x, yPos, gridInfo.wallX, yPos, 320);

    // Despawn at the wall
    await fadeOutAndRemove(hopper);
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
    const startSpot = findStartingSpot(clickedElement, isMain, gridInfo);

    try {
        await walkWord(clickedElement, stemChar, isMain, startSpot, gridInfo);
    } catch (err) {
        console.error("Zuo Gong simulation error:", err);
    } finally {
        isSimulationRunning = false;

        // Pause 2.0s after the entire sequence resolves so final scores can be inspected
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
        }, 2000);
    }
} 