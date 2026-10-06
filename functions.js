let selectedYuanyun = null;
let selectedDayun = null;   
let selectedLiunian = null; 
let selectedLiuyue = null;
let selectedLiuri = null;
let selectedLiushi = null;
let minggongBarVisible  = false;
let yuanyunBarVisible = false;
let dayunBarVisible = false; 
let liunianBarVisible = false;
let liuyueBarVisible = false;
let liuriBarVisible = false;
let liushiBarVisible = false;
let isSplitMode = true; 

// Function to handle the expanding/collapsing
function toggleRelContainer(event, el) {
    // If it is currently expanded, only collapse if the click target is exactly the border/padding
    // This prevents collapsing when the user accidentally clicks on the SVG lines or text.
    if (!el.classList.contains('collapsed')) {
        if (event.target !== el) return;
    }
    
    el.classList.toggle('collapsed');
    relContainerStates[el.id] = el.classList.contains('collapsed');
} 

function getElement(char) {
    if (char === "水" || 水.includes(char)) return "水";
    if (char === "火" || 火.includes(char)) return "火";
    if (char === "金" || 金.includes(char)) return "金";
    if (char === "木" || 木.includes(char)) return "木";
    if (char === "土" || 土.includes(char)) return "土";
    return "";
}

function getElementColor(char) {
    const dark = isDarkMode();
    if (char === "水" || 水.includes(char)) return dark ? "#66b2ff" : "blue";
    if (char === "火" || 火.includes(char)) return dark ? "#ff6b6b" : "red";
    if (char === "金" || 金.includes(char)) return dark ? "#ffd700" : "#d4af37";
    if (char === "木" || 木.includes(char)) return dark ? "#5cdb95" : "green";
    if (char === "土" || 土.includes(char)) return dark ? "#cd853f" : "brown";
    return dark ? "#e0e0e0" : "#222";
}

function getRelColor(color) {
    const dark = isDarkMode();
    if (!dark) {
        if (color === "darkorange") return "#d35400";
        return color;
    }
    if (color === "orange") return "#ffaa33";
    if (color === "darkorange") return "#ff7700";
    if (color === "purple") return "#c77dff";
    if (color === "red") return "#ff6b6b";
    if (color === "brown") return "#cd853f";
    if (color === "blue") return "#66b2ff";
    if (color === "green") return "#5cdb95";
    if (color === "#d4af37") return "#ffd700";
    return color;
}

function formatColoredLabel(label, defaultColor) {
    let result = '';
    for (const char of label) {
        const el = getElement(char);
        if (el) {
            const color = getElementColor(char);
            result += `<tspan fill="${color}">${char}</tspan>`;
        } else {
            result += `<tspan fill="${defaultColor}">${char}</tspan>`;
        }
    }
    return result;
}

function getBgColor(char) {
    const dark = isDarkMode();
    if (陰.includes(char)) return dark ? "#3a3a3a" : "#d5d5d5";
    return dark ? "#242424" : "#ffffff";
}

function calculateTenGod(targetChar, dayMasterChar) {
    const targetEl = getElement(targetChar);
    const dayMasterEl = getElement(dayMasterChar);
    if (!targetEl || !dayMasterEl) return ""; 

    const targetElIdx = five_elements.indexOf(targetEl);
    const relType = relations[dayMasterEl][targetElIdx];

    const sameGender = (陽.includes(targetChar) === 陽.includes(dayMasterChar));

    if (relType === "同我者") {
        return sameGender ? "比肩" : "劫財";
    } else if (relType === "我生者") {
        return sameGender ? "食神" : "傷官";
    } else if (relType === "我剋者") {
        return sameGender ? "偏財" : "正財";
    } else if (relType === "剋我者") {
        return sameGender ? "七殺" : "正官";
    } else if (relType === "生我者") {
        return sameGender ? "偏印" : "正印";
    }
    return "";
}

function formatHiddenStemLine(stemChar, dayMasterChar) {
    const god = calculateTenGod(stemChar, dayMasterChar);
    const col = getElementColor(stemChar);
    return `<div class="hidden-stem-line"><span class="stem-char" style="color:${col}">${stemChar}</span><span class="god-text">${god}</span></div>`;
}

function findStemRelationships(stems) {
    const results = [];
    const N = stems.length;

    for (const [elem, pair] of Object.entries(tenkan_relationships["合"])) {
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const s1 = stems[i];
                const s2 = stems[j];
                if ((s1 === pair[0] && s2 === pair[1]) || (s1 === pair[1] && s2 === pair[0])) {
                    results.push({
                        label: `${pair[0]}${pair[1]}合`,
                        color: getElementColor(elem),
                        indices: [i, j],
                        active: [true, true],
                        markerType: 'circle'
                    });
                }
            }
        }
    }

    for (const [key, pair] of Object.entries(tenkan_relationships["沖"])) {
        const targetStem = pair[0];
        const clasherStem = pair[1];

        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const s1 = stems[i];
                const s2 = stems[j];

                if (s1 === targetStem && s2 === clasherStem) {
                    results.push({
                        label: `${clasherStem}沖${targetStem}`,
                        color: "orange",
                        indices: [i, j],
                        active: [true, false],
                        markerType: 'arrow'
                    });
                } else if (s1 === clasherStem && s2 === targetStem) {
                    results.push({
                        label: `${clasherStem}沖${targetStem}`,
                        color: "orange",
                        indices: [i, j],
                        active: [false, true],
                        markerType: 'arrow'
                    }); 
                }
            }
        }
    }

    return results;
}

