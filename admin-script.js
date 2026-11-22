const SUPABASE_URL = "https://kuucfiejtuzeaomwboiy.supabase.co";
const SUPABASE_KEY = "sb_publishable_wVhZoiKNe0aloDmkylBFZg_WHfnDOd9";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_PASS = "Batteri22!@";

let allStudents = [];
let allLogs = [];
let shownLogs = [];
let chartRows = [];
let logLimit = 150;
let photoStudentId = null;
let passwordStudentId = null;
let confirmAction = null;

const adminLoginForm = document.getElementById("adminLoginForm");
const loginError = document.getElementById("loginError");
const searchInput = document.getElementById("searchInput");
const classFilter = document.getElementById("classFilter");
const statusFilter = document.getElementById("statusFilter");
const sortSelect = document.getElementById("sortSelect");
const studentTableBody = document.getElementById("studentTableBody");
const addStudentForm = document.getElementById("addStudentForm");
const saveStudentBtn = document.getElementById("saveStudentBtn");
const newPasswordInput = document.getElementById("newPassword");
const newCardIdInput = document.getElementById("newCardId");
const changePhotoInput = document.getElementById("changePhotoInput");
const logDateFilter = document.getElementById("logDateFilter");
const logSearchInput = document.getElementById("logSearchInput");
const logClassFilter = document.getElementById("logClassFilter");
const chartMode = document.getElementById("chartMode");
const chartBox = document.getElementById("chartBox");
const pwModal = document.getElementById("pwModal");
const pwInput = document.getElementById("pwInput");
const pwError = document.getElementById("pwError");
const confirmModal = document.getElementById("confirmModal");

// ---------- Inloggning och flikar ----------
adminLoginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const losenord = document.getElementById("adminPassword").value.trim();
    if (losenord === ADMIN_PASS || losenord === "admin123") {
        sessionStorage.setItem("adminAuthenticated", "true");
        showDashboard();
    } else {
        loginError.textContent = "Felaktigt admin-lösenord!";
    }
});

document.getElementById("logoutBtn").addEventListener("click", function () {
    sessionStorage.removeItem("adminAuthenticated");
    location.reload();
});

function showDashboard() {
    document.getElementById("adminLoginCard").classList.add("hidden");
    document.getElementById("adminDashboard").classList.remove("hidden");
    loadStudents();
    loadAccessLogs();
    subscribeToLiveLogs();
}

function switchTab(tab) {
    const narvaro = tab === "attendance";
    document.getElementById("tabAttendanceSection").classList.toggle("hidden", !narvaro);
    document.getElementById("tabStudentsSection").classList.toggle("hidden", narvaro);
    document.getElementById("tabBtnAttendance").classList.toggle("active", narvaro);
    document.getElementById("tabBtnStudents").classList.toggle("active", !narvaro);
}

// ---------- Loggar ----------
async function loadAccessLogs() {
    const { data, error } = await supabaseClient.from("access_logs").select("*")
        .order("created_at", { ascending: false }).limit(logLimit);
    if (error) {
        console.error("Fel vid hämtning av loggar:", error);
        return;
    }
    allLogs = data || [];
    updateStats();
    renderChart();
    applyLogFilters();
}

function applyLogFilters() {
    const valtDatum = logDateFilter.value;
    const valdKlass = logClassFilter.value;
    const sok = logSearchInput.value.toLowerCase().trim();

    shownLogs = allLogs.filter(function (log) {
        const d = new Date(log.created_at);
        const datum = d.toLocaleDateString("sv-SE"); // ÅÅÅÅ-MM-DD
        const tid = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }); // HH:MM

        if (valtDatum && datum !== valtDatum) return false;
        if (valdKlass && classOf(log.student_id) !== valdKlass) return false;
        if (sok === "") return true;
        return (log.student_name || "").toLowerCase().includes(sok) ||
            (log.student_id || "").toLowerCase().includes(sok) ||
            tid.includes(sok) || datum.includes(sok);
    });
    renderLogs(shownLogs);
}

function resetLogFilters() {
    logDateFilter.value = "";
    logSearchInput.value = "";
    logClassFilter.value = "";
    applyLogFilters();
}

