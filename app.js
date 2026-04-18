// New Life Church Dublin — Event Dashboard
// Works in two modes:
//  - Firebase mode (USE_LOCAL_DEMO=false): real-time sync via Firestore.
//  - Local demo mode (USE_LOCAL_DEMO=true): saves in browser localStorage.

import { firebaseConfig, ADMIN_PASSCODE, VIEWER_PASSCODE, USE_LOCAL_DEMO } from "./firebase-config.js";

// ---------- Staff viewer gate ----------
// Blocks the app until the visitor enters the shared staff passcode.
// Accepted sessions are remembered in localStorage (per device) if they tick "Remember".
const VIEWER_KEY = "nlc_viewer_ok_v1";

// Fully lock the dashboard: clear viewer storage and reload to the gate.
function lockDashboard(){
  localStorage.removeItem(VIEWER_KEY);
  sessionStorage.removeItem(VIEWER_KEY);
  location.reload();
}

(function viewerGate(){
  const gate  = document.getElementById("viewerGate");
  const form  = document.getElementById("gateForm");
  const input = document.getElementById("gateInput");
  const err   = document.getElementById("gateError");
  const remember = document.getElementById("gateRemember");
  if (!gate || !form) return;

  const already = localStorage.getItem(VIEWER_KEY) === "yes" || sessionStorage.getItem(VIEWER_KEY) === "yes";
  if (already){ gate.classList.add("hidden"); return; }

  gate.classList.remove("hidden");
  document.body.classList.add("gated");
  setTimeout(()=>input.focus(), 50);

  form.addEventListener("submit",(e)=>{
    e.preventDefault();
    if (input.value === VIEWER_PASSCODE){
      (remember.checked ? localStorage : sessionStorage).setItem(VIEWER_KEY, "yes");
      gate.classList.add("hidden");
      document.body.classList.remove("gated");
    } else {
      err.style.display = "block";
      input.value = "";
      input.focus();
    }
  });
})();

// ---------- Storage layer abstraction ----------
let storage;

if (USE_LOCAL_DEMO) {
  storage = createLocalStorageAdapter();
} else {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
  const fs = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  storage = createFirestoreAdapter(db, fs);
}

// ---------- State mutation helpers ----------
// In Firebase mode, onSnapshot already syncs state from the server — we must NOT
// also push locally, or the item appears twice until the next snapshot arrives.
// In local/demo mode, there is no snapshot, so these helpers do the work.
function localPush(coll, item){ if (USE_LOCAL_DEMO) state[coll].push(item); }
function localMerge(coll, id, patch){
  if (!USE_LOCAL_DEMO) return;
  const it = state[coll].find(x=>x.id===id); if (it) Object.assign(it, patch);
}
function localRemove(coll, id){
  if (USE_LOCAL_DEMO) state[coll] = state[coll].filter(x=>x.id!==id);
}

// ---------- State ----------
const state = {
  events: [],
  tasks: [],
  people: [],
  expenses: [],
  activity: [],
  teams: [],
  selectedEventId: null,
  selectedBudgetEventId: null,
  peopleFilterTeam: "All",
  isAdmin: false,
};

// ---------- Teams & roster ----------
// Default teams, seeded on first run. Admin can add/delete more from People tab.
const DEFAULT_TEAMS = ["Leadership","Media","Music","Ushering","Kids"];
// Helper — returns the current team name list (always from state.teams)
const teamNames = () => state.teams.map(t=>t.name);

// Categories used for tasks. Some map to teams (see CATEGORY_TEAM).
const CATEGORIES = [
  "Media","Music","Ushering","Kids",
  "Decoration","Shopping","Food","Hospitality","Games","Setup/Cleanup","General"
];

// Which team's members should be preferred for each task category.
const CATEGORY_TEAM = {
  "Media":"Media", "Music":"Music", "Ushering":"Ushering", "Kids":"Kids"
};

// New Life Church Dublin default roster.
// Pastor Mathew and Sister Pauline belong to every team.
const ALL_TEAMS = ["Leadership","Media","Music","Ushering","Kids"];
const NLC_ROSTER = [
  {name:"Pastor Mathew",   teams: ALL_TEAMS},
  {name:"Sister Pauline",  teams: ALL_TEAMS},
  // Media
  {name:"Kingson",   teams:["Media"]},
  {name:"Sunish",    teams:["Media"]},
  {name:"Sheena",    teams:["Media","Ushering"]},
  {name:"Renjith",   teams:["Media"]},
  {name:"Dhanush",   teams:["Media"]},
  {name:"Yeshvanth", teams:["Media"]},
  {name:"Nirmal",    teams:["Media"]},
  {name:"Higgins",   teams:["Media"]},
  {name:"Priya",     teams:["Media"]},
  {name:"Annish",    teams:["Media"]},
  {name:"Vivin",     teams:["Media"]},
  {name:"Richard",   teams:["Media"]},
  // Music
  {name:"Karen",     teams:["Music"]},
  {name:"Naveen",    teams:["Music"]},
  {name:"Sasirekha", teams:["Music"]},
  {name:"Joshua",    teams:["Music"]},
  {name:"Archana",   teams:["Music"]},
  {name:"Jenita",    teams:["Music"]},
  {name:"Jenifa",    teams:["Music"]},
  // Ushering
  {name:"Tabitha",       teams:["Ushering"]},
  {name:"Priyavinitha",  teams:["Ushering"]},
  {name:"Aishwarya",     teams:["Ushering"]},
];

// ---------- Boot ----------
await storage.init();
state.events    = await storage.list("events");
state.tasks     = await storage.list("tasks");
state.people    = await storage.list("people");
state.expenses  = await storage.list("expenses");
state.activity  = await storage.list("activity");
state.teams     = await storage.list("teams");

// Seed default teams on first run
if (state.teams.length === 0){
  for (const name of DEFAULT_TEAMS){
    const id = await storage.add("teams", {name});
    localPush("teams", {id, name});
  }
}

// One-time cleanup: remove old placeholder names from the first release.
const OLD_DEMO_NAMES = new Set(["Pauline","Pastor","Sister A","Brother B","Sister C","Brother D"]);
for (const p of [...state.people]){
  if (OLD_DEMO_NAMES.has(p.name) && !p.teams){
    await storage.remove("people", p.id);
    state.people = state.people.filter(x=>x.id!==p.id);
  }
}

bindUI();
render();

