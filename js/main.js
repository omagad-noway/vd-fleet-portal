// 1. GLOBAL ACCESS BINDING
window.checkKey = checkKey;
window.requestEditAccess = requestEditAccess;
window.filterTable = filterTable;
window.deleteRecord = deleteRecord;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.exportToCSV = exportToCSV;
window.sortTable = sortTable;
window.closeMasterModal = closeMasterModal;
window.verifyMasterCode = verifyMasterCode;
window.applyFilters = applyFilters;
window.toggleWeekDetails = toggleWeekDetails;

// 2. CONFIGURATION
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyrS4Sg3GvLIsmZsuIK0KD-zWOhRy5c5wccIKVisn-Wg04GBYU11p6hKUYNaZsYW3_1/exec'; 
const VIEW_KEY = 'VD'; 
const MASTER_KEY = '1631216'; 
const ALLOWED_TRUCKS = ['108', '1589', '1590', '1592', '1593', '1594', '156'];

// 3. APP STATE
let userRole = 'driver'; 
let editModeActive = false;
let assignedTruck = '';
let currentData = []; 
let filteredData = []; 
let sortState = { column: 'DATE', direction: 'desc' };
let weekSortDirection = 'desc'; // Initial state: Newest to Oldest
let expandedWeeks = new Set(); // Remembers which weeks are toggled open

function showSync() { document.getElementById('sync-indicator').classList.remove('hidden'); }
function hideSync() { document.getElementById('sync-indicator').classList.add('hidden'); }

// 4. AUTH LOGIC
function checkKey(autoLoginKey = null) {
    const input = autoLoginKey || document.getElementById('access-key').value.trim();
    
    if (input.toUpperCase() === VIEW_KEY) {
        userRole = 'admin'; 
        if (document.getElementById('mode-toggle')) document.getElementById('mode-toggle').classList.remove('hidden'); 
        sessionStorage.setItem('vd_access_key', input); // Remembers login
        enterDashboard();
    } else if (ALLOWED_TRUCKS.includes(input)) {
        userRole = 'driver'; 
        assignedTruck = input; 
        sessionStorage.setItem('vd_access_key', input); // Remembers login
        enterDashboard();
    } else { 
        if (!autoLoginKey) alert('Invalid Access Key'); 
    }
}

async function enterDashboard() {
    if (document.getElementById('auth-screen')) document.getElementById('auth-screen').classList.add('hidden');
    if (document.getElementById('dashboard')) document.getElementById('dashboard').classList.remove('hidden');
    
    // 1. Fetch data from Google Sheets
    await loadData();
    
    // 2. Identify Current Time
    const now = new Date();
    const currentYear = now.getUTCFullYear().toString();
    const currentMonthName = now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

    // 3. Calculate Current Week Index (Matching your grouping logic)
    const dateNum = now.getUTCDate();
    const firstOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    let firstWeekday = firstOfMonth.getUTCDay();
    if (firstWeekday === 0) firstWeekday = 7;
    
    let weekIndex = Math.ceil((dateNum + firstWeekday - 1) / 7);
    if (firstWeekday >= 6 && weekIndex > 1) weekIndex -= 1;
    if (weekIndex > 5) weekIndex = 5;
    const currentWeekStr = `Week ${weekIndex}`;

    // 4. Set Selectors (Crucial Order: Set values BEFORE applyFilters)
    const truckSel = document.getElementById('truck-select');
    const weekSel = document.getElementById('week-select');
    const monthSel = document.getElementById('month-select');
    const yearSel = document.getElementById('year-select');

    if (truckSel && userRole === 'admin') truckSel.value = "ALL";
    if (yearSel) yearSel.value = currentYear;
    
    // THE FIX: Check if we are on the weeks page
    if (document.getElementById('week-select')) {
        if (monthSel) monthSel.value = "ALL";
        if (weekSel) weekSel.value = "ALL";
    } else {
        if (monthSel) monthSel.value = currentMonthName;
        if (weekSel) weekSel.value = currentWeekStr;
    }

    applyFilters();
    
    // 6. Start the 3-second background sync
    setInterval(() => {
        const editModal = document.getElementById('edit-modal');
        if (!editModal || editModal.classList.contains('hidden')) {
            loadData();
        }
    }, 3000);
}

async function loadData() {
    try {
        const response = await fetch(`${SCRIPT_URL}?t=${Date.now()}`); 
        const data = await response.json();
        
        // Determine role-based data
        currentData = (userRole === 'driver') ? data.filter(item => String(item["TRUCK"]) === assignedTruck) : data;
        
        populateYearFilter(); 
        populateTruckFilter(); // <--- This now uses your ALLOWED_TRUCKS constant
        applyFilters();       
    } catch (err) { console.error("Sync Error:", err); }
}

function populateYearFilter() {
    const yearSelect = document.getElementById('year-select');
    if (!yearSelect) return;
    const currentYear = new Date().getUTCFullYear().toString();
    const years = [...new Set(currentData.map(item => new Date(item.DATE).getUTCFullYear()))].sort((a, b) => b - a);
    let options = '<option value="ALL">All Years</option>';
    years.forEach(y => { 
        if(!isNaN(y)) {
            const isSelected = y.toString() === currentYear ? 'selected' : '';
            options += `<option value="${y}" ${isSelected}>${y}</option>`;
        }
    });
    yearSelect.innerHTML = options;
}

