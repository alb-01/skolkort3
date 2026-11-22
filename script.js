const SUPABASE_URL = "https://kuucfiejtuzeaomwboiy.supabase.co";
const SUPABASE_KEY = "sb_publishable_wVhZoiKNe0aloDmkylBFZg_WHfnDOd9";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentStudent = null;
let qrTimer = null;
let qrCode = null;
let wakeLock = null;
let doorChannel = null;
let toastTimer = null;

const loginPage = document.getElementById("loginPage");
const cardPage = document.getElementById("cardPage");
const loginForm = document.getElementById("loginForm");
const studentIdInput = document.getElementById("studentId");
const passwordInput = document.getElementById("password");
const rememberMe = document.getElementById("rememberMe");
const loginError = document.getElementById("loginError");

const studentPhoto = document.getElementById("studentPhoto");
const studentName = document.getElementById("studentName");
const displayStudentId = document.getElementById("displayStudentId");
const cardId = document.getElementById("cardId");
const studentClass = document.getElementById("studentClass");
const lastAccessTime = document.getElementById("lastAccessTime");
const authorizationStatus = document.getElementById("authorizationStatus");
const historyList = document.getElementById("historyList");

const useCardButton = document.getElementById("useCardButton");
const accessMessage = document.getElementById("accessMessage");
const qrContainer = document.getElementById("qrContainer");
const qrcodeElement = document.getElementById("qrcode");
const doorToast = document.getElementById("doorToast");
const installTip = document.getElementById("installTip");

// Klockslag som HH:MM
function klockslag(datum) {
    return new Date(datum).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Hämtar eleven som har rätt elev-ID och lösenord
async function hamtaElev(id, losenord) {
    return await supabaseClient.from("students").select("*")
        .eq("student_id", id).eq("password", losenord).maybeSingle();
}

// Automatisk inloggning när sidan öppnas
document.addEventListener("DOMContentLoaded", async function () {
    const id = localStorage.getItem("savedStudentId");
    const losenord = localStorage.getItem("savedPassword");
    if (!id || !losenord) return;

    loginError.textContent = "Loggar in automatiskt...";
    const { data: student, error } = await hamtaElev(id, losenord);
    loginError.textContent = "";

    if (student) {
        showStudentCard(student);
    } else if (error) {
        // Inget nätverk: visa det sparade kortet
        const cached = JSON.parse(localStorage.getItem("cachedStudent"));
        if (cached && cached.student_id === id) showStudentCard(cached);
    } else {
        localStorage.removeItem("savedStudentId");
        localStorage.removeItem("savedPassword");
    }
});

// Inloggning
loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const id = studentIdInput.value.trim();
    const losenord = passwordInput.value.trim();

    const knapp = loginForm.querySelector("button[type=submit]");
    knapp.disabled = true;
    knapp.textContent = "Loggar in…";
    loginError.textContent = "";

    const { data: student, error } = await hamtaElev(id, losenord);
    knapp.disabled = false;
    knapp.textContent = "Logga in";

    if (error) {
        loginError.textContent = "Kunde inte nå servern. Kontrollera uppkopplingen och försök igen.";
        return;
    }
    if (!student) {
        loginError.textContent = "Fel elev-ID eller lösenord.";
        return;
    }

    if (rememberMe.checked) {
        localStorage.setItem("savedStudentId", id);
        localStorage.setItem("savedPassword", losenord);
    } else {
        localStorage.removeItem("savedStudentId");
        localStorage.removeItem("savedPassword");
    }
    showStudentCard(student);
});

