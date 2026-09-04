const STORAGE_KEY = "space-planner-cloud-fallback-v2";
const ACTIVE_VIEW_KEY = "space-planner-active-view-v1";
let storageScope = "anonymous";
const scopedStorageKey = () => `${STORAGE_KEY}-${storageScope}`;
const STATUS = { available:"ว่าง", hold:"จองชั่วคราว", confirmed:"ยืนยันแล้ว", setup:"กำลังติดตั้ง" };
const DEFAULT_OBJECT_SCALE = .68;
const DEFAULT_BACKGROUND_OPACITY = .35;
const DEFAULT_SLOT_IDS = [...Array.from({ length:24 }, (_, index) => String(index + 1)), "EVENT"];
const INITIAL_RECTS = {
  1:[45.6,24.9,5.68,7.3],2:[51.28,24.9,5.68,7.3],3:[56.96,24.9,5.68,7.3],4:[62.64,24.9,5.68,7.3],5:[68.32,24.9,5.68,7.3],6:[74,24.9,5.68,7.3],
  13:[26.3,34.1,5.35,7.8],14:[31.65,34.1,5.45,7.8],15:[26.3,48.25,5.35,7.8],16:[31.65,48.25,5.45,7.8],
  11:[45.55,38.9,4.9,7.8],12:[45.55,46.7,4.9,7.9],9:[69.45,38.9,4.75,7.8],10:[69.45,46.7,4.75,7.9],7:[78.75,38.9,5.05,7.8],8:[78.75,46.7,5.05,7.9],
  17:[38.1,60.95,5.25,7.6],18:[43.35,60.95,5.25,7.6],21:[59.05,59.85,5.45,7.9],22:[64.5,59.85,5.45,7.9],23:[75.4,59.85,5.65,7.9],24:[81.05,59.85,5.65,7.9],
  19:[38.15,74.7,5.25,7.7],20:[38.15,82.4,5.25,7.7],EVENT:[52.75,36.25,14.75,20.5],
};

const blankAssignment = () => ({ shopName:"", category:"", status:"available", startDate:"", endDate:"", contact:"", phone:"", email:"", notes:"" });
const clone = value => JSON.parse(JSON.stringify(value));
const round = value => Math.round(value * 10) / 10;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const escapeHTML = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
const slotLabel = (id, geometry=null) => (geometry?.kind === "stage" || id === "EVENT" || id.startsWith("STAGE")) ? (id === "EVENT" ? "EVENT SPACE" : `เวที ${id.replace("STAGE-","")}`) : `บูธ ${id}`;

function baseDimensions(id, geometry=null) { return geometry?.kind === "stage" || id === "EVENT" || id.startsWith("STAGE") ? [4,4] : [2,2]; }
function defaultLayout() {
  return Object.fromEntries(DEFAULT_SLOT_IDS.map(id => {
    const [left, top, width, height] = INITIAL_RECTS[id];
    const kind = id === "EVENT" ? "stage" : "booth";
    const [widthM, depthM] = baseDimensions(id,{kind});
    return [id, { left, top, width, height, widthM, depthM, scaleX:width/widthM, scaleY:height/depthM, rotation:0, kind, locked:false }];
  }));
}
function defaultSpaces() { return Object.fromEntries(DEFAULT_SLOT_IDS.map(id => [id, { assignment:blankAssignment() }])); }
function defaultColumns() { return {}; }
function defaultGuides() { return {}; }
function createEvent(name="งานกิจกรรมใหม่", layout=defaultLayout(), columns=defaultColumns(), guides=defaultGuides()) {
  const now = Date.now();
  const spaces=Object.fromEntries(Object.keys(layout).map(id=>[id,{assignment:blankAssignment()}]));
  return { id:uid("event"), name, startDate:"", endDate:"", archived:false, status:"draft", draftDirty:false, createdAt:now, updatedAt:now, spaces, draftLayout:clone(layout), publishedLayout:clone(layout), draftColumns:clone(columns), publishedColumns:clone(columns), draftGuides:clone(guides), publishedGuides:clone(guides), draftObjectScale:DEFAULT_OBJECT_SCALE, publishedObjectScale:DEFAULT_OBJECT_SCALE, draftBackgroundOpacity:DEFAULT_BACKGROUND_OPACITY, publishedBackgroundOpacity:DEFAULT_BACKGROUND_OPACITY, draftOnlyIds:[], pendingRemovedIds:[], versions:[] };
}
function initialPlanner() {
  const event = createEvent("Matcha Taste");
  event.spaces["1"].assignment = { ...blankAssignment(), shopName:"Uji House", category:"ชาเขียวพรีเมียม", status:"confirmed" };
  event.spaces.EVENT.assignment = { ...blankAssignment(), shopName:"Matcha Tasting Stage", category:"กิจกรรมชิมและสาธิต", status:"confirmed" };
  return { schemaVersion:2, activeEventId:event.id, events:[event], updatedAt:Date.now() };
}
function migrateLegacy(legacy) {
  const planner = initialPlanner();
  const event = planner.events[0];
  if (legacy?.spaces) {
    for (const id of DEFAULT_SLOT_IDS) {
      const old = legacy.spaces[id];
      if (!old) continue;
      event.spaces[id].assignment = { ...blankAssignment(), ...(old.assignment || {}) };
      const area = Number(old.area);
      if (Number.isFinite(area) && area > 0) {
        const side = round(Math.sqrt(area));
        event.draftLayout[id].widthM = side;
        event.draftLayout[id].depthM = side;
        event.publishedLayout[id].widthM = side;
        event.publishedLayout[id].depthM = side;
      }
    }
  }
  return planner;
}
function normalizePlanner(input) {
  if (!input?.events?.length) return initialPlanner();
  input.schemaVersion = 2;
  input.events.forEach(event => {
    event.spaces ||= defaultSpaces();
    event.draftLayout ||= defaultLayout();
    event.publishedLayout ||= clone(event.draftLayout);
    event.draftObjectScale=clamp(Number(event.draftObjectScale)||DEFAULT_OBJECT_SCALE,.4,1.2);
    event.publishedObjectScale=clamp(Number(event.publishedObjectScale)||event.draftObjectScale,.4,1.2);
    event.draftBackgroundOpacity=clamp(Number(event.draftBackgroundOpacity)||DEFAULT_BACKGROUND_OPACITY,.08,1);
    event.publishedBackgroundOpacity=clamp(Number(event.publishedBackgroundOpacity)||event.draftBackgroundOpacity,.08,1);
    event.draftColumns ||= clone(event.publishedColumns || defaultColumns());
    event.publishedColumns ||= clone(event.draftColumns || defaultColumns());
    for (const column of [...Object.values(event.draftColumns),...Object.values(event.publishedColumns)]) {
      column.left=clamp(Number(column.left)||50,0,100);column.top=clamp(Number(column.top)||50,0,100);column.size=clamp(Number(column.size)||3,.3,8);column.locked=Boolean(column.locked);
    }
    event.draftGuides ||= clone(event.publishedGuides || defaultGuides());
    event.publishedGuides ||= clone(event.draftGuides || defaultGuides());
    for (const guide of [...Object.values(event.draftGuides),...Object.values(event.publishedGuides)]) {
      guide.left=clamp(Number(guide.left)||50,0,100);guide.top=clamp(Number(guide.top)||50,0,100);guide.lengthM=clamp(Number(guide.lengthM)||1.2,.1,30);guide.orientation=guide.orientation==="vertical"?"vertical":"horizontal";guide.locked=Boolean(guide.locked);
    }
    event.versions ||= [];
    event.draftOnlyIds ||= [];
    event.pendingRemovedIds ||= [];
    const ids = new Set([...Object.keys(event.spaces),...Object.keys(event.draftLayout),...Object.keys(event.publishedLayout)]);
    for (const id of ids) {
      event.spaces[id] ||= { assignment:blankAssignment() };
      event.spaces[id].assignment = { ...blankAssignment(), ...(event.spaces[id].assignment || {}) };
      const fallback = defaultLayout()[id] || { left:42,top:66,width:5.4,height:7.6,widthM:2,depthM:2,kind:id.startsWith("STAGE")?"stage":"booth",locked:false };
      if (!event.draftLayout[id] && !event.pendingRemovedIds.includes(id)) event.draftLayout[id] = clone(fallback);
      if (!event.publishedLayout[id] && !event.draftOnlyIds.includes(id)) event.publishedLayout[id] = clone(event.draftLayout[id] || fallback);
      for (const geometry of [event.draftLayout[id],event.publishedLayout[id]].filter(Boolean)) {
        geometry.kind ||= (id === "EVENT" || id.startsWith("STAGE")) ? "stage" : "booth";
        geometry.widthM = Number(geometry.widthM) || baseDimensions(id,geometry)[0];
        geometry.depthM = Number(geometry.depthM) || baseDimensions(id,geometry)[1];
        geometry.scaleX ||= geometry.width / geometry.widthM;
        geometry.scaleY ||= geometry.height / geometry.depthM;
        geometry.rotation=((Number(geometry.rotation)||0)%360+360)%360;
      }
    }
  });
  if (!input.events.some(event => event.id === input.activeEventId)) input.activeEventId = input.events[0].id;
  return input;
}

let state = loadFallback();
let cloudRevision = 0;
let selectedId = null;
let swapSource = null;
let draggedId = null;
const storedActiveView = localStorage.getItem(ACTIVE_VIEW_KEY);
let activeView = ["interactive","reference","layout"].includes(storedActiveView) ? storedActiveView : "interactive";
let viewZoom = clamp(Number(localStorage.getItem("space-planner-view-zoom")) || 100,75,180);
let history = [];
let isSaving = false;
let queuedSaves = 0;
let saveTail = Promise.resolve(true);
let toastTimer;
let memberProfile = { authenticated:false, access:false, role:"visitor" };

const stage = document.querySelector("#planStage");
const planScroll = document.querySelector("#planScroll");
const zoneLayer = document.querySelector("#zoneLayer");
const spaceForm = document.querySelector("#spaceForm");
const layoutForm = document.querySelector("#layoutForm");
const columnForm = document.querySelector("#columnForm");
const guideForm = document.querySelector("#guideForm");
const emptyEditor = document.querySelector("#emptyEditor");
const toast = document.querySelector("#toast");
const libraryDialog = document.querySelector("#libraryDialog");
const membersDialog = document.querySelector("#membersDialog");