function applyFilters() {
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    const weekSelect = document.getElementById('week-select');
    const truckSelect = document.getElementById('truck-select');

    const selMonth = monthSelect ? monthSelect.value : "ALL";
    const selYear = yearSelect ? yearSelect.value : "ALL";
    const selWeek = weekSelect ? weekSelect.value : "ALL";
    const selTruck = truckSelect ? truckSelect.value : "ALL";

    const isWeeksPage = weekSelect !== null; 

    filteredData = currentData.filter(item => {
        const d = new Date(item.DATE);
        const itemTruck = item.TRUCK.toString();
        let truckMatch = (selTruck === "ALL" || itemTruck === selTruck);

        let monthMatch = false;
        let yearMatch = false;
        let weekMatch = true;

        if (isWeeksPage) {
            // --- CROSS-MONTH FILTER FIX ---
            const dayOfWeek = d.getUTCDay() || 7; 
            const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayOfWeek + 1));
            const weekEnd = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6));

            const startMonth = weekStart.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
            const endMonth = weekEnd.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
            const startYear = weekStart.getUTCFullYear().toString();
            const endYear = weekEnd.getUTCFullYear().toString();

            // Match if the selected month touches ANY part of this week
            monthMatch = (selMonth === "ALL" || selMonth === startMonth || selMonth === endMonth);
            yearMatch = (selYear === "ALL" || selYear === startYear || selYear === endYear);

            if (selWeek !== "ALL") {
                let anchorDate = weekStart;
                if (selMonth !== "ALL" && endMonth === selMonth) {
                    anchorDate = weekEnd; // Shift anchor to April if filtering by April
                }
                const dateNum = anchorDate.getUTCDate();
                const firstOfMonth = new Date(Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1));
                let firstWeekday = firstOfMonth.getUTCDay();
                if (firstWeekday === 0) firstWeekday = 7;
                
                let weekIndex = Math.ceil((dateNum + firstWeekday - 1) / 7);
                if (firstWeekday >= 6 && weekIndex > 1) weekIndex -= 1;
                if (weekIndex > 5) weekIndex = 5;

                weekMatch = (selWeek === `Week ${weekIndex}`);
            }
        } else {
            // Standard Dashboard Logic (Strict Literal Month)
            const itemMonth = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
            const itemYear = d.getUTCFullYear().toString();
            monthMatch = (selMonth === "ALL" || itemMonth === selMonth);
            yearMatch = (selYear === "ALL" || itemYear === selYear);
        }

        return monthMatch && yearMatch && weekMatch && truckMatch;
    });

    applySort();
}

function requestEditAccess() {
    if (editModeActive) {
        editModeActive = false;
        document.getElementById('management-tools').classList.add('hidden');
        document.getElementById('actions-header').classList.add('hidden');
        document.getElementById('mode-toggle').innerText = "🔒 ENTER EDIT MODE";
        document.getElementById('mode-toggle').classList.replace('bg-red-600', 'bg-slate-800');
        renderDashboard(filteredData);
        return;
    }
    document.getElementById('master-modal').classList.remove('hidden');
    document.getElementById('master-pass-input').value = '';
}

function verifyMasterCode() {
    if (document.getElementById('master-pass-input').value === MASTER_KEY) {
        editModeActive = true;
        document.getElementById('management-tools').classList.remove('hidden');
        document.getElementById('actions-header').classList.remove('hidden'); 
        document.getElementById('mode-toggle').innerText = "🔓 LOCK VIEW MODE";
        document.getElementById('mode-toggle').classList.replace('bg-slate-800', 'bg-red-600');
        closeMasterModal();
        renderDashboard(filteredData);
    } else { alert("Access Denied"); closeMasterModal(); }
}
function closeMasterModal() { document.getElementById('master-modal').classList.add('hidden'); }

function sortTable(column) {
    if (sortState.column === column) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.column = column;
        sortState.direction = (column === 'DATE') ? 'desc' : 'asc';
    }
    applySort();
}

function applySort() {
    filteredData.sort((a, b) => {
        const dateA = new Date(a.DATE).getTime();
        const dateB = new Date(b.DATE).getTime();
        if (dateA !== dateB) return sortState.direction === 'asc' ? dateA - dateB : dateB - dateA;
        return Number(a.TRUCK) - Number(b.TRUCK);
    });
    
    // --- ROUTER: Detects which page you are on ---
    if (document.getElementById('week-select')) {
        renderWeeksDashboard(filteredData);
    } else {
        renderDashboard(filteredData);
    }
}

