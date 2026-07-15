const MAX_SCORE = 32;

const RANKS = [
  { name: "Estudante da Academia", slug: "academia", range: "0–4 pontos" },
  { name: "Genin", slug: "genin", range: "5–9 pontos" },
  { name: "Chūnin", slug: "chunin", range: "10–14 pontos" },
  { name: "Jōnin", slug: "jonin", range: "15–24 pontos" },
  { name: "ANBU", slug: "anbu", range: "25–32 pontos" },
  { name: "Hokage", slug: "hokage", range: "Maior pontuação" },
];

const ERROR_MESSAGE = "Não foi possível carregar o ranking. Verifique o arquivo ranking.txt.";

const elements = {
  status: document.querySelector("#status-message"),
  rankingContent: document.querySelector("#ranking-content"),
  sideContent: document.querySelector("#side-content"),
  rankingList: document.querySelector("#ranking-list"),
  hokageList: document.querySelector("#hokage-list"),
  podium: document.querySelector("#podium"),
  rankLegend: document.querySelector("#rank-legend"),
  total: document.querySelector("#stat-total"),
  highest: document.querySelector("#stat-highest"),
  average: document.querySelector("#stat-average"),
};

function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character],
  );
}

function parseRanking(rawText) {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.lastIndexOf(";");
      if (separatorIndex === -1) return null;

      const name = line.slice(0, separatorIndex).trim().replace(/\s+/g, " ");
      const rawScore = line.slice(separatorIndex + 1).trim();
      if (!name || !/^\d+$/.test(rawScore)) return null;

      const score = Number(rawScore);
      if (!Number.isInteger(score) || score < 0 || score > MAX_SCORE) return null;
      return { name, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"));
}

function getBaseRank(score) {
  if (score <= 4) return RANKS[0];
  if (score <= 9) return RANKS[1];
  if (score <= 14) return RANKS[2];
  if (score <= 24) return RANKS[3];
  return RANKS[4];
}

function prepareParticipants(participants) {
  return participants.map((participant, index) => {
    const position = index + 1;
    const isHokage = position === 1;
    return {
      ...participant,
      position,
      isHokage,
      rank: isHokage ? RANKS[5] : getBaseRank(participant.score),
    };
  });
}

function renderRanking(participants) {
  elements.rankingList.innerHTML = participants
    .map((participant, index) => {
      const percentage = (participant.score / MAX_SCORE) * 100;
      return `
        <article
          class="rank-row rank--${participant.rank.slug} ${participant.isHokage ? "rank-row--hokage" : ""}"
          role="row"
          style="--row-index: ${index}"
        >
          <div class="rank-position" role="cell">${participant.position}<small>º</small></div>
          <div class="rank-name" role="cell">
            <strong>${escapeHTML(participant.name)}</strong>
            <small>Participante ${String(index + 1).padStart(2, "0")}</small>
          </div>
          <span class="rank-badge" role="cell">${participant.rank.name}</span>
          <div class="rank-score" role="cell">${participant.score}<small>/${MAX_SCORE}</small></div>
          <div class="progress" role="cell" aria-label="${participant.score} de ${MAX_SCORE} pontos">
            <div class="progress__track" aria-hidden="true">
              <div class="progress__fill" data-progress="${percentage}"></div>
            </div>
            <small>${Math.round(percentage)}%</small>
          </div>
        </article>`;
    })
    .join("");

  requestAnimationFrame(() => {
    document.querySelectorAll("[data-progress]").forEach((bar) => {
      bar.style.width = `${bar.dataset.progress}%`;
    });
  });
}

function renderHokages(participants) {
  const hokages = participants.filter((participant) => participant.isHokage);
  elements.hokageList.innerHTML = hokages
    .map(
      (participant) => `
        <article class="hokage-card">
          <span class="hokage-medal" aria-hidden="true">H</span>
          <div>
            <h3>${escapeHTML(participant.name)}</h3>
            <p>${hokages.length > 1 ? "Liderança compartilhada" : "Liderança da turma"}</p>
          </div>
          <strong>${participant.score}</strong>
        </article>`,
    )
    .join("");
}

function renderPodium(participants) {
  const podiumParticipants = participants.slice(0, 3);

  elements.podium.innerHTML = podiumParticipants
    .map(
      (participant, index) => `
        <button
          class="podium-item podium-item--${participant.position}"
          type="button"
          data-podium-index="${index}"
          aria-label="Entrar na cerimônia com ${escapeHTML(participant.name)}"
        >
          <span class="podium-place">${participant.position}º</span>
          <span class="podium-person">
            <b title="${escapeHTML(participant.name)}">${escapeHTML(participant.name)}</b>
            <small>Entrar na cerimônia</small>
          </span>
          <strong>${participant.score}</strong>
        </button>`,
    )
    .join("");

  elements.podium.querySelectorAll("[data-podium-index]").forEach((button) => {
    button.addEventListener("pointerenter", () => button.classList.add("is-highlighted"));
    button.addEventListener("pointerleave", () => button.classList.remove("is-highlighted"));
    button.addEventListener("focus", () => button.classList.add("is-highlighted"));
    button.addEventListener("blur", () => button.classList.remove("is-highlighted"));
    button.addEventListener("click", () => {
      const podiumIndex = Number(button.dataset.podiumIndex);
      const participant = podiumParticipants[podiumIndex];
      window.CeremonyGame?.open(participant, podiumIndex + 1);
    });
  });
}

function renderStats(participants) {
  const average = participants.reduce((sum, participant) => sum + participant.score, 0) / participants.length;
  elements.total.textContent = participants.length;
  elements.highest.textContent = `${participants[0].score}/${MAX_SCORE}`;
  elements.average.textContent = average.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function renderRankLegend(participants) {
  const counts = Object.fromEntries(RANKS.map((rank) => [rank.slug, 0]));
  participants.forEach((participant) => counts[participant.rank.slug]++);

  elements.rankLegend.innerHTML = RANKS.map(
    (rank) => `
      <div class="legend-item rank--${rank.slug}">
        <i aria-hidden="true"></i>
        <div><strong>${rank.name}</strong><br /><span>${rank.range}</span></div>
        <small>${counts[rank.slug]}</small>
      </div>`,
  ).join("");
}

function showError() {
  elements.status.className = "status-message status-message--error";
  elements.status.innerHTML = `<span aria-hidden="true">⚠</span><span>${ERROR_MESSAGE}</span>`;
  elements.rankingContent.hidden = true;
  elements.sideContent.hidden = true;
}

async function loadRanking() {
  try {
    const response = await fetch("ranking.txt", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const participants = parseRanking(await response.text());
    if (participants.length === 0) throw new Error("Nenhuma linha válida encontrada");

    const rankedParticipants = prepareParticipants(participants);
    renderRanking(rankedParticipants);
    renderHokages(rankedParticipants);
    renderPodium(rankedParticipants);
    renderStats(rankedParticipants);
    renderRankLegend(rankedParticipants);

    elements.status.hidden = true;
    elements.rankingContent.hidden = false;
    elements.sideContent.hidden = false;
  } catch (error) {
    console.error("Erro ao carregar ranking:", error);
    showError();
  }
}

loadRanking();
