// Biblioteca local de animações do Radar GameDev.
//
// O catálogo é alimentado por assets/gifs.txt.
// Cada linha ativa deve conter apenas o nome do arquivo existente em assets/gifs/.
// Linhas vazias e comentários iniciados com # são ignorados.

(function () {
  const GIF_DIRECTORY = "assets/gifs/";
  const GIF_MANIFEST = "assets/gifs.txt";
  const ACCEPTED_EXTENSIONS = [".gif", ".webp"];

  function slugify(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function titleFromFilename(filename) {
    const baseName = String(filename || "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();

    return baseName
      ? baseName.replace(/\b\w/g, (letter) => letter.toUpperCase())
      : "Animação local";
  }

  function isAcceptedFile(filename) {
    const normalized = String(filename || "").toLowerCase();
    return ACCEPTED_EXTENSIONS.some((extension) => normalized.endsWith(extension));
  }

  function parseGifManifest(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && isAcceptedFile(line))
      .map((filename) => {
        const key = slugify(filename);

        return {
          key,
          name: titleFromFilename(filename),
          description: "Animação local cadastrada em assets/gifs.txt.",
          url: `${GIF_DIRECTORY}${filename}`,
          filename,
          tags: ["biblioteca", "local"]
        };
      });
  }

  async function loadGifLibrary() {
    try {
      const response = await fetch(`${GIF_MANIFEST}?v=${Date.now()}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Não foi possível carregar o catálogo de GIFs.");
      }

      return parseGifManifest(await response.text());
    } catch (error) {
      console.warn(error.message);
      return [];
    }
  }

  window.GIF_LIBRARY = [];
  window.GIF_LIBRARY_READY = loadGifLibrary().then((items) => {
    window.GIF_LIBRARY = items;
    window.dispatchEvent(new CustomEvent("radar:gifs-ready", { detail: items }));
    return items;
  });
})();