// =======================================================
//                      UI BINDING
// =======================================================
function bindUI() {
  // Tabs
  document.querySelectorAll(".tab-btn").forEach(btn=>{
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".tab-btn").forEach(b=>b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p=>p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById("tab-"+btn.dataset.tab).classList.add("active");
    });
  });

  // Admin sign-in
  document.getElementById("adminBtn").addEventListener("click", toggleAdmin);

  // New event
  document.getElementById("btnNewEvent").addEventListener("click", ()=>openEventModal());

  // Task controls
  document.getElementById("taskEventSelect").addEventListener("change", e=>{
    state.selectedEventId = e.target.value || null;
    renderTasks();
  });
  document.getElementById("btnNewTask").addEventListener("click", ()=>openTaskModal());
  document.getElementById("btnSeedTasks").addEventListener("click", seedStandardTasks);
  document.getElementById("btnAutoFill").addEventListener("click", autoFillRotation);

  // People
  document.getElementById("btnNewPerson").addEventListener("click", ()=>openPersonModal());
  document.getElementById("btnLoadRoster").addEventListener("click", loadNLCRoster);
  document.getElementById("btnAddTeam").addEventListener("click", addTeam);

  // Budget
  document.getElementById("budgetEventSelect").addEventListener("change", e=>{
    state.selectedBudgetEventId = e.target.value || null;
    renderBudget();
  });
  document.getElementById("btnNewExpense").addEventListener("click", ()=>openExpenseModal());
  document.getElementById("btnExportBudget").addEventListener("click", ()=>{
    // Reuse the Tasks-tab exporter but scope it to the currently-selected budget event.
    const prior = state.selectedEventId;
    state.selectedEventId = state.selectedBudgetEventId;
    exportEventToExcel();
    state.selectedEventId = prior;
  });

  // Clear activity (admin-only)
  document.getElementById("btnClearActivity").addEventListener("click", clearActivity);

  // Lock dashboard — anyone on the device can clear the staff passcode
  document.getElementById("btnLockDashboard").addEventListener("click", (e)=>{
    e.preventDefault();
    if (confirm("Lock the dashboard on this device? You'll need the staff passcode to get back in.")) {
      lockDashboard();
    }
  });

  // Modal close
  document.getElementById("modal").addEventListener("click",(e)=>{
    if (e.target.dataset.close !== undefined || e.target.id === "modal") closeModal();
  });
}

function toggleAdmin(){
  const btn   = document.getElementById("adminBtn");
  const badge = document.getElementById("adminBadge");
  const hint  = document.getElementById("authHint");
  if (state.isAdmin){
    // Full sign-out: clear admin state AND the staff passcode, then reload
    // so the welcome gate appears again. Keeps the dashboard properly locked
    // when admin steps away from a shared device.
    state.isAdmin = false;
    document.body.classList.remove("is-admin");
    badge.classList.add("hidden");
    btn.textContent = "Sign in as Admin";
    hint.textContent = "View-only · Admin can edit";
    lockDashboard();
    return;
  }
  const code = prompt("Enter admin passcode:");
  if (code === ADMIN_PASSCODE){
    state.isAdmin = true;
    document.body.classList.add("is-admin");
    badge.classList.remove("hidden");
    btn.textContent = "Sign out";
    hint.textContent = "You can add, edit, and assign";
    render();
  } else if (code !== null){
    alert("Incorrect passcode.");
  }
}

function requireAdmin(){
  if (!state.isAdmin){
    alert("Please sign in as Admin to make changes.");
    return false;
  }
  return true;
}

// =======================================================
//                        RENDER
// =======================================================
function render(){
  renderOverview();
  renderEvents();
  populateEventSelectors();
  renderTasks();
  renderPeople();
  renderBudget();
}