function loadFallback() {
  try { const value = JSON.parse(localStorage.getItem(scopedStorageKey())); if (value?.events) return normalizePlanner(value); } catch (_) {}
  return initialPlanner();
}
function currentEvent() { return state.events.find(event => event.id === state.activeEventId) || state.events[0]; }
function activeLayout() { const event = currentEvent(); return activeView === "layout" ? event.draftLayout : event.publishedLayout; }
function activeColumns() { const event = currentEvent(); return activeView === "layout" ? event.draftColumns : event.publishedColumns; }
function activeGuides() { const event = currentEvent(); return activeView === "layout" ? event.draftGuides : event.publishedGuides; }
function activeObjectScale() { const event=currentEvent(); return activeView === "layout" ? event.draftObjectScale : event.publishedObjectScale; }
function activeBackgroundOpacity() { const event=currentEvent(); return activeView === "layout" ? event.draftBackgroundOpacity : event.publishedBackgroundOpacity; }
function isColumnId(id) { return Boolean(id && id.startsWith("COLUMN-")); }
function isGuideId(id) { return Boolean(id && id.startsWith("GUIDE-")); }
function isReadOnlyUser() { return memberProfile.authenticated && memberProfile.role === "viewer"; }
function spaceIds(layout=activeLayout()) {
  return Object.keys(layout).sort((a,b) => {
    const aNumber=Number(a),bNumber=Number(b),aNumeric=Number.isFinite(aNumber),bNumeric=Number.isFinite(bNumber);
    if(aNumeric&&bNumeric)return aNumber-bNumber;if(aNumeric)return-1;if(bNumeric)return 1;return a.localeCompare(b,"th");
  });
}
function areaOf(geometry) { return round(Number(geometry.widthM) * Number(geometry.depthM)); }
function dimensionText(geometry) { return `${round(geometry.widthM)} × ${round(geometry.depthM)} ม. · ${areaOf(geometry)} ตร.ม.`; }
function showToast(message) { toast.textContent = message; toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2600); }
function snapshot() { history.push(JSON.stringify(state)); if (history.length > 40) history.shift(); }

function standaloneStatus() {
  const localPreview = ["localhost","127.0.0.1"].includes(location.hostname);
  return localPreview ? "พรีวิวบนเครื่อง · เก็บข้อมูลในอุปกรณ์นี้" : "ออฟไลน์ · เก็บสำเนาในอุปกรณ์นี้";
}
function persist(message="บันทึกบน Cloud แล้ว") {
  state.updatedAt = Date.now();
  currentEvent().updatedAt = state.updatedAt;
  localStorage.setItem(scopedStorageKey(), JSON.stringify(state));
  const payload = clone(state);
  const saveState = document.querySelector("#saveState");
  saveState.innerHTML = "<i></i> กำลังบันทึกบน Cloud…";
  queuedSaves += 1;
  isSaving = true;
  const saveJob = async () => {
    try {
      for (let attempt=0;attempt<3;attempt+=1) {
        const response = await fetch("/api/planner", { method:"PUT", headers:{ "content-type":"application/json" }, body:JSON.stringify({ data:payload, baseRevision:cloudRevision }) });
        if (response.status === 409) {
          const latest = await response.json();
          cloudRevision = Number(latest?.revision) || cloudRevision;
          saveState.innerHTML = "<i></i> พบข้อมูลจากอีกอุปกรณ์ · กำลังซิงค์…";
          continue;
        }
        if(response.status===401){saveState.innerHTML="<i></i> เข้าสู่ระบบเพื่อบันทึกบน Cloud";if(message)showToast("กรุณาเข้าสู่ระบบเพื่อบันทึกข้อมูลส่วนตัว");return false;}
        if(response.status===403){const readOnly=isReadOnlyUser();saveState.innerHTML=`<i></i> ${readOnly?"บัญชีดูอย่างเดียว":"บัญชียังไม่ได้รับสิทธิ์"}`;if(message)showToast(readOnly?"บัญชีนี้ไม่มีสิทธิ์แก้ไขแปลน":"กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มบัญชี");return false;}
        if (!response.ok) throw new Error("save failed");
        const saved = await response.json();
        cloudRevision = Number(saved.revision) || cloudRevision;
        saveState.innerHTML = "<i></i> บันทึกบน Cloud แล้ว";
        if (message) showToast(message);
        return true;
      }
      saveState.innerHTML = "<i></i> มีข้อมูลใหม่จากอีกอุปกรณ์ · กรุณาลองอีกครั้ง";
      if(message)showToast("ยังบันทึกไม่ได้เพราะอีกอุปกรณ์กำลังแก้ไขอยู่");
      return false;
    } catch (_) {
      saveState.innerHTML = `<i></i> ${standaloneStatus()}`;
      if (message) showToast("ยังเชื่อมต่อ Cloud ไม่ได้ ระบบเก็บสำเนาในอุปกรณ์นี้แล้ว");
      return false;
    } finally {
      queuedSaves = Math.max(0,queuedSaves-1);
      isSaving = queuedSaves > 0;
    }
  };
  const result = saveTail.catch(()=>false).then(saveJob);
  saveTail = result;
  return result;
}

async function hydrate() {
  const saveState = document.querySelector("#saveState");
  try {
    const response = await fetch("/api/planner", { headers:{ accept:"application/json" } });
    if(response.status===403){state=loadFallback();cloudRevision=0;saveState.innerHTML="<i></i> บัญชียังไม่ได้รับสิทธิ์";document.querySelector("#accessBanner").hidden=false;render();return;}
    if (!response.ok) throw new Error();
    const cloud = await response.json();
    if (cloud?.data?.events) {
      state = normalizePlanner(cloud.data); cloudRevision = cloud.revision || 0;
    } else if(cloud?.authenticated){
      state=initialPlanner();cloudRevision=0;await persist("");
    } else {
      state=loadFallback();cloudRevision=0;saveState.innerHTML="<i></i> โหมดเยี่ยมชม · เข้าสู่ระบบเพื่อบันทึก";render();return;
    }
    localStorage.setItem(scopedStorageKey(), JSON.stringify(state));
    saveState.innerHTML = "<i></i> เชื่อมต่อ Cloud แล้ว";
    render();
  } catch (_) { saveState.innerHTML = `<i></i> ${standaloneStatus()}`; }
}
async function syncFromCloud() {
  if (isSaving || document.visibilityState === "hidden") return;
  try {
    const response = await fetch("/api/planner", { headers:{ accept:"application/json" } });
    if (!response.ok) return;
    const cloud = await response.json();
    if (cloud?.data && Number(cloud.revision) > cloudRevision) {
      state = normalizePlanner(cloud.data); cloudRevision = cloud.revision; localStorage.setItem(scopedStorageKey(), JSON.stringify(state)); render();
      document.querySelector("#saveState").innerHTML = "<i></i> อัปเดตข้อมูลบัญชีแล้ว";
      showToast("รับการเปลี่ยนแปลงล่าสุดของบัญชีแล้ว");
    }
  } catch (_) {}
}
async function hydrateMember() {
  try {
    const response = await fetch("/api/me"); if (!response.ok) throw new Error(); const member = await response.json();
    memberProfile=member;storageScope=member.authenticated?(member.id||member.email||"member"):"anonymous";const name = member.name || member.email || "ผู้เยี่ยมชม"; document.querySelector("#memberName").textContent = member.role==="admin"?`${name} · Admin`:member.role==="viewer"?`${name} · ดูอย่างเดียว`:name; document.querySelector(".member-avatar").textContent = name.trim().charAt(0).toUpperCase() || "S";document.querySelector(".member-badge").hidden=!member.authenticated;document.querySelector("#signInButton").hidden=member.authenticated;document.querySelector("#signOutButton").hidden=!member.authenticated;document.querySelector("#membersButton").hidden=member.role!=="admin";document.querySelector("#accessBanner").hidden=!(member.authenticated&&!member.access);document.body.classList.toggle("read-only-user",member.role==="viewer");const layoutTab=document.querySelector('[data-view="layout"]');if(layoutTab)layoutTab.hidden=member.role==="viewer";if(member.role==="viewer"&&activeView==="layout")activeView="interactive";
  } catch (_) {document.querySelector(".member-badge").hidden=true;document.querySelector("#membersButton").hidden=true;document.querySelector("#signOutButton").hidden=true;document.querySelector("#signInButton").hidden=["localhost","127.0.0.1"].includes(location.hostname);}
}

function render() {
  renderEventPicker(); renderHeader(); renderZones(); renderMetrics(); renderTable(); renderEditor(); renderLibrary();
}
function renderEventPicker() {
  const select = document.querySelector("#eventSelect");
  select.innerHTML = state.events.map(event => `<option value="${escapeHTML(event.id)}">${escapeHTML(event.name)}${event.archived ? " · เก็บแล้ว" : ""}</option>`).join("");
  select.value = state.activeEventId;
}
function renderHeader() {
  const event = currentEvent();
  document.querySelector("#eventTitle").textContent = event.name;
  const dates = event.startDate || event.endDate ? `${event.startDate || "ไม่ระบุ"} – ${event.endDate || "ไม่ระบุ"}` : "ยังไม่ระบุวันที่จัดงาน";
  document.querySelector("#eventMeta").textContent = `${dates} · อัปเดตล่าสุด ${new Intl.DateTimeFormat("th-TH",{dateStyle:"medium",timeStyle:"short"}).format(new Date(event.updatedAt || Date.now()))}`;
  const badge = document.querySelector("#planBadge"); badge.textContent = event.draftDirty ? "● DRAFT CHANGES" : "● LOCKED PLAN"; badge.classList.toggle("draft", Boolean(event.draftDirty));
  document.querySelector("#layoutControls").hidden = activeView !== "layout";
  document.querySelector("#scaleToolbar").hidden = activeView !== "layout";
  document.querySelector("#standardControls").hidden = activeView === "layout";
  document.querySelector("#layoutNotice").hidden = activeView !== "layout";
  document.querySelector("#duplicateSelectedButton").disabled=activeView!=="layout"||!selectedId;
  document.querySelector("#legendHelp").textContent = activeView === "layout" ? "ลากพื้นที่หรือเสาเพื่อย้าย · ลากจุดสีทองเพื่อปรับขนาดพื้นที่" : activeView === "interactive" ? "แตะ 2 พื้นที่ หรือใช้เมาส์ลาก เพื่อสลับร้าน" : "ภาพต้นฉบับสำหรับใช้อ้างอิง";
  if(activeView==="layout") updateScaleControls();
  applyViewZoom(viewZoom,false);
  stage.style.setProperty("--plan-opacity",String(activeBackgroundOpacity()));
}

function applyViewZoom(value,save=true){viewZoom=clamp(Math.round(Number(value)||100),75,180);stage.style.width=`${viewZoom}%`;stage.style.minWidth=`${Math.round(920*viewZoom/100)}px`;const range=document.querySelector("#viewZoomRange"),label=document.querySelector("#viewZoomValue");if(range)range.value=viewZoom;if(label)label.textContent=`${viewZoom}%`;if(save)localStorage.setItem("space-planner-view-zoom",String(viewZoom));}

