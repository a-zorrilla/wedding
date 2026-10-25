const STORAGE_KEY = "wedding-invites:v1";

const STATUSES = [
  { id: "unsorted", label: "Not yet sorted", empty: "New names land here." },
  { id: "invited", label: "Invited", empty: "Drag someone here to invite them." },
  { id: "maybe", label: "Maybe", empty: "Drag someone here if you're still deciding." },
];

const SUMMARY_SCOPES = [
  { id: "invited", label: "Invited" },
  { id: "maybe", label: "Maybe" },
  { id: "unsorted", label: "Not yet sorted" },
  { id: "all", label: "Everyone" },
];

const SIDES = [
  { id: "anna", label: "Anna" },
  { id: "alec", label: "Alec" },
  { id: "both", label: "Both" },
];

const RELATIONSHIPS = [
  { id: "family", label: "Family" },
  { id: "friend", label: "Friend" },
  { id: "work", label: "Work" },
  { id: "other", label: "Other" },
];

const state = { version: 1, people: [], parties: [] };

const ui = {
  search: "",
  sides: new Set(),
  relationships: new Set(),
  weddingParty: false,
  notWeddingParty: false,
  hasPlusOne: false,
  tags: new Set(),
  editingId: null,
  partyQuery: "",
  view: "board",
  summaryScope: "invited",
};

let dragId = null;
let suppressClick = false;
let saveFailed = false;
let toastTimer = 0;

function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch (err) {
      /* file:// pages are not a secure context in every browser */
    }
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function labelFor(list, id) {
  const found = list.find((item) => item.id === id);
  return found ? found.label : "";
}

function byOrder(a, b) {
  return a.order - b.order || a.name.localeCompare(b.name);
}

function normalizeStatus(status) {
  const id = status === "not_invited" ? "maybe" : status;
  return STATUSES.some((item) => item.id === id) ? id : "unsorted";
}

function normalizePerson(raw) {
  const person = raw && typeof raw === "object" ? raw : {};
  const tags = Array.isArray(person.tags) ? person.tags : [];
  return {
    id: String(person.id || uid()),
    name: cleanName(person.name).slice(0, 120) || "Untitled",
    status: normalizeStatus(person.status),
    side: SIDES.some((item) => item.id === person.side) ? person.side : null,
    relationship: RELATIONSHIPS.some((item) => item.id === person.relationship) ? person.relationship : null,
    weddingParty: Boolean(person.weddingParty),
    tags: [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 24),
    notes: String(person.notes || "").slice(0, 2000),
    partyId: person.partyId ? String(person.partyId) : null,
    unnamedPlusOne: Boolean(person.unnamedPlusOne),
    plusOneLabel: String(person.plusOneLabel || "").trim().slice(0, 40),
    order: Number.isFinite(Number(person.order)) ? Number(person.order) : 0,
  };
}

function normalizeState(data) {
  if (!data || !Array.isArray(data.people)) return null;
  const seen = new Set();
  const people = data.people.filter((person) => person && typeof person === "object").map((person) => {
    const next = normalizePerson(person);
    if (seen.has(next.id)) next.id = uid();
    seen.add(next.id);
    return next;
  });
  const parties = [];
  const partyIds = new Set();
  (Array.isArray(data.parties) ? data.parties : []).forEach((party) => {
    if (!party || !party.id || partyIds.has(String(party.id))) return;
    partyIds.add(String(party.id));
    parties.push({ id: String(party.id), name: String(party.name || "").trim().slice(0, 80) });
  });
  people.forEach((person) => {
    if (!person.partyId) return;
    if (!partyIds.has(person.partyId)) {
      partyIds.add(person.partyId);
      parties.push({ id: person.partyId, name: "" });
    }
  });
  return { version: 1, people, parties };
}

function resequence(status) {
  state.people.filter((person) => person.status === status).sort(byOrder).forEach((person, index) => {
    person.order = index;
  });
}

function resequenceAll() {
  STATUSES.forEach((status) => resequence(status.id));
}

// The integrated app owns persistence. Never auto-import unrelated browser localStorage.
function load() {}
function save() {
  if (window.WeddingBridge && window.WeddingBridge.queueGuestSave) {
    window.WeddingBridge.queueGuestSave({ version: 1, people: state.people, parties: state.parties });
  }
}

function toast(message) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 3400);
}

function getPerson(id) {
  return state.people.find((person) => person.id === id) || null;
}

function current() {
  return ui.editingId ? getPerson(ui.editingId) : null;
}

function getParty(id) {
  return state.parties.find((party) => party.id === id) || null;
}