function renderDashboard(data) {
    const tbody = document.getElementById('ledger-body');
    const truckContainer = document.getElementById('truck-stats');
    const actionHeader = document.getElementById('actions-header');

    if (!tbody) return;
    tbody.innerHTML = '';
    
    if(editModeActive) actionHeader.classList.remove('hidden');
    else actionHeader.classList.add('hidden');

    let tG = 0, tM = 0, tLM = 0, truckMap = {};

    data.forEach((item, index) => {
        const loaded = Number(item["LOADEDMILES"]) || 0;
        const empty = Number(item["DEADHEAD"]) || 0;
        const totalMiles = loaded + empty;
        const gross = Number(item["GROSS"]) || 0;
        
        const rawRptm = totalMiles > 0 ? (gross / totalMiles) : 0;
        const rptmNum = parseFloat(rawRptm.toFixed(2));
        const rawRpm = loaded > 0 ? (gross / loaded) : 0;
        const rpmNum = parseFloat(rawRpm.toFixed(2));

        tG += gross; tM += totalMiles; tLM += loaded;

        let typeColor = "bg-blue-100 text-blue-700"; 
        if (item.TYPE === 'PARTIAL') typeColor = "bg-green-100 text-green-700";
        else if (item.TYPE === 'TONU') typeColor = "bg-orange-100 text-orange-700";
        
        let rptmClass = "bg-red-100 text-red-700";
        if (rptmNum >= 3.00) rptmClass = "bg-green-500 text-white";
        else if (rptmNum >= 2.50) rptmClass = "bg-yellow-200 text-black";

        let actionsTd = editModeActive ? `<td class="p-4 flex gap-2 justify-center">
            <button onclick="openEditModal(${index})" class="hover:scale-125 transition-all text-lg mx-2">✏️</button>
            <button onclick="deleteRecord(${index})" class="hover:scale-125 transition-all text-lg">🗑️</button>
        </td>` : '';

        tbody.innerHTML += `<tr class="border-b bg-white text-black font-medium text-xs">
            <td class="p-4 text-xs">${new Date(item.DATE).toLocaleDateString('en-US', {timeZone: 'UTC'})}</td>
            <td class="p-4 font-bold text-blue-700">#${item.TRUCK}</td>
            <td class="p-4 text-center uppercase">${item.STATEORIGIN} ➔ ${item.STATEDESTINATION}</td>
            <td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-black ${typeColor}">${item.TYPE || 'FULL'}</span></td>
            <td class="p-4 text-right">${empty}</td>
            <td class="p-4 text-right">${loaded}</td>
            <td class="p-4 text-right font-black">$${gross.toLocaleString()}</td>
            <td class="p-4 text-right font-black text-blue-700 bg-blue-50">${rpmNum.toFixed(2)}</td>
            <td class="p-4 text-right font-black ${rptmClass}">${rptmNum.toFixed(2)}</td>
            ${actionsTd}
        </tr>`;

        if(!truckMap[item.TRUCK]) truckMap[item.TRUCK] = { weeks: {}, totalGross: 0, totalMiles: 0, totalLoaded: 0 };
        // --- NEW WEEK LOGIC START ---
        const d = new Date(item.DATE);
        const dateNum = d.getUTCDate();

        // 1. Find what day of the week the 1st of this month falls on
        const firstOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
        let firstWeekday = firstOfMonth.getUTCDay();
        if (firstWeekday === 0) firstWeekday = 7; // Convert standard Sunday (0) to 7 for Monday-start logic

        // 2. Calculate the calendar week index (Week 1 ends on the first Sunday)
        let weekIndex = Math.ceil((dateNum + firstWeekday - 1) / 7);

        // 3. Apply Spreadsheet Logic: If month starts on Sat (6) or Sun (7), 
        // do not count it as a standalone week. Merge it into the first full week.
        if (firstWeekday >= 6 && weekIndex > 1) {
            weekIndex -= 1;
        }

        // 4. Cap at Week 5 for the UI limit
        if (weekIndex > 5) weekIndex = 5;
        // --- NEW WEEK LOGIC END --- 
        if(!truckMap[item.TRUCK].weeks[weekIndex]) truckMap[item.TRUCK].weeks[weekIndex] = { gross: 0, totalMiles: 0, loadedMiles: 0 };
        
        truckMap[item.TRUCK].weeks[weekIndex].gross += gross;
        truckMap[item.TRUCK].weeks[weekIndex].totalMiles += totalMiles;
        truckMap[item.TRUCK].weeks[weekIndex].loadedMiles += loaded;
        
        // Track overall totals for the sidebar bottom row
        truckMap[item.TRUCK].totalGross += gross;
        truckMap[item.TRUCK].totalMiles += totalMiles;
        truckMap[item.TRUCK].totalLoaded += loaded;
    });

    if (truckContainer) {
        truckContainer.innerHTML = '';

        // --- SPLIT WEEK LOOKAHEAD LOGIC ---
        const selMonth = document.getElementById('month-select').value;
        const selYear = document.getElementById('year-select').value;
        let splitStart = null, splitEnd = null, lastWeekIndex = 5;

        if (selMonth !== "ALL" && selYear !== "ALL") {
            const mIdx = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(selMonth);
            // Get the very last day of the selected month
            const lastDayDate = new Date(Date.UTC(selYear, mIdx + 1, 0)); 
            let lastDayOfWeek = lastDayDate.getUTCDay();
            if (lastDayOfWeek === 0) lastDayOfWeek = 7; // Convert Sunday to 7

            // If the month ends mid-week (Mon-Sat), calculate the next month's days
            if (lastDayOfWeek < 7) {
                splitStart = new Date(lastDayDate.getTime() + 86400000); // +1 day
                splitEnd = new Date(lastDayDate.getTime() + ((7 - lastDayOfWeek) * 86400000));

                // Find out what week index this last day falls into based on our spreadsheet logic
                const dateNum = lastDayDate.getUTCDate();
                const firstOfMonth = new Date(Date.UTC(selYear, mIdx, 1));
                let firstWeekday = firstOfMonth.getUTCDay();
                if (firstWeekday === 0) firstWeekday = 7;
                lastWeekIndex = Math.ceil((dateNum + firstWeekday - 1) / 7);
                if (firstWeekday >= 6 && lastWeekIndex > 1) lastWeekIndex -= 1;
                if (lastWeekIndex > 5) lastWeekIndex = 5;
            }
        }
        // ----------------------------------

        let truckList = Object.keys(truckMap).map(id => {
            const t = truckMap[id];
            return { id, weeks: t.weeks, avgRptm: t.totalMiles > 0 ? t.totalGross/t.totalMiles : 0, totalGross: t.totalGross, totalMiles: t.totalMiles, totalLoaded: t.totalLoaded };
        });

        const bestPerformanceTruck = [...truckList].sort((a, b) => b.avgRptm - a.avgRptm)[0];
        const highestGrossTruck = [...truckList].sort((a, b) => b.totalGross - a.totalGross)[0];
        const goldId = bestPerformanceTruck?.id;
        const silverId = highestGrossTruck?.id;

        truckList.sort((a, b) => b.avgRptm - a.avgRptm);

        if (truckList.length > 1 && goldId !== silverId) {
            const sWinnerObj = truckList.find(t => t.id === silverId);
            if (sWinnerObj) {
                truckList = truckList.filter(t => t.id !== silverId);
                truckList.splice(1, 0, sWinnerObj);
            }
        }

        truckList.forEach((truck, idx) => {
            let weeklyHtml = '';
            for(let i=1; i<=5; i++) {
                if(truck.weeks[i]) {
                    const wData = truck.weeks[i];
                    const wRptm = wData.totalMiles > 0 ? (wData.gross / wData.totalMiles).toFixed(2) : "-";
                    const wRpm = wData.loadedMiles > 0 ? (wData.gross / wData.loadedMiles).toFixed(2) : "-";
                    
                    // --- FIX 1: Rounded weekly gross ---
                    weeklyHtml += `
                        <div class="grid grid-cols-[45px_55px_60px_50px] items-center text-[11.5px] py-1 border-t border-gray-100 whitespace-nowrap overflow-hidden">
                            <span class="font-bold text-gray-400 uppercase text-[9px]">Week ${i}</span>
                            <span class="text-blue-900 font-bold">$${Math.round(wData.gross).toLocaleString()}</span>
                            <div class="flex gap-1 items-center">
                                <span class="text-gray-400 text-[10px] uppercase font-bold">RPM:</span>
                                <span class="font-black text-slate-950">${wRpm}</span>
                            </div>
                            <div class="flex gap-1 items-center">
                                <span class="text-gray-400 text-[10px] uppercase font-bold">RPTM:</span>
                                <span class="font-black text-slate-950">${wRptm}</span>
                            </div>
                        </div>`;

                    // --- INJECT SECOND ROW FOR CROSS-MONTH DATA ---
                    if (i === lastWeekIndex && splitStart) {
                        let exGross = 0, exLoaded = 0, exTotal = 0;
                        
                        currentData.forEach(item => {
                            if (item.TRUCK.toString() === truck.id.toString()) {
                                const d = new Date(item.DATE);
                                if (d >= splitStart && d <= splitEnd) {
                                    exGross += (Number(item.GROSS) || 0);
                                    exLoaded += (Number(item.LOADEDMILES) || 0);
                                    exTotal += ((Number(item.LOADEDMILES) || 0) + (Number(item.DEADHEAD) || 0));
                                }
                            }
                        });

                        if (exTotal > 0 || exGross > 0) {
                            const cbGross = wData.gross + exGross;
                            const cbLoaded = wData.loadedMiles + exLoaded;
                            const cbTotal = wData.totalMiles + exTotal;
                            const cRpm = cbLoaded > 0 ? (cbGross / cbLoaded).toFixed(2) : "-";
                            const cRptm = cbTotal > 0 ? (cbGross / cbTotal).toFixed(2) : "-";

                            // --- FIX 2: Rounded cross-month gross ---
                            weeklyHtml += `
                                <div class="grid grid-cols-[45px_55px_60px_50px] items-center text-[9px] py-0.5 bg-gray-50/80 whitespace-nowrap overflow-hidden">
                                    <span class="italic text-gray-400 font-medium pl-1 text-[8.5px]">↳ Full </span>
                                    <span class="text-blue-700/80 font-bold">$${Math.round(cbGross).toLocaleString()}</span>
                                    <div class="flex gap-1 items-center text-gray-500/80">
                                        <span class="text-[8px] uppercase">RPM:</span>
                                        <span class="font-bold text-[9px]">${cRpm}</span>
                                    </div>
                                    <div class="flex gap-1 items-center text-gray-500/80">
                                        <span class="text-[8px] uppercase">RPTM:</span>
                                        <span class="font-bold text-[9px]">${cRptm}</span>
                                    </div>
                                </div>`;
                        }
                    }
                }
            }

            const totalRpm = truck.totalLoaded > 0 ? (truck.totalGross / truck.totalLoaded).toFixed(2) : "-";
            const totalRptm = truck.totalMiles > 0 ? (truck.totalGross / truck.totalMiles).toFixed(2) : "-";

            // --- FIX 3: Rounded total gross ---
            const totalsRowHtml = `
                <div class="grid grid-cols-[45px_55px_60px_50px] items-center text-[11.5px] py-1 border-t-2 border-blue-100 bg-blue-50/50 whitespace-nowrap overflow-hidden">
                    <span class="font-black text-blue-600 uppercase text-[9px]">TOTAL</span>
                    <span class="text-blue-900 font-black">$${Math.round(truck.totalGross).toLocaleString()}</span>
                    <div class="flex gap-1 items-center">
                        <span class="text-blue-400 text-[10px] uppercase font-bold">RPM:</span>
                        <span class="font-black text-blue-900">${totalRpm}</span>
                    </div>
                    <div class="flex gap-1 items-center">
                        <span class="text-blue-400 text-[10px] uppercase font-bold">RPTM:</span>
                        <span class="font-black text-blue-900">${totalRptm}</span>
                    </div>
                </div>`;

            let trophy = '';
            if (truck.id === goldId) trophy += '<span class="ml-1" title="Best Performance">🏆</span>';
            if (truck.id === silverId) trophy += '<span class="ml-1" title="Highest Revenue">🥈</span>';

            truckContainer.innerHTML += `
                <div class="bg-white rounded-lg px-2.5 py-3 mb-3 border border-gray-200 shadow-sm relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1 ${truck.avgRptm >= 3 ? 'bg-green-500' : 'bg-yellow-400'}"></div>
                    <p class="text-[13px] font-black uppercase mb-1.5 flex items-center tracking-tight">
                        UNIT #${truck.id} ${trophy}
                    </p>
                    <div class="flex flex-col">${weeklyHtml}${totalsRowHtml}</div>
                </div>`;
        });
    }

    document.getElementById('total-gross').innerText = `$${tG.toLocaleString()}`;
    if(document.getElementById('avg-rpm')) document.getElementById('avg-rpm').innerText = tLM > 0 ? (tG / tLM).toFixed(2) : "0.00";
    document.getElementById('avg-rptm').innerText = tM > 0 ? (tG / tM).toFixed(2) : "0.00"; 
    document.getElementById('load-count').innerText = data.length;
}