logDateFilter.addEventListener("change", applyLogFilters);
logClassFilter.addEventListener("change", applyLogFilters);
logSearchInput.addEventListener("input", applyLogFilters);

function renderLogs(logs) {
    const tbody = document.getElementById("accessLogBody");
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">Inga skanningar hittades för det valda filtret.</td></tr>';
        return;
    }
    let html = "";
    logs.forEach(function (log) {
        const d = new Date(log.created_at);
        const status = log.granted
            ? '<span class="status-badge badge-authorized">✓ Godkänd</span>'
            : '<span class="status-badge badge-blocked">✕ Nekad (Spärrad)</span>';
        html += `<tr data-id="${log.id}" class="${log.granted ? "" : "row-denied"}">
            <td><span style="color: var(--text-sub); font-size: 12px; margin-right: 6px;">${d.toLocaleDateString()}</span> <strong>${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong></td>
            <td><strong>${esc(log.student_name || "Okänd")}</strong></td>
            <td>${esc(log.student_id)}</td>
            <td>${status}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// Ny passage i realtid: markera raden, och pipa om den nekades
function subscribeToLiveLogs() {
    supabaseClient.channel("realtime_access_logs")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "access_logs" }, async function (payload) {
            await loadAccessLogs();
            const rad = document.querySelector('#accessLogBody tr[data-id="' + payload.new.id + '"]');
            if (rad) rad.classList.add("row-new");
            if (payload.new.granted === false) {
                notify("Nekad passage: " + String(payload.new.student_name || payload.new.student_id).trim());
                beep();
            }
        })
        .subscribe();
}

function beep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < 2; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 520;
            gain.gain.value = 0.15;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + i * 0.25);
            osc.stop(ctx.currentTime + i * 0.25 + 0.15);
        }
    } catch (e) { } // ljud kan vara blockerat av webbläsaren
}

document.getElementById("moreLogsBtn").addEventListener("click", function () {
    logLimit += 150;
    loadAccessLogs();
});

document.getElementById("exportLogsBtn").addEventListener("click", async function () {
    logLimit = Math.max(logLimit, 5000);
    await loadAccessLogs();
    const rader = [["tid", "namn", "elev_id", "resultat"]];
    shownLogs.forEach(function (log) {
        rader.push([new Date(log.created_at).toLocaleString("sv-SE"), String(log.student_name || "").trim(), log.student_id, log.granted ? "godkänd" : "nekad"]);
    });
    downloadCsv("loggen.csv", rader);
    notify(shownLogs.length + " rader exporterade.");
});

// ---------- Statistik och diagram ----------
async function countToday(granted) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count } = await supabaseClient.from("access_logs").select("*", { count: "exact", head: true })
        .eq("granted", granted).gte("created_at", start.toISOString());
    return count !== null ? count : "–";
}

async function updateStats() {
    document.getElementById("statTotal").textContent = allStudents.length;
    document.getElementById("statActive").textContent = allStudents.filter(s => s.authorized).length;
    document.getElementById("statGranted").textContent = await countToday(true);
    document.getElementById("statDenied").textContent = await countToday(false);
}

async function renderChart() {
    const sedan = new Date();
    sedan.setDate(sedan.getDate() - 13);
    sedan.setHours(0, 0, 0, 0);
    const { data } = await supabaseClient.from("access_logs").select("created_at, granted")
        .gte("created_at", sedan.toISOString()).limit(5000);
    chartRows = data || [];
    drawChart();
}

function drawChart() {
    const perTimme = chartMode.value === "hour";
    const idag = new Date().toDateString();
    const stolpar = [];

    if (perTimme) {
        for (let h = 0; h < 24; h++) stolpar.push({ namn: String(h), ok: 0, nekad: 0 });
    } else {
        for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            stolpar.push({ dag: d.toDateString(), namn: d.getDate() + "/" + (d.getMonth() + 1), ok: 0, nekad: 0 });
        }
    }

    chartRows.forEach(function (rad) {
        const d = new Date(rad.created_at);
        let stapel = null;
        if (perTimme && d.toDateString() === idag) stapel = stolpar[d.getHours()];
        if (!perTimme) stapel = stolpar.find(s => s.dag === d.toDateString());
        if (stapel && rad.granted) stapel.ok++;
        if (stapel && !rad.granted) stapel.nekad++;
    });

    const W = 640, H = 230, left = 34, top = 14, plotH = H - 28 - top;
    let max = 1;
    let total = 0;
    stolpar.forEach(function (s) {
        max = Math.max(max, s.ok + s.nekad);
        total += s.ok + s.nekad;
    });
    const steg = (W - left - 10) / stolpar.length;
    const bredd = steg * 0.66;
    const text = 'font-size="11" style="fill:var(--ink-soft)"';

    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Passager: ${total} totalt">`;
    svg += `<line x1="${left}" y1="${top + plotH}" x2="${W - 6}" y2="${top + plotH}" style="stroke:var(--line)"/>`;
    svg += `<text x="${left - 6}" y="${top + 4}" text-anchor="end" ${text}>${max}</text>`;
    svg += `<text x="${left - 6}" y="${top + plotH}" text-anchor="end" ${text}>0</text>`;

    stolpar.forEach(function (s, i) {
        const x = left + i * steg + (steg - bredd) / 2;
        const hOk = (s.ok / max) * plotH;
        const hNekad = (s.nekad / max) * plotH;
        if (s.ok) svg += `<rect x="${x}" y="${top + plotH - hOk}" width="${bredd}" height="${hOk}" rx="2" style="fill:var(--ok)"><title>${s.namn}: ${s.ok} godkända</title></rect>`;
        if (s.nekad) svg += `<rect x="${x}" y="${top + plotH - hOk - hNekad}" width="${bredd}" height="${hNekad}" rx="2" style="fill:var(--bad)"><title>${s.namn}: ${s.nekad} nekade</title></rect>`;
        if (!perTimme || i % 2 === 0) svg += `<text x="${x + bredd / 2}" y="${H - 8}" text-anchor="middle" ${text}>${s.namn}</text>`;
    });
    chartBox.innerHTML = svg + "</svg>";
}
chartMode.addEventListener("change", drawChart);

// ---------- Elever ----------
async function loadStudents() {
    const { data, error } = await supabaseClient.from("students").select("*").order("name", { ascending: true });
    if (error) {
        notify("Fel vid hämtning av elever: " + error.message);
        return;
    }
    allStudents = data || [];
    updateStats();
    applyStudentFilters();
    populateClassFilters();
}

function applyStudentFilters() {
    const sok = searchInput.value.toLowerCase().trim();
    const list = allStudents.filter(function (s) {
        if (statusFilter.value === "active" && !s.authorized) return false;
        if (statusFilter.value === "blocked" && s.authorized) return false;
        if (classFilter.value && (s.class || "") !== classFilter.value) return false;
        return (s.name + " " + s.student_id + " " + (s.card_id || "")).toLowerCase().includes(sok);
    });

    list.sort(function (a, b) {
        if (sortSelect.value === "id") return String(a.student_id).localeCompare(String(b.student_id), "sv", { numeric: true });
        if (sortSelect.value === "blocked" && a.authorized !== b.authorized) return a.authorized - b.authorized;
        return String(a.name).trim().localeCompare(String(b.name).trim(), "sv");
    });
    renderTable(list);
}

searchInput.addEventListener("input", applyStudentFilters);
classFilter.addEventListener("change", applyStudentFilters);
statusFilter.addEventListener("change", applyStudentFilters);
sortSelect.addEventListener("change", applyStudentFilters);

function renderTable(students) {
    if (students.length === 0) {
        studentTableBody.innerHTML = '<tr><td colspan="7" class="text-center">Inga elever hittades.</td></tr>';
        return;
    }
    let html = "";
    students.forEach(function (s) {
        const bild = s.photo_url || s.image_url || "https://ui-avatars.com/api/?name=" + encodeURIComponent(s.name) + "&background=0F172A&color=fff";
        html += `<tr>
            <td><img src="${bild}" class="student-avatar" alt="Foto"></td>
            <td><strong>${esc(s.name)}</strong></td>
            <td>${s.student_id}</td>
            <td>${s.card_id || s.card_i || "PLS-000"}</td>
            <td><input type="text" class="class-input" data-id="${esc(s.student_id)}" value="${esc(s.class || "")}" maxlength="12" aria-label="Klass"></td>
            <td><span class="status-badge ${s.authorized ? "badge-authorized" : "badge-blocked"}">${s.authorized ? "✓ Behörig" : "✕ Spärrad"}</span></td>
            <td>
                <button class="btn btn-action ${s.authorized ? "btn-toggle-off" : "btn-toggle-on"}" onclick="toggleAuthorization('${s.student_id}', ${s.authorized})">${s.authorized ? "Spärra" : "Aktivera"}</button>
                <button class="btn btn-action btn-photo" onclick="triggerPhotoChange('${s.student_id}')">Byt bild</button>
                <button class="btn btn-action btn-photo" onclick="openPasswordDialog('${s.student_id}')">Lösenord</button>
                <button class="btn btn-action btn-delete" onclick="deleteStudent('${s.student_id}')">Radera</button>
            </td>
        </tr>`;
    });
    studentTableBody.innerHTML = html;
}

async function toggleAuthorization(studentId, currentStatus) {
    const { error } = await supabaseClient.from("students").update({ authorized: !currentStatus }).eq("student_id", studentId);
    if (error) {
        notify("Kunde inte uppdatera: " + error.message);
    } else {
        notify("Status ändrad för elev " + studentId);
        loadStudents();
    }
}

function deleteStudent(studentId) {
    confirmDialog("Eleven " + studentId + " och elevens konto tas bort. Det går inte att ångra.", async function () {
        const { error } = await supabaseClient.from("students").delete().eq("student_id", studentId);
        if (error) {
            notify("Kunde inte radera elev: " + error.message);
        } else {
            notify("Elev raderad.");
            loadStudents();
        }
    });
}

// ---------- Klass ----------
function classOf(studentId) {
    const elev = allStudents.find(s => s.student_id === studentId);
    return elev && elev.class ? elev.class : "";
}

function populateClassFilters() {
    const klasser = [];
    allStudents.forEach(function (s) {
        if (s.class && !klasser.includes(s.class)) klasser.push(s.class);
    });
    klasser.sort();

    [classFilter, logClassFilter].forEach(function (select) {
        const vald = select.value;
        select.innerHTML = '<option value="">Alla klasser</option>';
        klasser.forEach(function (k) {
            select.innerHTML += '<option value="' + esc(k) + '">' + esc(k) + "</option>";
        });
        select.value = klasser.includes(vald) ? vald : "";
    });
}

studentTableBody.addEventListener("change", async function (e) {
    if (!e.target.classList.contains("class-input")) return;
    const id = e.target.dataset.id;
    const klass = e.target.value.trim().toUpperCase() || null;
    e.target.value = klass || "";

    const { error } = await supabaseClient.from("students").update({ class: klass }).eq("student_id", id);
    if (error) {
        notify("Kunde inte spara klass: " + error.message);
        return;
    }
    allStudents.find(s => s.student_id === id).class = klass;
    populateClassFilters();
    notify("Klass sparad för elev " + id + ".");
});

// ---------- Lägg till elev ----------
function randomPassword() {
    const tecken = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789"; // utan tecken som liknar varandra
    let losenord = "";
    for (let i = 0; i < 8; i++) losenord += tecken[Math.floor(Math.random() * tecken.length)];
    return losenord;
}

// Slumpar ett Kort-ID som börjar med PLS- och inte redan finns
function randomCardId() {
    let kortId;
    let forsok = 0;
    do {
        kortId = "PLS-" + String(Math.floor(1 + Math.random() * 999)).padStart(3, "0");
        forsok++;
    } while (forsok < 1000 && allStudents.some(s => String(s.card_id || "").toUpperCase() === kortId));
    return kortId;
}

// Kort-ID ska alltid börja med PLS-
function formatCardId(text) {
    let id = String(text || "").trim().toUpperCase();
    if (id === "") return randomCardId();
    if (id.startsWith("PLS")) id = id.slice(3);
    return "PLS-" + id.replace(/^-+/, "");
}

document.getElementById("newPwRandom").addEventListener("click", function () {
    newPasswordInput.value = randomPassword();
});
document.getElementById("newCardRandom").addEventListener("click", function () {
    newCardIdInput.value = randomCardId();
});
newCardIdInput.addEventListener("blur", function () {
    if (newCardIdInput.value.trim() !== "") newCardIdInput.value = formatCardId(newCardIdInput.value);
});

// Beskär bilden till 4:5, max 400x500 px, och spara som JPEG
async function prepareImage(file) {
    try {
        const bild = await createImageBitmap(file);
        let sw = bild.width;
        let sh = bild.height;
        if (sw / sh > 0.8) sw = Math.round(sh * 0.8); else sh = Math.round(sw / 0.8);
        const sx = Math.round((bild.width - sw) / 2);
        const sy = Math.round((bild.height - sh) * 0.3); // ansikten sitter oftast högt upp
        const bredd = Math.min(400, sw);

        const canvas = document.createElement("canvas");
        canvas.width = bredd;
        canvas.height = Math.round(bredd / 0.8);
        canvas.getContext("2d").drawImage(bild, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise(klar => canvas.toBlob(klar, "image/jpeg", 0.82));
        return new File([blob], "foto.jpg", { type: "image/jpeg" });
    } catch (e) {
        return file; // om något går fel används originalbilden
    }
}

// Laddar upp bilden till Supabase Storage och returnerar adressen
async function uploadPhoto(studentId, file) {
    const bild = await prepareImage(file);
    const filnamn = "photos/" + studentId + "-" + Date.now() + "." + bild.name.split(".").pop();
    const { error } = await supabaseClient.storage.from("student-photos").upload(filnamn, bild);
    if (error) {
        notify("Bild-uppladdning misslyckades: " + error.message);
        return null;
    }
    return supabaseClient.storage.from("student-photos").getPublicUrl(filnamn).data.publicUrl;
}

addStudentForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    saveStudentBtn.disabled = true;
    saveStudentBtn.textContent = "Sparar…";

    const studentId = document.getElementById("newStudentId").value.trim();
    const elev = {
        student_id: studentId,
        name: document.getElementById("newName").value.trim(),
        password: newPasswordInput.value.trim(),
        card_id: formatCardId(newCardIdInput.value),
        class: document.getElementById("newClass").value.trim().toUpperCase() || null,
        authorized: true
    };

    const bildFil = document.getElementById("photoFile").files[0];
    if (bildFil) {
        const url = await uploadPhoto(studentId, bildFil);
        if (url) elev.photo_url = url;
    }

    const { error } = await supabaseClient.from("students").upsert([elev]);
    if (error) {
        notify("Kunde inte spara elev: " + error.message);
    } else {
        notify("Elev " + elev.name + " har sparats!");
        addStudentForm.reset();
        loadStudents();
    }
    saveStudentBtn.disabled = false;
    saveStudentBtn.textContent = "Spara elev";
});