function renderStemRelationships(stems) {
    const container = document.getElementById('stemRelContainer');
    if (!container) return;

    const rels = findStemRelationships(stems);

    if (rels.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'block';

    const N = stems.length;
    const xCoords = Array.from({length: N}, (_, i) => 45 + i * 98);
    const viewBoxWidth = N * 90 + (N - 1) * 8;
    const layerHeight = 40;
    const totalHeight = rels.length * layerHeight + 8;

    let svgHtml = `<svg width="100%" height="${totalHeight}" viewBox="0 0 ${viewBoxWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">`;

    rels.forEach((rel, k) => {
        const yTop = k * layerHeight + 6;
        const yText = yTop + 13;
        const yBar = yTop + 18;
        const yBottom = yTop + 34;

        const sortedIndices = [...rel.indices].sort((a, b) => a - b);
        const minX = xCoords[sortedIndices[0]];
        const maxX = xCoords[sortedIndices[sortedIndices.length - 1]];

        let strokeColor = getRelColor(rel.color);

        svgHtml += `<line x1="${minX}" y1="${yBar}" x2="${maxX}" y2="${yBar}" stroke="${strokeColor}" stroke-width="2" />`;

        rel.indices.forEach((idx, arrIdx) => {
            const x = xCoords[idx];
            const isActive = rel.active[arrIdx];

            if (isActive) {
                if (rel.markerType === 'circle') {
                    const r = 3.5;
                    svgHtml += `<line x1="${x}" y1="${yBar}" x2="${x}" y2="${yBottom - r}" stroke="${strokeColor}" stroke-width="2" />`;
                    svgHtml += `<circle cx="${x}" cy="${yBottom - r}" r="${r}" fill="${strokeColor}" />`;
                } else {
                    svgHtml += `<line x1="${x}" y1="${yBar}" x2="${x}" y2="${yBottom - 5}" stroke="${strokeColor}" stroke-width="2" />`;
                    svgHtml += `<polygon points="${x - 4},${yBottom - 5} ${x},${yBottom} ${x + 4},${yBottom - 5}" fill="${strokeColor}" />`;
                }
            } else {
                svgHtml += `<line x1="${x}" y1="${yBar}" x2="${x}" y2="${yBottom}" stroke="${strokeColor}" stroke-width="2" />`;
            }
        });

        const textX = (minX + maxX) / 2;
        const coloredText = formatColoredLabel(rel.label, strokeColor);
        svgHtml += `<text x="${textX}" y="${yText}" font-size="14" font-weight="700" text-anchor="middle">${coloredText}</text>`;
    });

    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;
}

function findBranchRelationships(branches) {
    const results = []; 
    const N = branches.length;

    const categories = [
        { name: "會", dict: 三會 },
        { name: "合", dict: 三合 }
    ];

    for (const cat of categories) {
        for (const [elem, targetChars] of Object.entries(cat.dict)) {
            const foundTriplets = [];
            for (let i = 0; i < N; i++) {
                for (let j = i + 1; j < N; j++) {
                    for (let k = j + 1; k < N; k++) {
                        const set = new Set([branches[i], branches[j], branches[k]]);
                        if (targetChars.every(c => set.has(c))) {
                            foundTriplets.push([i, j, k]);
                        }
                    }
                }
            }

            if (foundTriplets.length > 0) {
                for (const triplet of foundTriplets) {
                    results.push({
                        label: `三${cat.name}${elem}局`,
                        color: getElementColor(elem),
                        indices: triplet,
                        active: [true, true, true],
                        markerType: 'circle'
                    });
                }
            } else {
                for (let i = 0; i < N; i++) {
                    for (let j = i + 1; j < N; j++) {
                        const b1 = branches[i];
                        const b2 = branches[j];
                        if (b1 !== b2 && targetChars.includes(b1) && targetChars.includes(b2)) {
                            results.push({
                                label: `半${cat.name}${elem}局`,
                                color: getElementColor(elem),
                                indices: [i, j],
                                active: [true, true],
                                markerType: 'circle'
                            });
                        }
                    }
                }
            }
        }
    }

    for (const [elem, pair] of Object.entries(six_rel["合"])) {
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const b1 = branches[i];
                const b2 = branches[j];
                if ((b1 === pair[0] && b2 === pair[1]) || (b1 === pair[1] && b2 === pair[0])) {
                    const isFireEarth = (elem === "火土");
                    results.push({
                        label: `${pair[0]}${pair[1]}化${elem}`,
                        color: isFireEarth ? "fireEarth" : getElementColor(elem),
                        isFireEarth: isFireEarth,
                        indices: [i, j],
                        active: [true, true],
                        markerType: 'circle'
                    });
                }
            }
        }
    }

    for (const [key, pair] of Object.entries(six_rel["沖"])) {
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const b1 = branches[i];
                const b2 = branches[j];
                if ((b1 === pair[0] && b2 === pair[1]) || (b1 === pair[1] && b2 === pair[0])) {
                    results.push({
                        label: `${pair[0]}${pair[1]}相沖`,
                        color: "darkorange",
                        indices: [i, j],
                        active: [true, true],
                        markerType: 'arrow'
                    });
                }
            }
        }
    }

    for (const [name, targetChars] of Object.entries(三刑)) {
        const foundTriplets = [];
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                for (let k = j + 1; k < N; k++) {
                    const set = new Set([branches[i], branches[j], branches[k]]);
                    if (targetChars.every(c => set.has(c))) {
                        foundTriplets.push([i, j, k]);
                    }
                }
            }
        }

        if (foundTriplets.length > 0) {
            for (const triplet of foundTriplets) {
                results.push({
                    label: `${name}(三刑)`,
                    color: "purple",
                    indices: triplet,
                    active: [true, true, true],
                    markerType: 'arrow'
                });
            }
        } else {
            for (let i = 0; i < N; i++) {
                for (let j = i + 1; j < N; j++) {
                    const b1 = branches[i];
                    const b2 = branches[j];
                    if (b1 !== b2 && targetChars.includes(b1) && targetChars.includes(b2)) {
                        let act1 = false;
                        let act2 = false;
                        if (punishMap[b1] === b2) {
                            act2 = true;
                        } else if (punishMap[b2] === b1) {
                            act1 = true;
                        } else {
                            act1 = true;
                            act2 = true;
                        }
                        results.push({
                            label: name,
                            color: "purple",
                            indices: [i, j],
                            active: [act1, act2],
                            markerType: 'arrow'
                        });
                    }
                }
            }
        }
    }

    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const b1 = branches[i];
            const b2 = branches[j];
            if ((b1 === "子" && b2 === "卯") || (b1 === "卯" && b2 === "子")) {
                results.push({
                    label: "無禮之刑",
                    color: "purple",
                    indices: [i, j],
                    active: [true, true],
                    markerType: 'arrow'
                });
            }
        }
    }

    for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
            const b1 = branches[i];
            const b2 = branches[j];
            if (b1 === b2 && 自刑.includes(b1)) {
                results.push({
                    label: `${b1}${b2}自刑`,
                    color: "purple",
                    indices: [i, j],
                    active: [true, true],
                    markerType: 'arrow'
                });
            }
        }
    }

    return results;
}

