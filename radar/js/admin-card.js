(function () {
  const NEW_DRAFT_KEY = "radar-admin-card-draft-new";
  const MAX_CACHED_IMAGE_SIZE = 1024 * 1024;
  const RESOURCES_CACHE_KEY = "radar-resources-cache-v1";

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("id");
  const isEditMode = Boolean(editId);

  const fields = {
    title: document.querySelector("#resourceTitle"),
    section: document.querySelector("#resourceSection"),
    type: document.querySelector("#resourceType"),
    country: document.querySelector("#resourceCountry"),
    cta: document.querySelector("#resourceCta"),
    description: document.querySelector("#resourceDescription"),
    tags: document.querySelector("#resourceTags"),
    url: document.querySelector("#resourceUrl"),
    image: document.querySelector("#resourceImage"),
    removeImage: document.querySelector("#resourceRemoveImage"),
    featured: document.querySelector("#resourceFeatured"),
    wallpaper: document.querySelector("#resourceWallpaper"),
    special: document.querySelector("#resourceSpecial"),
    pinned: document.querySelector("#resourcePinned"),
    imagePositionY: document.querySelector("#resourceImagePositionY"),
    useLibraryGif: document.querySelector("#resourceUseLibraryGif"),
    libraryGifKey: document.querySelector("#resourceLibraryGifKey"),
    libraryGifMode: document.querySelector("#resourceLibraryGifMode"),
    libraryGifPositionY: document.querySelector("#resourceLibraryGifPositionY"),
    status: document.querySelector("#resourceStatus")
  };

  const elements = {
    form: document.querySelector("#resourceForm"),
    preview: document.querySelector("#cardPreview"),
    feedback: document.querySelector("#adminFeedback"),
    cancel: document.querySelector("#cancelResource"),
    save: document.querySelector("#saveResource"),
    delete: document.querySelector("#deleteResource"),
    title: document.querySelector("#adminCardTitle"),
    description: document.querySelector("#adminCardDescription"),
    documentTitle: document.querySelector("#documentTitle"),
    imagePositionField: document.querySelector("#imagePositionField"),
    libraryGifPreview: document.querySelector("#libraryGifPreview"),
    libraryGifPositionField: document.querySelector("#libraryGifPositionField"),
    libraryGifPriorityNote: document.querySelector("#libraryGifPriorityNote"),
    removeImageField: document.querySelector("#removeImageField")
  };

  let imageDataUrl = "";
  let imageCacheable = true;
  let imageWarning = "";
  let selectedImageFile = null;
  let originalResource = null;
  let isDraggingImage = false;
  let dragStartY = 0;
  let dragStartPosition = 50;

  const typeOptionsBySection = {
    curadoria: [
      "Curso",
      "Vídeo",
      "Artigo",
      "Ferramenta",
      "Asset",
      "Comunidade",
      "Evento",
      "Documentação",
      "Repositório",
      "Dica",
      "Vaga"
    ],
    profissionais: [
      "Profissional",
      "Portfólio",
      "Gameplay Programming",
      "Game Design",
      "Level Design",
      "Technical Art",
      "Environment Art",
      "Character Art",
      "UI/UX",
      "Narrative Design",
      "Producer",
      "Audio",
      "QA"
    ],
    empresas: [
      "AAA",
      "AA",
      "Indie",
      "Mobile",
      "Outsourcing",
      "Publisher",
      "Serious Games",
      "Game Tech",
      "QA/Localization",
      "Porting",
      "Estúdio Brasileiro",
      "Estúdio Internacional"
    ]
  };

  function getDraftKey() {
    return isEditMode ? `radar-admin-card-draft-edit-${editId}` : NEW_DRAFT_KEY;
  }

  async function ensureAdmin() {
    const firebase = await waitForFirebaseApi();
    const user = await firebase.getCurrentUserOnce();
    const profile = await firebase.getCurrentApprovedProfile(user);

    if (!profile || profile.role !== "admin") {
      window.location.href = "index.html#radar-admin";
      throw new Error("Acesso admin necessário.");
    }
  }

  function waitForFirebaseApi() {
    if (window.radarFirebase) {
      return Promise.resolve(window.radarFirebase);
    }

    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;

        if (window.radarFirebase) {
          window.clearInterval(timer);
          resolve(window.radarFirebase);
        }

        if (attempts >= 80) {
          window.clearInterval(timer);
          reject(new Error("Firebase não carregou. Verifique a conexão."));
        }
      }, 100);
    });
  }

  function setFeedback(message, tone = "neutral") {
    elements.feedback.textContent = message;
    elements.feedback.dataset.tone = tone;
  }

  function parseTags(value) {
    return value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function normalizeSection(section, type) {
    const validSections = ["curadoria", "profissionais", "empresas"];
    const sectionValue = normalizeText(section);

    if (validSections.includes(sectionValue)) {
      return sectionValue;
    }

    const normalizedType = normalizeText(type);
    const empresaTypes = [
      "empresa",
      "empresas",
      "estudio",
      "studio",
      "aaa",
      "aa",
      "indie",
      "mobile",
      "outsourcing",
      "publisher",
      "serious games",
      "game tech",
      "qa/localization",
      "porting",
      "estudio brasileiro",
      "estudio internacional"
    ];
    const profissionalTypes = [
      "profissional",
      "profissionais",
      "portfolio",
      "portfolios",
      "gameplay programming",
      "game design",
      "level design",
      "technical art",
      "environment art",
      "character art",
      "ui/ux",
      "narrative design",
      "producer",
      "audio",
      "qa"
    ];
    const curadoriaTypes = [
      "ferramenta",
      "ferramentas",
      "vaga",
      "vagas",
      "evento",
      "eventos",
      "artigo",
      "artigos",
      "curso",
      "cursos",
      "comunidade",
      "comunidades",
      "asset",
      "assets",
      "documentacao",
      "documentacoes",
      "repositorio",
      "repositorios",
      "dica",
      "dicas",
      "video"
    ];

    if (empresaTypes.some((typeName) => normalizedType.includes(typeName))) {
      return "empresas";
    }

    if (profissionalTypes.some((typeName) => normalizedType.includes(typeName))) {
      return "profissionais";
    }

    if (curadoriaTypes.some((typeName) => normalizedType.includes(typeName))) {
      return "curadoria";
    }

    return "curadoria";
  }

  function populateTypeOptions(section = fields.section.value, preferredType = fields.type.value) {
    const options = typeOptionsBySection[section] || typeOptionsBySection.curadoria;
    const nextType = options.includes(preferredType) ? preferredType : options[0];

    fields.type.innerHTML = options
      .map((type) => `<option value="${escapeAttribute(type)}">${type}</option>`)
      .join("");
    fields.type.value = nextType;
  }

  function tagsToInput(tags) {
    return Array.isArray(tags) ? tags.join(", ") : "";
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function makeSlug(title) {
    const slug = title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return `${slug || "recurso"}-${Date.now()}`;
  }

  function getImagePositionY() {
    const value = Number(fields.imagePositionY.value);
    return Number.isFinite(value) ? clamp(value, 0, 100) : 50;
  }

  function getLibraryGifPositionY() {
    const value = Number(fields.libraryGifPositionY.value);
    return Number.isFinite(value) ? clamp(value, 0, 100) : 50;
  }

  function getGifLibrary() {
    return Array.isArray(window.GIF_LIBRARY) ? window.GIF_LIBRARY : [];
  }

  function getLibraryGifByKey(key) {
    return getGifLibrary().find((gif) => gif.key === key) || null;
  }

  function getSelectedLibraryGif() {
    if (!fields.useLibraryGif.checked) {
      return null;
    }

    return getLibraryGifByKey(fields.libraryGifKey.value);
  }

  function shouldShowPositionControl() {
    return Boolean(imageDataUrl && fields.wallpaper.checked && !getSelectedLibraryGif());
  }

  function shouldShowGifPositionControl() {
    return Boolean(getSelectedLibraryGif() && fields.libraryGifMode.value === "cover");
  }

  function syncPositionControl() {
    elements.imagePositionField.hidden = !shouldShowPositionControl();
    elements.libraryGifPositionField.hidden = !shouldShowGifPositionControl();
    elements.libraryGifPriorityNote.hidden = !Boolean(getSelectedLibraryGif() && imageDataUrl);
  }

  function getFormData() {
    return {
      title: fields.title.value.trim(),
      section: fields.section.value || "curadoria",
      type: fields.type.value,
      country: fields.country.value.trim(),
      description: fields.description.value.trim(),
      tags: fields.tags.value,
      url: fields.url.value.trim(),
      cta: fields.cta.value.trim(),
      image: fields.removeImage.checked ? "" : imageDataUrl,
      imageCacheable,
      removeImage: fields.removeImage.checked,
      featured: fields.featured.checked,
      wallpaper: fields.wallpaper.checked,
      special: fields.special.checked,
      pinned: fields.pinned.checked,
      imagePositionY: getImagePositionY(),
      useLibraryGif: fields.useLibraryGif.checked,
      libraryGifKey: fields.libraryGifKey.value,
      libraryGifMode: fields.libraryGifMode.value || "cover",
      libraryGifPositionY: getLibraryGifPositionY(),
      status: fields.status.value || "published"
    };
  }

  function getResourceFromForm() {
    const data = getFormData();
    const now = new Date().toISOString();

    return {
      id: isEditMode ? editId : makeSlug(data.title),
      section: data.section,
      title: data.title,
      type: data.type,
      country: data.country || "Global",
      description: data.description,
      tags: parseTags(data.tags),
      url: data.url,
      cta: data.cta,
      wallpaper: Boolean(data.wallpaper),
      imagePositionY: data.wallpaper ? data.imagePositionY : 50,
      useLibraryGif: Boolean(data.useLibraryGif),
      libraryGifKey: data.useLibraryGif ? data.libraryGifKey : "",
      libraryGifMode: data.libraryGifMode || "cover",
      libraryGifPositionY: data.libraryGifMode === "cover" ? data.libraryGifPositionY : 50,
      featured: data.featured,
      special: Boolean(data.special),
      pinned: Boolean(data.pinned),
      status: data.status,
      createdAt: originalResource?.createdAt || now,
      updatedAt: now,
      source: "firebase"
    };
  }

  function escapeAttribute(value) {
    return String(value || "").replace(/"/g, "&quot;");
  }

  function renderLibraryGifPreview() {
    const selectedGif = getSelectedLibraryGif();

    if (!selectedGif) {
      elements.libraryGifPreview.innerHTML = fields.useLibraryGif.checked
        ? '<p class="empty-panel">Selecione um GIF disponível na biblioteca.</p>'
        : '<p class="empty-panel">Nenhum GIF selecionado.</p>';
      return;
    }

    const tags = Array.isArray(selectedGif.tags) ? selectedGif.tags : [];
    elements.libraryGifPreview.innerHTML = `
      <img src="${escapeAttribute(selectedGif.url)}" alt="" loading="lazy" />
      <div>
        <strong>${selectedGif.name || selectedGif.key}</strong>
        <p>${selectedGif.description || "GIF da biblioteca local."}</p>
        <div class="tag-list">
          ${tags.map((tag) => `<span class="tag-pill">${tag}</span>`).join("")}
        </div>
      </div>
    `;
  }

  function getPreviewMedia(data) {
    const selectedGif = getSelectedLibraryGif();

    if (selectedGif) {
      const mode = data.libraryGifMode === "contain" ? "contain" : "cover";
      const positionY = mode === "cover" ? data.libraryGifPositionY : 50;
      return {
        markup: `<div class="card-media card-media--gif card-media--${mode}"><img src="${escapeAttribute(selectedGif.url)}" alt="" loading="lazy" style="object-position: center ${positionY}%;" /></div>`,
        hasMedia: true,
        isCover: mode === "cover"
      };
    }

    if (data.image) {
      const positionY = data.wallpaper ? data.imagePositionY : 50;
      const mode = data.wallpaper ? "cover" : "contain";
      return {
        markup: `<div class="card-media card-media--${mode}"><img src="${escapeAttribute(data.image)}" alt="" style="object-position: center ${positionY}%;" /></div>`,
        hasMedia: true,
        isCover: data.wallpaper
      };
    }

    return {
      markup: "",
      hasMedia: false,
      isCover: false
    };
  }

  function renderPreview() {
    const data = getFormData();
    const tags = parseTags(data.tags);
    const title = data.title || "Título do recurso";
    const type = data.type || "Categoria";
    const country = data.country || "Global";
    const description =
      data.description || "Descrição curta do recurso selecionado para a curadoria.";
    const cta = data.cta || "Acessar recurso";
    const media = getPreviewMedia(data);
    const tagsMarkup = (tags.length ? tags : ["Tag", "Radar"])
      .map((tag) => `<span class="tag-pill">${tag}</span>`)
      .join("");

    elements.preview.innerHTML = `
      <article class="resource-card ${data.featured ? "is-featured" : ""} ${data.special ? "resource-card--special" : ""} ${data.pinned ? "is-pinned" : ""} ${media.hasMedia ? "has-image" : "text-card"} ${media.isCover ? "resource-card--wallpaper" : ""}">
        ${media.markup}
        <div class="card-content">
          <div class="card-topline">
            <span class="type-label">${type}</span>
            <span class="country-label">${country}</span>
          </div>
          ${data.pinned ? '<span class="pinned-label">Fixado</span>' : ""}
          <h3>${title}</h3>
          <p>${description}</p>
          <div class="tag-list">${tagsMarkup}</div>
          <span class="card-cta">${cta}<span aria-hidden="true">→</span></span>
        </div>
      </article>
    `;

    renderLibraryGifPreview();
    syncPositionControl();
    bindPreviewDrag();
  }

  function getDraftPayload() {
    const data = getFormData();
    return {
      ...data,
      image: data.imageCacheable ? data.image : ""
    };
  }

  function saveCardDraft() {
    try {
      localStorage.setItem(getDraftKey(), JSON.stringify(getDraftPayload()));
    } catch (error) {
      setFeedback("Não foi possível manter este rascunho localmente.", "warning");
    }
  }

  function clearCardDraft() {
    localStorage.removeItem(getDraftKey());
  }

  function clearResourcesCache() {
    try {
      localStorage.removeItem(RESOURCES_CACHE_KEY);
    } catch (error) {
      // Cache is only an optimization.
    }
  }

  function loadCardDraft() {
    try {
      const draft = localStorage.getItem(getDraftKey());
      return draft ? JSON.parse(draft) : null;
    } catch (error) {
      return null;
    }
  }

  function loadResourceIntoForm(resource) {
    fields.title.value = resource.title || "";
    fields.section.value = normalizeSection(resource.section, resource.type);
    populateTypeOptions(fields.section.value, resource.type || "");
    fields.country.value = resource.country || "";
    fields.description.value = resource.description || "";
    fields.tags.value = tagsToInput(resource.tags);
    fields.url.value = resource.url || "";
    fields.cta.value = resource.cta || "";
    fields.featured.checked = Boolean(resource.featured);
    fields.wallpaper.checked = Boolean(resource.wallpaper);
    fields.special.checked = Boolean(resource.special);
    fields.pinned.checked = Boolean(resource.pinned);
    fields.imagePositionY.value = Number.isFinite(Number(resource.imagePositionY))
      ? String(clamp(Number(resource.imagePositionY), 0, 100))
      : "50";
    fields.useLibraryGif.checked = Boolean(resource.useLibraryGif);
    fields.libraryGifKey.value = resource.libraryGifKey || "";
    fields.libraryGifMode.value = resource.libraryGifMode === "contain" ? "contain" : "cover";
    fields.libraryGifPositionY.value = Number.isFinite(Number(resource.libraryGifPositionY))
      ? String(clamp(Number(resource.libraryGifPositionY), 0, 100))
      : "50";
    fields.status.value = resource.status || "published";
    imageDataUrl = resource.imageUrl || resource.image || "";
    fields.removeImage.checked = false;
    elements.removeImageField.hidden = !Boolean(resource.imageUrl || resource.image);
    imageCacheable = true;
  }

  async function restoreDraftOrResource() {
    if (isEditMode) {
      const firebase = await waitForFirebaseApi();
      originalResource = await firebase.getResourceById(editId);

      if (!originalResource) {
        elements.form.hidden = true;
        elements.preview.innerHTML = "";
        elements.title.textContent = "Card não encontrado";
        elements.description.textContent =
          "Este recurso não existe no armazenamento local deste navegador.";
        setFeedback("Volte para a home e escolha outro card para editar.", "error");
        return;
      }

      elements.title.textContent = "Editar card";
      elements.description.textContent = "Atualize o recurso selecionado.";
      document.title = "Editar card | Radar GameDev";
      elements.save.textContent = "Salvar alterações";
      elements.delete.hidden = false;
      loadResourceIntoForm(originalResource);
    }

    const draft = loadCardDraft();
    if (draft) {
      loadResourceIntoForm({
        ...draft,
        tags: parseTags(draft.tags || "")
      });
      setFeedback("Rascunho restaurado automaticamente.", "success");
    }

    renderPreview();
  }

  function hasFormContent() {
    const data = getFormData();
    return Boolean(
        data.title ||
        data.section !== "curadoria" ||
        data.type ||
        data.country ||
        data.description ||
        data.tags ||
        data.url ||
        data.cta ||
        data.image ||
        data.featured ||
        data.wallpaper ||
        data.special ||
        data.pinned ||
        data.imagePositionY !== 50 ||
        data.useLibraryGif ||
        data.libraryGifKey ||
        data.libraryGifMode !== "cover" ||
        data.libraryGifPositionY !== 50
    );
  }

  function isValidUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch (error) {
      return false;
    }
  }

  function validateResource() {
    const data = getFormData();

    if (!data.title) return "Informe o título.";
    if (!data.section) return "Selecione uma seção.";
    if (!data.type) return "Selecione uma categoria.";
    if (!data.description) return "Informe a descrição.";
    if (!data.url || !isValidUrl(data.url)) return "Informe uma URL válida.";
    if (!data.cta) return "Informe o texto do botão CTA.";
    if (data.useLibraryGif && !getLibraryGifByKey(data.libraryGifKey)) {
      return "Selecione um GIF válido da biblioteca ou desmarque o uso de GIF.";
    }
    if (data.image && !data.imageCacheable) {
      return "A imagem é grande demais para salvar localmente. Use uma imagem menor ou remova a imagem.";
    }

    return "";
  }

  function resetForm() {
    elements.form.reset();
    imageDataUrl = "";
    imageCacheable = true;
    imageWarning = "";
    selectedImageFile = null;
    fields.status.value = "published";
    fields.section.value = "curadoria";
    populateTypeOptions("curadoria");
    fields.wallpaper.checked = false;
    fields.special.checked = false;
    fields.pinned.checked = false;
    fields.imagePositionY.value = "50";
    fields.useLibraryGif.checked = false;
    fields.libraryGifKey.value = "";
    fields.libraryGifMode.value = "cover";
    fields.libraryGifPositionY.value = "50";
    fields.removeImage.checked = false;
    elements.removeImageField.hidden = true;
    renderPreview();
  }

  function handleFieldUpdate() {
    renderPreview();
    saveCardDraft();

    if (imageWarning) {
      setFeedback(imageWarning, "warning");
    }
  }

  function handleImageChange() {
    const file = fields.image.files[0];
    selectedImageFile = null;
    imageDataUrl = originalResource?.imageUrl || originalResource?.image || "";
    imageCacheable = true;
    imageWarning = "";

    if (!file) {
      handleFieldUpdate();
      return;
    }

    const isAllowedImage =
      file.type === "image/webp" || file.name.toLowerCase().endsWith(".webp");

    if (!isAllowedImage) {
      fields.image.value = "";
      setFeedback("Use uma imagem no formato WEBP. Para animações, escolha um GIF da biblioteca.", "error");
      handleFieldUpdate();
      return;
    }

    if (file.size > MAX_CACHED_IMAGE_SIZE) {
      imageCacheable = false;
      imageWarning = "Imagem muito grande. Use uma imagem WEBP de até 1 MB.";
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      imageDataUrl = reader.result;
      selectedImageFile = file;
      fields.removeImage.checked = false;
      handleFieldUpdate();
    });
    reader.readAsDataURL(file);
  }

  async function handleSave(event) {
    event.preventDefault();
    const validationError = validateResource();

    if (validationError) {
      setFeedback(validationError, "error");
      return;
    }

    const resource = getResourceFromForm();

    try {
      elements.save.disabled = true;
      setFeedback(selectedImageFile ? "Enviando imagem e salvando..." : "Salvando card...");
      const firebase = await waitForFirebaseApi();
      if (isEditMode) {
        await firebase.updateResource(
          editId,
          resource,
          selectedImageFile,
          fields.removeImage.checked && !selectedImageFile
        );
      } else {
        await firebase.createResource(resource, selectedImageFile);
      }
      clearResourcesCache();
      clearCardDraft();
      setFeedback(
        isEditMode
          ? "Alterações salvas. Redirecionando para a home..."
          : "Card salvo com sucesso. Redirecionando para a home...",
        "success"
      );
      window.setTimeout(() => {
        window.location.href = "index.html";
      }, 650);
    } catch (error) {
      setFeedback(error.message || "Não foi possível salvar no Firebase.", "error");
    } finally {
      elements.save.disabled = false;
    }
  }

  function handleCancel() {
    if (hasFormContent() && !window.confirm("Cancelar e apagar o rascunho atual?")) {
      return;
    }

    clearCardDraft();
    resetForm();
    window.location.href = "index.html";
  }

  async function handleDelete() {
    if (!isEditMode || !originalResource) {
      return;
    }

    if (!window.confirm("Excluir este card permanentemente?")) {
      return;
    }

    try {
      elements.delete.disabled = true;
      setFeedback("Excluindo card...");
      const firebase = await waitForFirebaseApi();
      await firebase.deleteResource(editId);
      clearResourcesCache();
      clearCardDraft();
      window.location.href = "index.html";
    } catch (error) {
      setFeedback(error.message || "Não foi possível excluir o card.", "error");
      elements.delete.disabled = false;
    }
  }

  function bindPreviewDrag() {
    const media = elements.preview.querySelector(".card-media");

    if (!media || !shouldShowPositionControl()) {
      return;
    }

    media.addEventListener("pointerdown", (event) => {
      isDraggingImage = true;
      dragStartY = event.clientY;
      dragStartPosition = getImagePositionY();
      media.setPointerCapture(event.pointerId);
      media.classList.add("is-dragging");
    });

    media.addEventListener("pointermove", (event) => {
      if (!isDraggingImage) {
        return;
      }

      const deltaY = event.clientY - dragStartY;
      const nextPosition = clamp(dragStartPosition + deltaY / 2, 0, 100);
      fields.imagePositionY.value = String(Math.round(nextPosition));
      const image = media.querySelector("img");
      if (image) {
        image.style.objectPosition = `center ${Math.round(nextPosition)}%`;
      }
      saveCardDraft();
    });

    media.addEventListener("pointerup", () => {
      isDraggingImage = false;
      media.classList.remove("is-dragging");
    });

    media.addEventListener("pointercancel", () => {
      isDraggingImage = false;
      media.classList.remove("is-dragging");
    });
  }

  function bindEvents() {
    Object.values(fields).forEach((field) => {
      const eventName =
        field.type === "checkbox" || field.tagName === "SELECT"
          ? "change"
          : "input";
      field.addEventListener(eventName, handleFieldUpdate);
    });
    fields.section.addEventListener("change", () => {
      populateTypeOptions(fields.section.value);
      handleFieldUpdate();
    });
    fields.image.addEventListener("change", handleImageChange);
    elements.form.addEventListener("submit", handleSave);
    elements.cancel.addEventListener("click", handleCancel);
    elements.delete.addEventListener("click", handleDelete);
  }

  function populateGifLibrarySelect() {
    const gifs = getGifLibrary();

    if (!gifs.length) {
      fields.libraryGifKey.innerHTML =
        '<option value="">Nenhum GIF disponível</option>';
      fields.libraryGifKey.disabled = true;
      fields.useLibraryGif.disabled = true;
      return;
    }

    fields.libraryGifKey.disabled = false;
    fields.useLibraryGif.disabled = false;
    fields.libraryGifKey.innerHTML = [
      '<option value="">Selecione</option>',
      ...gifs.map((gif) => `<option value="${escapeAttribute(gif.key)}">${gif.name || gif.key}</option>`)
    ].join("");
  }

  async function init() {
    try {
      await ensureAdmin();
      if (window.GIF_LIBRARY_READY) {
        await window.GIF_LIBRARY_READY;
      }
    populateGifLibrarySelect();
    populateTypeOptions("curadoria");
    await restoreDraftOrResource();
      bindEvents();
    } catch (error) {
      setFeedback(error.message || "Faça login como admin.", "error");
    }
  }

  init();
})();