function updateScaleControls(){const event=currentEvent(),percent=Math.round(event.draftObjectScale*100),opacity=Math.round(event.draftBackgroundOpacity*100);document.querySelector("#objectScaleRange").value=percent;document.querySelector("#objectScaleValue").textContent=`${percent}%`;document.querySelector("#backgroundOpacityRange").value=opacity;document.querySelector("#backgroundOpacityValue").textContent=`${opacity}%`;document.querySelector("#viewZoomRange").value=viewZoom;document.querySelector("#viewZoomValue").textContent=`${viewZoom}%`;}

function snapStep(){return document.querySelector("#gridToggle").checked?(Number(document.querySelector("#snapPrecision")?.value)||.5):.05;}
function visualRect(geometry,scale=activeObjectScale()){return{left:geometry.left,top:geometry.top,right:geometry.left+geometry.width*scale,bottom:geometry.top+geometry.height*scale,width:geometry.width*scale,height:geometry.height*scale};}
function overlapsAnother(id,layout){const current=visualRect(layout[id]);return spaceIds(layout).some(otherId=>{if(otherId===id)return false;const other=visualRect(layout[otherId]);const overlapX=Math.min(current.right,other.right)-Math.max(current.left,other.left);const overlapY=Math.min(current.bottom,other.bottom)-Math.max(current.top,other.top);return overlapX>.12&&overlapY>.12;});}
function smartSnapPosition(id,left,top){
  if(!document.querySelector("#gridToggle").checked)return{left,top,lineX:null,lineY:null};
  const layout=currentEvent().draftLayout,geometry=layout[id],scale=currentEvent().draftObjectScale,movingW=geometry.width*scale,movingH=geometry.height*scale,threshold=.65;
  let bestX={delta:threshold,left,line:null},bestY={delta:threshold,top,line:null};
  for(const otherId of spaceIds(layout)){if(otherId===id)continue;const other=visualRect(layout[otherId],scale);const xTargets=[[other.left,other.left],[other.right-movingW,other.right],[other.left+other.width/2-movingW/2,other.left+other.width/2]];const yTargets=[[other.top,other.top],[other.bottom-movingH,other.bottom],[other.top+other.height/2-movingH/2,other.top+other.height/2]];for(const [candidate,line]of xTargets){const delta=Math.abs(candidate-left);if(delta<bestX.delta)bestX={delta,left:candidate,line};}for(const [candidate,line]of yTargets){const delta=Math.abs(candidate-top);if(delta<bestY.delta)bestY={delta,top:candidate,line};}}
  return{left:bestX.line===null?left:bestX.left,top:bestY.line===null?top:bestY.top,lineX:bestX.line,lineY:bestY.line};
}
function clearAlignmentGuides(){zoneLayer.querySelectorAll(".alignment-guide").forEach(item=>item.remove());}
function showAlignmentGuides(lineX,lineY){clearAlignmentGuides();if(lineX!==null){const line=document.createElement("div");line.className="alignment-guide vertical";line.style.left=`${lineX}%`;zoneLayer.append(line);}if(lineY!==null){const line=document.createElement("div");line.className="alignment-guide horizontal";line.style.top=`${lineY}%`;zoneLayer.append(line);}}

function renderZones() {
  const event = currentEvent(); const layout = activeLayout();
  const query = document.querySelector("#searchInput").value.trim().toLowerCase(); const filter = document.querySelector("#statusFilter").value;
  stage.classList.toggle("reference", activeView === "reference"); stage.classList.toggle("layout", activeView === "layout");
  zoneLayer.innerHTML = "";
  spaceIds(layout).forEach(id => {
    const geometry = layout[id]; const assignment = event.spaces[id].assignment;
    const zone = document.createElement("div"); zone.tabIndex = 0; zone.dataset.id = id;
    zone.className = `zone ${assignment.status} ${geometry.kind === "stage" ? "event stage-kind" : ""} ${selectedId === id ? "selected" : ""} ${swapSource === id ? "swap-source" : ""} ${activeView === "layout" ? "layout-zone" : ""} ${geometry.locked ? "locked" : ""} ${activeView === "layout" && overlapsAnother(id,layout) ? "overlap-warning" : ""}`;
    const objectScale=activeObjectScale();
    zone.style.cssText = `left:${geometry.left}%;top:${geometry.top}%;width:${geometry.width*objectScale}%;height:${geometry.height*objectScale}%;transform:rotate(${geometry.rotation||0}deg)`;
    zone.dataset.widthLabel = `${round(geometry.widthM)} ม.`; zone.dataset.depthLabel = `${round(geometry.depthM)} ม.`;
    const searchText = `${id} ${assignment.shopName} ${assignment.category}`.toLowerCase();
    if (activeView !== "layout" && ((query && !searchText.includes(query)) || (filter !== "all" && assignment.status !== filter))) zone.classList.add("filtered");
    const displayId=geometry.kind==="stage"?(id==="EVENT"?"EVENT":`STAGE ${id.replace("STAGE-","")}`):id;
    zone.innerHTML = `${geometry.locked && activeView === "layout" ? '<span class="lock-icon">◆</span>' : ""}<span class="zone-id">${displayId}</span><span class="zone-name">${escapeHTML(assignment.shopName || STATUS[assignment.status])}</span><span class="zone-area">${areaOf(geometry)} ตร.ม.</span>${activeView === "layout" && !geometry.locked ? '<span class="resize-handle" aria-hidden="true"></span>' : ""}`;
    zone.setAttribute("aria-label", `${slotLabel(id,geometry)} ${assignment.shopName || "ว่าง"} ${dimensionText(geometry)}`);
    if (activeView === "interactive" && !isReadOnlyUser()) bindAssignmentDrag(zone, id);
    if (activeView === "layout") bindLayoutEditing(zone, id);
    if (activeView !== "reference") zone.addEventListener("click", eventClick => { if (zone.dataset.moved === "true") { zone.dataset.moved = "false"; return; } activeView === "layout" ? selectSpace(id) : handleSpaceClick(id); });
    zoneLayer.append(zone);
  });
  renderColumns();
  renderGuides();
}

function renderColumns() {
  const columns=activeColumns();
  Object.entries(columns).forEach(([id,geometry],index)=>{
    const column=document.createElement("div");column.tabIndex=activeView==="layout"?0:-1;column.dataset.id=id;
    column.className=`plan-column ${activeView==="layout"?"editable":""} ${geometry.locked?"locked":""} ${selectedId===id?"selected":""}`;
    column.style.cssText=`left:${geometry.left}%;top:${geometry.top}%;width:${geometry.size}%`;
    column.innerHTML=`<span class="column-core" aria-hidden="true"></span>${geometry.locked&&activeView==="layout"?'<span class="column-lock" aria-hidden="true">◆</span>':""}`;
    column.setAttribute("aria-label",`เสา ${index+1}${geometry.locked?" ล็อกแล้ว":""}`);
    if(activeView==="layout"){
      bindColumnEditing(column,id);
      column.addEventListener("click",()=>{if(column.dataset.moved==="true"){column.dataset.moved="false";return;}selectedId=id;swapSource=null;render();});
    }
    zoneLayer.append(column);
  });
}

function bindColumnEditing(column,id){
  column.addEventListener("pointerdown",pointerEvent=>{
    const geometry=currentEvent().draftColumns[id];selectedId=id;swapSource=null;renderEditor();document.querySelectorAll(".plan-column").forEach(item=>item.classList.toggle("selected",item===column));
    if(geometry.locked)return;pointerEvent.preventDefault();column.setPointerCapture(pointerEvent.pointerId);const start={x:pointerEvent.clientX,y:pointerEvent.clientY,geometry:clone(geometry)};const stageRect=stage.getBoundingClientRect();let moved=false;snapshot();
    const onMove=moveEvent=>{const dx=(moveEvent.clientX-start.x)/stageRect.width*100,dy=(moveEvent.clientY-start.y)/stageRect.height*100,snap=snapStep();if(Math.abs(dx)+Math.abs(dy)>.15)moved=true;const radius=geometry.size/2;geometry.left=clamp(Math.round((start.geometry.left+dx)/snap)*snap,radius,100-radius);geometry.top=clamp(Math.round((start.geometry.top+dy)/snap)*snap,radius,100-radius);currentEvent().draftDirty=true;column.style.left=`${geometry.left}%`;column.style.top=`${geometry.top}%`;updateColumnEditor(id);};
    const onEnd=()=>{column.removeEventListener("pointermove",onMove);column.removeEventListener("pointerup",onEnd);column.removeEventListener("pointercancel",onEnd);if(moved){column.dataset.moved="true";void persist("บันทึกตำแหน่งเสาในฉบับร่างแล้ว");render();}else history.pop();};
    column.addEventListener("pointermove",onMove);column.addEventListener("pointerup",onEnd);column.addEventListener("pointercancel",onEnd);
  });
  column.addEventListener("keydown",keyEvent=>{if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(keyEvent.key))return;const geometry=currentEvent().draftColumns[id];if(geometry.locked)return;keyEvent.preventDefault();snapshot();const step=keyEvent.shiftKey?1:.2,radius=geometry.size/2;if(keyEvent.key==="ArrowLeft")geometry.left=clamp(geometry.left-step,radius,100-radius);if(keyEvent.key==="ArrowRight")geometry.left=clamp(geometry.left+step,radius,100-radius);if(keyEvent.key==="ArrowUp")geometry.top=clamp(geometry.top-step,radius,100-radius);if(keyEvent.key==="ArrowDown")geometry.top=clamp(geometry.top+step,radius,100-radius);currentEvent().draftDirty=true;void persist("เลื่อนเสาแล้ว");render();});
}