function renderOverview(){
  const upcoming = state.events.filter(e=> new Date(e.date) >= startOfToday()).sort(byDateAsc);
  const openTasks = state.tasks.filter(t=> !t.done).length;
  const totalSpend = state.expenses.reduce((s,x)=> s + (Number(x.actual)||0), 0);

  document.getElementById("stUpcoming").textContent = upcoming.length;
  document.getElementById("stOpen").textContent = openTasks;
  document.getElementById("stPeople").textContent = state.people.length;
  document.getElementById("stSpend").textContent = fmtMoney(totalSpend);

  const box = document.getElementById("nextEventBox");
  if (upcoming.length === 0){
    box.textContent = "No upcoming event scheduled yet.";
  } else {
    const e = upcoming[0];
    const taskCount = state.tasks.filter(t=>t.eventId===e.id).length;
    const assigned  = state.tasks.filter(t=>t.eventId===e.id).reduce((s,t)=>s+(t.assigned?.length||0),0);
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap">
        <div>
          <div style="font-size:20px;font-weight:700;color:var(--nlc-green-dark)">${escapeHtml(e.name)}</div>
          <div class="muted">${fmtDate(e.date)} · ${escapeHtml(e.location||"Church")}</div>
        </div>
        <div class="muted small">
          ${taskCount} tasks · ${assigned} volunteer assignments
        </div>
      </div>`;
  }

  const feed = document.getElementById("activityFeed");
  const items = [...state.activity].sort((a,b)=> (b.ts||0)-(a.ts||0)).slice(0,10);
  feed.innerHTML = items.length === 0
    ? '<li class="muted">No recent activity.</li>'
    : items.map(a=>`<li>${escapeHtml(a.text)} <span class="muted small">· ${timeAgo(a.ts)}</span></li>`).join("");
}

function renderEvents(){
  const host = document.getElementById("eventList");
  if (state.events.length === 0){
    host.innerHTML = `<p class="muted">No events yet. Click <b>+ New Event</b> to add one (e.g. Couples Meeting, Sunday Service, Christmas Celebration).</p>`;
    return;
  }
  const sorted = [...state.events].sort(byDateAsc);
  host.innerHTML = sorted.map(e=>{
    const taskCount = state.tasks.filter(t=>t.eventId===e.id).length;
    const done = state.tasks.filter(t=>t.eventId===e.id && t.done).length;
    return `
      <div class="event-card">
        <div class="meta">${fmtDate(e.date)} · ${escapeHtml(e.location||"Church")}</div>
        <h3>${escapeHtml(e.name)}</h3>
        <div class="muted small">${escapeHtml(e.description||"")}</div>
        <div class="muted small" style="margin-top:6px">${done}/${taskCount} tasks complete</div>
        <div class="actions">
          <button class="btn btn-outline" data-ev-open="${e.id}">Open tasks</button>
          <button class="btn btn-ghost admin-only" data-ev-edit="${e.id}">Edit</button>
          <button class="btn btn-danger admin-only" data-ev-del="${e.id}">Delete</button>
        </div>
      </div>`;
  }).join("");

  host.querySelectorAll("[data-ev-open]").forEach(b=>b.addEventListener("click",()=>{
    state.selectedEventId = b.dataset.evOpen;
    document.querySelector('.tab-btn[data-tab="tasks"]').click();
    document.getElementById("taskEventSelect").value = state.selectedEventId;
    renderTasks();
  }));
  host.querySelectorAll("[data-ev-edit]").forEach(b=>b.addEventListener("click",()=>openEventModal(b.dataset.evEdit)));
  host.querySelectorAll("[data-ev-del]").forEach(b=>b.addEventListener("click",()=>deleteEvent(b.dataset.evDel)));
}

function populateEventSelectors(){
  for (const id of ["taskEventSelect","budgetEventSelect"]){
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = `<option value="">— Select event —</option>` +
      [...state.events].sort(byDateAsc).map(e=>`<option value="${e.id}">${escapeHtml(e.name)} · ${fmtDate(e.date)}</option>`).join("");
    sel.value = prev;
  }
  if (!state.selectedEventId && state.events.length){
    state.selectedEventId = [...state.events].sort(byDateAsc)[0].id;
    document.getElementById("taskEventSelect").value = state.selectedEventId;
  }
  if (!state.selectedBudgetEventId && state.events.length){
    state.selectedBudgetEventId = [...state.events].sort(byDateAsc)[0].id;
    document.getElementById("budgetEventSelect").value = state.selectedBudgetEventId;
  }
}

function renderTasks(){
  renderSummary();
  const host = document.getElementById("taskBoard");
  const eid = state.selectedEventId;
  if (!eid){
    host.innerHTML = `<p class="muted">Pick an event above to view tasks.</p>`;
    return;
  }
  const tasks = state.tasks.filter(t=>t.eventId===eid);
  if (tasks.length===0){
    host.innerHTML = `<p class="muted">No tasks yet. Use <b>+ Add Task</b> or <b>Add from standard list…</b>.</p>`;
    return;
  }
  host.innerHTML = tasks.map(t=>renderTaskCard(t)).join("");
  // Wire events
  host.querySelectorAll("[data-task-done]").forEach(b=>b.addEventListener("click",()=>toggleDone(b.dataset.taskDone)));
  host.querySelectorAll("[data-task-edit]").forEach(b=>b.addEventListener("click",()=>openTaskModal(b.dataset.taskEdit)));
  host.querySelectorAll("[data-task-del]").forEach(b=>b.addEventListener("click",()=>deleteTask(b.dataset.taskDel)));
  host.querySelectorAll("[data-assign]").forEach(sel=>sel.addEventListener("change",()=>assignPerson(sel)));
  host.querySelectorAll("[data-unassign]").forEach(x=>x.addEventListener("click",()=>unassignPerson(x.dataset.unassign, x.dataset.person)));
  host.querySelectorAll("[data-apply-suggestion]").forEach(b=>b.addEventListener("click",()=>applySuggestion(b.dataset.applySuggestion)));
}

function renderTaskCard(t){
  const people = state.people;
  const assignedIds = t.assigned || [];
  const remaining   = people.filter(p=>!assignedIds.includes(p.id));
  const suggestion  = suggestVolunteersForTask(t);
  const catClass    = catCss(t.category);
  const teamName    = CATEGORY_TEAM[t.category]; // may be undefined

  // Split remaining into team-first, then others
  const inTeam  = teamName ? remaining.filter(p=>(p.teams||[]).includes(teamName)) : [];
  const others  = teamName ? remaining.filter(p=>!(p.teams||[]).includes(teamName)) : remaining;

  const personLabel = p => {
    const n = taskCountForPerson(p.id, t.eventId);
    return `${p.name}${n>0?` · ${n} task${n>1?"s":""}`:""}`;
  };
  const assignDropdown = (!state.isAdmin || remaining.length===0) ? "" : `
    <select class="input" style="max-width:240px" data-assign="${t.id}">
      <option value="">+ Assign…</option>
      ${teamName && inTeam.length ? `<optgroup label="${escapeHtml(teamName)} team">
        ${inTeam.map(p=>`<option value="${p.id}">${escapeHtml(personLabel(p))}</option>`).join("")}
      </optgroup>` : ""}
      ${others.length ? `<optgroup label="${teamName?'Others':'Everyone'}">
        ${others.map(p=>`<option value="${p.id}">${escapeHtml(personLabel(p))}</option>`).join("")}
      </optgroup>` : ""}
    </select>`;

  return `
    <div class="task-card">
      <span class="cat ${catClass}">${escapeHtml(t.category||"General")}</span>
      ${teamName?`<span class="team-tag">${escapeHtml(teamName)} team</span>`:""}
      <h4>${escapeHtml(t.title)} ${t.done?'<span class="muted small">✓ done</span>':""}</h4>
      <div class="muted small">${escapeHtml(t.notes||"")}</div>

      <div class="assign-row">
        ${assignedIds.map(pid=>{
          const p = people.find(x=>x.id===pid); if(!p) return "";
          const n = taskCountForPerson(pid, t.eventId);
          const warn = n >= 3 ? `<span class="load-badge load-high" title="Already ${n} tasks in this event">${n}</span>` : "";
          return `<span class="chip">${escapeHtml(p.name)}${warn}${state.isAdmin?`<span class="x" data-unassign="${t.id}" data-person="${p.id}" title="Remove">×</span>`:""}</span>`;
        }).join("")}
        ${assignDropdown}
      </div>

      ${suggestion.length ? `
        <div class="suggestion">
          <b>Rotation suggestion:</b> ${suggestion.slice(0,3).map(p=>escapeHtml(p.name)).join(", ")}
          ${state.isAdmin ? `<button class="btn btn-ghost small" style="margin-left:6px" data-apply-suggestion="${t.id}">Apply</button>` : ""}
        </div>` : ""}

      <div class="row-between tight">
        <button class="btn btn-outline admin-only" data-task-done="${t.id}">${t.done?"Mark not done":"Mark done"}</button>
        <div>
          <button class="btn btn-ghost admin-only" data-task-edit="${t.id}">Edit</button>
          <button class="btn btn-danger admin-only" data-task-del="${t.id}">Delete</button>
        </div>
      </div>
    </div>`;
}

function renderPeople(){
  // Filter bar (shows team chips; admin-only delete × for non-default custom teams)
  const bar = document.getElementById("peopleFilterBar");
  if (bar){
    const counts = {All: state.people.length};
    teamNames().forEach(tm=> counts[tm] = state.people.filter(p=>(p.teams||[]).includes(tm)).length);
    const current = state.peopleFilterTeam;
    const deletable = new Set(teamNames().filter(t=>!DEFAULT_TEAMS.includes(t)));
    bar.innerHTML = ["All", ...teamNames()].map(tm=>`
      <span class="filter-chip-wrap ${current===tm?"active":""}">
        <button class="filter-chip ${current===tm?"active":""}" data-team-filter="${tm}">
          ${escapeHtml(tm)} <span class="filter-count">${counts[tm]||0}</span>
        </button>
        ${state.isAdmin && deletable.has(tm) ? `<button class="filter-del admin-only" data-del-team="${escapeAttr(tm)}" title="Delete team">×</button>` : ""}
      </span>`).join("");
    bar.querySelectorAll("[data-team-filter]").forEach(b=>b.addEventListener("click",()=>{
      state.peopleFilterTeam = b.dataset.teamFilter;
      renderPeople();
    }));
    bar.querySelectorAll("[data-del-team]").forEach(b=>b.addEventListener("click",(e)=>{
      e.stopPropagation(); deleteTeam(b.dataset.delTeam);
    }));
  }

  const host = document.getElementById("peopleList");
  if (state.people.length===0){
    host.innerHTML = `<p class="muted">No people yet. Admin can add someone or click <b>Load NLC Team</b>.</p>`;
    return;
  }
  const filter = state.peopleFilterTeam;
  const list = filter && filter !== "All"
    ? state.people.filter(p=>(p.teams||[]).includes(filter))
    : state.people;
  if (list.length===0){
    host.innerHTML = `<p class="muted">No one in the <b>${escapeHtml(filter)}</b> team yet.</p>`;
    return;
  }
  const eid = state.selectedEventId;
  host.innerHTML = list.map(p=>{
    const evCount = eid ? taskCountForPerson(p.id, eid) : 0;
    const totalCount = taskCountForPerson(p.id, null);
    const badge = eid
      ? `<span class="load-badge ${loadBadgeClass(evCount)}" title="${evCount} tasks in the selected event">${evCount}</span>`
      : "";
    return `
    <div class="person">
      <div class="avatar">${escapeHtml(initials(p.name))}</div>
      <div class="info">
        <div class="name">${escapeHtml(p.name)} ${badge}</div>
        <div class="team-chips">
          ${(p.teams||[]).map(tm=>`<span class="team-chip ${teamCss(tm)}">${escapeHtml(tm)}</span>`).join("") || '<span class="muted small">No team</span>'}
        </div>
        <div class="muted small" style="margin-top:3px">Total tasks all-time: ${totalCount}</div>
      </div>
      <button class="btn btn-ghost admin-only" data-p-edit="${p.id}">Edit</button>
      <button class="btn btn-danger admin-only" data-p-del="${p.id}">×</button>
    </div>`;
  }).join("");
  host.querySelectorAll("[data-p-edit]").forEach(b=>b.addEventListener("click",()=>openPersonModal(b.dataset.pEdit)));
  host.querySelectorAll("[data-p-del]").forEach(b=>b.addEventListener("click",()=>deletePerson(b.dataset.pDel)));
}

// Import the pre-configured NLC roster (skips anyone with the same name).
async function loadNLCRoster(){
  if (!requireAdmin()) return;
  const existingNames = new Set(state.people.map(p=>p.name.toLowerCase()));
  let added = 0;
  for (const p of NLC_ROSTER){
    if (existingNames.has(p.name.toLowerCase())) continue;
    const newId = await storage.add("people", p);
    localPush("people", {id:newId, ...p});
    added++;
  }
  logActivity(`Loaded NLC roster (${added} new)`);
  alert(added === 0 ? "Everyone from the NLC roster is already here." : `Added ${added} people to the roster.`);
  render();
}

// ---------- Clear activity log ----------
async function clearActivity(){
  if (!requireAdmin()) return;
  if (!state.activity.length){ alert("Activity log is already empty."); return; }
  if (!confirm(`Clear all ${state.activity.length} activity entries? This cannot be undone.`)) return;
  for (const a of [...state.activity]){
    try { await storage.remove("activity", a.id); } catch {}
  }
  state.activity = [];
  renderOverview();
}

// ---------- Team CRUD ----------
async function addTeam(){
  if (!requireAdmin()) return;
  const name = (prompt("New team name (e.g. Prayer, Youth, Kitchen):") || "").trim();
  if (!name) return;
  if (teamNames().some(t=>t.toLowerCase()===name.toLowerCase())){
    alert("A team with that name already exists."); return;
  }
  const id = await storage.add("teams", {name});
  localPush("teams", {id, name});
  logActivity(`Created team "${name}"`);
  render();
}

async function deleteTeam(teamName){
  if (!requireAdmin()) return;
  const inUse = state.people.filter(p=>(p.teams||[]).includes(teamName));
  const msg = inUse.length
    ? `Delete team "${teamName}"? It will be removed from ${inUse.length} person/people.`
    : `Delete team "${teamName}"?`;
  if (!confirm(msg)) return;
  // Remove from all people
  for (const p of inUse){
    p.teams = p.teams.filter(t=>t!==teamName);
    await storage.update("people", p.id, {teams:p.teams});
  }
  // Remove the team record
  const t = state.teams.find(x=>x.name===teamName);
  if (t){ await storage.remove("teams", t.id); state.teams = state.teams.filter(x=>x.id!==t.id); }
  if (state.peopleFilterTeam === teamName) state.peopleFilterTeam = "All";
  logActivity(`Deleted team "${teamName}"`);
  render();
}

// ---------- Load balance ----------
// Count of task assignments for a given person, optionally scoped to one event.
function taskCountForPerson(personId, eventId){
  return state.tasks.filter(t =>
    (eventId ? t.eventId === eventId : true) && (t.assigned||[]).includes(personId)
  ).length;
}

// CSS class for a load badge based on count in the current event
function loadBadgeClass(count){
  if (count >= 4) return "load-high";
  if (count >= 2) return "load-med";
  if (count >= 1) return "load-low";
  return "load-zero";
}

// ---------- Auto-fill rotation ----------
// For every unassigned task in the selected event, pick the top rotation suggestion.
// Respects team preference and tries to balance load (skips people already at 3+ for this event).
async function autoFillRotation(){
  if (!requireAdmin()) return;
  const eid = state.selectedEventId;
  if (!eid){ alert("Pick an event first."); return; }
  const tasks = state.tasks.filter(t=>t.eventId===eid && (!t.assigned || t.assigned.length===0));
  if (tasks.length === 0){ alert("Every task already has at least one volunteer assigned."); return; }
  if (!confirm(`Auto-assign ${tasks.length} unassigned task(s) for this event?\nAdmin can still edit each one afterwards.`)) return;

  const CAP = 3; // don't put more than 3 tasks on any single person during auto-fill
  let assigned = 0;
  for (const t of tasks){
    const ranked = suggestVolunteersForTask(t);
    const pick = ranked.find(p => taskCountForPerson(p.id, eid) < CAP);
    if (!pick) continue;
    t.assigned = [pick.id];
    await storage.update("tasks", t.id, {assigned: t.assigned});
    assigned++;
  }
  logActivity(`Auto-filled ${assigned} task(s) by rotation`);
  alert(`Assigned ${assigned} task(s). Scroll down to review and adjust.`);
  render();
}

// ---------- Excel export (uses SheetJS loaded via CDN in index.html) ----------
async function exportEventToExcel(){
  const eid = state.selectedEventId;
  const ev  = state.events.find(e=>e.id===eid);
  if (!ev){ alert("Pick an event first."); return; }
  if (typeof XLSX === "undefined"){ alert("Excel library didn't load. Check your internet connection."); return; }

  const safeName = ev.name.replace(/[^a-z0-9]+/gi, "_");
  const wb = XLSX.utils.book_new();

  // Sheet 1 — Tasks & assignments
  const taskRows = state.tasks.filter(t=>t.eventId===eid).map(t=>({
    Category: t.category || "",
    Task: t.title,
    "Assigned to": (t.assigned||[]).map(pid=>state.people.find(p=>p.id===pid)?.name).filter(Boolean).join(", "),
    Status: t.done ? "Done" : "To do",
    "Est. hours": t.hours || "",
    Notes: t.notes || "",
  }));
  if (taskRows.length === 0) taskRows.push({Category:"", Task:"(no tasks)", "Assigned to":"", Status:"", "Est. hours":"", Notes:""});
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), "Tasks");

  // Sheet 2 — Per-person summary for this event
  const involvedIds = new Set(state.tasks.filter(t=>t.eventId===eid).flatMap(t=>t.assigned||[]));
  const peopleRows = [...involvedIds].map(pid=>{
    const p = state.people.find(pp=>pp.id===pid);
    if (!p) return null;
    const theirTasks = state.tasks.filter(t=>t.eventId===eid && (t.assigned||[]).includes(pid));
    return {
      Name: p.name,
      Teams: (p.teams||[]).join(", "),
      "Task count": theirTasks.length,
      Tasks: theirTasks.map(t=>t.title).join("; "),
    };
  }).filter(Boolean).sort((a,b)=>b["Task count"]-a["Task count"]);
  if (peopleRows.length === 0) peopleRows.push({Name:"(no one assigned yet)", Teams:"", "Task count":0, Tasks:""});
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(peopleRows), "People");

  // Sheet 3 — Expenses
  const expRows = state.expenses.filter(x=>x.eventId===eid).map(x=>({
    Item: x.item, Category: x.category||"", Planned: Number(x.planned)||0,
    Actual: Number(x.actual)||0, "Paid by": x.paidBy||"",
  }));
  if (expRows.length > 0){
    const planned = expRows.reduce((s,r)=>s+r.Planned,0);
    const actual  = expRows.reduce((s,r)=>s+r.Actual,0);
    expRows.push({Item:"TOTAL", Category:"", Planned:planned, Actual:actual, "Paid by":""});
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), "Budget");
  }

  const dateStr = ev.date || new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `NLC_${safeName}_${dateStr}.xlsx`);
  logActivity(`Exported "${ev.name}" to Excel`);
}

function renderBudget(){
  const eid = state.selectedBudgetEventId;
  const rows = document.getElementById("expenseRows");
  const list = state.expenses.filter(x=>x.eventId===eid);
  const planned = list.reduce((s,x)=>s+(Number(x.planned)||0),0);
  const actual  = list.reduce((s,x)=>s+(Number(x.actual)||0),0);
  document.getElementById("sumPlanned").textContent   = fmtMoney(planned);
  document.getElementById("sumActual").textContent    = fmtMoney(actual);
  document.getElementById("sumRemaining").textContent = fmtMoney(planned-actual);

  if (!eid){ rows.innerHTML = `<tr><td colspan="6" class="muted">Pick an event to view expenses.</td></tr>`; return; }
  if (list.length===0){ rows.innerHTML = `<tr><td colspan="6" class="muted">No expenses yet.</td></tr>`; return; }
  rows.innerHTML = list.map(x=>`
    <tr>
      <td>${escapeHtml(x.item)}</td>
      <td>${escapeHtml(x.category||"")}</td>
      <td>${fmtMoney(x.planned)}</td>
      <td>${fmtMoney(x.actual)}</td>
      <td>${escapeHtml(x.paidBy||"")}</td>
      <td>
        <button class="btn btn-ghost admin-only" data-x-edit="${x.id}">Edit</button>
        <button class="btn btn-danger admin-only" data-x-del="${x.id}">×</button>
      </td>
    </tr>`).join("");
  rows.querySelectorAll("[data-x-edit]").forEach(b=>b.addEventListener("click",()=>openExpenseModal(b.dataset.xEdit)));
  rows.querySelectorAll("[data-x-del]").forEach(b=>b.addEventListener("click",()=>deleteExpense(b.dataset.xDel)));
}

// =======================================================
//                  ROTATION SUGGESTION
// =======================================================
// For a given task, prefer:
//   1. People on the matching team (if the category maps to one)
//   2. People who were NOT assigned in the most recent past event
//   3. People with fewest past assignments overall
function suggestVolunteersForTask(task){
  const eventDate = new Date(state.events.find(ev=>ev.id===task.eventId)?.date || Date.now());
  const pastEvents = [...state.events]
    .filter(e=> new Date(e.date) < eventDate)
    .sort(byDateDesc);
  const lastEvent = pastEvents[0];
  const lastEventPeople = new Set(
    state.tasks.filter(t=>t.eventId===lastEvent?.id).flatMap(t=>t.assigned||[])
  );
  const tally = {};
  state.tasks.filter(t=>t.eventId !== task.eventId).forEach(t=>{
    (t.assigned||[]).forEach(pid=>{ tally[pid]=(tally[pid]||0)+1; });
  });
  const teamName = CATEGORY_TEAM[task.category];
  const assignedHere = new Set(task.assigned||[]);
  return state.people
    .filter(p=>!assignedHere.has(p.id))
    .sort((a,b)=>{
      // Prefer team members first
      if (teamName){
        const aIn = (a.teams||[]).includes(teamName) ? 0 : 1;
        const bIn = (b.teams||[]).includes(teamName) ? 0 : 1;
        if (aIn !== bIn) return aIn - bIn;
      }
      const aWas = lastEventPeople.has(a.id) ? 1 : 0;
      const bWas = lastEventPeople.has(b.id) ? 1 : 0;
      if (aWas !== bWas) return aWas - bWas;
      return (tally[a.id]||0) - (tally[b.id]||0);
    });
}

async function applySuggestion(taskId){
  const t = state.tasks.find(x=>x.id===taskId); if(!t) return;
  const suggestion = suggestVolunteersForTask(t);
  if (!suggestion.length) return;
  const pick = suggestion[0];
  t.assigned = [...(t.assigned||[]), pick.id];
  await storage.update("tasks", t.id, {assigned: t.assigned});
  logActivity(`Assigned ${pick.name} to "${t.title}" via rotation suggestion.`);
  renderTasks(); renderOverview();
}

// =======================================================
//                  EVENT / TASK / PEOPLE / EXPENSE CRUD
// =======================================================
function openEventModal(id){
  if (!requireAdmin()) return;
  const existing = id ? state.events.find(e=>e.id===id) : {};
  openModal("Event details", `
    <label>Name</label><input class="input" name="name" value="${escapeAttr(existing.name||"")}" required />
    <div class="row">
      <div><label>Date</label><input class="input" type="date" name="date" value="${existing.date||""}" required /></div>
      <div><label>Location</label><input class="input" name="location" value="${escapeAttr(existing.location||"Church")}" /></div>
    </div>
    <label>Description</label><textarea class="input" name="description" rows="2">${escapeHtml(existing.description||"")}</textarea>
    <div class="modal-actions">
      ${id?`<button type="button" class="btn btn-danger" data-del>Delete</button>`:""}
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary">Save</button>
    </div>
  `, async (data, form)=>{
    if (form._deleted){ await deleteEvent(id); return; }
    if (id){
      await storage.update("events", id, data);
      Object.assign(state.events.find(e=>e.id===id), data);
      logActivity(`Updated event "${data.name}"`);
    } else {
      const newId = await storage.add("events", data);
      localPush("events", {id:newId, ...data});
      state.selectedEventId = newId;
      state.selectedBudgetEventId = newId;
      logActivity(`Added event "${data.name}"`);
    }
    render();
  });
}

async function deleteEvent(id){
  if (!state.isAdmin) return;
  const e = state.events.find(x=>x.id===id); if (!e) return;
  if (!confirm(`Delete event "${e.name}" and its tasks/expenses?`)) return;
  const tasks = state.tasks.filter(t=>t.eventId===id);
  const exps  = state.expenses.filter(x=>x.eventId===id);
  for (const t of tasks) await storage.remove("tasks", t.id);
  for (const x of exps)  await storage.remove("expenses", x.id);
  await storage.remove("events", id);
  state.events   = state.events.filter(x=>x.id!==id);
  state.tasks    = state.tasks.filter(t=>t.eventId!==id);
  state.expenses = state.expenses.filter(x=>x.eventId!==id);
  logActivity(`Deleted event "${e.name}"`);
  render(); closeModal();
}

function openTaskModal(id){
  if (!requireAdmin()) return;
  if (!state.selectedEventId){ alert("Pick an event first."); return; }
  const existing = id ? state.tasks.find(t=>t.id===id) : {};
  openModal(id?"Edit task":"New task", `
    <label>Title</label><input class="input" name="title" value="${escapeAttr(existing.title||"")}" required />
    <div class="row">
      <div><label>Category</label>
        <select class="input" name="category">
          ${CATEGORIES.map(c=>`<option ${existing.category===c?"selected":""}>${c}</option>`).join("")}
        </select>
      </div>
      <div><label>Estimated hours</label><input class="input" type="number" min="0" step="0.5" name="hours" value="${existing.hours||""}" /></div>
    </div>
    <label>Notes</label><textarea class="input" name="notes" rows="2">${escapeHtml(existing.notes||"")}</textarea>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary">Save</button>
    </div>
  `, async (data)=>{
    data.eventId = state.selectedEventId;
    data.hours   = Number(data.hours||0);
    if (id){
      await storage.update("tasks", id, data);
      Object.assign(state.tasks.find(t=>t.id===id), data);
      logActivity(`Updated task "${data.title}"`);
    } else {
      data.done = false; data.assigned = [];
      const newId = await storage.add("tasks", data);
      localPush("tasks", {id:newId, ...data});
      logActivity(`Added task "${data.title}"`);
    }
    render();
  });
}

async function deleteTask(id){
  if (!state.isAdmin) return;
  const t = state.tasks.find(x=>x.id===id); if(!t) return;
  if (!confirm(`Delete task "${t.title}"?`)) return;
  await storage.remove("tasks", id);
  state.tasks = state.tasks.filter(x=>x.id!==id);
  logActivity(`Deleted task "${t.title}"`);
  renderTasks(); renderOverview();
}

async function toggleDone(id){
  if (!requireAdmin()) return;
  const t = state.tasks.find(x=>x.id===id); if(!t) return;
  t.done = !t.done;
  await storage.update("tasks", id, {done:t.done});
  logActivity(`${t.done?"Completed":"Reopened"} "${t.title}"`);
  render();
}

async function assignPerson(sel){
  if (!requireAdmin()) return;
  const taskId = sel.dataset.assign; const personId = sel.value; if (!personId) return;
  const t = state.tasks.find(x=>x.id===taskId); if(!t) return;
  t.assigned = [...(t.assigned||[]), personId];
  await storage.update("tasks", taskId, {assigned:t.assigned});
  const p = state.people.find(p=>p.id===personId);
  logActivity(`Assigned ${p?.name||""} to "${t.title}"`);
  render();
}

async function unassignPerson(taskId, personId){
  if (!requireAdmin()) return;
  const t = state.tasks.find(x=>x.id===taskId); if(!t) return;
  t.assigned = (t.assigned||[]).filter(pid=>pid!==personId);
  await storage.update("tasks", taskId, {assigned:t.assigned});
  const p = state.people.find(p=>p.id===personId);
  logActivity(`Removed ${p?.name||""} from "${t.title}"`);
  render();
}

function openPersonModal(id){
  if (!requireAdmin()) return;
  const existing = id ? state.people.find(p=>p.id===id) : {};
  const currentTeams = existing.teams || [];
  const teamBoxes = teamNames().map(tm=>`
    <label class="check-row">
      <input type="checkbox" name="team_${tm}" ${currentTeams.includes(tm)?"checked":""} />
      <span>${escapeHtml(tm)}</span>
    </label>`).join("");
  openModal(id?"Edit person":"New person", `
    <label>Name</label><input class="input" name="name" value="${escapeAttr(existing.name||"")}" required />
    <label>Teams</label>
    <div class="check-list" style="max-height:none;padding:6px">${teamBoxes}</div>
    <label>Notes (optional)</label>
    <input class="input" name="notes" value="${escapeAttr(existing.notes||"")}" placeholder="e.g. can also help with kitchen" />
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary">Save</button>
    </div>
  `, async (data)=>{
    const teams = teamNames().filter(tm=>data[`team_${tm}`]==="on");
    const payload = {name:data.name, notes:data.notes||"", teams};
    if (id){
      await storage.update("people", id, payload);
      Object.assign(state.people.find(p=>p.id===id), payload);
      logActivity(`Updated "${payload.name}"`);
    } else {
      const newId = await storage.add("people", payload);
      localPush("people", {id:newId, ...payload});
      logActivity(`Added "${payload.name}"`);
    }
    render();
  });
}

async function deletePerson(id){
  if (!state.isAdmin) return;
  const p = state.people.find(x=>x.id===id); if(!p) return;
  if (!confirm(`Remove volunteer "${p.name}"?`)) return;
  await storage.remove("people", id);
  state.people = state.people.filter(x=>x.id!==id);
  // also unassign from tasks
  for (const t of state.tasks){
    if ((t.assigned||[]).includes(id)){
      t.assigned = t.assigned.filter(x=>x!==id);
      await storage.update("tasks", t.id, {assigned:t.assigned});
    }
  }
  logActivity(`Removed volunteer "${p.name}"`);
  renderPeople(); renderTasks();
}

function openExpenseModal(id){
  if (!requireAdmin()) return;
  if (!state.selectedBudgetEventId){ alert("Pick an event first."); return; }
  const existing = id ? state.expenses.find(x=>x.id===id) : {};
  openModal(id?"Edit expense":"New expense", `
    <label>Item</label><input class="input" name="item" value="${escapeAttr(existing.item||"")}" required />
    <div class="row">
      <div><label>Category</label>
        <select class="input" name="category">
          ${["Decoration","Food","Shopping","Hospitality","Kids","Media","Other"]
            .map(c=>`<option ${existing.category===c?"selected":""}>${c}</option>`).join("")}
        </select>
      </div>
      <div><label>Paid by</label><input class="input" name="paidBy" value="${escapeAttr(existing.paidBy||"")}" /></div>
    </div>
    <div class="row">
      <div><label>Planned (€)</label><input class="input" type="number" step="0.01" name="planned" value="${existing.planned||""}" /></div>
      <div><label>Actual (€)</label><input class="input" type="number" step="0.01" name="actual" value="${existing.actual||""}" /></div>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary">Save</button>
    </div>
  `, async (data)=>{
    data.eventId = state.selectedBudgetEventId;
    data.date = data.date || new Date().toISOString().slice(0,10);
    data.planned = Number(data.planned||0);
    data.actual  = Number(data.actual||0);
    if (id){
      await storage.update("expenses", id, data);
      Object.assign(state.expenses.find(x=>x.id===id), data);
      logActivity(`Updated expense "${data.item}"`);
    } else {
      const newId = await storage.add("expenses", data);
      localPush("expenses", {id:newId, ...data});
      logActivity(`Added expense "${data.item}" (€${data.actual||data.planned})`);
    }
    renderBudget(); renderOverview();
  });
}

async function deleteExpense(id){
  if (!state.isAdmin) return;
  const x = state.expenses.find(e=>e.id===id); if(!x) return;
  if (!confirm(`Delete expense "${x.item}"?`)) return;
  await storage.remove("expenses", id);
  state.expenses = state.expenses.filter(e=>e.id!==id);
  renderBudget(); renderOverview();
}

// Standard task templates — the user picks which ones to add
const STANDARD_TASKS = [
  {category:"Decoration", title:"Venue decoration"},
  {category:"Decoration", title:"Chair covers & cloth setup"},
  {category:"Decoration", title:"Table cloth setup"},
  {category:"Shopping",   title:"Procure decorations"},
  {category:"Shopping",   title:"Procure table & chair cloths"},
  {category:"Shopping",   title:"Procure disposables (plates, cups, napkins)"},
  {category:"Food",       title:"Meal preparation"},
  {category:"Food",       title:"Dessert / sweet preparation"},
  {category:"Hospitality",title:"Starter service"},
  {category:"Hospitality",title:"Main course service"},
  {category:"Hospitality",title:"Tea & beverage service"},
  {category:"Media",      title:"Sound & AV"},
  {category:"Media",      title:"Slide projection"},
  {category:"Media",      title:"Photography"},
  {category:"Media",      title:"Videography"},
  {category:"Music",      title:"Worship & music ministry"},
  {category:"Ushering",   title:"Door ushering & welcome"},
  {category:"Ushering",   title:"Seating coordination"},
  {category:"Games",      title:"Games coordination"},
  {category:"Games",      title:"Games support volunteers"},
  {category:"Kids",       title:"Kids ministry / child-minding"},
  {category:"Setup/Cleanup", title:"Chair & table arrangement"},
  {category:"Setup/Cleanup", title:"Dish washing"},
  {category:"Setup/Cleanup", title:"Venue cleanup", hours:2, notes:"~2 hours with 4 people (chairs, bins, sweeping)"},
  {category:"Setup/Cleanup", title:"Storage of supplies"},
];

function seedStandardTasks(){
  if (!requireAdmin()) return;
  if (!state.selectedEventId){ alert("Pick an event first."); return; }
  const rows = STANDARD_TASKS.map((tpl,i)=>`
    <label class="check-row">
      <input type="checkbox" name="seed_${i}" checked />
      <span class="cat ${catCss(tpl.category)}">${escapeHtml(tpl.category)}</span>
      <span>${escapeHtml(tpl.title)}</span>
    </label>`).join("");
  openModal("Add from standard list", `
    <p class="muted small">Tick only the ones you need for this event. You can always edit or delete later.</p>
    <div style="display:flex;gap:8px;margin:6px 0 4px">
      <button type="button" class="btn btn-ghost" id="seedAllBtn">Select all</button>
      <button type="button" class="btn btn-ghost" id="seedNoneBtn">Clear all</button>
    </div>
    <div class="check-list">${rows}</div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button class="btn btn-primary">Add selected</button>
    </div>
  `, async (data)=>{
    let count = 0;
    for (let i=0; i<STANDARD_TASKS.length; i++){
      if (data[`seed_${i}`] === "on"){
        const d = {...STANDARD_TASKS[i], eventId: state.selectedEventId, done:false, assigned:[]};
        const newId = await storage.add("tasks", d);
        localPush("tasks", {id:newId, ...d});
        count++;
      }
    }
    logActivity(`Added ${count} standard tasks`);
    render();
  });
  // Wire select-all / clear-all (elements live inside the modal)
  setTimeout(()=>{
    document.getElementById("seedAllBtn")?.addEventListener("click",()=>{
      document.querySelectorAll('#modal input[type=checkbox][name^="seed_"]').forEach(c=>c.checked=true);
    });
    document.getElementById("seedNoneBtn")?.addEventListener("click",()=>{
      document.querySelectorAll('#modal input[type=checkbox][name^="seed_"]').forEach(c=>c.checked=false);
    });
  }, 0);
}

// Summary view: grouped by category, shareable
function renderSummary(){
  const card = document.getElementById("summaryCard");
  const eid = state.selectedEventId;
  const tasks = state.tasks.filter(t=>t.eventId===eid);
  if (!eid || tasks.length===0){ card.style.display = "none"; return; }
  card.style.display = "block";

  const ev = state.events.find(e=>e.id===eid);
  const total = tasks.length;
  const withPeople = tasks.filter(t=>(t.assigned||[]).length>0).length;
  const needs = total - withPeople;
  const done  = tasks.filter(t=>t.done).length;

  document.getElementById("summaryTitle").textContent =
    `Summary — ${ev?.name || ""} · ${fmtDate(ev?.date)}`;
  document.getElementById("summaryCounts").innerHTML =
    `${total} tasks · <b>${withPeople}</b> assigned · <b class="need">${needs}</b> still need a volunteer · ${done} done`;

  // Group by category
  const groups = {};
  tasks.forEach(t=>{
    const c = t.category || "General";
    (groups[c] = groups[c] || []).push(t);
  });

  const body = document.getElementById("summaryBody");
  body.innerHTML = Object.keys(groups).sort().map(cat=>`
    <div class="sum-group">
      <div class="sum-cat ${catCss(cat)}">${escapeHtml(cat)}</div>
      <ul class="sum-list">
        ${groups[cat].map(t=>{
          const names = (t.assigned||[]).map(pid=>state.people.find(p=>p.id===pid)?.name).filter(Boolean).join(", ");
          const cls = names ? "" : "unassigned";
          const mark = t.done ? "✓" : "•";
          return `<li class="${cls}">
            <span class="mk">${mark}</span>
            <span class="tt">${escapeHtml(t.title)}</span>
            <span class="pp">${names ? escapeHtml(names) : "needs volunteer"}</span>
          </li>`;
        }).join("")}
      </ul>
    </div>`).join("");

  document.getElementById("btnCopyWhatsApp").onclick = copyForWhatsApp;
  document.getElementById("btnPrintSummary").onclick = printSummary;
  document.getElementById("btnExportExcel").onclick = exportEventToExcel;
}

function buildWhatsAppText(){
  const eid = state.selectedEventId;
  const ev  = state.events.find(e=>e.id===eid);
  const tasks = state.tasks.filter(t=>t.eventId===eid);
  if (!ev || tasks.length===0) return "";

  const groups = {};
  tasks.forEach(t=>{
    const c = t.category || "General";
    (groups[c] = groups[c] || []).push(t);
  });

  let txt = `*${ev.name}*\n${fmtDate(ev.date)}${ev.location?` · ${ev.location}`:""}\n\n`;
  Object.keys(groups).sort().forEach(cat=>{
    txt += `*${cat.toUpperCase()}*\n`;
    groups[cat].forEach(t=>{
      const names = (t.assigned||[]).map(pid=>state.people.find(p=>p.id===pid)?.name).filter(Boolean).join(", ");
      const prefix = t.done ? "✅" : "▫️";
      txt += `${prefix} ${t.title}${names?` — ${names}`:` — _needs a volunteer_`}\n`;
    });
    txt += `\n`;
  });
  txt += `🙏 Please confirm your tasks. Thank you!\n— New Life Church Dublin`;
  return txt;
}

async function copyForWhatsApp(){
  const text = buildWhatsAppText();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied! Paste into your WhatsApp group.");
  } catch {
    // Fallback for contexts where clipboard API is blocked
    window.prompt("Copy this message (Ctrl+C, then Enter):", text);
  }
}

function printSummary(){
  const text = buildWhatsAppText();
  if (!text) return;
  const w = window.open("", "_blank");
  w.document.write(`<pre style="font-family:Segoe UI,Arial;font-size:14px;white-space:pre-wrap;padding:24px">${escapeHtml(text)}</pre>`);
  w.document.close(); w.focus(); w.print();
}

// =======================================================
//                      MODAL HELPER
// =======================================================
function openModal(title, innerHTML, onSubmit){
  const m = document.getElementById("modal");
  document.getElementById("modalTitle").textContent = title;
  const form = document.getElementById("modalForm");
  form.innerHTML = innerHTML;
  form._submitting = false;
  form.onsubmit = async (e)=>{
    e.preventDefault();
    if (form._submitting) return;
    form._submitting = true;
    const saveBtn = form.querySelector('button.btn-primary');
    if (saveBtn) saveBtn.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await onSubmit(data, form);
      closeModal();
    } finally {
      form._submitting = false;
      if (saveBtn) saveBtn.disabled = false;
    }
  };
  form.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click", closeModal));
  const delBtn = form.querySelector("[data-del]");
  if (delBtn) delBtn.addEventListener("click", ()=>{ form._deleted = true; form.requestSubmit(); });
  m.classList.remove("hidden");
}
function closeModal(){ document.getElementById("modal").classList.add("hidden"); }

// =======================================================
//                       HELPERS
// =======================================================
function logActivity(text){
  const entry = {text, ts: Date.now()};
  localPush("activity", entry);
  storage.add("activity", entry);
  renderOverview();
}
function byDateAsc(a,b){ return new Date(a.date||0) - new Date(b.date||0) }
function byDateDesc(a,b){ return new Date(b.date||0) - new Date(a.date||0) }
function startOfToday(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function fmtDate(s){ if(!s) return "—"; const d=new Date(s); return d.toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short",year:"numeric"}); }
function fmtMoney(n){ n = Number(n||0); return "€" + n.toLocaleString(undefined,{minimumFractionDigits:0, maximumFractionDigits:2}); }
function timeAgo(ts){ if(!ts) return ""; const s=Math.floor((Date.now()-ts)/1000); if(s<60) return s+"s ago"; const m=Math.floor(s/60); if(m<60) return m+"m ago"; const h=Math.floor(m/60); if(h<24) return h+"h ago"; return Math.floor(h/24)+"d ago"; }
function initials(name){ return (name||"?").split(/\s+/).map(p=>p[0]||"").slice(0,2).join("").toUpperCase(); }
function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function escapeAttr(s){ return escapeHtml(s); }
function catCss(c){ c=(c||"").toLowerCase(); if(c.includes("decor")||c.includes("shop")) return "decor"; if(c.includes("food")||c.includes("hospit")) return "food"; if(c.includes("media")) return "media"; if(c.includes("music")) return "music"; if(c.includes("usher")) return "usher"; if(c.includes("kid")) return "kids"; if(c.includes("clean")||c.includes("setup")) return "clean"; return ""; }
function teamCss(t){ t=(t||"").toLowerCase(); if(t==="media") return "media"; if(t==="music") return "music"; if(t==="ushering") return "usher"; if(t==="kids") return "kids"; if(t==="leadership") return "lead"; return ""; }

// =======================================================
//                   STORAGE ADAPTERS
// =======================================================
function createLocalStorageAdapter(){
  const key = "nlc_dashboard_v1";
  let db = JSON.parse(localStorage.getItem(key) || "null") || {events:[],tasks:[],people:[],expenses:[],activity:[]};
  const save = () => localStorage.setItem(key, JSON.stringify(db));
  const uid = () => Math.random().toString(36).slice(2,10)+Date.now().toString(36);
  return {
    async init(){ save(); },
    async list(coll){ db[coll] = db[coll] || []; return [...db[coll]]; },
    async add(coll, data){ db[coll] = db[coll] || []; const id=uid(); db[coll].push({id,...data}); save(); return id; },
    async update(coll, id, patch){ db[coll] = db[coll] || []; const i=db[coll].findIndex(x=>x.id===id); if(i>=0){ db[coll][i]={...db[coll][i],...patch}; save(); } },
    async remove(coll, id){ db[coll] = (db[coll]||[]).filter(x=>x.id!==id); save(); },
  };
}

function createFirestoreAdapter(db, fs){
  const { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, onSnapshot } = fs;
  return {
    async init(){
      // Live sync: refresh UI when any collection changes remotely (or locally)
      ["events","tasks","people","expenses","activity","teams"].forEach(name=>{
        onSnapshot(collection(db,name), snap=>{
          state[name] = snap.docs.map(d=>({id:d.id, ...d.data()}));
          render();
        });
      });
    },
    async list(coll){
      const snap = await getDocs(collection(db, coll));
      return snap.docs.map(d=>({id:d.id, ...d.data()}));
    },
    async add(coll, data){ const ref = await addDoc(collection(db, coll), data); return ref.id; },
    async update(coll, id, patch){ await updateDoc(doc(db, coll, id), patch); },
    async remove(coll, id){ await deleteDoc(doc(db, coll, id)); },
  };
}
