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

// 2. CONFIGURATION
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyrS4Sg3GvLIsmZsuIK0KD-zWOhRy5c5wccIKVisn-Wg04GBYU11p6hKUYNaZsYW3_1/exec'; 
const VIEW_KEY = 'VD'; 
const MASTER_KEY = '1631216'; 
const ALLOWED_TRUCKS = ['108', '1589', '1592', '1593', '1594', '156'];

// 3. APP STATE
let userRole = 'driver'; 
let editModeActive = false;
let assignedTruck = '';
let currentData = []; 
let filteredData = []; 
let sortState = { column: 'DATE', direction: 'desc' };

function showSync() { document.getElementById('sync-indicator').classList.remove('hidden'); }
function hideSync() { document.getElementById('sync-indicator').classList.add('hidden'); }

// 4. AUTH LOGIC
function checkKey() {
    const input = document.getElementById('access-key').value.trim();
    if (input.toUpperCase() === VIEW_KEY) {
        userRole = 'admin'; 
        document.getElementById('mode-toggle').classList.remove('hidden'); 
        enterDashboard();
    } else if (ALLOWED_TRUCKS.includes(input)) {
        userRole = 'driver'; 
        assignedTruck = input; 
        enterDashboard();
    } else { alert('Invalid Access Key'); }
}

function enterDashboard() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    const currentMonthName = new Date().toLocaleString('en-US', { month: 'long' });
    const monthSelect = document.getElementById('month-select');
    if (monthSelect) monthSelect.value = currentMonthName;
    loadData();
}

async function loadData() {
    try {
        const response = await fetch(`${SCRIPT_URL}?t=${Date.now()}`); 
        const data = await response.json();
        currentData = (userRole === 'driver') ? data.filter(item => String(item["TRUCK"]) === assignedTruck) : data;
        populateYearFilter(); 
        applyFilters();       
    } catch (err) { console.error("Sync Error:", err); }
}

// 5. DUAL FILTER LOGIC
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
    const selMonth = document.getElementById('month-select').value;
    const selYear = document.getElementById('year-select').value;
    filteredData = currentData.filter(item => {
        const d = new Date(item.DATE);
        const itemMonth = d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).split(' ')[0];
        const itemYear = d.getUTCFullYear().toString();
        return (selMonth === "ALL" || itemMonth === selMonth) && (selYear === "ALL" || itemYear === selYear);
    });
    applySort();
}

// 6. MASTER ACCESS
function requestEditAccess() {
    if (editModeActive) {
        editModeActive = false;
        document.getElementById('management-tools').classList.add('hidden');
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
        document.getElementById('mode-toggle').innerText = "🔓 LOCK VIEW MODE";
        document.getElementById('mode-toggle').classList.replace('bg-slate-800', 'bg-red-600');
        closeMasterModal();
        renderDashboard(filteredData);
    } else { alert("Access Denied"); closeMasterModal(); }
}
function closeMasterModal() { document.getElementById('master-modal').classList.add('hidden'); }

// 7. SORTING & RENDER
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
    renderDashboard(filteredData);
}