function exportToCSV() {
    let rows = document.querySelectorAll("table tr");
    let csv = Array.from(rows).map(row => Array.from(row.querySelectorAll("th, td")).map(td => `"${td.innerText.replace(/"/g, '""')}"`).join(",")).join("\n");
    let blob = new Blob([csv], { type: "text/csv" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Fleet_Log_${new Date().toLocaleDateString()}.csv`;
    link.click();
}

function filterTable() {
    const filter = document.getElementById("table-search").value.toLowerCase();
    const rows = document.getElementById("ledger-body").getElementsByTagName("tr");
    for (let i = 0; i < rows.length; i++) rows[i].style.display = rows[i].textContent.toLowerCase().includes(filter) ? "" : "none";
}

document.addEventListener('DOMContentLoaded', () => {
    const savedKey = sessionStorage.getItem('vd_access_key');
    if (savedKey) {
        checkKey(savedKey); // Auto-login if key is saved
    }

    document.getElementById('access-key')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') checkKey(); });
    document.getElementById('master-pass-input')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') verifyMasterCode(); });
    const form = document.getElementById('load-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const uiItem = {
                DATE: document.getElementById('date').value,
                TRUCK: document.getElementById('truck').value,
                STATEORIGIN: document.getElementById('origin').value.toUpperCase(),
                STATEDESTINATION: document.getElementById('dest').value.toUpperCase(),
                DEADHEAD: Number(document.getElementById('deadhead').value),
                LOADEDMILES: Number(document.getElementById('loaded').value),
                GROSS: Number(document.getElementById('gross').value),
                TYPE: document.getElementById('type').value
            };
            currentData.unshift(uiItem); 
            form.reset(); 
            applyFilters(); 
            showSync();
            try {
                await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: "add", ...uiItem }) });
                hideSync();
            } catch (err) { hideSync(); loadData(); }
        });
    }
});

async function deleteRecord(index) {
    const item = filteredData[index];
    if (!confirm(`Delete load for Truck #${item.TRUCK}?`)) return;
    currentData.splice(currentData.indexOf(item), 1);
    applyFilters(); 
    showSync();
    try {
        await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: "delete", date: item.DATE, truck: item.TRUCK.toString(), gross: item.GROSS.toString() }) });
        hideSync();
    } catch (err) { hideSync(); loadData(); }
}