function guideScale(guide){return (guide.orientation==="vertical"?3.8:2.7)*activeObjectScale();}
function renderGuides(){Object.entries(activeGuides()).forEach(([id,geometry],index)=>{const guide=document.createElement("div");guide.tabIndex=activeView==="layout"?0:-1;guide.dataset.id=id;guide.className=`clearance-guide ${geometry.orientation} ${activeView==="layout"?"editable":""} ${geometry.locked?"locked":""} ${selectedId===id?"selected":""}`;updateGuideGeometry(guide,geometry);guide.innerHTML=`<span class="guide-label">${round(geometry.lengthM)} ม.</span><span class="guide-start" aria-hidden="true"></span><span class="guide-end guide-handle" aria-hidden="true"></span>`;guide.setAttribute("aria-label",`ระยะร่น ${index+1} ${round(geometry.lengthM)} เมตร`);if(activeView==="layout"){bindGuideEditing(guide,id);guide.addEventListener("click",()=>{if(guide.dataset.moved==="true"){guide.dataset.moved="false";return;}selectedId=id;swapSource=null;render();});}zoneLayer.append(guide);});}
function updateGuideGeometry(element,geometry){const length=geometry.lengthM*guideScale(geometry);element.style.left=`${geometry.left}%`;element.style.top=`${geometry.top}%`;element.style.width=geometry.orientation==="horizontal"?`${length}%`:"2px";element.style.height=geometry.orientation==="vertical"?`${length}%`:"2px";const label=element.querySelector(".guide-label");if(label)label.textContent=`${round(geometry.lengthM)} ม.`;}
function bindGuideEditing(guide,id){guide.addEventListener("pointerdown",pointerEvent=>{const geometry=currentEvent().draftGuides[id];selectedId=id;swapSource=null;renderEditor();document.querySelectorAll(".clearance-guide").forEach(item=>item.classList.toggle("selected",item===guide));if(geometry.locked)return;pointerEvent.preventDefault();guide.setPointerCapture(pointerEvent.pointerId);const start={x:pointerEvent.clientX,y:pointerEvent.clientY,geometry:clone(geometry)},stageRect=stage.getBoundingClientRect(),resize=pointerEvent.target.classList.contains("guide-handle");let moved=false;snapshot();const onMove=moveEvent=>{const dx=(moveEvent.clientX-start.x)/stageRect.width*100,dy=(moveEvent.clientY-start.y)/stageRect.height*100,snap=snapStep();if(Math.abs(dx)+Math.abs(dy)>.15)moved=true;if(resize){const delta=geometry.orientation==="horizontal"?dx:dy;const maxLength=(100-(geometry.orientation==="horizontal"?geometry.left:geometry.top))/guideScale(geometry);geometry.lengthM=clamp(round(start.geometry.lengthM+delta/guideScale(geometry)),.1,maxLength);}else{const extent=geometry.lengthM*guideScale(geometry);geometry.left=clamp(Math.round((start.geometry.left+dx)/snap)*snap,0,geometry.orientation==="horizontal"?100-extent:100);geometry.top=clamp(Math.round((start.geometry.top+dy)/snap)*snap,0,geometry.orientation==="vertical"?100-extent:100);}currentEvent().draftDirty=true;updateGuideGeometry(guide,geometry);updateGuideEditor(id);};const onEnd=()=>{guide.removeEventListener("pointermove",onMove);guide.removeEventListener("pointerup",onEnd);guide.removeEventListener("pointercancel",onEnd);if(moved){guide.dataset.moved="true";void persist("บันทึกระยะร่นในฉบับร่างแล้ว");render();}else history.pop();};guide.addEventListener("pointermove",onMove);guide.addEventListener("pointerup",onEnd);guide.addEventListener("pointercancel",onEnd);});}