// Visa elevens kort
function showStudentCard(student) {
    currentStudent = student;
    loginError.textContent = "";

    // Spara en kopia utan lösenord så att kortet kan visas offline
    const kopia = Object.assign({}, student);
    delete kopia.password;
    localStorage.setItem("cachedStudent", JSON.stringify(kopia));

    studentName.textContent = student.name;
    displayStudentId.textContent = student.student_id;
    cardId.textContent = student.card_id || student.card_i || "N/A";
    studentClass.textContent = student.class || "–";

    const avatar = "https://ui-avatars.com/api/?name=" + encodeURIComponent(student.name) + "&background=0F172A&color=fff&size=128";
    studentPhoto.onerror = function () { this.src = avatar; };
    studentPhoto.src = student.photo_url || student.image_url || student.student_id + ".jpg";

    stopQr();
    authorizationStatus.textContent = student.authorized ? "Behörig" : "Spärrat kort";
    authorizationStatus.parentElement.classList.toggle("not-authorized", !student.authorized);
    useCardButton.disabled = !student.authorized;
    useCardButton.style.opacity = student.authorized ? "1" : "0.5";

    fetchLastEntrance(student.student_id);
    loadHistory(student.student_id);
    watchDoor(student);
    maybeShowInstallTip();

    loginPage.classList.add("hidden");
    cardPage.classList.remove("hidden");
}

// Senaste godkända inpassage
async function fetchLastEntrance(studentId) {
    const { data } = await supabaseClient.from("access_logs").select("created_at")
        .eq("student_id", studentId).eq("granted", true)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (data && data.created_at) {
        const datum = new Date(data.created_at);
        if (datum.toDateString() === new Date().toDateString()) {
            lastAccessTime.textContent = "Idag kl. " + klockslag(datum);
        } else {
            lastAccessTime.textContent = datum.toLocaleDateString() + " " + klockslag(datum);
        }
    } else {
        lastAccessTime.textContent = "Ingen registrerad";
    }
}

// De 15 senaste passagerna
async function loadHistory(studentId) {
    const { data } = await supabaseClient.from("access_logs").select("created_at, granted")
        .eq("student_id", studentId).order("created_at", { ascending: false }).limit(15);
    if (!data) return;

    if (data.length === 0) {
        historyList.innerHTML = "<li><span>Inga passager än</span></li>";
        return;
    }
    let html = "";
    data.forEach(function (rad) {
        const datum = new Date(rad.created_at);
        const dag = datum.toDateString() === new Date().toDateString() ? "Idag" : datum.toLocaleDateString();
        html += '<li class="' + (rad.granted ? "ok" : "bad") + '"><span>' + dag + " " + klockslag(datum) + "</span><strong>" +
            (rad.granted ? "Godkänd" : "Nekad") + "</strong></li>";
    });
    historyList.innerHTML = html;
}

// Visa eller dölj den levande QR-koden
useCardButton.addEventListener("click", function () {
    if (!currentStudent || !currentStudent.authorized) return;
    if ("vibrate" in navigator) navigator.vibrate(50);

    if (qrTimer !== null) {
        stopQr();
        return;
    }

    qrContainer.classList.remove("hidden");
    useCardButton.textContent = "Dölj koden";
    accessMessage.textContent = "Koden byts varje sekund. Skärmdumpar fungerar inte.";
    keepAwake();
    showQr();
    qrTimer = setInterval(showQr, 1000);
});

// Skapar QR-koden med elev-ID och tidsstämpel
function showQr() {
    const adress = window.location.origin + window.location.pathname;
    const text = adress + "?student_id=" + encodeURIComponent(currentStudent.student_id) + "&t=" + Math.floor(Date.now() / 1000);

    if (qrCode) {
        qrCode.makeCode(text); // uppdaterar på plats, ingen flimmer
    } else {
        qrcodeElement.innerHTML = "";
        qrCode = new QRCode(qrcodeElement, {
            text: text, width: 200, height: 200,
            colorDark: "#0f2a43", colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
    }
}

function stopQr() {
    clearInterval(qrTimer);
    qrTimer = null;
    qrCode = null;
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
    qrContainer.classList.add("hidden");
    qrcodeElement.innerHTML = "";
    accessMessage.textContent = "";
    useCardButton.textContent = "Visa skolkort vid dörren";
}

// Skärmen ska inte släckas när koden visas
function keepAwake() {
    if ("wakeLock" in navigator) {
        navigator.wakeLock.request("screen").then(function (lock) { wakeLock = lock; }).catch(function () { });
    }
}
document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && qrTimer !== null) keepAwake();
});