function othersInParty(person) {
  if (!person || !person.partyId) return [];
  return state.people
    .filter((other) => other.partyId === person.partyId && other.id !== person.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function personHasPlus(person) {
  return person.unnamedPlusOne || othersInParty(person).length > 0;
}

function allTags() {
  const tags = new Set();
  state.people.forEach((person) => person.tags.forEach((tag) => tags.add(tag)));
  return [...tags].sort((a, b) => a.localeCompare(b));
}

function filtersActive() {
  return Boolean(
    ui.search.trim() ||
    ui.sides.size ||
    ui.relationships.size ||
    ui.weddingParty ||
    ui.notWeddingParty ||
    ui.hasPlusOne ||
    ui.tags.size
  );
}

function matches(person) {
  if (ui.sides.size && !ui.sides.has(person.side)) return false;
  if (ui.relationships.size && !ui.relationships.has(person.relationship)) return false;
  if (ui.weddingParty && !person.weddingParty) return false;
  if (ui.notWeddingParty && person.weddingParty) return false;
  if (ui.hasPlusOne && !personHasPlus(person)) return false;
  for (const tag of ui.tags) {
    if (!person.tags.some((own) => own.toLowerCase() === tag.toLowerCase())) return false;
  }
  const query = ui.search.trim().toLowerCase();
  if (!query) return true;
  const party = getParty(person.partyId);
  const blob = [
    person.name,
    person.notes,
    person.tags.join(" "),
    party ? party.name : "",
    othersInParty(person).map((other) => other.name).join(" "),
  ].join(" ").toLowerCase();
  return blob.includes(query);
}

function formatNames(names) {
  const safe = names.map(esc);
  if (safe.length <= 1) return safe[0] || "";
  if (safe.length === 2) return `${safe[0]} and ${safe[1]}`;
  return `${safe.slice(0, -1).join(", ")}, and ${safe[safe.length - 1]}`;
}

function nextOrder(status) {
  const orders = state.people.filter((person) => person.status === status).map((person) => person.order);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

function addPerson(raw) {
  const name = cleanName(raw).slice(0, 120);
  if (!name) return false;
  const duplicate = state.people.some((person) => person.name.toLowerCase() === name.toLowerCase());
  if (duplicate && !window.confirm(`${name} is already on the list. Add another person with this name?`)) {
    return false;
  }
  state.people.push({
    id: uid(),
    name,
    status: "unsorted",
    side: null,
    relationship: null,
    weddingParty: false,
    tags: [],
    notes: "",
    partyId: null,
    unnamedPlusOne: false,
    plusOneLabel: "",
    order: nextOrder("unsorted"),
  });
  save();
  render();
  return true;
}

function placePerson(id, status, beforeId) {
  const person = getPerson(id);
  if (!person || !STATUSES.some((item) => item.id === status)) return;
  const oldStatus = person.status;
  const others = state.people.filter((item) => item.status === status && item.id !== id).sort(byOrder);
  let index = others.length;
  if (beforeId) {
    const found = others.findIndex((item) => item.id === beforeId);
    if (found >= 0) index = found;
  }
  person.status = status;
  others.splice(index, 0, person);
  others.forEach((item, order) => {
    item.order = order;
  });
  if (oldStatus !== status) resequence(oldStatus);
  save();
  render();
  syncPanelStatus();
  syncPlusHint();
  if (document.getElementById("party-list")) renderPartyList();
}

function ensureParty(person) {
  if (person.partyId && getParty(person.partyId)) return person.partyId;
  const id = uid();
  state.parties.push({ id, name: "" });
  person.partyId = id;
  return id;
}

function pruneParties() {
  const used = new Set(state.people.map((person) => person.partyId).filter(Boolean));
  state.parties = state.parties.filter((party) => used.has(party.id));
}

function linkPerson(otherId, linked) {
  const person = current();
  const other = getPerson(otherId);
  if (!person || !other || other.id === person.id) return;
  if (linked) {
    if (other.partyId && other.partyId !== person.partyId) {
      const leftBehind = state.people.filter((item) => item.partyId === other.partyId && item.id !== other.id);
      if (leftBehind.length) {
        const names = leftBehind.map((item) => item.name).join(", ");
        const ok = window.confirm(`${other.name} is already with ${names}. Move them into this party?`);
        if (!ok) {
          renderPartyList();
          return;
        }
      }
    }
    const partyId = ensureParty(person);
    other.partyId = partyId;
  } else if (other.partyId && other.partyId === person.partyId) {
    other.partyId = null;
  }
  pruneParties();
  save();
  render();
  renderPartyList();
}

function deleteCurrent() {
  const person = current();
  if (!person) return;
  if (!window.confirm(`Remove ${person.name} from the list?`)) return;
  state.people = state.people.filter((item) => item.id !== person.id);
  pruneParties();
  resequenceAll();
  save();
  closeEditor();
}

function setChoice(group, value) {
  const person = current();
  if (!person || (group !== "side" && group !== "relationship")) return;
  person[group] = person[group] === value ? null : value;
  save();
  render();
  syncChoiceButtons();
}

function addTagFromInput() {
  const input = document.getElementById("tag-input");
  const person = current();
  if (!input || !person) return;
  const tag = input.value.trim().replace(/\s+/g, " ");
  if (!tag) return;
  if (tag.length > 40) {
    toast("Tags are limited to 40 characters.");
    return;
  }
  if (person.tags.some((own) => own.toLowerCase() === tag.toLowerCase())) {
    input.value = "";
    return;
  }
  person.tags.push(tag);
  input.value = "";
  save();
  render();
  renderTagList();
  input.focus();
}

function removeTag(tag) {
  const person = current();
  if (!person) return;
  person.tags = person.tags.filter((own) => own !== tag);
  save();
  render();
  renderTagList();
}

function invitedOutsidePartyCount() {
  return state.people.filter((person) => (
    person.status === "invited" &&
    othersInParty(person).some((other) => other.status !== "invited")
  )).length;
}

function rsvpHeadcount(person) {
  if (person.status !== "invited") return 0;
  return person.unnamedPlusOne ? 2 : 1;
}

function rsvpTotal(people) {
  return people.reduce((sum, person) => sum + rsvpHeadcount(person), 0);
}

function summaryCountWeight(person) {
  if (person.status === "invited") return rsvpHeadcount(person);
  return 1;
}

function renderSummary() {
  const invited = state.people.filter((person) => person.status === "invited");
  const rsvp = rsvpTotal(invited);
  const plusCards = invited.filter((person) => person.unnamedPlusOne).length;
  const unsorted = state.people.filter((person) => person.status === "unsorted").length;
  const maybe = state.people.filter((person) => person.status === "maybe").length;
  const summary = document.getElementById("summary");
  if (!state.people.length) {
    summary.textContent = "No guests yet. Add a name to start the list.";
  } else {
    const rsvpLine = rsvp !== invited.length
      ? `${rsvp} people RSVP (${invited.length} invited cards, ${plusCards} with an unnamed +1)`
      : `${rsvp} people RSVP`;
    summary.textContent = `${rsvpLine} · ${unsorted} not yet sorted · ${maybe} maybe`;
  }

  const filterLine = document.getElementById("filter-summary");
  if (filtersActive()) {
    const visible = state.people.filter(matches).length;
    filterLine.hidden = false;
    filterLine.textContent = `Showing ${visible} of ${state.people.length}`;
  } else {
    filterLine.hidden = true;
    filterLine.textContent = "";
  }

  const notice = document.getElementById("notice");
  const mismatched = invitedOutsidePartyCount();
  if (mismatched) {
    notice.hidden = false;
    notice.textContent = mismatched === 1
      ? "1 invited guest is linked to someone outside the invited list."
      : `${mismatched} invited guests are linked to someone outside the invited list.`;
  } else {
    notice.hidden = true;
    notice.textContent = "";
  }
}

function chip(kind, value, label, on, title) {
  const titleAttr = title ? ` title="${esc(title)}"` : "";
  return `<button type="button" class="chip${on ? " is-on" : ""}" data-filter="${esc(kind)}" data-value="${esc(encodeURIComponent(value))}" aria-pressed="${on ? "true" : "false"}"${titleAttr}>${esc(label)}</button>`;
}

function renderFilters() {
  const tags = allTags();
  const tagChips = tags.map((tag) => chip("tag", tag, tag, ui.tags.has(tag))).join("");
  document.getElementById("filter-bar").innerHTML = `
    <div class="filter-group">
      <span class="filter-label">Side</span>
      ${SIDES.map((side) => chip("side", side.id, side.label, ui.sides.has(side.id))).join("")}
    </div>
    <div class="filter-group">
      <span class="filter-label">Relationship</span>
      ${RELATIONSHIPS.map((item) => chip("relationship", item.id, item.label, ui.relationships.has(item.id))).join("")}
    </div>
    <div class="filter-group">
      <span class="filter-label">More</span>
      ${chip("weddingParty", "1", "Wedding party", ui.weddingParty)}
      ${chip("hasPlusOne", "1", "Has a +1", ui.hasPlusOne, "Unnamed plus-one, or linked to another named guest")}
    </div>
    ${tagChips ? `<div class="filter-group"><span class="filter-label">Tags</span>${tagChips}</div>` : ""}
    ${filtersActive() ? `<button type="button" class="text-button" id="clear-filters">Clear</button>` : ""}
  `;
}

function pillsHtml(person) {
  const pills = [];
  if (person.side) pills.push(`<span class="pill pill-${person.side}">${esc(labelFor(SIDES, person.side))}</span>`);
  if (person.relationship) pills.push(`<span class="pill">${esc(labelFor(RELATIONSHIPS, person.relationship))}</span>`);
  if (person.weddingParty) pills.push(`<span class="pill pill-party">Wedding party</span>`);
  person.tags.slice(0, 4).forEach((tag) => {
    pills.push(`<span class="pill pill-tag">${esc(tag)}</span>`);
  });
  if (person.tags.length > 4) pills.push(`<span class="pill">+${person.tags.length - 4}</span>`);
  return pills.length ? `<div class="pills">${pills.join("")}</div>` : "";
}

function metaHtml(person) {
  const bits = [];
  const others = othersInParty(person);
  if (others.length) {
    const party = getParty(person.partyId);
    const prefix = party && party.name ? `${esc(party.name)} · ` : "";
    bits.push(`<p class="with">${prefix}with ${formatNames(others.map((other) => other.name))}</p>`);
  }
  if (person.unnamedPlusOne) {
    bits.push(`<p class="plus">+1 ${esc(person.plusOneLabel || "Guest")}</p>`);
  }
  const notes = person.notes.trim();
  if (notes) bits.push(`<p class="notes-preview">${esc(notes)}</p>`);
  return bits.join("");
}

function cardHtml(person) {
  const options = STATUSES.map((status) => (
    `<option value="${status.id}"${status.id === person.status ? " selected" : ""}>${esc(status.label)}</option>`
  )).join("");
  return `
    <article class="card${person.id === ui.editingId ? " is-editing" : ""}" data-id="${esc(person.id)}" draggable="true" role="listitem">
      <span class="grip" aria-hidden="true"></span>
      <div class="card-body">
        <h3 class="card-name">${esc(person.name)}</h3>
        ${pillsHtml(person)}
        ${metaHtml(person)}
      </div>
      <select class="move-select" aria-label="Move ${esc(person.name)}" draggable="false">${options}</select>
    </article>
  `;
}

function emptyCopy(status, total) {
  if (total === 0) return status.empty;
  return "No matches in this column.";
}

function renderBoard() {
  const scrolls = new Map();
  document.querySelectorAll(".cards").forEach((list) => {
    scrolls.set(list.dataset.list, list.scrollTop);
  });
  STATUSES.forEach((status) => {
    const people = state.people.filter((person) => person.status === status.id).sort(byOrder);
    const visible = people.filter(matches);
    const list = document.querySelector(`.cards[data-list="${status.id}"]`);
    const count = document.querySelector(`[data-count="${status.id}"]`);
    count.textContent = people.length === visible.length ? String(visible.length) : `${visible.length}/${people.length}`;
    list.innerHTML = visible.length
      ? visible.map(cardHtml).join("")
      : `<p class="empty">${esc(emptyCopy(status, people.length))}</p>`;
    list.scrollTop = scrolls.get(status.id) || 0;
  });
}

function matchedPeople() {
  return state.people.filter(matches);
}

function summaryCohort() {
  const people = matchedPeople();
  if (ui.summaryScope === "all") return people;
  return people.filter((person) => person.status === ui.summaryScope);
}

function countBuckets(people, buckets, classify, weightFor = () => 1) {
  const counts = new Map(buckets.map((bucket) => [bucket.id, 0]));
  people.forEach((person) => {
    const id = classify(person);
    counts.set(id, (counts.get(id) || 0) + weightFor(person));
  });
  return buckets.map((bucket) => ({ ...bucket, count: counts.get(bucket.id) || 0 }));
}

function bubbleHtml(label, count, extraClass, drillKind, drillValue, sublabel) {
  const sub = sublabel ? `<span class="bubble-sub">${esc(sublabel)}</span>` : "";
  const drill = drillKind
    ? ` data-drill="${esc(drillKind)}" data-drill-value="${esc(encodeURIComponent(drillValue))}"`
    : "";
  return `
    <button type="button" class="bubble${extraClass ? ` ${extraClass}` : ""}"${drill} aria-label="${esc(label)}: ${count}">
      <span class="bubble-count">${count}</span>
      <span class="bubble-label">${esc(label)}</span>
      ${sub}
    </button>
  `;
}

function renderSummarySheet() {
  const sheet = document.getElementById("summary-sheet");
  const scopeLine = document.getElementById("summary-scope-line");
  if (!sheet) return;

  const matched = matchedPeople();
  const cohort = summaryCohort();
  const scopeLabel = labelFor(SUMMARY_SCOPES, ui.summaryScope);
  const invitedInCohort = cohort.filter((person) => person.status === "invited");
  const rsvpInCohort = rsvpTotal(invitedInCohort);

  if (scopeLine) {
    if (!matched.length) {
      scopeLine.textContent = filtersActive()
        ? "No guests match the current filters."
        : "Add guests on the board to see counts here.";
    } else if (ui.summaryScope === "invited") {
      const plusCards = cohort.filter((person) => person.unnamedPlusOne).length;
      scopeLine.textContent = plusCards
        ? `${rsvpInCohort} people RSVP · ${cohort.length} invited cards (${plusCards} with an unnamed +1)`
        : `${rsvpInCohort} people RSVP · ${cohort.length} invited cards`;
    } else if (ui.summaryScope === "all") {
      scopeLine.textContent = `Counting ${cohort.length} guest${cohort.length === 1 ? "" : "s"} · ${rsvpTotal(cohort)} people RSVP among invited`;
    } else {
      scopeLine.textContent = `Counting ${cohort.length} in ${scopeLabel.toLowerCase()}`;
    }
  }

  const scopeChips = SUMMARY_SCOPES.map((scope) => (
    `<button type="button" class="chip${ui.summaryScope === scope.id ? " is-on" : ""}" data-summary-scope="${esc(scope.id)}" aria-pressed="${ui.summaryScope === scope.id ? "true" : "false"}">${esc(scope.label)}</button>`
  )).join("");

  if (!cohort.length) {
    sheet.innerHTML = `
      <div class="summary-scope">
        <span class="filter-label">Show</span>
        <div class="filter-group">${scopeChips}</div>
      </div>
      <p class="hint summary-empty">Nothing to summarize yet. Try another scope or clear filters.</p>
    `;
    return;
  }

  const invitationBuckets = STATUSES.map((status) => ({ id: status.id, label: status.label }));
  const invitationCounts = countBuckets(
    matched,
    invitationBuckets,
    (person) => person.status,
    (person) => (person.status === "invited" ? rsvpHeadcount(person) : 1),
  );
  const invitationBubbles = invitationCounts.map((bucket) => {
    let sub = "";
    if (bucket.id === "invited") {
      const invited = matched.filter((person) => person.status === "invited");
      if (invited.length && bucket.count !== invited.length) sub = `${invited.length} cards`;
    }
    return bubbleHtml(bucket.label, bucket.count, `bubble-status bubble-${bucket.id}`, "summaryScope", bucket.id, sub);
  }).join("");

  const sideBuckets = [
    ...SIDES.map((side) => ({ id: side.id, label: side.label })),
    { id: "__unset", label: "Not set" },
  ];
  const sideBubbles = countBuckets(cohort, sideBuckets, (person) => person.side || "__unset", summaryCountWeight)
    .map((bucket) => bubbleHtml(
      bucket.label,
      bucket.count,
      bucket.id === "__unset" ? "bubble-muted" : `bubble-side bubble-side-${bucket.id}`,
      bucket.id === "__unset" ? null : "side",
      bucket.id,
    ))
    .join("");

  const relationshipBuckets = [
    ...RELATIONSHIPS.map((item) => ({ id: item.id, label: item.label })),
    { id: "__unset", label: "Not set" },
  ];
  const relationshipBubbles = countBuckets(cohort, relationshipBuckets, (person) => person.relationship || "__unset", summaryCountWeight)
    .map((bucket) => bubbleHtml(
      bucket.label,
      bucket.count,
      bucket.id === "__unset" ? "bubble-muted" : "",
      bucket.id === "__unset" ? null : "relationship",
      bucket.id,
    ))
    .join("");

  const partyBuckets = [
    { id: "yes", label: "Wedding party" },
    { id: "no", label: "Not in party" },
  ];
  const partyBubbles = countBuckets(cohort, partyBuckets, (person) => (person.weddingParty ? "yes" : "no"), summaryCountWeight)
    .map((bucket) => bubbleHtml(
      bucket.label,
      bucket.count,
      bucket.id === "yes" ? "bubble-party" : "bubble-muted",
      bucket.id === "yes" ? "weddingParty" : "notWeddingParty",
      bucket.id,
    ))
    .join("");

  const tagMap = new Map();
  cohort.forEach((person) => {
    const weight = summaryCountWeight(person);
    person.tags.forEach((tag) => {
      tagMap.set(tag, (tagMap.get(tag) || 0) + weight);
    });
  });
  const tagBubbles = [...tagMap.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, count]) => bubbleHtml(tag, count, "bubble-tag", "tag", tag))
    .join("");

  sheet.innerHTML = `
    <div class="summary-scope">
      <span class="filter-label">Show</span>
      <div class="filter-group">${scopeChips}</div>
    </div>
    <div class="summary-sections">
      <section class="summary-section">
        <h2 class="summary-heading">Invitation</h2>
        <p class="hint">Across everyone matching the filters above. Invited counts are people (2 per invited card with an unnamed +1).</p>
        <div class="bubble-grid">${invitationBubbles}</div>
      </section>
      <section class="summary-section">
        <h2 class="summary-heading">Closer to</h2>
        <div class="bubble-grid">${sideBubbles}</div>
      </section>
      <section class="summary-section">
        <h2 class="summary-heading">Relationship</h2>
        <div class="bubble-grid">${relationshipBubbles}</div>
      </section>
      <section class="summary-section">
        <h2 class="summary-heading">Wedding party</h2>
        <div class="bubble-grid">${partyBubbles}</div>
      </section>
      ${tagBubbles ? `<section class="summary-section"><h2 class="summary-heading">Tags</h2><div class="bubble-grid">${tagBubbles}</div></section>` : ""}
    </div>
  `;
}

function syncView() {
  const board = document.getElementById("board");
  const summaryView = document.getElementById("summary-view");
  const addForm = document.getElementById("add-form");
  if (!board || !summaryView || !addForm) return;
  const onBoard = ui.view === "board";
  board.hidden = !onBoard;
  addForm.hidden = !onBoard;
  summaryView.hidden = !onBoard ? false : true;
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === ui.view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function setView(view) {
  if (view !== "board" && view !== "summary") return;
  ui.view = view;
  if (view === "summary" && ui.editingId) {
    ui.editingId = null;
    ui.partyQuery = "";
    const panel = document.getElementById("panel");
    panel.hidden = true;
    panel.innerHTML = "";
    document.body.classList.remove("panel-open");
  }
  syncView();
  render();
}

function setSummaryScope(scope) {
  if (!SUMMARY_SCOPES.some((item) => item.id === scope)) return;
  ui.summaryScope = scope;
  render();
}

function applySummaryDrill(kind, value) {
  if (kind === "summaryScope") {
    setSummaryScope(value);
    return;
  }
  if (kind === "side") {
    ui.sides.clear();
    ui.sides.add(value);
  } else if (kind === "relationship") {
    ui.relationships.clear();
    ui.relationships.add(value);
  } else if (kind === "tag") {
    ui.tags.clear();
    ui.tags.add(value);
  } else if (kind === "weddingParty") {
    ui.weddingParty = true;
    ui.notWeddingParty = false;
  } else if (kind === "notWeddingParty") {
    ui.weddingParty = false;
    ui.notWeddingParty = true;
  }
  render();
  const search = document.getElementById("search");
  if (search) search.value = ui.search;
}

function render() {
  renderSummary();
  renderFilters();
  syncView();
  if (ui.view === "board") renderBoard();
  else renderSummarySheet();
}

function choiceButtons(group, items) {
  return items.map((item) => (
    `<button type="button" class="choice" data-choice="${group}" data-value="${item.id}">${esc(item.label)}</button>`
  )).join("");
}

function renderTagList() {
  const el = document.getElementById("tag-list");
  const person = current();
  if (!el || !person) return;
  el.innerHTML = person.tags.map((tag) => (
    `<span class="tag-chip">${esc(tag)}<button type="button" class="tag-x" data-action="remove-tag" data-tag="${esc(encodeURIComponent(tag))}" aria-label="Remove tag ${esc(tag)}">×</button></span>`
  )).join("");
}

function renderPartyList() {
  const el = document.getElementById("party-list");
  const summary = document.getElementById("party-summary");
  const person = current();
  if (!el || !person) return;
  const others = othersInParty(person);
  if (summary) {
    summary.textContent = others.length
      ? `Linked with ${others.map((other) => other.name).join(", ")}. Each person keeps their own invitation.`
      : "Not linked to another named guest yet.";
  }
  const query = ui.partyQuery.trim().toLowerCase();
  const rows = state.people
    .filter((other) => other.id !== person.id)
    .filter((other) => {
      if (!query) return true;
      return other.name.toLowerCase().includes(query) || (person.partyId && other.partyId === person.partyId);
    })
    .sort((a, b) => {
      const aLinked = person.partyId && a.partyId === person.partyId ? 0 : 1;
      const bLinked = person.partyId && b.partyId === person.partyId ? 0 : 1;
      if (aLinked !== bLinked) return aLinked - bLinked;
      return a.name.localeCompare(b.name);
    });
  if (!rows.length) {
    el.innerHTML = `<p class="hint">${state.people.length < 2 ? "Add another guest, then link them here." : "No guests match that search."}</p>`;
    return;
  }
  el.innerHTML = rows.map((other) => {
    const checked = person.partyId && other.partyId === person.partyId ? " checked" : "";
    return `
      <label class="party-row">
        <input class="party-check" type="checkbox" value="${esc(other.id)}"${checked}>
        <span class="party-person">
          <span>${esc(other.name)}</span>
          <span class="party-status">${esc(labelFor(STATUSES, other.status))}</span>
        </span>
      </label>
    `;
  }).join("");
}

function plusHint(person) {
  if (!person.unnamedPlusOne) {
    return "An unnamed +1 counts as 2 people on your RSVP total when this guest is invited. It does not create another card.";
  }
  if (person.status === "invited") return "Counts as 2 people on your RSVP total (this guest and their plus-one).";
  return "Not counted toward RSVP until this guest is invited.";
}

function syncPlusHint() {
  const el = document.getElementById("plus-hint");
  const person = current();
  if (!el || !person) return;
  el.textContent = plusHint(person);
}

function syncChoiceButtons() {
  const person = current();
  if (!person) return;
  document.querySelectorAll("[data-choice]").forEach((button) => {
    const on = person[button.dataset.choice] === button.dataset.value;
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function syncPanelStatus() {
  const select = document.getElementById("edit-status");
  const person = current();
  if (select && person) select.value = person.status;
}

function renderPanel() {
  const person = current();
  const panel = document.getElementById("panel");
  if (!person) {
    closeEditor();
    return;
  }
  const statusOptions = STATUSES.map((status) => (
    `<option value="${status.id}">${esc(status.label)}</option>`
  )).join("");
  panel.hidden = false;
  document.body.classList.add("panel-open");
  panel.innerHTML = `
    <div class="panel-head">
      <p class="eyebrow">Guest</p>
      <button type="button" class="button" data-action="close-panel">Close</button>
    </div>
    <div class="panel-body">
      <input id="edit-name" type="text" maxlength="120" aria-label="Name" spellcheck="false" autocomplete="off">
      <label class="field">
        <span>Invitation</span>
        <select id="edit-status" class="field-input">${statusOptions}</select>
      </label>
      <div class="field">
        <span>Closer to</span>
        <div class="choice-row">${choiceButtons("side", SIDES)}</div>
      </div>
      <div class="field">
        <span>Relationship</span>
        <div class="choice-row">${choiceButtons("relationship", RELATIONSHIPS)}</div>
      </div>
      <label class="check"><input type="checkbox" id="wedding-party"> Wedding party</label>
      <div class="field">
        <span>Tags</span>
        <div id="tag-list" class="tag-list"></div>
        <div class="tag-editor">
          <input id="tag-input" type="text" maxlength="40" placeholder="Add a tag" aria-label="Add a tag" autocomplete="off">
          <button type="button" class="button" data-action="add-tag">Add</button>
        </div>
      </div>
      <label class="field">
        <span>Notes</span>
        <textarea id="edit-notes" maxlength="2000"></textarea>
      </label>
      <div class="field">
        <span>Unnamed +1</span>
        <label class="check"><input type="checkbox" id="plus-one"> This guest is bringing someone unnamed</label>
        <label class="field" id="plus-label-row">
          <span>What to call them</span>
          <input id="plus-label" type="text" maxlength="40" placeholder="Guest" autocomplete="off">
        </label>
        <p class="hint" id="plus-hint"></p>
      </div>
      <div class="field">
        <span>Named party</span>
        <p class="hint">Link people who are each named, like a couple or a family. They stay separate, so you can invite one and not the other.</p>
        <label class="field">
          <span>Party name</span>
          <input id="party-name" type="text" maxlength="80" placeholder="Optional, like Chen family" autocomplete="off">
        </label>
        <p id="party-summary" class="hint"></p>
        <input id="party-query" type="search" placeholder="Search guests to link" aria-label="Search guests to link" autocomplete="off">
        <div id="party-list" class="party-list"></div>
      </div>
      <button type="button" class="button danger" data-action="delete-person">Remove from list</button>
    </div>
  `;
  const nameInput = document.getElementById("edit-name");
  nameInput.dataset.personId = person.id;
  nameInput.value = person.name;
  document.getElementById("edit-status").value = person.status;
  document.getElementById("wedding-party").checked = person.weddingParty;
  document.getElementById("edit-notes").value = person.notes;
  document.getElementById("plus-one").checked = person.unnamedPlusOne;
  document.getElementById("plus-label").value = person.plusOneLabel;
  document.getElementById("plus-label-row").hidden = !person.unnamedPlusOne;
  const party = getParty(person.partyId);
  document.getElementById("party-name").value = party ? party.name : "";
  document.getElementById("party-query").value = ui.partyQuery;
  syncChoiceButtons();
  syncPlusHint();
  renderTagList();
  renderPartyList();
}

function openEditor(id) {
  if (!getPerson(id) || ui.editingId === id) return;
  ui.editingId = id;
  ui.partyQuery = "";
  renderPanel();
  render();
  const name = document.getElementById("edit-name");
  name.focus();
  name.select();
}

function closeEditor() {
  ui.editingId = null;
  ui.partyQuery = "";
  const panel = document.getElementById("panel");
  panel.hidden = true;
  panel.innerHTML = "";
  document.body.classList.remove("panel-open");
  render();
}

function toggleSet(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
}

function toggleFilter(kind, value) {
  if (kind === "side") toggleSet(ui.sides, value);
  else if (kind === "relationship") toggleSet(ui.relationships, value);
  else if (kind === "tag") toggleSet(ui.tags, value);
  else if (kind === "weddingParty") {
    ui.weddingParty = !ui.weddingParty;
    if (ui.weddingParty) ui.notWeddingParty = false;
  }
  else if (kind === "hasPlusOne") ui.hasPlusOne = !ui.hasPlusOne;
  else return;
  render();
  document.querySelectorAll("[data-filter]").forEach((button) => {
    if (button.dataset.filter === kind && decodeURIComponent(button.dataset.value) === value) button.focus();
  });
}

function clearFilters() {
  ui.search = "";
  ui.sides.clear();
  ui.relationships.clear();
  ui.weddingParty = false;
  ui.notWeddingParty = false;
  ui.hasPlusOne = false;
  ui.tags.clear();
  const search = document.getElementById("search");
  if (search) search.value = "";
  render();
}

function localStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function downloadBackup() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    people: state.people,
    parties: state.parties,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wedding-invites-${localStamp()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Backup downloaded.");
}

function restoreBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const next = normalizeState(JSON.parse(String(reader.result)));
      if (!next) {
        window.alert("That file doesn't look like a guest list backup.");
        return;
      }
      const ok = window.confirm(`Replace the SHARED guest list for both of you with ${next.people.length} people from this backup? Download a current backup first if needed.`);
      if (!ok) return;
      state.people = next.people;
      state.parties = next.parties;
      resequenceAll();
      ui.editingId = null;
      ui.partyQuery = "";
      document.getElementById("panel").hidden = true;
      document.getElementById("panel").innerHTML = "";
      document.body.classList.remove("panel-open");
      save();
      render();
      toast("Backup restored.");
    } catch (err) {
      window.alert("That file doesn't look like a guest list backup.");
    }
  };
  reader.readAsText(file);
}

function getDragAfterElement(list, y) {
  const cards = [...list.querySelectorAll(".card:not(.is-dragging)")];
  return cards.reduce((closest, card) => {
    const box = card.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: card };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function clearDrag() {
  dragId = null;
  document.querySelectorAll(".is-dragging, .is-over").forEach((el) => {
    el.classList.remove("is-dragging", "is-over");
  });
  document.querySelectorAll(".drop-marker").forEach((el) => el.remove());
}

function bindDrag() {
  const board = document.getElementById("board");

  board.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".card");
    if (!card || event.target.closest("select, input, textarea, button")) {
      event.preventDefault();
      return;
    }
    dragId = card.dataset.id;
    card.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.dataset.id);
  });

  board.addEventListener("dragover", (event) => {
    const column = event.target.closest(".column");
    if (!column || !dragId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    board.querySelectorAll(".column").forEach((item) => {
      item.classList.toggle("is-over", item === column);
    });
    const list = column.querySelector(".cards");
    let marker = board.querySelector(".drop-marker");
    if (!marker) {
      marker = document.createElement("div");
      marker.className = "drop-marker";
      marker.setAttribute("aria-hidden", "true");
    }
    const after = getDragAfterElement(list, event.clientY);
    if (after) list.insertBefore(marker, after);
    else list.appendChild(marker);
  });

  board.addEventListener("drop", (event) => {
    const column = event.target.closest(".column");
    const id = dragId;
    if (!column || !id) return;
    event.preventDefault();
    const before = getDragAfterElement(column.querySelector(".cards"), event.clientY);
    suppressClick = true;
    clearDrag();
    placePerson(id, column.dataset.status, before ? before.dataset.id : null);
    window.setTimeout(() => {
      suppressClick = false;
    }, 200);
  });

  board.addEventListener("dragend", () => {
    suppressClick = true;
    clearDrag();
    window.setTimeout(() => {
      suppressClick = false;
    }, 200);
  });
}

function bindEvents() {
  document.getElementById("add-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("add-name");
    if (addPerson(input.value)) input.value = "";
    input.focus();
  });

  document.getElementById("search").addEventListener("input", (event) => {
    ui.search = event.target.value;
    render();
  });

  document.getElementById("download-backup").addEventListener("click", downloadBackup);
  document.getElementById("restore-backup").addEventListener("click", () => {
    document.getElementById("restore-file").click();
  });
  document.getElementById("restore-file").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file) restoreBackup(file);
  });

  document.addEventListener("mousedown", (event) => {
    const card = event.target.closest(".card");
    if (!card) return;
    card.draggable = !event.target.closest("select, input, textarea, button");
  });

  document.addEventListener("mouseup", () => {
    document.querySelectorAll(".card").forEach((card) => {
      card.draggable = true;
    });
  });

  document.addEventListener("click", (event) => {
    const viewTab = event.target.closest("[data-view]");
    if (viewTab) {
      setView(viewTab.dataset.view);
      return;
    }
    const scopeChip = event.target.closest("[data-summary-scope]");
    if (scopeChip) {
      setSummaryScope(scopeChip.dataset.summaryScope);
      return;
    }
    const drill = event.target.closest("[data-drill]");
    if (drill) {
      applySummaryDrill(drill.dataset.drill, decodeURIComponent(drill.dataset.drillValue));
      return;
    }
    const filter = event.target.closest("[data-filter]");
    if (filter) {
      toggleFilter(filter.dataset.filter, decodeURIComponent(filter.dataset.value));
      return;
    }
    if (event.target.closest("#clear-filters")) {
      clearFilters();
      return;
    }
    if (event.target.closest("[data-action='close-panel']")) {
      closeEditor();
      return;
    }
    if (event.target.closest("[data-action='delete-person']")) {
      deleteCurrent();
      return;
    }
    if (event.target.closest("[data-action='add-tag']")) {
      addTagFromInput();
      return;
    }
    const remove = event.target.closest("[data-action='remove-tag']");
    if (remove) {
      removeTag(decodeURIComponent(remove.dataset.tag));
      return;
    }
    const choice = event.target.closest("[data-choice]");
    if (choice) {
      setChoice(choice.dataset.choice, choice.dataset.value);
      return;
    }
    const card = event.target.closest(".card");
    if (suppressClick) return;
    if (card && card.closest("#board") && !event.target.closest("select, input, textarea, button")) {
      openEditor(card.dataset.id);
    }
  });

  document.addEventListener("change", (event) => {
    const person = current();
    if (event.target.classList.contains("move-select")) {
      const card = event.target.closest(".card");
      if (card) placePerson(card.dataset.id, event.target.value, null);
      return;
    }
    if (!person) return;
    if (event.target.id === "edit-status") {
      placePerson(person.id, event.target.value, null);
      return;
    }
    if (event.target.id === "wedding-party") {
      person.weddingParty = event.target.checked;
      save();
      render();
      return;
    }
    if (event.target.id === "plus-one") {
      person.unnamedPlusOne = event.target.checked;
      document.getElementById("plus-label-row").hidden = !person.unnamedPlusOne;
      save();
      render();
      syncPlusHint();
      return;
    }
    if (event.target.classList.contains("party-check")) {
      linkPerson(event.target.value, event.target.checked);
    }
  });

  document.addEventListener("input", (event) => {
    const person = current();
    if (event.target.id === "party-query") {
      ui.partyQuery = event.target.value;
      renderPartyList();
      return;
    }
    if (!person) return;
    if (event.target.id === "edit-name") {
      person.name = event.target.value;
      save();
      render();
    } else if (event.target.id === "edit-notes") {
      person.notes = event.target.value.slice(0, 2000);
      save();
      render();
    } else if (event.target.id === "plus-label") {
      person.plusOneLabel = event.target.value.slice(0, 40);
      save();
      render();
    } else if (event.target.id === "party-name") {
      const partyId = ensureParty(person);
      getParty(partyId).name = event.target.value.slice(0, 80);
      save();
      render();
      const summary = document.getElementById("party-summary");
      if (summary && !othersInParty(person).length && !event.target.value.trim()) {
        summary.textContent = "Not linked to another named guest yet.";
      }
    }
  });

  document.addEventListener("focusout", (event) => {
    if (event.target.id !== "edit-name") return;
    const person = getPerson(event.target.dataset.personId);
    if (!person) return;
    const name = cleanName(event.target.value).slice(0, 120) || "Untitled";
    const changed = person.name !== name;
    person.name = name;
    if (event.target.isConnected && ui.editingId === person.id) event.target.value = person.name;
    if (!changed) return;
    save();
    render();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ui.editingId) {
      closeEditor();
      return;
    }
    if (event.key === "Enter" && event.target.id === "tag-input") {
      event.preventDefault();
      addTagFromInput();
    }
  });

  document.addEventListener("dragover", (event) => {
    if (dragId) event.preventDefault();
  });

  document.addEventListener("drop", (event) => {
    if (dragId && !event.target.closest("#board")) event.preventDefault();
  });
}

window.GuestListApp = {
  hydrate(data) {
    const next = normalizeState(data);
    if (!next) throw new Error('Guest list data is invalid');
    state.people = next.people;
    state.parties = next.parties;
    resequenceAll();
    closeEditor();
    render();
  },
  snapshot() {
    return JSON.parse(JSON.stringify({ version: 1, people: state.people, parties: state.parties }));
  },
  editing() { return Boolean(ui.editingId); },
  downloadBackup,
  refresh() { render(); },
};

function init() {
  load();
  bindDrag();
  bindEvents();
  render();
}

init();