function renderRelationships(branches) {
    const container = document.getElementById('relContainer');
    if (!container) return;

    const rels = findBranchRelationships(branches);

    if (rels.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'block';

    const N = branches.length;
    const xCoords = Array.from({length: N}, (_, i) => 45 + i * 98);
    const viewBoxWidth = N * 90 + (N - 1) * 8;
    const layerHeight = 40;
    const totalHeight = rels.length * layerHeight + 8;

    let svgHtml = `<svg width="100%" height="${totalHeight}" viewBox="0 0 ${viewBoxWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">`;

    rels.forEach((rel, k) => {
        const yTop = k * layerHeight + 6;
        const yBar = yTop + 12;
        const yText = yBar + 16;

        const sortedIndices = [...rel.indices].sort((a, b) => a - b);
        const minX = xCoords[sortedIndices[0]];
        const maxX = xCoords[sortedIndices[sortedIndices.length - 1]];

        let strokeColor = getRelColor(rel.color);
        let textFillColor = getRelColor(rel.color);

        if (rel.isFireEarth) {
            const gradId = `fireEarthGrad_${k}`;
            const textGradId = `fireEarthTextGrad_${k}`;
            const cRed = getRelColor("red");
            const cBrown = getRelColor("brown");

            svgHtml += `
                <defs>
                    <linearGradient id="${gradId}" x1="${minX}" y1="0" x2="${maxX}" y2="0" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stop-color="${cRed}" />
                        <stop offset="50%" stop-color="${cRed}" />
                        <stop offset="50%" stop-color="${cBrown}" />
                        <stop offset="100%" stop-color="${cBrown}" />
                    </linearGradient>
                    <linearGradient id="${textGradId}" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stop-color="${cRed}" />
                        <stop offset="50%" stop-color="${cRed}" />
                        <stop offset="50%" stop-color="${cBrown}" />
                        <stop offset="100%" stop-color="${cBrown}" />
                    </linearGradient>
                </defs>
            `;
            strokeColor = `url(#${gradId})`;
            textFillColor = `url(#${textGradId})`;
        }

        svgHtml += `<line x1="${minX}" y1="${yBar}" x2="${maxX}" y2="${yBar}" stroke="${strokeColor}" stroke-width="2" />`;

        rel.indices.forEach((idx, arrIdx) => {
            const x = xCoords[idx];
            const isActive = rel.active[arrIdx];

            let itemColor = strokeColor;
            if (rel.isFireEarth) {
                itemColor = (idx === sortedIndices[0]) ? getRelColor("red") : getRelColor("brown");
            }

            if (isActive) {
                if (rel.markerType === 'circle') {
                    const r = 3.5;
                    svgHtml += `<line x1="${x}" y1="${yBar}" x2="${x}" y2="${yTop + r}" stroke="${itemColor}" stroke-width="2" />`;
                    svgHtml += `<circle cx="${x}" cy="${yTop + r}" r="${r}" fill="${itemColor}" />`;
                } else {
                    svgHtml += `<line x1="${x}" y1="${yBar}" x2="${x}" y2="${yTop + 5}" stroke="${itemColor}" stroke-width="2" />`;
                    svgHtml += `<polygon points="${x - 4},${yTop + 5} ${x},${yTop} ${x + 4},${yTop + 5}" fill="${itemColor}" />`;
                }
            } else {
                svgHtml += `<line x1="${x}" y1="${yBar}" x2="${x}" y2="${yTop}" stroke="${itemColor}" stroke-width="2" />`;
            }
        });

        const textX = (minX + maxX) / 2;
        const coloredText = formatColoredLabel(rel.label, textFillColor);
        svgHtml += `<text x="${textX}" y="${yText}" font-size="14" font-weight="700" text-anchor="middle">${coloredText}</text>`;
    });

    svgHtml += `</svg>`;
    container.innerHTML = svgHtml;
}

function removeYuanyun() {
    selectedYuanyun = null;
    renderGrid(); 
    renderYuanyunBar();
}

function selectYuanyun(yearStr) {
    if (selectedYuanyun && selectedYuanyun.year === yearStr) {
        selectedYuanyun = null;
    } else {
        const item = yuanYunOptions.find(opt => opt.year === yearStr);
        if (item) {
            selectedYuanyun = { year: item.year, stem: item.stem, branch: item.branch };
        }
    }
    renderGrid();
    renderYuanyunBar();
}

function removeDayun() {
    selectedDayun = null;
    selectedLiunian = null;
    selectedLiuyue = null;
    selectedLiuri = null;
    selectedLiushi = null;
    liunianBarVisible = false;
    liuyueBarVisible = false;
    liuriBarVisible = false;
    liushiBarVisible = false;
    document.getElementById('liunianBtn').style.display = 'none';
    document.getElementById('liuyueBtn').style.display = 'none';
    document.getElementById('liuriBtn').style.display = 'none';
    document.getElementById('liushiBtn').style.display = 'none';
    renderGrid();
    renderDayunBar();
    renderLiunianBar();
    renderLiuyueBar();
    renderLiuriBar();
    renderLiushiBar();
}

function removeLiunian() {
    selectedLiunian = null;
    selectedLiuyue = null;
    selectedLiuri = null;
    selectedLiushi = null;
    liuyueBarVisible = false;
    liuriBarVisible = false;
    liushiBarVisible = false;
    document.getElementById('liuyueBtn').style.display = 'none';
    document.getElementById('liuriBtn').style.display = 'none';
    document.getElementById('liushiBtn').style.display = 'none';
    renderGrid();
    renderLiunianBar();
    renderLiuyueBar();
    renderLiuriBar();
    renderLiushiBar();
}

function removeLiuyue() {
    selectedLiuyue = null;
    selectedLiuri = null;
    selectedLiushi = null;
    liuriBarVisible = false;
    liushiBarVisible = false;
    document.getElementById('liuriBtn').style.display = 'none';
    document.getElementById('liushiBtn').style.display = 'none';
    renderGrid();
    renderLiuyueBar();
    renderLiuriBar();
    renderLiushiBar();
}

function removeLiuri() {
    selectedLiuri = null;
    selectedLiushi = null;
    liushiBarVisible = false;
    document.getElementById('liushiBtn').style.display = 'none';
    renderGrid();
    renderLiuriBar();
    renderLiushiBar();
}

function removeLiushi() {
    selectedLiushi = null;
    renderGrid();
    renderLiushiBar();
}

function selectDayun(index) {
    const liunianBtn = document.getElementById('liunianBtn');
    const liuyueBtn = document.getElementById('liuyueBtn');
    const liuriBtn = document.getElementById('liuriBtn');
    const liushiBtn = document.getElementById('liushiBtn');

    if (selectedDayun && selectedDayun.index === index) {
        selectedDayun = null;
        selectedLiunian = null;
        selectedLiuyue = null;
        selectedLiuri = null;
        selectedLiushi = null;
        liunianBarVisible = false;
        liuyueBarVisible = false;
        liuriBarVisible = false;
        liushiBarVisible = false;
        liunianBtn.style.display = 'none';
        liuyueBtn.style.display = 'none';
        liuriBtn.style.display = 'none';
        liushiBtn.style.display = 'none';
    } else if (currentBaziData && currentBaziData.bigList[index]) {
        const item = currentBaziData.bigList[index];
        selectedDayun = { stem: item.stem, branch: item.branch, index: index };
        selectedLiunian = null;
        selectedLiuyue = null;
        selectedLiuri = null;
        selectedLiushi = null;
        liunianBarVisible = true;
        liuyueBarVisible = false;
        liuriBarVisible = false;
        liushiBarVisible = false;
        liunianBtn.style.display = 'inline-block';
        liuyueBtn.style.display = 'none';
        liuriBtn.style.display = 'none';
        liushiBtn.style.display = 'none';
    }
    renderGrid();
    renderDayunBar();
    renderLiunianBar();
    renderLiuyueBar();
    renderLiuriBar();
    renderLiushiBar();
}

function getLiunianList(dayunIdx) {
    if (!currentBaziData || !currentBaziData.big_start_time) return [];
    const times = currentBaziData.big_start_time;
    if (!times[dayunIdx]) return [];

    var p = new paipan();
    p.zwz = false;
    var sex = parseInt(document.getElementById('sexSelect').value, 10);

    const tStart = times[dayunIdx];
    let curYear = tStart[0];
    const startAns = p.GetInfo(sex, curYear, 6, 1, 12, 0, 0);
    if (!startAns || !startAns.bazi) return [];

    let curStem = startAns.bazi[0];
    let curBranch = startAns.bazi[1];

    let endStem = null, endBranch = null;
    if (dayunIdx < times.length - 1 && times[dayunIdx + 1]) {
        const tEnd = times[dayunIdx + 1];
        const endAns = p.GetInfo(sex, tEnd[0], tEnd[1], tEnd[2], tEnd[3], 0, 0);
        if (endAns && endAns.bazi) {
            endStem = endAns.bazi[0];
            endBranch = endAns.bazi[1];
        }
    }

    const list = [];
    let sIdx = tenkan_order.indexOf(curStem);
    let bIdx = deizi_order.indexOf(curBranch);

    if (sIdx === -1 || bIdx === -1) return [];

    for (let i = 0; i < 15; i++) {
        const s = tenkan_order[(sIdx + i) % 10];
        const b = deizi_order[(bIdx + i) % 12];
        const y = curYear + i;

        list.push({ year: y, stem: s, branch: b });

        if (endStem && endBranch && s === endStem && b === endBranch) {
            break;
        }
        if (!endStem && i === 9) {
            break;
        }
    }
    return list;
}

function selectLiunian(index) {
    if (!selectedDayun) return;
    const liunianList = getLiunianList(selectedDayun.index);
    if (!liunianList[index]) return;

    const liuyueBtn = document.getElementById('liuyueBtn');
    const liuriBtn = document.getElementById('liuriBtn');
    const liushiBtn = document.getElementById('liushiBtn');

    if (selectedLiunian && selectedLiunian.index === index) {
        selectedLiunian = null;
        selectedLiuyue = null;
        selectedLiuri = null;
        selectedLiushi = null;
        liuyueBarVisible = false;
        liuriBarVisible = false;
        liushiBarVisible = false;
        liuyueBtn.style.display = 'none';
        liuriBtn.style.display = 'none';
        liushiBtn.style.display = 'none';
    } else {
        const item = liunianList[index];
        selectedLiunian = { stem: item.stem, branch: item.branch, index: index, year: item.year };
        selectedLiuyue = null;
        selectedLiuri = null;
        selectedLiushi = null;
        liuyueBarVisible = true;
        liuriBarVisible = false;
        liushiBarVisible = false;
        liuyueBtn.style.display = 'inline-block';
        liuriBtn.style.display = 'none';
        liushiBtn.style.display = 'none';
    }
    renderGrid();
    renderLiunianBar();
    renderLiuyueBar();
    renderLiuriBar();
    renderLiushiBar();
}

function getLiunianStartTime(dayunIdx, liunianIdx) {
    if (liunianIdx === 0) {
        if (currentBaziData && currentBaziData.big_start_time && currentBaziData.big_start_time[dayunIdx]) {
            return currentBaziData.big_start_time[dayunIdx];
        }
    }
    const liunianList = getLiunianList(dayunIdx);
    if (!liunianList[liunianIdx]) return null;
    const target = liunianList[liunianIdx];

    var p = new paipan();
    p.zwz = false;
    var sex = parseInt(document.getElementById('sexSelect').value, 10);

    let d = new Date(target.year, 1, 1, 0, 0, 0);
    for (let h = 0; h < 30 * 24; h++) {
        let y = d.getFullYear();
        let m = d.getMonth() + 1;
        let day = d.getDate();
        let hr = d.getHours();

        let ans = p.GetInfo(sex, y, m, day, hr, 0, 0);
        if (ans && ans.bazi && ans.bazi[0] === target.stem && ans.bazi[1] === target.branch) {
            return [y, m, day, hr];
        }
        d.setHours(d.getHours() + 1);
    }
    return [target.year, 2, 4, 0];
}

function getLiuyueList(dayunIdx, liunianIdx) {
    const startTime = getLiunianStartTime(dayunIdx, liunianIdx);
    if (!startTime) return [];

    var p = new paipan();
    p.zwz = false;
    var sex = parseInt(document.getElementById('sexSelect').value, 10);

    let curDate = new Date(startTime[0], startTime[1] - 1, startTime[2], startTime[3], 0, 0);

    let y = curDate.getFullYear();
    let m = curDate.getMonth() + 1;
    let day = curDate.getDate();
    let hr = curDate.getHours();

    let startAns = p.GetInfo(sex, y, m, day, hr, 0, 0);
    if (!startAns || !startAns.bazi) return [];

    const targetYearStem = startAns.bazi[0];
    let prevMonthStem = startAns.bazi[2];
    let prevMonthBranch = startAns.bazi[3];

    const list = [];

    function toOddHour(hour) {
        if (hour % 2 === 0) {
            return hour === 0 ? 23 : hour - 1;
        }
        return hour;
    }

    const initHour = toOddHour(hr);
    const initTimeStr = String(initHour).padStart(2, '0') + ':00';
    list.push({
        date: `${monthNames[m - 1]} ${day}.`,
        timeStr: initTimeStr,
        stem: prevMonthStem,
        branch: prevMonthBranch,
        startDate: [y, m, day, hr]
    });

    let safetyCounter = 0;
    while (safetyCounter < 20) {
        safetyCounter++;

        if (curDate.getDate() > 9) {
            curDate.setMonth(curDate.getMonth() + 1);
            curDate.setDate(2);
            curDate.setHours(0, 0, 0, 0);
        }

        let foundNextMonth = false;

        while (true) {
            let cy = curDate.getFullYear();
            let cm = curDate.getMonth() + 1;
            let cd = curDate.getDate();
            let ch = curDate.getHours();

            let ans = p.GetInfo(sex, cy, cm, cd, ch, 0, 0);
            if (!ans || !ans.bazi) {
                foundNextMonth = false;
                break;
            }

            if (ans.bazi[0] !== targetYearStem) {
                return list;
            }

            if (ans.bazi[2] !== prevMonthStem || ans.bazi[3] !== prevMonthBranch) {
                prevMonthStem = ans.bazi[2];
                prevMonthBranch = ans.bazi[3];

                const displayHour = toOddHour(ch);
                const displayDate = (ch === 0) ? `${monthNames[cm - 1]} ${cd - 1}.` : `${monthNames[cm - 1]} ${cd}.`;
                const changeTimeStr = String(displayHour).padStart(2, '0') + ':00';

                p.GetInfo(sex, cy, cm, cd, ch, 0, 0);

                list.push({
                    date: displayDate,
                    timeStr: changeTimeStr,
                    stem: prevMonthStem,
                    branch: prevMonthBranch,
                    startDate: [cy, cm, cd, ch]
                });
                foundNextMonth = true;
                break;
            }

            curDate.setHours(curDate.getHours() + 1);

            if (curDate.getDate() > 9) {
                curDate.setMonth(curDate.getMonth() + 1);
                curDate.setDate(2);
                curDate.setHours(0, 0, 0, 0);
            }
        }

        if (!foundNextMonth) break;
    }

    return list;
}

function selectLiuyue(index) {
    if (!selectedDayun || !selectedLiunian) return;
    const liuyueList = getLiuyueList(selectedDayun.index, selectedLiunian.index);
    if (!liuyueList[index]) return;

    const liuriBtn = document.getElementById('liuriBtn');
    const liushiBtn = document.getElementById('liushiBtn');

    if (selectedLiuyue && selectedLiuyue.index === index) {
        selectedLiuyue = null;
        selectedLiuri = null;
        selectedLiushi = null;
        liuriBarVisible = false;
        liushiBarVisible = false;
        liuriBtn.style.display = 'none';
        liushiBtn.style.display = 'none';
    } else {
        const item = liuyueList[index];
        selectedLiuyue = { stem: item.stem, branch: item.branch, index: index, date: item.date, timeStr: item.timeStr, startDate: item.startDate };
        selectedLiuri = null;
        selectedLiushi = null;
        liuriBarVisible = true;
        liushiBarVisible = false;
        liuriBtn.style.display = 'inline-block';
        liushiBtn.style.display = 'none';
    }
    renderGrid();
    renderLiuyueBar();
    renderLiuriBar();
    renderLiushiBar();
}

function getLiuriList(dayunIdx, liunianIdx, liuyueIdx) {
    const liuyueList = getLiuyueList(dayunIdx, liunianIdx);
    if (!liuyueList[liuyueIdx]) return [];

    const monthItem = liuyueList[liuyueIdx];
    let startT = monthItem.startDate;
    if (!startT) return [];

    var p = new paipan();
    p.zwz = false;
    var sex = parseInt(document.getElementById('sexSelect').value, 10);

    let curDate = new Date(startT[0], startT[1] - 1, startT[2], startT[3], 0, 0);

    const initialMonthStem = monthItem.stem;
    const initialMonthBranch = monthItem.branch;

    let prevDayStem = null;
    let prevDayBranch = null;

    const list = [];
    let lastHeaderMonth = null;
    let lastHeaderDay = null;

    let safetyHours = 0;
    while (safetyHours < 40 * 24) {
        safetyHours += 2;

        let y = curDate.getFullYear();
        let m = curDate.getMonth() + 1;
        let day = curDate.getDate();
        let hr = curDate.getHours();

        let ans = p.GetInfo(sex, y, m, day, hr, 0, 0);
        if (!ans || !ans.bazi) break;

        if (ans.bazi[2] !== initialMonthStem || ans.bazi[3] !== initialMonthBranch) {
            break;
        }

        let curDayStem = ans.bazi[4];
        let curDayBranch = ans.bazi[5];

        if (prevDayStem === null) {
            prevDayStem = curDayStem;
            prevDayBranch = curDayBranch;
            lastHeaderMonth = m;
            lastHeaderDay = day;

            let oddHr = (hr % 2 === 0) ? (hr === 0 ? 23 : hr - 1) : hr;
            let timeStr = String(oddHr).padStart(2, '0') + ':00';
            let dateStr = `${monthNames[m - 1]} ${getOrdinalDay(day)}`;

            list.push({
                date: dateStr,
                timeStr: timeStr,
                stem: curDayStem,
                branch: curDayBranch,
                startDate: [y, m, day, hr]
            });
        } else if (curDayStem !== prevDayStem || curDayBranch !== prevDayBranch) {
            prevDayStem = curDayStem;
            prevDayBranch = curDayBranch;

            let oddHr = (hr % 2 === 0) ? (hr === 0 ? 23 : hr - 1) : hr;
            let timeStr = String(oddHr).padStart(2, '0') + ':00';
            let dateStr = "";

            if (m !== lastHeaderMonth) {
                dateStr = `${monthNames[m - 1]} ${getOrdinalDay(day)}`;
                lastHeaderMonth = m;
                lastHeaderDay = day;
            } else if (day !== lastHeaderDay) {
                dateStr = `${getOrdinalDay(day)}`;
                lastHeaderDay = day;
            }

            list.push({
                date: dateStr,
                timeStr: timeStr,
                stem: curDayStem,
                branch: curDayBranch,
                startDate: [y, m, day, hr]
            });
        }

        curDate.setHours(curDate.getHours() + 2);
    }

    return list;
}

function selectLiuri(index) {
    if (!selectedDayun || !selectedLiunian || !selectedLiuyue) return;
    const liuriList = getLiuriList(selectedDayun.index, selectedLiunian.index, selectedLiuyue.index);
    if (!liuriList[index]) return;

    const liushiBtn = document.getElementById('liushiBtn');

    if (selectedLiuri && selectedLiuri.index === index) {
        selectedLiuri = null;
        selectedLiushi = null;
        liushiBarVisible = false;
        liushiBtn.style.display = 'none';
    } else {
        const item = liuriList[index];
        selectedLiuri = { stem: item.stem, branch: item.branch, index: index, date: item.date, timeStr: item.timeStr, startDate: item.startDate };
        selectedLiushi = null;
        liushiBarVisible = true;
        liushiBtn.style.display = 'inline-block';
    }
    renderGrid();
    renderLiuriBar();
    renderLiushiBar();
}

function getLiushiList(dayunIdx, liunianIdx, liuyueIdx, liuriIdx) {
    const liuriList = getLiuriList(dayunIdx, liunianIdx, liuyueIdx);
    if (!liuriList[liuriIdx]) return [];

    const dayItem = liuriList[liuriIdx];
    let startT = dayItem.startDate;
    if (!startT) return [];

    var p = new paipan();
    p.zwz = false;
    var sex = parseInt(document.getElementById('sexSelect').value, 10);

    let curDate = new Date(startT[0], startT[1] - 1, startT[2], startT[3], 0, 0);

    let startHr = curDate.getHours();
    if (startHr % 2 === 0) {
        let oddHr = (startHr === 0) ? 23 : startHr - 1;
        if (oddHr === 23) {
            curDate.setDate(curDate.getDate() - 1);
        }
        curDate.setHours(oddHr);
    }

    const targetDayStem = dayItem.stem;
    const targetDayBranch = dayItem.branch;

    const list = [];
    let prevDay = null;

    for (let i = 0; i < 12; i++) {
        let y = curDate.getFullYear();
        let m = curDate.getMonth() + 1;
        let day = curDate.getDate();
        let hr = curDate.getHours();

        let ans = p.GetInfo(sex, y, m, day, hr, 0, 0);
        if (!ans || !ans.bazi) break;

        if (ans.bazi[4] !== targetDayStem || ans.bazi[5] !== targetDayBranch) {
            if (i === 0) {
                curDate = new Date(startT[0], startT[1] - 1, startT[2], startT[3], 0, 0);
                y = curDate.getFullYear();
                m = curDate.getMonth() + 1;
                day = curDate.getDate();
                hr = curDate.getHours();
                ans = p.GetInfo(sex, y, m, day, hr, 0, 0);
                if (!ans || !ans.bazi || ans.bazi[4] !== targetDayStem || ans.bazi[5] !== targetDayBranch) {
                    break;
                }
            } else {
                break;
            }
        }

        let timeStem = ans.bazi[6];
        let timeBranch = ans.bazi[7];

        let timeStr = String(hr).padStart(2, '0') + ':00';
        let dateStr = "";

        if (prevDay !== null && day !== prevDay) {
            dateStr = `${monthNames[m - 1]} ${getOrdinalDay(day)}`;
        }
        prevDay = day;

        list.push({
            date: dateStr,
            timeStr: timeStr,
            stem: timeStem,
            branch: timeBranch,
            startDate: [y, m, day, hr]
        });

        curDate.setHours(curDate.getHours() + 2);
    }

    return list;
}

function selectLiushi(index) {
    if (!selectedDayun || !selectedLiunian || !selectedLiuyue || !selectedLiuri) return;
    const liushiList = getLiushiList(selectedDayun.index, selectedLiunian.index, selectedLiuyue.index, selectedLiuri.index);
    if (!liushiList[index]) return;

    if (selectedLiushi && selectedLiushi.index === index) {
        selectedLiushi = null;
    } else {
        const item = liushiList[index];
        selectedLiushi = { stem: item.stem, branch: item.branch, index: index, date: item.date, timeStr: item.timeStr };
    }
    renderGrid();
    renderLiushiBar();
}

function selectNow() {
    if (!currentBaziData || !currentBaziData.bigList || currentBaziData.bigList.length === 0) return;

    const now = new Date();

    dayunBarVisible = true;
    renderDayunBar();

    const times = currentBaziData.big_start_time || [];
    let dayunIdx = -1;
    for (let i = 0; i < times.length; i++) {
        const t = times[i];
        if (t && t.length >= 4) {
            const d = new Date(t[0], t[1] - 1, t[2], t[3]);
            if (now >= d) {
                dayunIdx = i;
            } else {
                break;
            }
        }
    }

    if (dayunIdx === -1) dayunIdx = 0;
    selectDayun(dayunIdx);

    const liunianList = getLiunianList(dayunIdx);
    let liunianIdx = -1;
    for (let j = 0; j < liunianList.length; j++) {
        const st = getLiunianStartTime(dayunIdx, j);
        if (st) {
            const d = new Date(st[0], st[1] - 1, st[2], st[3]);
            if (now >= d) {
                liunianIdx = j;
            } else {
                break;
            }
        }
    }

    if (liunianIdx === -1) liunianIdx = 0;
    selectLiunian(liunianIdx);

    const liuyueList = getLiuyueList(dayunIdx, liunianIdx);
    let liuyueIdx = -1;
    for (let k = 0; k < liuyueList.length; k++) {
        const st = liuyueList[k].startDate;
        if (st) {
            const d = new Date(st[0], st[1] - 1, st[2], st[3]);
            if (now >= d) {
                liuyueIdx = k;
            } else {
                break;
            }
        }
    }

    if (liuyueIdx === -1) liuyueIdx = 0;
    selectLiuyue(liuyueIdx);

    const liuriList = getLiuriList(dayunIdx, liunianIdx, liuyueIdx);
    let liuriIdx = -1;
    for (let l = 0; l < liuriList.length; l++) {
        const st = liuriList[l].startDate;
        if (st) {
            const d = new Date(st[0], st[1] - 1, st[2], st[3]);
            if (now >= d) {
                liuriIdx = l;
            } else {
                break;
            }
        }
    }

    if (liuriIdx === -1) liuriIdx = 0;
    selectLiuri(liuriIdx);

    const liushiList = getLiushiList(dayunIdx, liunianIdx, liuyueIdx, liuriIdx);
    let liushiIdx = -1;
    for (let m = 0; m < liushiList.length; m++) {
        const st = liushiList[m].startDate;
        if (st) {
            const d = new Date(st[0], st[1] - 1, st[2], st[3]);
            if (now >= d) {
                liushiIdx = m;
            } else {
                break;
            }
        }
    }

    if (liushiIdx === -1) liushiIdx = 0;
    selectLiushi(liushiIdx);
}

function getFilteredYuanYunOptions() {
    const yearSelect = document.getElementById('yearSelect');
    const yr = parseInt(yearSelect.value, 10);

    // Dynamically find the active 60-year cycle start year
    let activeCycleYear = -Infinity;
    yuanYunOptions.forEach(item => {
        const itemY = parseInt(item.year, 10);
        if (itemY <= yr && itemY > activeCycleYear) {
            activeCycleYear = itemY;
        }
    });

    // Fallback in case a year before 1564 is selected
    if (activeCycleYear === -Infinity) {
        activeCycleYear = parseInt(yuanYunOptions[0].year, 10);
    }

    // Return all options from the active cycle onwards
    return yuanYunOptions.filter(item => parseInt(item.year, 10) >= activeCycleYear);
} 