function openEditModal(index) {
    const item = filteredData[index];
    const d = new Date(item.DATE);
    document.getElementById('edit-old-date').value = item.DATE;
    document.getElementById('edit-old-truck').value = item.TRUCK;
    document.getElementById('edit-old-gross').value = item.GROSS;
    document.getElementById('edit-date').value = isNaN(d) ? "" : d.toISOString().split('T')[0];
    document.getElementById('edit-truck').value = item.TRUCK;
    document.getElementById('edit-origin').value = item.STATEORIGIN || "";
    document.getElementById('edit-dest').value = item.STATEDESTINATION || "";
    document.getElementById('edit-deadhead').value = item.DEADHEAD;
    document.getElementById('edit-loaded').value = item.LOADEDMILES;
    document.getElementById('edit-gross').value = item.GROSS;
    document.getElementById('edit-type').value = item.TYPE || "FULL";
    document.getElementById('edit-modal').classList.remove('hidden');
    document.getElementById('edit-form').onsubmit = (e) => saveEdit(e, item);
}

async function saveEdit(e, originalItem) {
    e.preventDefault();
    const updatedItem = {
        DATE: document.getElementById('edit-date').value,
        TRUCK: document.getElementById('edit-truck').value,
        STATEORIGIN: document.getElementById('edit-origin').value.toUpperCase(),
        STATEDESTINATION: document.getElementById('edit-dest').value.toUpperCase(),
        DEADHEAD: Number(document.getElementById('edit-deadhead').value),
        LOADEDMILES: Number(document.getElementById('edit-loaded').value),
        GROSS: Number(document.getElementById('edit-gross').value),
        TYPE: document.getElementById('edit-type').value
    };
    currentData[currentData.indexOf(originalItem)] = updatedItem;
    closeEditModal(); applyFilters(); showSync();
    try {
        await fetch(SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: "edit", oldDate: document.getElementById('edit-old-date').value, oldTruck: document.getElementById('edit-old-truck').value, oldGross: document.getElementById('edit-old-gross').value, ...updatedItem }) });
        hideSync();
    } catch (err) { hideSync(); loadData(); }
}