function renderDashboard(data) {
    const tbody = document.getElementById('ledger-body');
    const truckContainer = document.getElementById('truck-stats');
    const yearlyBar = document.getElementById('yearly-summary');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let tG = 0, tM = 0, tLM = 0, truckMap = {};
    let yG = 0, yM = 0;

    if (userRole === 'admin' && yearlyBar) {
        yearlyBar.classList.remove('hidden');
        currentData.forEach(item => {
            const miles = (Number(item.DEADHEAD) || 0) + (Number(item.LOADEDMILES) || 0);
            yG += Number(item.GROSS) || 0;
            yM += miles;
        });
        document.getElementById('ytd-gross').innerText = `$${yG.toLocaleString()}`;
        document.getElementById('ytd-loads').innerText = currentData.length;
        document.getElementById('ytd-rpm').innerText = yM > 0 ? (yG / yM).toFixed(2) : "0.00";
    }

    data.forEach((item, index) => {
        const loaded = Number(item["LOADEDMILES"]) || 0;
        const empty = Number(item["DEADHEAD"]) || 0;
        const totalMiles = loaded + empty;
        const gross = Number(item["GROSS"]) || 0;
        
        const rptmNum = totalMiles > 0 ? (gross / totalMiles) : 0;
        const rpmNum = loaded > 0 ? (gross / loaded) : 0;

        tG += gross;
        tM += totalMiles;
        tLM += loaded;

        let typeColor = "bg-blue-100 text-blue-700"; 
        if (item.TYPE === 'PARTIAL') typeColor = "bg-green-100 text-green-700";
        else if (item.TYPE === 'TONU') typeColor = "bg-orange-100 text-orange-700";
        
        let rptmDisplay = rptmNum.toFixed(2);
        let rptmClass = rptmNum >= 3.0 ? 'bg-green-500 text-white' : (rptmNum > 2.0 ? 'bg-yellow-200 text-gray-800' : 'bg-red-100 text-red-700');
        let rpmDisplay = rpmNum.toFixed(2);
        let rpmClass = "bg-blue-50 text-blue-700";

        if (totalMiles === 0) { rptmDisplay = "-"; rptmClass = "bg-gray-100 text-gray-400"; }
        if (loaded === 0) { rpmDisplay = "-"; rpmClass = "bg-gray-100 text-gray-400"; }

        // MAIN TABLE RENDERING (ACTIONS COLUMN REMOVED)
        tbody.innerHTML += `<tr class="border-b bg-white text-black font-medium text-xs">
            <td class="p-4 text-xs">${new Date(item.DATE).toLocaleDateString('en-US', {timeZone: 'UTC'})}</td>
            <td class="p-4 font-bold text-blue-700">#${item.TRUCK}</td>
            <td class="p-4 text-center uppercase">${item.STATEORIGIN} ➔ ${item.STATEDESTINATION}</td>
            <td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-black ${typeColor}">${item.TYPE || 'FULL'}</span></td>
            <td class="p-4 text-right">${empty}</td>
            <td class="p-4 text-right">${loaded}</td>
            <td class="p-4 text-right font-black">$${gross.toLocaleString()}</td>
            <td class="p-4 text-right font-black ${rpmClass}">${rpmDisplay}</td>
            <td class="p-4 text-right font-black ${rptmClass}">${rptmDisplay}</td></tr>`;

        if(!truckMap[item.TRUCK]) truckMap[item.TRUCK] = { weeks: {} };
        const weekIndex = Math.ceil(new Date(item.DATE).getUTCDate() / 7); 
        if(!truckMap[item.TRUCK].weeks[weekIndex]) truckMap[item.TRUCK].weeks[weekIndex] = { gross: 0, totalMiles: 0, loadedMiles: 0 };
        truckMap[item.TRUCK].weeks[weekIndex].gross += gross;
        truckMap[item.TRUCK].weeks[weekIndex].totalMiles += totalMiles;
        truckMap[item.TRUCK].weeks[weekIndex].loadedMiles += loaded;
    });

    if (truckContainer) {
        truckContainer.innerHTML = '';
        let sortedTrucks = Object.keys(truckMap).map(id => {
            let tg = 0, tm = 0; Object.values(truckMap[id].weeks).forEach(w => { tg += w.gross; tm += w.totalMiles; });
            return { id, weeks: truckMap[id].weeks, avgRptm: tm > 0 ? tg/tm : 0, totalGross: tg };
        }).sort((a, b) => b.avgRptm - a.avgRptm);

        sortedTrucks.forEach((truck, idx) => {
            let weeklyHtml = '';
            for(let i=1; i<=5; i++) {
                if(truck.weeks[i]) {
                    const wData = truck.weeks[i];
                    const wRptm = wData.totalMiles > 0 ? (wData.gross / wData.totalMiles).toFixed(2) : "-";
                    const wRpm = wData.loadedMiles > 0 ? (wData.gross / wData.loadedMiles).toFixed(2) : "-";
                    
                    // PERFORMANCE GRID: 45px 55px 60px 50px | Font: 11.5px
                    weeklyHtml += `
                        <div class="grid grid-cols-[45px_55px_60px_50px] items-center text-[11.5px] py-1 border-t border-gray-100 whitespace-nowrap overflow-hidden">
                            <span class="font-bold text-gray-400 uppercase text-[9px]">Week ${i}</span>
                            <span class="text-blue-900 font-bold">$${wData.gross.toLocaleString()}</span>
                            
                            <div class="flex gap-1 items-center">
                                <span class="text-gray-400 text-[10px] uppercase font-bold">RPM:</span>
                                <span class="${wRpm === '-' ? 'text-gray-300' : 'font-black text-slate-950'}">${wRpm}</span>
                            </div>
                            
                            <div class="flex gap-1 items-center">
                                <span class="text-gray-400 text-[10px] uppercase font-bold">RPTM:</span>
                                <span class="${wRptm === '-' ? 'text-gray-300' : 'font-black text-slate-950'}">${wRptm}</span>
                            </div>
                        </div>`;
                }
            }
            truckContainer.innerHTML += `
                <div class="bg-white rounded-lg px-2.5 py-3 mb-3 border border-gray-200 shadow-sm relative overflow-hidden">
                    <div class="absolute left-0 top-0 bottom-0 w-1 ${truck.avgRptm >= 3 ? 'bg-green-500' : 'bg-yellow-400'}"></div>
                    <p class="text-[13px] font-black uppercase mb-1.5 flex items-center tracking-tight">UNIT #${truck.id} ${idx === 0 ? '🏆' : ''}</p>
                    <div class="flex flex-col">${weeklyHtml}</div>
                    <div class="mt-2 pt-1 border-t border-dashed border-gray-200 flex justify-between items-center px-0.5">
                         <span class="text-[12px] font-black uppercase text-blue-700 tracking-tighter">Monthly Total</span>
                         <span class="text-[12px] font-black text-slate-900">$${truck.totalGross.toLocaleString()}</span>
                    </div>
                </div>`;
        });
    }

    document.getElementById('total-gross').innerText = `$${tG.toLocaleString()}`;
    if(document.getElementById('avg-rpm')) document.getElementById('avg-rpm').innerText = tLM > 0 ? (tG / tLM).toFixed(2) : "0.00";
    document.getElementById('avg-rptm').innerText = tM > 0 ? (tG / tM).toFixed(2) : "0.00"; 
    document.getElementById('load-count').innerText = data.length;
}

// 8. UTILS & EVENT HANDLERS
function exportToCSV() {
    let rows = document.querySelectorAll("table tr");
    let csv = Array.from(rows).map(row => Array.from(row.querySelectorAll("th, td")).map(td => `"${td.innerText.replace(/"/g, '""')}"`).join(",")).join("\n");
    let blob = new Blob([csv], { type: "text/csv" });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Fleet_Log_${new Date().toLocaleDateString()}.csv`;
    link.click();
}

document.addEventListener('DOMContentLoaded', () => {
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

function filterTable() {
    const filter = document.getElementById("table-search").value.toLowerCase();
    const rows = document.getElementById("ledger-body").getElementsByTagName("tr");
    for (let i = 0; i < rows.length; i++) rows[i].style.display = rows[i].textContent.toLowerCase().includes(filter) ? "" : "none";
}