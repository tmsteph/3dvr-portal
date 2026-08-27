const STORAGE_KEY = "3dvr.ideaGarden.v1";

const form = document.querySelector("#ideaForm");
const input = document.querySelector("#ideaInput");
const list = document.querySelector("#ideaList");
const emptyState = document.querySelector("#emptyState");
const clearDone = document.querySelector("#clearDone");

let ideas = loadIdeas();
render();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  ideas.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    text,
    stage: "seed",
    createdAt: new Date().toISOString(),
  });

  persist();
  input.value = "";
  input.focus();
  render();
});

clearDone.addEventListener("click", () => {
  ideas = ideas.filter((idea) => idea.stage !== "done");
  persist();
  render();
});

list.addEventListener("change", (event) => {
  if (!event.target.matches("select[data-id]")) return;
  const idea = ideas.find((item) => item.id === event.target.dataset.id);
  if (!idea) return;
  idea.stage = event.target.value;
  persist();
  render();
});

list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-delete]");
  if (!button) return;
  ideas = ideas.filter((idea) => idea.id !== button.dataset.delete);
  persist();
  render();
});

function loadIdeas() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
}

function render() {
  list.innerHTML = "";
  emptyState.hidden = ideas.length > 0;
  clearDone.hidden = !ideas.some((idea) => idea.stage === "done");

  for (const idea of ideas) {
    const card = document.createElement("article");
    card.className = "idea-card";
    card.dataset.stage = idea.stage;

    const copy = document.createElement("div");
    copy.className = "idea-copy";
    copy.textContent = idea.text;

    const meta = document.createElement("div");
    meta.className = "idea-meta";

    const date = document.createElement("small");
    date.textContent = `Planted ${formatDate(idea.createdAt)}`;

    const controls = document.createElement("div");
    controls.className = "idea-controls";

    const select = document.createElement("select");
    select.dataset.id = idea.id;
    select.setAttribute("aria-label", `Stage for ${idea.text}`);
    select.innerHTML = `
      <option value="seed">🌱 Seed</option>
      <option value="exploring">✨ Exploring</option>
      <option value="project">🛠 Project</option>
      <option value="done">✓ Finished</option>
    `;
    select.value = idea.stage;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.dataset.delete = idea.id;
    remove.textContent = "Remove";

    controls.append(select, remove);
    meta.append(date, controls);
    card.append(copy, meta);
    list.append(card);
  }
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}