function bindAssignmentDrag(zone, id) {
  zone.draggable = true;
  zone.addEventListener("dragstart", event => { draggedId=id; swapSource=id; event.dataTransfer.effectAllowed="move"; event.dataTransfer.setData("text/plain",id); document.querySelector("#dropHint").classList.add("show"); renderZones(); });
  zone.addEventListener("dragover", event => { event.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", event => { event.preventDefault(); swapAssignments(event.dataTransfer.getData("text/plain") || draggedId,id); });
  zone.addEventListener("dragend", () => { draggedId=null; swapSource=null; document.querySelector("#dropHint").classList.remove("show"); renderZones(); });
}

function bindLayoutEditing(zone, id) {
  zone.addEventListener("pointerdown", pointerEvent => {
    const event = currentEvent(); const geometry = event.draftLayout[id]; selectedId=id; swapSource=null; renderEditor(); document.querySelectorAll(".zone").forEach(item=>item.classList.toggle("selected",item===zone));
    if (geometry.locked) return;
    pointerEvent.preventDefault(); zone.setPointerCapture(pointerEvent.pointerId);
    const start = { x:pointerEvent.clientX, y:pointerEvent.clientY, geometry:clone(geometry) }; const stageRect = stage.getBoundingClientRect(); const resize = pointerEvent.target.classList.contains("resize-handle");
    let moved = false; snapshot();
    const onMove = moveEvent => {
      const dx = (moveEvent.clientX - start.x) / stageRect.width * 100; const dy = (moveEvent.clientY - start.y) / stageRect.height * 100; const snap = snapStep();
      if (Math.abs(dx) + Math.abs(dy) > .15) moved = true;
      if (resize) {
        const scale=activeObjectScale();
        geometry.width = clamp(Math.round((start.geometry.width + dx/scale) / snap) * snap, 2, (100 - geometry.left)/scale);
        geometry.height = clamp(Math.round((start.geometry.height + dy/scale) / snap) * snap, 3, (100 - geometry.top)/scale);
        geometry.widthM = round(geometry.width / geometry.scaleX); geometry.depthM = round(geometry.height / geometry.scaleY);
      } else {
        const scale=activeObjectScale(),rawLeft=clamp(Math.round((start.geometry.left+dx)/snap)*snap,0,100-geometry.width*scale),rawTop=clamp(Math.round((start.geometry.top+dy)/snap)*snap,0,100-geometry.height*scale),snapped=smartSnapPosition(id,rawLeft,rawTop);geometry.left=clamp(snapped.left,0,100-geometry.width*scale);geometry.top=clamp(snapped.top,0,100-geometry.height*scale);showAlignmentGuides(snapped.lineX,snapped.lineY);
      }
      event.draftDirty = true; updateZoneGeometry(zone, geometry); updateLayoutEditor(id);
    };
    const onEnd = () => { clearAlignmentGuides();zone.removeEventListener("pointermove",onMove); zone.removeEventListener("pointerup",onEnd); zone.removeEventListener("pointercancel",onEnd); if (moved) { zone.dataset.moved="true"; void persist("บันทึกตำแหน่งในฉบับร่างแล้ว"); render(); } else history.pop(); };
    zone.addEventListener("pointermove",onMove); zone.addEventListener("pointerup",onEnd); zone.addEventListener("pointercancel",onEnd);
  });
  zone.addEventListener("keydown", keyEvent => {
    if (!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(keyEvent.key)) return; const geometry=currentEvent().draftLayout[id]; if (geometry.locked) return; keyEvent.preventDefault(); snapshot(); const step=keyEvent.shiftKey?1:.2;
    const scale=activeObjectScale();if(keyEvent.key==="ArrowLeft") geometry.left=clamp(geometry.left-step,0,100-geometry.width*scale); if(keyEvent.key==="ArrowRight") geometry.left=clamp(geometry.left+step,0,100-geometry.width*scale); if(keyEvent.key==="ArrowUp") geometry.top=clamp(geometry.top-step,0,100-geometry.height*scale); if(keyEvent.key==="ArrowDown") geometry.top=clamp(geometry.top+step,0,100-geometry.height*scale);
    currentEvent().draftDirty=true; void persist("เลื่อนพื้นที่แล้ว"); render();
  });
}
function updateZoneGeometry(zone, geometry) { const scale=activeObjectScale();zone.style.left=`${geometry.left}%`; zone.style.top=`${geometry.top}%`; zone.style.width=`${geometry.width*scale}%`; zone.style.height=`${geometry.height*scale}%`;zone.style.transform=`rotate(${geometry.rotation||0}deg)`; zone.dataset.widthLabel=`${round(geometry.widthM)} ม.`; zone.dataset.depthLabel=`${round(geometry.depthM)} ม.`; zone.querySelector(".zone-area").textContent=`${areaOf(geometry)} ตร.ม.`; }
function selectSpace(id) { selectedId=id; swapSource=null; renderEditor(); renderZones(); }
function handleSpaceClick(id) { if (swapSource && swapSource !== id) return swapAssignments(swapSource,id); if (selectedId === id) { swapSource = swapSource === id ? null : id; document.querySelector("#dropHint").classList.toggle("show",Boolean(swapSource)); } else { selectedId=id; swapSource=null; } render(); }
function swapAssignments(from,to) { if(!from||!to||from===to)return; snapshot(); const event=currentEvent(),spaces=event.spaces; [spaces[from].assignment,spaces[to].assignment]=[spaces[to].assignment,spaces[from].assignment]; selectedId=to; swapSource=null; draggedId=null; document.querySelector("#dropHint").classList.remove("show"); void persist(`สลับร้านจาก ${slotLabel(from,event.publishedLayout[from])} ไป ${slotLabel(to,event.publishedLayout[to])} แล้ว`); render(); }

function renderMetrics() {
  const event=currentEvent(),ids=spaceIds(event.publishedLayout); const statuses=ids.map(id=>event.spaces[id].assignment.status); const total=ids.reduce((sum,id)=>sum+areaOf(event.publishedLayout[id]),0);
  document.querySelector("#totalSpaces").textContent=ids.length; document.querySelector("#totalArea").textContent=round(total); document.querySelector("#confirmedCount").textContent=statuses.filter(x=>x==="confirmed").length; document.querySelector("#availableCount").textContent=statuses.filter(x=>x==="available").length;
}
function dateText(assignment) { if(!assignment.startDate&&!assignment.endDate)return"—"; const short=value=>value?new Intl.DateTimeFormat("th-TH",{day:"numeric",month:"short"}).format(new Date(`${value}T00:00:00`)):"?"; return `${short(assignment.startDate)} – ${short(assignment.endDate)}`; }
function renderTable() {
  const event=currentEvent(); document.querySelector("#spaceTable").innerHTML=spaceIds(event.publishedLayout).map(id=>{const assignment=event.spaces[id].assignment;const geometry=event.publishedLayout[id];const contact=[assignment.contact,assignment.phone].filter(Boolean).join(" · ");return `<tr data-row-id="${id}"><td><strong>${slotLabel(id,geometry)}</strong></td><td>${assignment.shopName?escapeHTML(assignment.shopName):'<span class="muted">ยังไม่มีร้าน</span>'}<br><small class="muted">${escapeHTML(assignment.category)}</small></td><td>${dimensionText(geometry)}</td><td>${contact?escapeHTML(contact):"—"}</td><td><span class="table-status ${assignment.status}">${STATUS[assignment.status]}</span></td><td>${dateText(assignment)}</td></tr>`}).join("");
  document.querySelectorAll("[data-row-id]").forEach(row=>row.addEventListener("click",()=>{activeView="interactive";setActiveView();selectedId=row.dataset.rowId;render();document.querySelector("#editorPanel").scrollIntoView({behavior:"smooth",block:"nearest"})}));
}
function renderEditor() {
  document.querySelector("#duplicateSelectedButton").disabled=activeView!=="layout"||!selectedId;
  if (!selectedId) { emptyEditor.hidden=false; spaceForm.hidden=true; layoutForm.hidden=true; columnForm.hidden=true; guideForm.hidden=true; return; }
  emptyEditor.hidden=true;
  if(activeView==="layout"&&isColumnId(selectedId)){spaceForm.hidden=true;layoutForm.hidden=true;guideForm.hidden=true;columnForm.hidden=false;updateColumnEditor(selectedId);return;}
  if(activeView==="layout"&&isGuideId(selectedId)){spaceForm.hidden=true;layoutForm.hidden=true;columnForm.hidden=true;guideForm.hidden=false;updateGuideEditor(selectedId);return;}
  columnForm.hidden=true;
  guideForm.hidden=true;
  if(activeView==="layout"){spaceForm.hidden=true;layoutForm.hidden=false;updateLayoutEditor(selectedId);return;}
  layoutForm.hidden=true; spaceForm.hidden=false; const event=currentEvent();const assignment=event.spaces[selectedId]?.assignment;const geometry=event.publishedLayout[selectedId];if(!geometry||!assignment){selectedId=null;return renderEditor()}document.querySelector("#editorTitle").textContent=slotLabel(selectedId,geometry);document.querySelector("#selectedStatus").textContent=`${STATUS[assignment.status]} · ${dimensionText(geometry)}`;
  [...spaceForm.elements].forEach(element=>{if(!element.name)return;element.value=element.name==="area"?dimensionText(geometry):(assignment[element.name]??"")});
}
function updateLayoutEditor(id) {
  if(!id)return;const geometry=currentEvent().draftLayout[id];if(!geometry){selectedId=null;return renderEditor()}document.querySelector("#layoutEditorTitle").textContent=slotLabel(id,geometry);document.querySelector("#dimensionSummary").textContent=`${round(geometry.widthM)} × ${round(geometry.depthM)} ม.`;document.querySelector("#areaSummary").textContent=`${areaOf(geometry)} ตร.ม.`;
  layoutForm.elements.kind.value=geometry.kind||"booth";layoutForm.elements.widthM.value=round(geometry.widthM);layoutForm.elements.depthM.value=round(geometry.depthM);layoutForm.elements.left.value=round(geometry.left);layoutForm.elements.top.value=round(geometry.top);layoutForm.elements.rotation.value=Math.round(geometry.rotation||0);layoutForm.elements.locked.checked=Boolean(geometry.locked);
}
function updateColumnEditor(id){const geometry=currentEvent().draftColumns[id];if(!geometry){selectedId=null;return renderEditor()}const number=Object.keys(currentEvent().draftColumns).indexOf(id)+1;document.querySelector("#columnEditorTitle").textContent=`เสา ${Math.max(number,1)}`;columnForm.elements.left.value=round(geometry.left);columnForm.elements.top.value=round(geometry.top);columnForm.elements.size.value=round(geometry.size);columnForm.elements.locked.checked=Boolean(geometry.locked);}
function updateGuideEditor(id){const geometry=currentEvent().draftGuides[id];if(!geometry){selectedId=null;return renderEditor()}const number=Object.keys(currentEvent().draftGuides).indexOf(id)+1;document.querySelector("#guideEditorTitle").textContent=`ระยะร่น ${Math.max(number,1)}`;document.querySelector("#guideSummary").textContent=`${round(geometry.lengthM)} ม.`;guideForm.elements.orientation.value=geometry.orientation;guideForm.elements.lengthM.value=round(geometry.lengthM);guideForm.elements.left.value=round(geometry.left);guideForm.elements.top.value=round(geometry.top);guideForm.elements.locked.checked=Boolean(geometry.locked);}

spaceForm.addEventListener("submit",event=>{event.preventDefault();if(!selectedId)return;snapshot();const values=Object.fromEntries(new FormData(spaceForm));delete values.area;const plannerEvent=currentEvent(),geometry=plannerEvent.publishedLayout[selectedId];plannerEvent.spaces[selectedId].assignment={...plannerEvent.spaces[selectedId].assignment,...values};void persist(`บันทึกข้อมูล ${slotLabel(selectedId,geometry)} แล้ว`);render()});
layoutForm.addEventListener("submit",event=>{event.preventDefault();if(!selectedId)return;snapshot();const values=Object.fromEntries(new FormData(layoutForm));const geometry=currentEvent().draftLayout[selectedId],objectScale=currentEvent().draftObjectScale;geometry.kind=values.kind==="stage"?"stage":"booth";const [baseW,baseD]=baseDimensions(selectedId,geometry);geometry.widthM=clamp(Number(values.widthM)||baseW,.5,30);geometry.depthM=clamp(Number(values.depthM)||baseD,.5,30);geometry.rotation=((Number(values.rotation)||0)%360+360)%360;geometry.scaleX||=geometry.width/geometry.widthM;geometry.scaleY||=geometry.height/geometry.depthM;geometry.width=clamp(round(geometry.widthM*geometry.scaleX),2,(100-geometry.left)/objectScale);geometry.height=clamp(round(geometry.depthM*geometry.scaleY),3,(100-geometry.top)/objectScale);geometry.left=clamp(Number(values.left)||0,0,100-geometry.width*objectScale);geometry.top=clamp(Number(values.top)||0,0,100-geometry.height*objectScale);geometry.locked=layoutForm.elements.locked.checked;currentEvent().draftDirty=true;void persist("บันทึกรูปแบบพื้นที่ในฉบับร่างแล้ว");render()});
columnForm.addEventListener("submit",event=>{event.preventDefault();if(!isColumnId(selectedId))return;snapshot();const values=Object.fromEntries(new FormData(columnForm)),geometry=currentEvent().draftColumns[selectedId];geometry.size=clamp(Number(values.size)||3,.3,8);const radius=geometry.size/2;geometry.left=clamp(Number(values.left)||50,radius,100-radius);geometry.top=clamp(Number(values.top)||50,radius,100-radius);geometry.locked=columnForm.elements.locked.checked;currentEvent().draftDirty=true;void persist("บันทึกเสาในฉบับร่างแล้ว");render()});
guideForm.addEventListener("submit",event=>{event.preventDefault();if(!isGuideId(selectedId))return;snapshot();const values=Object.fromEntries(new FormData(guideForm)),geometry=currentEvent().draftGuides[selectedId];geometry.orientation=values.orientation==="vertical"?"vertical":"horizontal";geometry.lengthM=clamp(Number(values.lengthM)||1.2,.1,30);const extent=geometry.lengthM*guideScale(geometry);geometry.left=clamp(Number(values.left)||50,0,geometry.orientation==="horizontal"?100-extent:100);geometry.top=clamp(Number(values.top)||50,0,geometry.orientation==="vertical"?100-extent:100);geometry.locked=guideForm.elements.locked.checked;currentEvent().draftDirty=true;void persist("บันทึกระยะร่นในฉบับร่างแล้ว");render()});
document.querySelector("#clearSpace").addEventListener("click",()=>{if(!selectedId)return;snapshot();currentEvent().spaces[selectedId].assignment=blankAssignment();void persist(`ล้างข้อมูลร้านใน ${slotLabel(selectedId)} แล้ว`);render()});
document.querySelectorAll("[data-close-editor]").forEach(button=>button.addEventListener("click",()=>{selectedId=null;swapSource=null;render()}));
document.querySelector("#resetSelectedButton").addEventListener("click",()=>{if(!selectedId)return;snapshot();const current=currentEvent().draftLayout[selectedId],original=defaultLayout()[selectedId];currentEvent().draftLayout[selectedId]=original||{...current,left:42,top:66,widthM:current.kind==="stage"?4:2,depthM:current.kind==="stage"?4:2,width:current.kind==="stage"?10.8:5.4,height:current.kind==="stage"?15.2:7.6,scaleX:2.7,scaleY:3.8,locked:false};currentEvent().draftDirty=true;void persist("คืนค่าพื้นที่ที่เลือกแล้ว");render()});
document.querySelector("#rotateSelectedButton").addEventListener("click",()=>{const geometry=currentEvent().draftLayout[selectedId];if(!geometry)return;if(geometry.locked)return showToast("ปลดล็อกพื้นที่ก่อนหมุน");snapshot();geometry.rotation=((geometry.rotation||0)+90)%360;currentEvent().draftDirty=true;void persist("หมุนพื้นที่ 90 องศาแล้ว");render()});
document.querySelector("#rotateGuideButton").addEventListener("click",()=>{if(!isGuideId(selectedId))return;const geometry=currentEvent().draftGuides[selectedId];if(geometry.locked)return showToast("ปลดล็อกระยะร่นก่อนหมุน");snapshot();geometry.orientation=geometry.orientation==="horizontal"?"vertical":"horizontal";const extent=geometry.lengthM*guideScale(geometry);geometry.left=clamp(geometry.left,0,geometry.orientation==="horizontal"?100-extent:100);geometry.top=clamp(geometry.top,0,geometry.orientation==="vertical"?100-extent:100);currentEvent().draftDirty=true;void persist("หมุนระยะร่น 90 องศาแล้ว");render()});
function addSpace(kind) {
  snapshot();const event=currentEvent(),ids=Object.keys(event.spaces);let id;
  if(kind==="stage"){let number=1;while(ids.includes(`STAGE-${number}`))number++;id=`STAGE-${number}`;}else{const numbers=ids.map(Number).filter(Number.isFinite);id=String((numbers.length?Math.max(...numbers):0)+1);}
  const count=Object.keys(event.draftLayout).length,left=clamp(31+(count%9)*6,2,86),top=clamp(64+Math.floor((count%18)/9)*10,4,82);const isStage=kind==="stage";
  event.draftLayout[id]={left,top,width:isStage?10.8:5.4,height:isStage?15.2:7.6,widthM:isStage?4:2,depthM:isStage?4:2,scaleX:2.7,scaleY:3.8,rotation:0,kind,locked:false};event.spaces[id]={assignment:blankAssignment()};event.draftOnlyIds.push(id);event.pendingRemovedIds=event.pendingRemovedIds.filter(item=>item!==id);event.draftDirty=true;selectedId=id;void persist(isStage?"เพิ่มเวทีในฉบับร่างแล้ว":"เพิ่มบูธในฉบับร่างแล้ว");render();
}
document.querySelector("#addBoothButton").addEventListener("click",()=>addSpace("booth"));
document.querySelector("#addStageButton").addEventListener("click",()=>addSpace("stage"));
document.querySelector("#addColumnButton").addEventListener("click",()=>{snapshot();const event=currentEvent(),ids=Object.keys(event.draftColumns);let number=1;while(ids.includes(`COLUMN-${number}`))number++;const id=`COLUMN-${number}`,offset=ids.length%6;event.draftColumns[id]={left:43+offset*4,top:47,size:3,locked:false};event.draftDirty=true;selectedId=id;void persist("เพิ่มเสาในฉบับร่างแล้ว");render()});
document.querySelector("#addGuideButton").addEventListener("click",()=>{snapshot();const event=currentEvent(),ids=Object.keys(event.draftGuides);let number=1;while(ids.includes(`GUIDE-${number}`))number++;const id=`GUIDE-${number}`,offset=ids.length%5;event.draftGuides[id]={left:48,top:61+offset*3,lengthM:1.2,orientation:"horizontal",locked:false};event.draftDirty=true;selectedId=id;void persist("เพิ่มระยะร่นในฉบับร่างแล้ว");render()});
document.querySelector("#duplicateSelectedButton").addEventListener("click",()=>{if(!selectedId||activeView!=="layout")return;snapshot();const event=currentEvent();if(isColumnId(selectedId)){let number=1;while(event.draftColumns[`COLUMN-${number}`])number++;const id=`COLUMN-${number}`,copy=clone(event.draftColumns[selectedId]);copy.left=clamp(copy.left+2,copy.size/2,100-copy.size/2);copy.top=clamp(copy.top+2,copy.size/2,100-copy.size/2);copy.locked=false;event.draftColumns[id]=copy;selectedId=id;}else if(isGuideId(selectedId)){let number=1;while(event.draftGuides[`GUIDE-${number}`])number++;const id=`GUIDE-${number}`,copy=clone(event.draftGuides[selectedId]);copy.left=clamp(copy.left+2,0,98);copy.top=clamp(copy.top+2,0,98);copy.locked=false;event.draftGuides[id]=copy;selectedId=id;}else{const source=event.draftLayout[selectedId];if(!source)return;let id;if(source.kind==="stage"){let number=1;while(event.spaces[`STAGE-${number}`])number++;id=`STAGE-${number}`;}else{const numbers=Object.keys(event.spaces).map(Number).filter(Number.isFinite);id=String((numbers.length?Math.max(...numbers):0)+1);}const copy=clone(source),scale=event.draftObjectScale;copy.left=clamp(copy.left+2,0,100-copy.width*scale);copy.top=clamp(copy.top+2,0,100-copy.height*scale);copy.locked=false;event.draftLayout[id]=copy;event.spaces[id]={assignment:blankAssignment()};event.draftOnlyIds.push(id);selectedId=id;}event.draftDirty=true;void persist("ทำสำเนาสิ่งที่เลือกแล้ว");render()});
document.querySelector("#deleteSpaceButton").addEventListener("click",()=>{if(!selectedId)return;const event=currentEvent(),geometry=event.draftLayout[selectedId],name=slotLabel(selectedId,geometry),hasTenant=Boolean(event.spaces[selectedId]?.assignment?.shopName);if(!confirm(`ลบ ${name} ออกจากฉบับร่างหรือไม่?${hasTenant?" ข้อมูลร้านจะถูกลบเมื่อนำแปลนไปใช้งาน":""}`))return;snapshot();delete event.draftLayout[selectedId];if(event.draftOnlyIds.includes(selectedId)){event.draftOnlyIds=event.draftOnlyIds.filter(id=>id!==selectedId);delete event.spaces[selectedId];}else if(!event.pendingRemovedIds.includes(selectedId))event.pendingRemovedIds.push(selectedId);event.draftDirty=true;selectedId=null;void persist(`ลบ ${name} จากฉบับร่างแล้ว`);render()});
document.querySelector("#deleteColumnButton").addEventListener("click",()=>{if(!isColumnId(selectedId))return;const event=currentEvent(),column=event.draftColumns[selectedId];if(column?.locked&&!confirm("เสานี้ถูกล็อกอยู่ ต้องการลบออกจากฉบับร่างหรือไม่?"))return;if(!column?.locked&&!confirm("ลบเสานี้ออกจากฉบับร่างหรือไม่?"))return;snapshot();delete event.draftColumns[selectedId];event.draftDirty=true;selectedId=null;void persist("ลบเสาออกจากฉบับร่างแล้ว");render()});
document.querySelector("#deleteGuideButton").addEventListener("click",()=>{if(!isGuideId(selectedId))return;const event=currentEvent(),guide=event.draftGuides[selectedId];if(guide?.locked&&!confirm("ระยะนี้ถูกล็อกอยู่ ต้องการลบออกจากฉบับร่างหรือไม่?"))return;if(!guide?.locked&&!confirm("ลบระยะร่นนี้ออกจากฉบับร่างหรือไม่?"))return;snapshot();delete event.draftGuides[selectedId];event.draftDirty=true;selectedId=null;void persist("ลบระยะร่นออกจากฉบับร่างแล้ว");render()});

function setActiveView() { localStorage.setItem(ACTIVE_VIEW_KEY,activeView);document.querySelectorAll("[data-view]").forEach(button=>button.classList.toggle("active",button.dataset.view===activeView)); selectedId=null;swapSource=null;render(); }
document.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>{activeView=button.dataset.view;setActiveView()}));
const objectScaleRange=document.querySelector("#objectScaleRange");
const beginScaleChange=()=>{if(objectScaleRange.dataset.editing)return;snapshot();objectScaleRange.dataset.editing="true";};
objectScaleRange.addEventListener("pointerdown",beginScaleChange);objectScaleRange.addEventListener("keydown",beginScaleChange);
objectScaleRange.addEventListener("input",()=>{const event=currentEvent();event.draftObjectScale=clamp(Number(objectScaleRange.value)/100,.4,1.2);event.draftDirty=true;document.querySelector("#objectScaleValue").textContent=`${objectScaleRange.value}%`;renderZones();});
objectScaleRange.addEventListener("change",()=>{delete objectScaleRange.dataset.editing;void persist("ปรับสเกลพื้นที่เทียบกับแปลนแล้ว");render();});
const backgroundOpacityRange=document.querySelector("#backgroundOpacityRange");
const beginOpacityChange=()=>{if(backgroundOpacityRange.dataset.editing)return;snapshot();backgroundOpacityRange.dataset.editing="true";};
backgroundOpacityRange.addEventListener("pointerdown",beginOpacityChange);backgroundOpacityRange.addEventListener("keydown",beginOpacityChange);
backgroundOpacityRange.addEventListener("input",()=>{const event=currentEvent();event.draftBackgroundOpacity=clamp(Number(backgroundOpacityRange.value)/100,.08,1);event.draftDirty=true;document.querySelector("#backgroundOpacityValue").textContent=`${backgroundOpacityRange.value}%`;stage.style.setProperty("--plan-opacity",String(event.draftBackgroundOpacity));});
backgroundOpacityRange.addEventListener("change",()=>{delete backgroundOpacityRange.dataset.editing;void persist("ปรับความโปร่งใสภาพพื้นหลังแล้ว");render();});
const viewZoomRange=document.querySelector("#viewZoomRange");
viewZoomRange.addEventListener("input",()=>applyViewZoom(viewZoomRange.value));
document.querySelector("#fitPlanButton").addEventListener("click",()=>applyViewZoom(100));
document.querySelector("#mobileZoomOut").addEventListener("click",()=>applyViewZoom(viewZoom-15));
document.querySelector("#mobileZoomIn").addEventListener("click",()=>applyViewZoom(viewZoom+15));
document.querySelector("#mobileFitPlan").addEventListener("click",()=>{applyViewZoom(100);planScroll.scrollTo({left:0,top:0,behavior:"smooth"});});
const mapTouches=new Map();let mapGesture=null;
const touchDistance=points=>Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);
const beginMapGesture=()=>{const points=[...mapTouches.values()];if(points.length===1){mapGesture={type:"pan",x:points[0].x,y:points[0].y,left:planScroll.scrollLeft,top:planScroll.scrollTop};}else if(points.length>=2){const rect=planScroll.getBoundingClientRect(),midX=(points[0].x+points[1].x)/2,midY=(points[0].y+points[1].y)/2;mapGesture={type:"pinch",distance:Math.max(1,touchDistance(points)),zoom:viewZoom,ratioX:(planScroll.scrollLeft+midX-rect.left)/Math.max(1,planScroll.scrollWidth),ratioY:(planScroll.scrollTop+midY-rect.top)/Math.max(1,planScroll.scrollHeight),midX,midY};}};
planScroll.addEventListener("pointerdown",event=>{if(event.pointerType!=="touch"||event.target.closest(".zone,.plan-column,.clearance-guide,.map-navigation"))return;event.preventDefault();mapTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});planScroll.setPointerCapture(event.pointerId);beginMapGesture();planScroll.classList.add("is-touching");});
planScroll.addEventListener("pointermove",event=>{if(!mapTouches.has(event.pointerId))return;event.preventDefault();mapTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});const points=[...mapTouches.values()];if(points.length>=2){if(mapGesture?.type!=="pinch")beginMapGesture();const rect=planScroll.getBoundingClientRect(),midX=(points[0].x+points[1].x)/2,midY=(points[0].y+points[1].y)/2;applyViewZoom(mapGesture.zoom*touchDistance(points)/mapGesture.distance);planScroll.scrollLeft=mapGesture.ratioX*planScroll.scrollWidth-(midX-rect.left);planScroll.scrollTop=mapGesture.ratioY*planScroll.scrollHeight-(midY-rect.top);}else if(points.length===1&&mapGesture?.type==="pan"){planScroll.scrollLeft=mapGesture.left-(points[0].x-mapGesture.x);planScroll.scrollTop=mapGesture.top-(points[0].y-mapGesture.y);}});
const endMapTouch=event=>{if(!mapTouches.has(event.pointerId))return;mapTouches.delete(event.pointerId);if(mapTouches.size)beginMapGesture();else{mapGesture=null;planScroll.classList.remove("is-touching");}};
planScroll.addEventListener("pointerup",endMapTouch);planScroll.addEventListener("pointercancel",endMapTouch);
document.querySelector("#searchInput").addEventListener("input",renderZones);document.querySelector("#statusFilter").addEventListener("change",renderZones);
document.querySelector("#undoButton").addEventListener("click",()=>{if(!history.length)return showToast("ยังไม่มีรายการให้ย้อนกลับ");state=normalizePlanner(JSON.parse(history.pop()));void persist("ย้อนกลับหนึ่งขั้นแล้ว");render()});
document.querySelector("#lockAllButton").addEventListener("click",()=>{snapshot();const event=currentEvent(),layout=event.draftLayout,ids=spaceIds(layout),columns=Object.values(event.draftColumns),guides=Object.values(event.draftGuides),allItems=[...ids.map(id=>layout[id]),...columns,...guides],allLocked=allItems.length>0&&allItems.every(item=>item.locked);allItems.forEach(item=>item.locked=!allLocked);event.draftDirty=true;void persist(allLocked?"ปลดล็อกทั้งหมดแล้ว":"ล็อกทั้งหมดแล้ว");render()});
document.querySelector("#resetLayoutButton").addEventListener("click",()=>{if(!confirm("คืนค่าจำนวน ตำแหน่ง และขนาดพื้นที่ พร้อมลบเสาและระยะร่นในฉบับร่างทั้งหมดหรือไม่?"))return;snapshot();const event=currentEvent();event.draftLayout=defaultLayout();event.draftColumns=defaultColumns();event.draftGuides=defaultGuides();event.draftObjectScale=DEFAULT_OBJECT_SCALE;event.draftBackgroundOpacity=DEFAULT_BACKGROUND_OPACITY;event.draftOnlyIds=Object.keys(event.draftLayout).filter(id=>!event.publishedLayout[id]);event.pendingRemovedIds=Object.keys(event.publishedLayout).filter(id=>!event.draftLayout[id]);event.draftDirty=true;selectedId=null;void persist("คืนค่าแปลนฉบับร่างแล้ว");render()});
document.querySelector("#publishLayoutButton").addEventListener("click",()=>{const event=currentEvent(),removed=event.pendingRemovedIds.length;if(!confirm(`ล็อกฉบับร่างนี้และนำไปใช้กับแปลนใช้งานหรือไม่?${removed?` ระบบจะลบพื้นที่ ${removed} จุดและข้อมูลร้านในพื้นที่เหล่านั้น`:""}`))return;snapshot();for(const id of event.pendingRemovedIds)delete event.spaces[id];event.publishedLayout=clone(event.draftLayout);event.publishedColumns=clone(event.draftColumns);event.publishedGuides=clone(event.draftGuides);event.publishedObjectScale=event.draftObjectScale;event.publishedBackgroundOpacity=event.draftBackgroundOpacity;event.draftOnlyIds=[];event.pendingRemovedIds=[];event.draftDirty=false;event.status="published";event.versions.unshift({id:uid("version"),name:`เวอร์ชัน ${event.versions.length+1}`,createdAt:Date.now(),layout:clone(event.publishedLayout),columns:clone(event.publishedColumns),guides:clone(event.publishedGuides),objectScale:event.publishedObjectScale,backgroundOpacity:event.publishedBackgroundOpacity});event.versions=event.versions.slice(0,30);activeView="interactive";void persist("ล็อกและอัปเดตแปลนใช้งานแล้ว");setActiveView()});