document.getElementById("appleWalletBtn").addEventListener("click", function () {
    if (!currentStudent) return;
    alert("Apple Wallet-integrationen är förberedd i backend med Supabase Edge Functions och PassKit, men kräver ett betalt Apple Developer-certifikat för att aktiveras i produktion.");
});

// Logga ut
document.getElementById("logoutButton").addEventListener("click", function () {
    stopQr();
    localStorage.removeItem("savedStudentId");
    localStorage.removeItem("savedPassword");
    localStorage.removeItem("cachedStudent");
    if (doorChannel) {
        supabaseClient.removeChannel(doorChannel);
        doorChannel = null;
    }
    currentStudent = null;

    loginForm.reset();
    loginError.textContent = "";
    lastAccessTime.textContent = "";
    historyList.innerHTML = "";
    authorizationStatus.parentElement.classList.remove("not-authorized");
    useCardButton.disabled = false;
    useCardButton.style.opacity = "1";

    cardPage.classList.add("hidden");
    loginPage.classList.remove("hidden");
    studentIdInput.focus();
});

// Offline-läge: gul ram och ingen levande kod
function updateOnlineState() {
    const offline = !navigator.onLine;
    cardPage.classList.toggle("offline", offline);
    if (offline && qrTimer !== null) stopQr();
    useCardButton.disabled = offline || !currentStudent || !currentStudent.authorized;
    if (offline) {
        accessMessage.textContent = "Offline: koden kan inte skapas.";
    } else if (qrTimer === null) {
        accessMessage.textContent = "";
    }
}
window.addEventListener("online", updateOnlineState);
window.addEventListener("offline", updateOnlineState);
if (!navigator.onLine) updateOnlineState();

// Bekräftelse när dörren öppnas (Supabase Realtime)
function watchDoor(student) {
    if (doorChannel) supabaseClient.removeChannel(doorChannel);
    doorChannel = supabaseClient.channel("door-" + student.student_id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "access_logs", filter: "student_id=eq." + student.student_id }, function (payload) {
            const tid = klockslag(payload.new.created_at);
            showDoorToast(payload.new.granted ? "Dörren öppnades " + tid : "Passagen nekades " + tid, payload.new.granted);
            if (payload.new.granted) lastAccessTime.textContent = "Idag kl. " + tid;
            loadHistory(student.student_id);
        })
        .subscribe();
}

function showDoorToast(text, ok) {
    doorToast.textContent = text;
    doorToast.className = "door-toast " + (ok ? "ok" : "bad");
    if ("vibrate" in navigator) navigator.vibrate(ok ? [80] : [80, 60, 80]);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { doorToast.classList.add("hidden"); }, 4500);
}

// Visa eller dölj lösenordet
const togglePw = document.getElementById("togglePw");
togglePw.addEventListener("click", function () {
    const visa = passwordInput.type === "password";
    passwordInput.type = visa ? "text" : "password";
    togglePw.textContent = visa ? "Dölj" : "Visa";
});

// Tips om att lägga till appen på hemskärmen (visas en gång på mobil)
function maybeShowInstallTip() {
    const installerad = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const mobil = window.matchMedia("(max-width: 699px)").matches;
    if (installerad || !mobil || localStorage.getItem("installTipDismissed")) return;

    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
    document.getElementById("installTipText").textContent = iphone
        ? "Lägg till skolkortet på hemskärmen: tryck på Dela och välj Lägg till på hemskärmen."
        : "Lägg till skolkortet på hemskärmen: öppna webbläsarens meny och välj Installera app.";
    installTip.classList.remove("hidden");
}
document.getElementById("installDismiss").addEventListener("click", function () {
    installTip.classList.add("hidden");
    localStorage.setItem("installTipDismissed", "1");
});
