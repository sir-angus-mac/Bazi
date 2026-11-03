// --- working.js ---
// Mang Pai BaZi (盲派命理) - 做功 (Zuo Gong) Simulation Engine

let isZuoGongMode = false;
const activeZuoGongTooltips = new Map();
let activeHoppersCount = 0;
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
 * Calculates the base 做功 score for a heavenly stem
 */
function getZuoGongScore(targetElem, stemChar) {
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
 * Clears all active 做功 tooltips and resets state
 */
function clearAllZuoGongTooltips() {
    if (resolutionTimeout) {
        clearTimeout(resolutionTimeout);
        resolutionTimeout = null;
    }
    activeHoppersCount = 0;
    document.querySelectorAll('.zuogong-tooltip').forEach(el => el.remove());
    activeZuoGongTooltips.clear();
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

    const bodyRect = document.body.getBoundingClientRect();
    const centerX = (rect.left - bodyRect.left) + rect.width / 2;
    const centerY = (rect.top - bodyRect.top) + rect.height / 2;

    const isLarge = targetElem.classList.contains('main-pillar-stem');

    const tooltip = document.createElement('div');
    tooltip.className = `zuogong-tooltip ${isLarge ? 'large' : 'small'}`;
    tooltip.style.left = `${centerX}px`;
    tooltip.style.top = `${centerY}px`;
    tooltip.style.zIndex = "2000"; // Always in front of hoppers

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
 * Retrieves unified data for all stem nodes on screen (Main stems and SVG invisible stems)
 */
function getAllStemNodes() {
    const nodes = [];

    // Main pillar stems
    document.querySelectorAll('.main-pillar-stem').forEach(el => {
        const char = el.textContent.trim();
        if (!char || char === '合') return;
        const center = getElemCenter(el);
        const col = parseInt(el.getAttribute('data-col') || '0', 10);
        nodes.push({
            elem: el,
            char: char,
            realm: 'main',
            col: col,
            x: center.x,
            y: center.y
        });
    });

    // Invisible stems in SVG realm
    document.querySelectorAll('#invisibleStemRelContainer text.spawned-stem').forEach(el => {
        const char = el.textContent.trim();
        if (!char || char === '合') return;
        const center = getElemCenter(el);
        nodes.push({
            elem: el,
            char: char,
            realm: 'svg',
            col: null,
            x: center.x,
            y: center.y
        });
    });

    return nodes;
}

/**
 * Main click handler for 做功 Mode
 */
function handleZuoGongClick(clickedElement, stemChar) {
    if (!clickedElement || !stemChar || stemChar === '合') return;

    if (resolutionTimeout) {
        clearTimeout(resolutionTimeout);
        resolutionTimeout = null;
    }

    // Toggle off if already opened and clicked again
    if (activeZuoGongTooltips.has(clickedElement)) {
        activeZuoGongTooltips.get(clickedElement).remove();
        activeZuoGongTooltips.delete(clickedElement);
        return;
    }

    const allNodes = getAllStemNodes();
    const clickedCenter = getElemCenter(clickedElement);
    const isMainRealm = clickedElement.classList.contains('main-pillar-stem');

    const clickedNode = allNodes.find(n => n.elem === clickedElement) || {
        elem: clickedElement,
        char: stemChar,
        realm: isMainRealm ? 'main' : 'svg',
        x: clickedCenter.x,
        y: clickedCenter.y
    };

    const targetQiShaChar = (typeof qiShaDict !== 'undefined') ? qiShaDict[stemChar] : null;

    // Reveal clicked word's card
    spawnZuoGongTooltip(clickedElement, stemChar);

    // Find destination Time stem (時柱) X coordinate
    const allHeaders = Array.from(document.querySelectorAll('.bazi-header'));
    let timeColIdx = allHeaders.findIndex(h => h.textContent.trim() === "時");
    if (timeColIdx === -1) timeColIdx = 0;
    const timeStemElem = document.querySelector(`.main-pillar-stem[data-col="${timeColIdx}"]`) || document.querySelector('.main-pillar-stem');
    const timeX = timeStemElem ? getElemCenter(timeStemElem).x : 50;

    // Scan for 七殺: to the right (x > clickedNode.x + 20) OR directly above/below (|x - clickedNode.x| <= 45)
    const qishaSources = targetQiShaChar ? allNodes.filter(n => {
        if (n.char !== targetQiShaChar) return false;
        const isRight = n.x > clickedNode.x + 20;
        const isVertical = Math.abs(n.x - clickedNode.x) <= 45 && n.realm !== clickedNode.realm;
        return isRight || isVertical;
    }) : [];

    if (qishaSources.length > 0) {
        // 七殺 attacks first!
        qishaSources.forEach((qishaNode, idx) => {
            setTimeout(() => {
                executeDirectOrHorizontalAttack(qishaNode, clickedNode, stemChar, timeX);
            }, idx * 250);
        });
    } else {
        // Words move regardless to find their 偏財 (and SVG stems animate even if nothing to hit!)
        setTimeout(() => {
            if (clickedNode.realm === 'main') {
                executeMainPillarHopping(clickedNode, timeX);
            } else {
                executeSvgHopping(clickedNode, timeX);
            }
        }, 150);
    }
}

/**
 * Handles attack from a 七殺 to our word (vertical leap or horizontal traversal)
 */
async function executeDirectOrHorizontalAttack(sourceNode, targetNode, ourStemChar, timeX) {
    activeHoppersCount++;
    const hopperScore = getZuoGongScore(sourceNode.elem, sourceNode.char);

    const hopper = createHopperElement(sourceNode.char, hopperScore, sourceNode.x, sourceNode.y, sourceNode.realm === 'main');
    document.body.appendChild(hopper);

    const isDirectVertical = Math.abs(sourceNode.x - targetNode.x) <= 45 && sourceNode.realm !== targetNode.realm;

    if (isDirectVertical) {
        // Vertical leap: directly jumps above/below onto target
        const deltaY = sourceNode.y - targetNode.y;
        hopper.style.left = `${targetNode.x}px`;
        hopper.style.top = `${targetNode.y}px`;

        const anim = hopper.animate([
            { transform: `translate(-50%, -50%) translate(0px, ${deltaY}px) scale(1)`, offset: 0 },
            { transform: `translate(-50%, -50%) translate(-20px, ${deltaY * 0.5}px) scale(1.1)`, offset: 0.5 },
            { transform: `translate(-50%, -50%) translate(0px, 0px) scale(1)`, offset: 1 }
        ], { duration: 500, easing: 'ease-in-out' });

        await anim.finished;

        let targetTooltip = activeZuoGongTooltips.get(targetNode.elem) || spawnZuoGongTooltip(targetNode.elem, ourStemChar);
        addScoreToTooltip(targetTooltip, hopperScore);

        await fadeOutAndRemove(hopper);
        onHopperFinished();

        // Target word is hit -> now hops left to find its 偏財!
        setTimeout(() => {
            if (targetNode.realm === 'main') {
                executeMainPillarHopping(targetNode, timeX);
            } else {
                executeSvgHopping(targetNode, timeX);
            }
        }, 200);

    } else {
        // Horizontal leftward hop onto target
        await hopStep(hopper, sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, 750);

        let targetTooltip = activeZuoGongTooltips.get(targetNode.elem) || spawnZuoGongTooltip(targetNode.elem, ourStemChar);
        addScoreToTooltip(targetTooltip, hopperScore);

        await fadeOutAndRemove(hopper);
        onHopperFinished();

        // Target word is hit -> now hops left to find its 偏財!
        setTimeout(() => {
            if (targetNode.realm === 'main') {
                executeMainPillarHopping(targetNode, timeX);
            } else {
                executeSvgHopping(targetNode, timeX);
            }
        }, 200);
    }
}

/**
 * Checks and hits any invisible SVG stem directly above a given X coordinate
 */
function checkAndHitSvgStemAbove(xCoord, targetPianCai, hopperScore, timeX) {
    if (!targetPianCai) return;
    const allNodes = getAllStemNodes();
    const svgTargets = allNodes.filter(n => n.realm === 'svg' && Math.abs(n.x - xCoord) <= 40 && n.char === targetPianCai);

    svgTargets.forEach(svgNode => {
        let svgTooltip = activeZuoGongTooltips.get(svgNode.elem) || spawnZuoGongTooltip(svgNode.elem, targetPianCai);
        addScoreToTooltip(svgTooltip, hopperScore);

        // Hit invisible stem immediately starts hopping in the SVG realm!
        setTimeout(() => {
            executeSvgHopping(svgNode, timeX);
        }, 200);
    });
}

/**
 * Dramatic Knockout & High Bounce-Away Animation:
 * Strikes an invisible barrier with a red shockwave flash and shudder, then tumbles high
 * into the air (-100px apex) and spins backwards before crashing and fading out.
 */
async function bounceAwayAndFade(element, fromX, fromY, targetX, targetY) {
    const dx = fromX - targetX;
    const dy = fromY - targetY;

    element.style.left = `${targetX}px`;
    element.style.top = `${targetY}px`;

    // 1. Sudden approach to impact point
    const approachAnim = element.animate([
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(1)`, offset: 0 },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2}px, -10px) scale(1.1)`, offset: 1 }
    ], {
        duration: 200,
        easing: 'ease-in'
    });
    await approachAnim.finished;

    // 2. Dramatic impact flash & shudder
    element.style.borderColor = '#ff4d4f';
    element.style.boxShadow = '0 0 35px rgba(255, 77, 79, 0.95)';
    const numEl = element.querySelector('.zuogong-num');
    if (numEl) numEl.style.color = '#ff4d4f';

    const impactShake = element.animate([
        { transform: `translate(-50%, -50%) translate(${dx * 0.2 - 8}px, -14px) scale(1.18)` },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2 + 8}px, -6px) scale(1.14)` },
        { transform: `translate(-50%, -50%) translate(${dx * 0.2}px, -10px) scale(1.1)` }
    ], {
        duration: 130,
        easing: 'linear'
    });
    await impactShake.finished;

    // 3. High dramatic knockout arc backward!
    // Catapults high into the air (-100px) and tumbles 140 degrees backward
    const recoilAnim = element.animate([
        {
            transform: `translate(-50%, -50%) translate(${dx * 0.2}px, -10px) rotate(0deg) scale(1.1)`,
            opacity: 1,
            offset: 0
        },
        {
            // High jump apex!
            transform: `translate(-50%, -50%) translate(${dx * 0.2 + 50}px, -100px) rotate(45deg) scale(1.05)`,
            opacity: 0.95,
            offset: 0.45
        },
        {
            // Falling and tumbling down
            transform: `translate(-50%, -50%) translate(${dx * 0.2 + 95}px, -20px) rotate(90deg) scale(0.85)`,
            opacity: 0.7,
            offset: 0.75
        },
        {
            // Crash down and fade out
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
 * Main Stem hopping traversal:
 * Steps via in-between midpoint first!
 * Checks for stronger 七殺 collision (bounces away and ends journey if 七殺 score > hopper score).
 */
async function executeMainPillarHopping(startNode, timeX) {
    activeHoppersCount++;
    const allStems = Array.from(document.querySelectorAll('.main-pillar-stem'));
    allStems.sort((a, b) => parseInt(a.getAttribute('data-col') || 0, 10) - parseInt(b.getAttribute('data-col') || 0, 10));

    const allNodes = getAllStemNodes();
    const hopperScore = getZuoGongScore(startNode.elem, startNode.char);
    const startCol = parseInt(startNode.elem.getAttribute('data-col'), 10);
    const targetPianCai = zuoGongPianCaiDict[startNode.char];
    const myQiShaChar = (typeof qiShaDict !== 'undefined') ? qiShaDict[startNode.char] : null;

    // Check directly above the starting pillar
    checkAndHitSvgStemAbove(startNode.x, targetPianCai, hopperScore, timeX);

    const hopper = createHopperElement(startNode.char, hopperScore, startNode.x, startNode.y, true);
    document.body.appendChild(hopper);

    let currentCol = startCol;

    while (currentCol > 0) {
        const nextCol = currentCol - 1;
        const currentElem = allStems.find(s => parseInt(s.getAttribute('data-col'), 10) === currentCol);
        const nextElem = allStems.find(s => parseInt(s.getAttribute('data-col'), 10) === nextCol);
        if (!currentElem || !nextElem) break;

        const curPos = getElemCenter(currentElem);
        const nextPos = getElemCenter(nextElem);
        const midX = (curPos.x + nextPos.x) / 2;
        const midY = curPos.y;

        // --- CHECK IN-BETWEEN MIDPOINT FOR STRONGER 七殺 ---
        if (myQiShaChar) {
            const midSvgStem = allNodes.find(n => n.realm === 'svg' && Math.abs(n.x - midX) <= 30 && n.char === myQiShaChar);
            if (midSvgStem) {
                let qishaScore = getZuoGongScore(midSvgStem.elem, midSvgStem.char);
                if (activeZuoGongTooltips.has(midSvgStem.elem)) {
                    qishaScore = parseInt(activeZuoGongTooltips.get(midSvgStem.elem).dataset.score || qishaScore, 10);
                }

                if (qishaScore > hopperScore) {
                    // Reveal stronger 七殺 and dramatically bounce away!
                    spawnZuoGongTooltip(midSvgStem.elem, midSvgStem.char);
                    await bounceAwayAndFade(hopper, curPos.x, curPos.y, midX, midY);
                    onHopperFinished();
                    return; // End journey right here!
                }
            }
        }

        // 1. Half-Hop to In-Between Midpoint (~0.375s)
        await hopStep(hopper, curPos.x, curPos.y, midX, midY, 375);

        // Check if there is an invisible stem above at this midpoint (偏財)
        checkAndHitSvgStemAbove(midX, targetPianCai, hopperScore, timeX);

        // --- CHECK NEXT PILLAR FOR STRONGER 七殺 ---
        const nextStemChar = nextElem.textContent.trim();
        if (myQiShaChar && nextStemChar === myQiShaChar) {
            let qishaScore = getZuoGongScore(nextElem, nextStemChar);
            if (activeZuoGongTooltips.has(nextElem)) {
                qishaScore = parseInt(activeZuoGongTooltips.get(nextElem).dataset.score || qishaScore, 10);
            }

            if (qishaScore > hopperScore) {
                // Reveal stronger 七殺 and dramatically bounce away!
                spawnZuoGongTooltip(nextElem, nextStemChar);
                await bounceAwayAndFade(hopper, midX, midY, nextPos.x, nextPos.y);
                onHopperFinished();
                return; // End journey right here!
            }
        }

        // 2. Complete Hop to the Next Pillar (~0.375s)
        await hopStep(hopper, midX, midY, nextPos.x, nextPos.y, 375);
        currentCol = nextCol;

        // A. Check next main stem pillar (偏財)
        if (nextStemChar === targetPianCai) {
            let targetTooltip = activeZuoGongTooltips.get(nextElem) || spawnZuoGongTooltip(nextElem, targetPianCai);
            addScoreToTooltip(targetTooltip, hopperScore);

            const hitNode = allNodes.find(n => n.elem === nextElem);
            if (hitNode) {
                setTimeout(() => {
                    executeMainPillarHopping(hitNode, timeX);
                }, 200);
            }
        }

        // B. Also check any invisible SVG stems directly above this pillar!
        checkAndHitSvgStemAbove(nextPos.x, targetPianCai, hopperScore, timeX);
    }

    await fadeOutAndRemove(hopper);
    onHopperFinished();
}

/**
 * SVG Invisible Stem hopping traversal:
 * Stays at SVG altitude (never hops below!). Hops leftward to the time stem.
 */
async function executeSvgHopping(startNode, timeX) {
    activeHoppersCount++;
    const allNodes = getAllStemNodes();
    const hopperScore = getZuoGongScore(startNode.elem, startNode.char);
    const targetPianCai = zuoGongPianCaiDict[startNode.char];

    const hopper = createHopperElement(startNode.char, hopperScore, startNode.x, startNode.y, false);
    document.body.appendChild(hopper);

    let curX = startNode.x;
    const curY = startNode.y;

    // Hop leftward in ~98px increments until reaching the Time stem
    while (curX > timeX + 10) {
        const nextX = Math.max(timeX, curX - 98);

        // 0.75s bunny hop across the SVG realm
        await hopStep(hopper, curX, curY, nextX, curY, 750);
        curX = nextX;

        if (targetPianCai) {
            // 1. Affect any 偏財 in the SVG realm around this location
            const svgTarget = allNodes.find(n => n.realm === 'svg' && n.elem !== startNode.elem && Math.abs(n.x - curX) <= 35);
            if (svgTarget && svgTarget.char === targetPianCai) {
                let tooltip = activeZuoGongTooltips.get(svgTarget.elem) || spawnZuoGongTooltip(svgTarget.elem, targetPianCai);
                addScoreToTooltip(tooltip, hopperScore);

                setTimeout(() => {
                    executeSvgHopping(svgTarget, timeX);
                }, 200);
            }

            // 2. Affect any 偏財 in the Main Stem realm directly below this location
            const mainTarget = allNodes.find(n => n.realm === 'main' && Math.abs(n.x - curX) <= 45);
            if (mainTarget && mainTarget.char === targetPianCai) {
                let tooltip = activeZuoGongTooltips.get(mainTarget.elem) || spawnZuoGongTooltip(mainTarget.elem, targetPianCai);
                addScoreToTooltip(tooltip, hopperScore);

                setTimeout(() => {
                    executeMainPillarHopping(mainTarget, timeX);
                }, 200);
            }
        }
    }

    await fadeOutAndRemove(hopper);
    onHopperFinished();
}

/**
 * Creates a floating hopper card
 */
function createHopperElement(char, score, x, y, isLarge) {
    const hopper = document.createElement('div');
    hopper.className = `zuogong-tooltip ${isLarge ? 'large' : 'small'} zuogong-hopper`;
    hopper.style.zIndex = "1500";
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
 * Performs a parabolic bunny hop from (fromX, fromY) to (toX, toY)
 */
async function hopStep(element, fromX, fromY, toX, toY, duration) {
    const deltaX = fromX - toX;
    const deltaY = fromY - toY;

    element.style.left = `${toX}px`;
    element.style.top = `${toY}px`;

    const anim = element.animate([
        { transform: `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px) scale(1)`, offset: 0 },
        { transform: `translate(-50%, -50%) translate(${deltaX * 0.5}px, ${deltaY * 0.5 - 35}px) scale(1.08)`, offset: 0.5 },
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
    ], { duration: 350, fill: 'forwards' });
    await fade.finished;
    element.remove();
}

/**
 * Handles completion of in-flight hoppers.
 * Once all hoppers finish, pauses 1.5s then fades out all cards and resets scores.
 */
function onHopperFinished() {
    activeHoppersCount = Math.max(0, activeHoppersCount - 1);

    if (activeHoppersCount === 0) {
        if (resolutionTimeout) clearTimeout(resolutionTimeout);

        // Pause 1.5s after everything resolves so the final values can be inspected
        resolutionTimeout = setTimeout(async () => {
            if (activeHoppersCount > 0) return;

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
        }, 1500);
    }
} 