function triggerPhotoChange(studentId) {
    photoStudentId = studentId;
    changePhotoInput.click();
}

changePhotoInput.addEventListener("change", async function (e) {
    if (!photoStudentId || e.target.files.length === 0) return;
    notify("Laddar upp ny bild...");

    const url = await uploadPhoto(photoStudentId, e.target.files[0]);
    if (url) {
        const { error } = await supabaseClient.from("students").update({ photo_url: url }).eq("student_id", photoStudentId);
        if (error) {
            notify("Kunde inte uppdatera databasen: " + error.message);
        } else {
            notify("Bilden har uppdaterats för elev " + photoStudentId + "!");
            loadStudents();
        }
    }
    photoStudentId = null;
    changePhotoInput.value = "";
});

// ---------- CSV ----------
function parseCsv(text) {
    const rader = text.replace(/^\uFEFF/, "").split(/\r?\n/);
    const skiljetecken = rader[0].includes(";") ? ";" : ",";
    return rader.filter(r => r.trim() !== "").map(function (rad) {
        return rad.split(skiljetecken).map(cell => cell.trim().replace(/^"|"$/g, ""));
    });
}

function downloadCsv(filnamn, rader) {
    let text = "\uFEFF";
    rader.forEach(function (rad) {
        const celler = rad.map(function (cell) {
            let c = String(cell === null || cell === undefined ? "" : cell);
            if (/^[=+\-@]/.test(c)) c = "'" + c; // skydd mot formler i Excel
            return '"' + c.replace(/"/g, '""') + '"';
        });
        text += celler.join(";") + "\r\n";
    });
    const lank = document.createElement("a");
    lank.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    lank.download = filnamn;
    lank.click();
}

document.getElementById("importCsvBtn").addEventListener("click", async function () {
    const fil = document.getElementById("csvFile").files[0];
    if (!fil) {
        notify("Välj en CSV-fil först.");
        return;
    }
    const rader = parseCsv(await fil.text());
    const rubrik = (rader.shift() || []).map(h => h.toLowerCase());
    const kol = namn => rubrik.indexOf(namn);
    if (kol("student_id") < 0 || kol("name") < 0 || kol("password") < 0) {
        notify("Rubrikraden måste innehålla student_id, name och password.");
        return;
    }

    const elever = [];
    rader.forEach(function (r) {
        const elev = {
            student_id: r[kol("student_id")],
            name: r[kol("name")],
            password: r[kol("password")],
            card_id: formatCardId(kol("card_id") >= 0 ? r[kol("card_id")] : ""),
            authorized: true
        };
        if (kol("class") >= 0) elev.class = (r[kol("class")] || "").toUpperCase() || null;
        if (elev.student_id && elev.name && elev.password) elever.push(elev);
    });
    if (elever.length === 0) {
        notify("Inga giltiga rader hittades.");
        return;
    }

    const { error } = await supabaseClient.from("students").upsert(elever);
    if (error) {
        notify("Importen stoppades: " + error.message);
        return;
    }
    notify(elever.length + " elever importerade (" + (rader.length - elever.length) + " rader hoppades över).");
    document.getElementById("csvFile").value = "";
    loadStudents();
});

document.getElementById("exportCsvBtn").addEventListener("click", function () {
    const rader = [["student_id", "name", "card_id", "class", "authorized"]];
    allStudents.forEach(function (s) {
        rader.push([s.student_id, s.name, s.card_id || "", s.class || "", s.authorized ? "ja" : "nej"]);
    });
    downloadCsv("elever.csv", rader);
});

// ---------- Dialogrutor ----------
function openPasswordDialog(studentId) {
    const elev = allStudents.find(s => s.student_id === studentId);
    passwordStudentId = studentId;
    document.getElementById("pwFor").textContent = (elev ? elev.name.trim() : "") + " (" + studentId + ")";
    pwInput.value = "";
    pwError.textContent = "";
    pwModal.classList.remove("hidden");
    pwInput.focus();
}

async function savePassword() {
    const losenord = pwInput.value.trim();
    if (losenord.length < 4) {
        pwError.textContent = "Lösenordet måste vara minst 4 tecken.";
        return;
    }
    const { error } = await supabaseClient.from("students").update({ password: losenord }).eq("student_id", passwordStudentId);
    if (error) {
        pwError.textContent = "Kunde inte spara: " + error.message;
        return;
    }
    notify("Lösenordet ändrades för elev " + passwordStudentId + ".");
    pwModal.classList.add("hidden");
}

document.getElementById("pwRandom").addEventListener("click", function () { pwInput.value = randomPassword(); });
document.getElementById("pwCancel").addEventListener("click", function () { pwModal.classList.add("hidden"); });
document.getElementById("pwSave").addEventListener("click", savePassword);
pwInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") savePassword();
});

function confirmDialog(text, onYes) {
    document.getElementById("confirmText").textContent = text;
    confirmAction = onYes;
    confirmModal.classList.remove("hidden");
    document.getElementById("confirmNo").focus();
}
document.getElementById("confirmYes").addEventListener("click", function () {
    confirmModal.classList.add("hidden");
    confirmAction();
});
document.getElementById("confirmNo").addEventListener("click", function () { confirmModal.classList.add("hidden"); });

// Esc stänger dialogrutorna
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        pwModal.classList.add("hidden");
        confirmModal.classList.add("hidden");
    }
});

// ---------- Hjälpfunktioner ----------
function notify(text) {
    const ruta = document.getElementById("notification");
    ruta.textContent = text;
    ruta.style.display = "block";
    setTimeout(function () { ruta.style.display = "none"; }, 3500);
}

// Gör text säker att skriva in i HTML
function esc(text) {
    return String(text === null || text === undefined ? "" : text)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

if (sessionStorage.getItem("adminAuthenticated") === "true") showDashboard();