document.querySelector("#eventSelect").addEventListener("change",event=>{state.activeEventId=event.target.value;selectedId=null;render();void persist("")});
document.querySelector("#libraryButton").addEventListener("click",()=>{renderLibrary();libraryDialog.showModal()});
document.querySelector("#newEventButton").addEventListener("click",()=>{const name=prompt("ชื่องานกิจกรรมใหม่","งานกิจกรรมใหม่");if(!name?.trim())return;snapshot();const event=createEvent(name.trim());state.events.unshift(event);state.activeEventId=event.id;selectedId=null;void persist("สร้างงานใหม่แล้ว");render()});
document.querySelector("#duplicateEventButton").addEventListener("click",()=>{const source=currentEvent();const name=prompt("ชื่อสำเนางาน",`สำเนา ${source.name}`);if(!name?.trim())return;snapshot();const event=createEvent(name.trim(),source.publishedLayout,source.publishedColumns,source.publishedGuides);event.publishedLayout=clone(source.publishedLayout);event.draftLayout=clone(source.publishedLayout);event.publishedColumns=clone(source.publishedColumns);event.draftColumns=clone(source.publishedColumns);event.publishedGuides=clone(source.publishedGuides);event.draftGuides=clone(source.publishedGuides);event.publishedObjectScale=source.publishedObjectScale;event.draftObjectScale=source.publishedObjectScale;event.publishedBackgroundOpacity=source.publishedBackgroundOpacity;event.draftBackgroundOpacity=source.publishedBackgroundOpacity;state.events.unshift(event);state.activeEventId=event.id;void persist("สร้างสำเนาแปลนแล้ว");render()});
document.querySelector("#archiveEventButton").addEventListener("click",()=>{snapshot();const event=currentEvent();event.archived=!event.archived;void persist(event.archived?"เก็บงานเข้าคลังแล้ว":"นำงานกลับมาใช้งานแล้ว");render()});
document.querySelector("#saveEventButton").addEventListener("click",()=>{snapshot();const event=currentEvent();event.name=document.querySelector("#eventNameInput").value.trim()||event.name;event.startDate=document.querySelector("#eventStartInput").value;event.endDate=document.querySelector("#eventEndInput").value;void persist("บันทึกข้อมูลงานแล้ว");render()});
function renderLibrary() {
  const current=currentEvent();document.querySelector("#eventNameInput").value=current.name;document.querySelector("#eventStartInput").value=current.startDate||"";document.querySelector("#eventEndInput").value=current.endDate||"";document.querySelector("#archiveEventButton").textContent=current.archived?"นำงานกลับมาใช้งาน":"เก็บงานเข้าคลัง";
  document.querySelector("#libraryList").innerHTML=state.events.map(event=>`<div class="library-row ${event.id===state.activeEventId?"current":""}"><div><strong>${escapeHTML(event.name)}</strong><small>${event.startDate||"ไม่ระบุวันที่"}${event.endDate?` – ${event.endDate}`:""}</small></div>${event.archived?'<span class="archive-tag">เก็บแล้ว</span>':"<span></span>"}<button class="button ghost compact" data-open-event="${escapeHTML(event.id)}" type="button">เปิดงาน</button></div>`).join("");
  document.querySelectorAll("[data-open-event]").forEach(button=>button.addEventListener("click",()=>{state.activeEventId=button.dataset.openEvent;selectedId=null;render();void persist("")}));
  document.querySelector("#versionList").innerHTML=current.versions.length?current.versions.map(version=>`<div class="version-item"><span>${escapeHTML(version.name)} · ${new Intl.DateTimeFormat("th-TH",{dateStyle:"medium",timeStyle:"short"}).format(new Date(version.createdAt))}</span><button class="button ghost compact" data-restore-version="${escapeHTML(version.id)}" type="button">ใช้เป็นฉบับร่าง</button></div>`).join(""):'<div class="muted">ยังไม่มีเวอร์ชันที่ล็อก</div>';
  document.querySelectorAll("[data-restore-version]").forEach(button=>button.addEventListener("click",()=>{const event=currentEvent(),version=event.versions.find(item=>item.id===button.dataset.restoreVersion);if(!version)return;snapshot();event.draftLayout=clone(version.layout);event.draftColumns=clone(version.columns||{});event.draftGuides=clone(version.guides||{});event.draftObjectScale=clamp(Number(version.objectScale)||event.publishedObjectScale||DEFAULT_OBJECT_SCALE,.4,1.2);event.draftBackgroundOpacity=clamp(Number(version.backgroundOpacity)||event.publishedBackgroundOpacity||DEFAULT_BACKGROUND_OPACITY,.08,1);for(const id of Object.keys(event.draftLayout))event.spaces[id]||={assignment:blankAssignment()};event.draftOnlyIds=Object.keys(event.draftLayout).filter(id=>!event.publishedLayout[id]);event.pendingRemovedIds=Object.keys(event.publishedLayout).filter(id=>!event.draftLayout[id]);event.draftDirty=true;activeView="layout";libraryDialog.close();void persist("เปิดเวอร์ชันเก่าเป็นฉบับร่างแล้ว");setActiveView()}));
}