function closeEditModal() { document.getElementById('edit-modal').classList.add('hidden'); }

function populateTruckFilter() {
    const truckSelect = document.getElementById('truck-select');
    if (!truckSelect) return;

    // --- STEP 1: REMEMBER WHAT IS CURRENTLY SELECTED ---
    const currentSelection = truckSelect.value;

    truckSelect.innerHTML = '';

    if (userRole === 'admin') {
        // Start with "All Trucks"
        // Check if "ALL" was the previous selection
        let options = `<option value="ALL" ${currentSelection === 'ALL' ? 'selected' : ''}>All Trucks</option>`;
        
        const sortedTrucks = [...ALLOWED_TRUCKS].sort((a, b) => a - b);
        
        sortedTrucks.forEach(t => {
            // --- STEP 2: CHECK IF THIS TRUCK WAS THE ONE SELECTED ---
            const isSelected = (t === currentSelection) ? 'selected' : '';
            options += `<option value="${t}" ${isSelected}>Truck #${t}</option>`;
        });
        
        truckSelect.innerHTML = options;
    } else {
        // Drivers are locked to their truck anyway
        truckSelect.innerHTML = `<option value="${assignedTruck}" selected>Truck #${assignedTruck}</option>`;
        truckSelect.disabled = true;
    }
}

function toggleWeekSort() {
    weekSortDirection = (weekSortDirection === 'asc') ? 'desc' : 'asc';
    const btn = document.getElementById('week-sort-btn');
    if (btn) {
        // If we are currently sorting by 'desc' (Newest first), the button should offer 'OLDEST'
        btn.innerText = weekSortDirection === 'asc' ? 'NEWEST' : 'OLDEST';
    }
    applyFilters(); // Re-renders the dashboard with the new sort
}

function toggleWeekDetails(weekId) {
    const rows = document.querySelectorAll(`.detail-row-${weekId}`);
    const toggleBg = document.getElementById(`toggle-bg-${weekId}`);
    const toggleCircle = document.getElementById(`toggle-circle-${weekId}`);
    
    // Check current state
    const isCurrentlyHidden = !expandedWeeks.has(weekId);

    if (isCurrentlyHidden) {
        // We are opening it (Expanded = Black, shifted right)
        expandedWeeks.add(weekId);
        rows.forEach(row => row.classList.remove('hidden'));
        if (toggleBg) {
            toggleBg.classList.remove('bg-blue-600');
            toggleBg.classList.add('bg-slate-800');
        }
        if (toggleCircle) toggleCircle.classList.add('translate-x-5');
    } else {
        // We are closing it (Minimized = Blue, shifted left)
        expandedWeeks.delete(weekId);
        rows.forEach(row => row.classList.add('hidden'));
        if (toggleBg) {
            toggleBg.classList.remove('bg-slate-800');
            toggleBg.classList.add('bg-blue-600');
        }
        if (toggleCircle) toggleCircle.classList.remove('translate-x-5');
    }
}