async function loadMembers(){
  const list=document.querySelector("#memberList");list.innerHTML='<div class="member-row"><span class="muted">กำลังโหลดสมาชิก…</span></div>';
  try{const response=await fetch("/api/members",{headers:{accept:"application/json"}});if(!response.ok)throw new Error();const data=await response.json();renderMembers(data.members||[]);}catch(_){list.innerHTML='<div class="member-row"><span class="muted">ไม่สามารถโหลดรายชื่อสมาชิกได้</span></div>';}
}
function renderMembers(members){const roleLabel={admin:"Admin Developer",editor:"แก้ไขแปลน",viewer:"ดูอย่างเดียว",member:"แก้ไขแปลน"};document.querySelector("#memberList").innerHTML=members.map(member=>`<div class="member-row"><div><strong>${escapeHTML(member.name||member.email)}</strong><small>${escapeHTML(member.email)}</small></div>${member.protected?`<span class="role-badge admin">${roleLabel.admin}</span><span class="muted">บัญชีหลัก</span>`:`<select class="member-role-select" data-member-role="${escapeHTML(member.email)}" aria-label="สิทธิ์ของ ${escapeHTML(member.email)}"><option value="editor" ${member.role!=="viewer"?"selected":""}>แก้ไขแปลน</option><option value="viewer" ${member.role==="viewer"?"selected":""}>ดูอย่างเดียว</option></select><button class="button danger compact" data-remove-member="${escapeHTML(member.email)}" type="button">ลบสิทธิ์</button>`}</div>`).join("")||'<div class="member-row"><span class="muted">ยังไม่มีสมาชิก</span></div>';document.querySelectorAll("[data-member-role]").forEach(select=>select.addEventListener("change",async()=>{select.disabled=true;try{const response=await fetch("/api/members",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({email:select.dataset.memberRole,role:select.value})});if(!response.ok)throw new Error();const data=await response.json();renderMembers(data.members||[]);showToast("อัปเดตสิทธิ์สมาชิกแล้ว");}catch(_){select.disabled=false;showToast("เปลี่ยนสิทธิ์ไม่สำเร็จ");}}));document.querySelectorAll("[data-remove-member]").forEach(button=>button.addEventListener("click",async()=>{if(!confirm(`ลบสิทธิ์ ${button.dataset.removeMember} หรือไม่?`))return;button.disabled=true;try{const response=await fetch(`/api/members?email=${encodeURIComponent(button.dataset.removeMember)}`,{method:"DELETE"});if(!response.ok)throw new Error();const data=await response.json();renderMembers(data.members||[]);showToast("ลบสิทธิ์สมาชิกแล้ว");}catch(_){button.disabled=false;showToast("ลบสมาชิกไม่สำเร็จ");}}));}
document.querySelector("#membersButton").addEventListener("click",()=>{membersDialog.showModal();void loadMembers();});
document.querySelector("#memberAddForm").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector("button[type=submit]"),values=Object.fromEntries(new FormData(form));button.disabled=true;try{const response=await fetch("/api/members",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(values)});if(!response.ok)throw new Error();const data=await response.json();renderMembers(data.members||[]);form.reset();showToast("เพิ่มสมาชิกแล้ว");}catch(_){showToast("เพิ่มสมาชิกไม่สำเร็จ กรุณาตรวจสอบอีเมล");}finally{button.disabled=false;}});