function renderWeeksDashboard(data) {
    const tbody = document.getElementById('ledger-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const selMonth = document.getElementById('month-select')?.value || "ALL";
    const selYear = document.getElementById('year-select')?.value || "ALL";

    const getWeekIndex = (dateObj) => {
        const dateNum = dateObj.getUTCDate();
        const firstOfMonth = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), 1));
        let firstWeekday = firstOfMonth.getUTCDay();
        if (firstWeekday === 0) firstWeekday = 7;
        
        let weekIndex = Math.ceil((dateNum + firstWeekday - 1) / 7);
        if (firstWeekday >= 6 && weekIndex > 1) weekIndex -= 1;
        if (weekIndex > 5) weekIndex = 5;
        return weekIndex;
    };

    let nestedData = {}; 

    data.forEach(item => {
        if (!item.DATE) return;
        const truck = item.TRUCK;
        const d = new Date(item.DATE);
        if (isNaN(d)) return; 

        const dayOfWeek = d.getUTCDay() || 7; 
        const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayOfWeek + 1));
        const weekEnd = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6));

        let anchorDate = weekStart;
        if (selMonth !== "ALL") {
            const endMonthName = weekEnd.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
            if (endMonthName === selMonth) {
                anchorDate = weekEnd;
            }
        }

        const year = anchorDate.getUTCFullYear(); 
        const monthIndex = anchorDate.getUTCMonth(); 
        const monthName = anchorDate.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }); 
        const weekIndex = getWeekIndex(anchorDate);
        const monthKey = `${year}-${String(monthIndex).padStart(2, '0')}`;
        
        if (!nestedData[monthKey]) {
            nestedData[monthKey] = { name: monthName, year: year, index: monthIndex, weeks: {} };
        }
        if (!nestedData[monthKey].weeks[weekIndex]) {
            nestedData[monthKey].weeks[weekIndex] = {};
        }
        if (!nestedData[monthKey].weeks[weekIndex][truck]) {
            nestedData[monthKey].weeks[weekIndex][truck] = { loaded: 0, empty: 0, gross: 0, items: [] };
        }

        nestedData[monthKey].weeks[weekIndex][truck].loaded += (Number(item.LOADEDMILES) || 0);
        nestedData[monthKey].weeks[weekIndex][truck].empty += (Number(item.DEADHEAD) || 0);
        nestedData[monthKey].weeks[weekIndex][truck].gross += (Number(item.GROSS) || 0);
        nestedData[monthKey].weeks[weekIndex][truck].items.push(item); 
    });

    const sortedMonthKeys = Object.keys(nestedData).sort((a, b) => {
        return weekSortDirection === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
    });

    let html = `<tr class="bg-gray-100 !border-0 !border-transparent"><td colspan="8" class="h-5 !border-0 !border-transparent bg-gray-100"></td></tr>`;

    sortedMonthKeys.forEach(mKey => {
        const monthObj = nestedData[mKey];
        let weekKeys = Object.keys(monthObj.weeks);
        
        // --- THE FIX: Let the toggle control the week order unconditionally ---
        weekKeys.sort((a, b) => weekSortDirection === 'asc' ? Number(a) - Number(b) : Number(b) - Number(a));

        weekKeys.forEach((wIndex, wArrayIdx) => {
            const weekTrucks = monthObj.weeks[wIndex];
            const sortedTrucks = Object.keys(weekTrucks).sort((a, b) => Number(a) - Number(b));

            const anyTruck = sortedTrucks[0];
            const sampleLoad = weekTrucks[anyTruck].items[0];
            const dObj = new Date(sampleLoad.DATE);
            const dDayOfWeek = dObj.getUTCDay() || 7;
            const wStart = new Date(Date.UTC(dObj.getUTCFullYear(), dObj.getUTCMonth(), dObj.getUTCDate() - dDayOfWeek + 1));
            const wEnd = new Date(Date.UTC(wStart.getUTCFullYear(), wStart.getUTCMonth(), wStart.getUTCDate() + 6));

            const startMonthShort = wStart.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
            const startDay = String(wStart.getUTCDate()).padStart(2, '0');
            const endMonthShort = wEnd.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
            const endDay = String(wEnd.getUTCDate()).padStart(2, '0');

            let dateRangeStr = `${startMonthShort} ${startDay} - ${endDay}`;
            if (startMonthShort !== endMonthShort) {
                dateRangeStr = `${startMonthShort} ${startDay} - ${endMonthShort} ${endDay}`;
            }

            const startMonthFull = wStart.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase();
            const startYearFull = wStart.getUTCFullYear();
            const startWeekIdx = getWeekIndex(wStart);
            
            const endMonthFull = wEnd.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }).toUpperCase();
            const endYearFull = wEnd.getUTCFullYear();
            const endWeekIdx = getWeekIndex(wEnd);

            // --- THE FIX: Cleaner Header Titles without "SUMMARY" ---
            let headerTitle = `${startMonthFull} ${startYearFull} - WEEK ${startWeekIdx}`;
            
            // If the week crosses into a new month, use the "&" symbol and swap based on sort!
            if (startMonthFull !== endMonthFull) {
                if (weekSortDirection === 'desc') {
                    // Newest first: April comes before March
                    headerTitle = `${endMonthFull} ${endYearFull} - WEEK ${endWeekIdx}  &  ${startMonthFull} ${startYearFull} - WEEK ${startWeekIdx}`;
                } else {
                    // Oldest first: March comes before April
                    headerTitle = `${startMonthFull} ${startYearFull} - WEEK ${startWeekIdx}  &  ${endMonthFull} ${endYearFull} - WEEK ${endWeekIdx}`;
                }
            }

            if (html !== '' && !(mKey === sortedMonthKeys[0] && wArrayIdx === 0)) {
                html += `<tr class="bg-gray-100 !border-0 !border-transparent"><td colspan="8" class="h-6 !border-0 !border-transparent bg-gray-100"></td></tr>`;
            }

            const weekId = `w-${mKey}-${wIndex}`;
            
            const isExpanded = expandedWeeks.has(weekId);
            const rowHiddenClass = isExpanded ? "" : "hidden";
            const bgClass = isExpanded ? "bg-slate-800" : "bg-blue-600";
            const circlePosition = isExpanded ? "translate-x-5" : "";

            html += `
                <tr class="bg-blue-50 border-t-4 border-black">
                    <td colspan="8" class="px-4 py-3">
                        <div class="flex justify-between items-center">
                            <span class="font-black text-blue-800 uppercase tracking-widest text-[12.24px]">📅 ${headerTitle}</span>
                            
                            <button onclick="toggleWeekDetails('${weekId}')" class="focus:outline-none cursor-pointer" title="Expand/Collapse Loads">
                                <div id="toggle-bg-${weekId}" class="w-10 h-5 rounded-full relative transition-colors duration-300 ease-in-out ${bgClass}">
                                    <div id="toggle-circle-${weekId}" class="w-4 h-4 bg-white rounded-full absolute top-0.5 left-0.5 shadow-sm transition-transform duration-300 ease-in-out transform ${circlePosition}"></div>
                                </div>
                            </button>

                        </div>
                    </td>
                </tr>
                <tr class="bg-white border-b-2 border-gray-100 uppercase font-black text-slate-900">
                    <th class="px-4 py-3 text-left w-40 text-[13.1px]">Date</th>
                    <th class="px-4 py-3 text-left w-32 text-[13.1px]">Truck</th>                                    
                    <th class="px-4 py-3 text-left text-[13.1px]">Empty Miles</th>
                    <th class="px-4 py-3 text-left text-[13.1px]">Loaded Miles</th>
                    <th class="px-4 py-3 text-left text-[13.1px]">Total Miles</th>
                    <th class="px-4 py-3 text-left text-[13.1px]">Gross</th>
                    <th class="px-4 py-3 text-left text-[13.1px]">RPM</th>     
                    <th class="px-4 py-3 text-left text-[13.1px]">RPTM</th>
                </tr>
            `;

            sortedTrucks.forEach((truck, index) => {
                const t = weekTrucks[truck];
                const totalMiles = t.loaded + t.empty;
                const rpm = t.loaded > 0 ? (t.gross / t.loaded).toFixed(2) : "0.00";
                const rptm = totalMiles > 0 ? (t.gross / totalMiles).toFixed(2) : "0.00";

                let rptmClass = "text-slate-900";
                if (parseFloat(rptm) >= 3.00) rptmClass = "text-green-600";
                else if (parseFloat(rptm) >= 2.50) rptmClass = "text-yellow-500";
                
                let isLast = index === sortedTrucks.length - 1;
                let borderClass = (isLast && t.items.length === 0) ? "border-b-4 border-gray-200" : "border-b border-gray-100";

                html += `
                    <tr class="bg-white hover:bg-blue-50/50 transition-colors ${borderClass}">
                        <td class="px-4 py-4 font-bold text-slate-900 text-left text-[11.2px] uppercase whitespace-nowrap">${dateRangeStr}</td>
                        <td class="px-4 py-4 font-black text-blue-600 text-[12.1px] text-left">#${truck}</td>
                        <td class="px-4 py-4 font-bold text-slate-900 text-left text-[11.9px]">${t.empty}</td>
                        <td class="px-4 py-4 font-bold text-slate-900 text-left text-[11.9px]">${t.loaded}</td>
                        <td class="px-4 py-4 font-black text-slate-900 text-left text-[11.9px]">${totalMiles}</td>
                        <td class="px-4 py-4 font-black text-green-600 text-left text-[11.9px]">$${t.gross.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td class="px-4 py-4 font-black text-blue-600 text-left text-[11.9px]">${rpm}</td>
                        <td class="px-4 py-4 font-black ${rptmClass} text-left text-[11.9px]">${rptm}</td>
                    </tr>
                `;

                // --- THE FIX: Let the toggle control the Days (Loads) order too ---
                t.items.sort((a, b) => {
                    return weekSortDirection === 'asc' 
                        ? new Date(a.DATE) - new Date(b.DATE) 
                        : new Date(b.DATE) - new Date(a.DATE);
                });

                t.items.forEach((load, lIdx) => {
                    const dObj = new Date(load.DATE);
                    const dayStr = dObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }); 
                    const dateStr = dObj.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
                    
                    const lLoaded = Number(load.LOADEDMILES) || 0;
                    const lEmpty = Number(load.DEADHEAD) || 0;
                    const lTotal = lLoaded + lEmpty;
                    const lGross = Number(load.GROSS) || 0;
                    const lRpm = lLoaded > 0 ? (lGross / lLoaded).toFixed(2) : "-";
                    const lRptm = lTotal > 0 ? (lGross / lTotal).toFixed(2) : "-";
                    
                    const origin = load.STATEORIGIN ? load.STATEORIGIN.trim() : "";
                    const dest = load.STATEDESTINATION ? load.STATEDESTINATION.trim() : "";
                    
                    let routeStr = "";
                    if (origin && dest) {
                        routeStr = `${origin} ➔ ${dest}`; 
                    } else if (origin || dest) {
                        routeStr = origin || dest; 
                    }
                    
                    const childBorder = (isLast && lIdx === t.items.length - 1) ? "border-b-4 border-gray-200" : "border-b border-gray-100";

                    html += `
                        <tr class="${rowHiddenClass} detail-row-${weekId} bg-slate-50 text-[11px] hover:bg-slate-100 transition-colors ${childBorder}">
                            <td class="px-4 py-2 pl-8 font-medium text-gray-500 whitespace-nowrap">
                                <div class="flex items-center gap-2">
                                    <span class="w-8 text-left">${dayStr}</span>
                                    <span class="text-gray-400">-</span>
                                    <span>${dateStr}</span>
                                </div>
                            </td>
                            <td class="px-4 py-2 font-bold text-gray-500 uppercase whitespace-nowrap">
                                ${routeStr}
                            </td>
                            <td class="px-4 py-2 text-gray-500">${lEmpty}</td>
                            <td class="px-4 py-2 text-gray-500">${lLoaded}</td>
                            <td class="px-4 py-2 text-gray-500 font-bold">${lTotal}</td>
                            <td class="px-4 py-2 text-green-700 font-bold">$${lGross.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            <td class="px-4 py-2 text-gray-500">${lRpm}</td>
                            <td class="px-4 py-2 text-gray-500">${lRptm}</td>
                        </tr>
                    `;
                });
            });
        });
    });

    if (sortedMonthKeys.length === 0) {
        html = `<tr><td colspan="8" class="p-8 text-center text-gray-400 font-bold uppercase tracking-widest">No loads found for this selection</td></tr>`;
    }

    tbody.innerHTML = html;
}