document.querySelector("#exportToggle").addEventListener("click",()=>{const menu=document.querySelector("#exportMenu");menu.hidden=!menu.hidden});
document.addEventListener("click",event=>{if(!event.target.closest(".top-actions"))document.querySelector("#exportMenu").hidden=true});
document.querySelectorAll("[data-export]").forEach(button=>button.addEventListener("click",async()=>{document.querySelector("#exportMenu").hidden=true;const type=button.dataset.export;if(type==="pdf")printPlan();if(type==="json")exportJSON();if(type==="csv")exportCSV();if(type==="png")await exportPlanPNG();if(type==="import")document.querySelector("#importFile").click()}));
function download(blob,name){const link=Object.assign(document.createElement("a"),{href:URL.createObjectURL(blob),download:name});link.click();setTimeout(()=>URL.revokeObjectURL(link.href),500)}
function safeName(value){return value.replace(/[^a-zA-Z0-9ก-๙_-]+/g,"-").replace(/^-|-$/g,"")||"event"}
function exportJSON(){download(new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),`space-planner-${new Date().toISOString().slice(0,10)}.json`);showToast("ส่งออกข้อมูลสำรองแล้ว")}
function exportCSV(){const event=currentEvent();const rows=[["พื้นที่","ประเภทพื้นที่","ชื่อร้าน","ประเภทสินค้า","กว้าง (ม.)","ลึก (ม.)","ตร.ม.","สถานะ","ผู้ติดต่อ","เบอร์โทร","อีเมล/LINE","วันที่เริ่ม","วันที่สิ้นสุด","รายละเอียด"]];for(const id of spaceIds(event.publishedLayout)){const a=event.spaces[id].assignment,g=event.publishedLayout[id];rows.push([slotLabel(id,g),g.kind==="stage"?"เวที":"บูธ",a.shopName,a.category,g.widthM,g.depthM,areaOf(g),STATUS[a.status],a.contact,a.phone,a.email,a.startDate,a.endDate,a.notes])}const csv="\ufeff"+rows.map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""')}"`).join(",")).join("\r\n");download(new Blob([csv],{type:"text/csv;charset=utf-8"}),`${safeName(event.name)}-shops.csv`);showToast("ส่งออกข้อมูลร้านค้าแล้ว")}
function exportSource(){const event=currentEvent(),draft=activeView==="layout";return{event,layout:draft?event.draftLayout:event.publishedLayout,columns:draft?event.draftColumns:event.publishedColumns,guides:draft?event.draftGuides:event.publishedGuides,scale:draft?event.draftObjectScale:event.publishedObjectScale,opacity:draft?event.draftBackgroundOpacity:event.publishedBackgroundOpacity};}
function fitCanvasText(context,text,maxWidth,fontSize,weight=700){let size=fontSize;do{context.font=`${weight} ${size}px "IBM Plex Sans Thai",sans-serif`;if(context.measureText(text).width<=maxWidth||size<=8)break;size-=1;}while(size>8);context.fillText(text,0,0,maxWidth);}
function roundedRectPath(context,x,y,width,height,radius){const r=Math.min(radius,width/2,height/2);context.beginPath();context.moveTo(x+r,y);context.arcTo(x+width,y,x+width,y+height,r);context.arcTo(x+width,y+height,x,y+height,r);context.arcTo(x,y+height,x,y,r);context.arcTo(x,y,x+width,y,r);context.closePath();}
async function renderPlanCanvas(){
  const image=document.querySelector("#planImage");
  if(!image.complete)await image.decode();
  const source=exportSource(),{event,layout,columns,guides,scale,opacity}=source,planWidth=image.naturalWidth||1457,planHeight=image.naturalHeight||1080,padding=44,canvas=document.createElement("canvas");canvas.width=planWidth+padding*2;canvas.height=planHeight+padding*2;
  const context=canvas.getContext("2d"),px=value=>padding+value/100*planWidth,py=value=>padding+value/100*planHeight;
  context.fillStyle="#fbfaf6";context.fillRect(0,0,canvas.width,canvas.height);context.save();context.globalAlpha=clamp(opacity,.08,1);context.filter="saturate(.58) contrast(.82)";context.drawImage(image,padding,padding,planWidth,planHeight);context.restore();context.textAlign="center";context.textBaseline="middle";
  for(const id of spaceIds(layout)){
    const geometry=layout[id],assignment=event.spaces[id]?.assignment||blankAssignment(),x=px(geometry.left),y=py(geometry.top),w=geometry.width*scale/100*planWidth,h=geometry.height*scale/100*planHeight,isStage=geometry.kind==="stage",palette=assignment.status==="confirmed"?["#185b44","#0b4934","#fff"]:assignment.status==="hold"?["#f6d375","#c69c32","#5f4b10"]:assignment.status==="setup"?["#eeafc1","#cd7892","#76394d"]:isStage?["#9b6427","#d6a43f","#fff"]:["#e8ede2","#7f9674","#173f32"],radius=Math.min(isStage?18:10,w*.16,h*.16);
    context.save();context.translate(x+w/2,y+h/2);context.rotate((geometry.rotation||0)*Math.PI/180);context.shadowColor="rgba(22,45,36,.22)";context.shadowBlur=12;context.shadowOffsetY=5;roundedRectPath(context,-w/2,-h/2,w,h,radius);context.fillStyle=palette[0];context.fill();context.shadowColor="transparent";context.lineWidth=isStage?4:2;context.strokeStyle=palette[1];context.stroke();if(isStage){roundedRectPath(context,-w/2+7,-h/2+7,w-14,h-14,Math.max(4,radius-6));context.lineWidth=2;context.strokeStyle="rgba(255,230,158,.95)";context.stroke();}context.fillStyle=palette[2];context.save();context.translate(0,-h*.23);fitCanvasText(context,isStage?(id==="EVENT"?"EVENT":id):id,Math.max(20,w-12),Math.max(9,Math.min(18,h*.2)));context.restore();context.save();context.translate(0,0);fitCanvasText(context,assignment.shopName||STATUS[assignment.status],Math.max(20,w-12),Math.max(8,Math.min(15,h*.16)),600);context.restore();context.save();context.translate(0,h*.24);fitCanvasText(context,`${areaOf(geometry)} ตร.ม.`,Math.max(20,w-12),Math.max(8,Math.min(13,h*.14)),600);context.restore();context.restore();
  }
  for(const column of Object.values(columns||{})){const x=px(column.left),y=py(column.top),r=Math.max(2,column.size/200*planWidth);context.beginPath();context.arc(x,y,r,0,Math.PI*2);context.fillStyle="#aeb2ae";context.shadowColor="rgba(22,35,29,.2)";context.shadowBlur=7;context.fill();context.shadowColor="transparent";context.lineWidth=2;context.strokeStyle="#747a75";context.stroke();context.fillStyle="#1e2321";const core=Math.max(3,r*.18);context.fillRect(x-core/2,y-core/2,core,core);}
  for(const guide of Object.values(guides||{})){const x=px(guide.left),y=py(guide.top),guideRatio=(guide.orientation==="vertical"?3.8:2.7)*scale,length=guide.lengthM*guideRatio/100*(guide.orientation==="horizontal"?planWidth:planHeight),endX=guide.orientation==="horizontal"?x+length:x,endY=guide.orientation==="vertical"?y+length:y;context.beginPath();context.moveTo(x,y);context.lineTo(endX,endY);context.strokeStyle="#315f75";context.lineWidth=3;context.stroke();context.fillStyle="#173f32";context.font='700 13px "IBM Plex Sans Thai",sans-serif';context.fillText(`${round(guide.lengthM)} ม.`,guide.orientation==="horizontal"?x+length/2:x+28,guide.orientation==="vertical"?y+length/2:y-16);}
  return canvas;
}
async function printPlan(){try{const canvas=await renderPlanCanvas(),frame=document.createElement("iframe"),title=escapeHTML(currentEvent().name);frame.className="print-frame";document.body.append(frame);frame.srcdoc=`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>@page{size:A4 landscape;margin:0}*{box-sizing:border-box}html,body{margin:0;width:297mm;height:210mm;overflow:hidden;background:#fff}body{display:grid;place-items:center;padding:8mm}img{display:block;max-width:281mm;max-height:194mm;width:auto;height:auto;object-fit:contain}</style></head><body><img src="${canvas.toDataURL("image/png")}" alt="${title}"></body></html>`;frame.addEventListener("load",()=>setTimeout(()=>{const cleanup=()=>frame.remove();frame.contentWindow.addEventListener("afterprint",cleanup,{once:true});frame.contentWindow.focus();frame.contentWindow.print();setTimeout(cleanup,5000);},120),{once:true});}catch(_){showToast("ไม่สามารถสร้าง PDF ได้ในขณะนี้");}}
async function exportPlanPNG(){try{const canvas=await renderPlanCanvas(),event=currentEvent();canvas.toBlob(blob=>{if(blob)download(blob,`${safeName(event.name)}-plan.png`);},"image/png");showToast(activeView==="layout"?"สร้างรูปจากฉบับร่างแล้ว":"สร้างรูปภาพแปลนแล้ว");}catch(_){showToast("ไม่สามารถสร้างรูปภาพได้ในขณะนี้");}}
document.querySelector("#importFile").addEventListener("change",async event=>{const file=event.target.files?.[0];if(!file)return;try{const incoming=normalizePlanner(JSON.parse(await file.text()));if(!incoming.events?.length)throw new Error();snapshot();state=incoming;selectedId=null;await persist("นำเข้าข้อมูลเรียบร้อย");render()}catch(_){showToast("ไฟล์ข้อมูลไม่ถูกต้อง")}event.target.value=""});

function registerModelTools(){const context=document.modelContext;if(!context?.registerTool)return;try{void Promise.resolve(context.registerTool({name:"assign_shop_to_space",title:"Assign shop to space",description:"Assign or update a shop in the active event without changing the published physical layout.",inputSchema:{type:"object",properties:{spaceId:{type:"string"},shopName:{type:"string"},status:{type:"string",enum:Object.keys(STATUS)},phone:{type:"string"}},required:["spaceId","shopName"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){const id=String(input?.spaceId||"").toUpperCase();const plannerEvent=currentEvent();if(!plannerEvent.publishedLayout[id])throw new Error("Unknown space");snapshot();plannerEvent.spaces[id].assignment={...plannerEvent.spaces[id].assignment,shopName:String(input.shopName).trim(),status:input.status||plannerEvent.spaces[id].assignment.status,phone:input.phone||plannerEvent.spaces[id].assignment.phone};selectedId=id;void persist("");render();return{spaceId:id,shopName:plannerEvent.spaces[id].assignment.shopName}}})).catch(()=>{})}catch(_){}}

render();void(async()=>{await hydrateMember();state=loadFallback();render();await hydrate()})();setInterval(syncFromCloud,6000);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void syncFromCloud()});registerModelTools();
