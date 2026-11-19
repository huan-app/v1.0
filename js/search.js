(() => {
  const searchRoot = document.querySelector("[data-search]");
  const searchInput = document.querySelector("[data-search-input]");
  const searchResults = document.querySelector("[data-search-results]");
  const searchList = document.querySelector("[data-search-list]");
  const searchMessage = document.querySelector("[data-search-message]");
  const searchStatus = document.querySelector("[data-search-status]");
  const searchShortcut = document.querySelector("[data-search-shortcut]");
  const searchMore = document.querySelector("[data-search-more]");
  const supportedIndexFormat = "elasticlunr_javascript";
  const searchIndexFormat =
    searchRoot?.dataset.searchIndexFormat || supportedIndexFormat;

  if (!searchRoot || searchIndexFormat !== supportedIndexFormat) {
    return;
  }

  const searchLabels = {
    start: searchRoot?.dataset.searchStartLabel || "Start typing to search.",
    noResults:
      searchRoot?.dataset.searchNoResultsLabel || "No results found.",
    unavailable:
      searchRoot?.dataset.searchUnavailableLabel ||
      "Search is currently unavailable.",
    resultsCount:
      searchRoot?.dataset.searchResultsCountLabel || "Results found: {count}.",
  };

  class SearchIndexAdapter {
    constructor() {
      this.index = null;
    }

    loadIndex() {
      if (
        !window.elasticlunr ||
        !window.elasticlunr.Index ||
        typeof window.elasticlunr.Index.load !== "function" ||
        !window.searchIndex
      ) {
        return null;
      }

      return window.elasticlunr.Index.load(window.searchIndex);
    }

    getDocument(reference) {
      return this.index.documentStore.getDoc(reference);
    }

    reset() {
      this.index = null;
    }

    search(query) {
      if (!this.index) {
        this.index = this.loadIndex();
      }

      if (!this.index) {
        throw new Error("Search index is unavailable.");
      }

      return this.index.search(query, {
        bool: "OR",
        expand: true,
      });
    }
  }

  class SearchView {
    constructor(indexAdapter) {
      this.indexAdapter = indexAdapter;
      this.activeResultIndex = -1;
      this.results = [];
      this.renderedCount = 0;
      this.highlightPattern = null;
    }

    getSearchContainer() {
      if (!searchInput) {
        return null;
      }

      return searchInput.closest(
        "dialog, [data-search-modal], [data-search-drawer]"
      );
    }

    setExpanded(isExpanded) {
      searchInput?.setAttribute("aria-expanded", String(isExpanded));
    }

    announceStatus(message) {
      if (searchStatus) {
        searchStatus.textContent = message;
      }
    }

    getResultItems() {
      if (!searchResults || !searchList || searchResults.hidden) {
        return [];
      }

      return Array.from(
        searchList.querySelectorAll(".site-search-result")
      );
    }

    clearActiveResult() {
      this.getResultItems().forEach((item) => {
        item.classList.remove("is-active");
        item.setAttribute("aria-selected", "false");
      });

      this.activeResultIndex = -1;
      searchInput?.removeAttribute("aria-activedescendant");
    }

    createResultItem(result, index) {
      const doc = this.indexAdapter.getDocument(result.ref);

      const link = document.createElement("a");
      link.id = `site-search-result-${index}`;
      link.className = "site-search-result";
      link.href = result.ref;
      link.tabIndex = -1;
      link.setAttribute("role", "option");
      link.setAttribute("aria-selected", "false");

      const title = document.createElement("span");
      title.className = "site-search-result-title";
      title.textContent = doc.title || result.ref;

      const description = document.createElement("span");
      description.className = "site-search-result-description";
      const body = typeof doc.body === "string"
        ? this.decodeIndexText(doc.body).replace(/\s+/gu, " ").trim()
        : "";
      const match = body && this.highlightPattern ? this.highlightPattern.exec(body) : null;
      const descriptionText = typeof doc.description === "string"
        ? doc.description.replace(/\s+/gu, " ").trim()
        : "";
      const fallback = descriptionText || result.ref;
      const excerpt = match
        ? this.excerpt(body, Math.max(0, match.index - 48))
        : this.excerpt(fallback, 0);
      this.appendHighlightedText(description, excerpt);

      link.appendChild(title);
      link.appendChild(description);

      return link;
    }

    decodeIndexText(text) {
      // Zola removes markup from indexed text but can retain entity references.
      // Decode exactly once, then use text nodes; double-escaped examples stay
      // literal, and invalid numeric references never become malformed Unicode.
      const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      return text.replace(/&(?:(amp|lt|gt|quot|apos|nbsp)|#([0-9]+)|#[xX]([0-9a-fA-F]+));/g,
        (reference, name, decimal, hexadecimal) => {
          if (name) return named[name];
          const point = Number.parseInt(decimal || hexadecimal, decimal ? 10 : 16);
          if (point < 1 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
            return reference;
          }
          return String.fromCodePoint(point);
        });
    }

    excerpt(text, start) {
      // Keep the visible preview bounded without splitting a UTF-16 surrogate
      // pair at either edge.
      const isLowSurrogate = index => {
        const code = text.charCodeAt(index);
        return code >= 0xdc00 && code <= 0xdfff;
      };
      if (start > 0 && isLowSurrogate(start)) start--;
      const prefix = start > 0 ? "…" : "";
      let end = Math.min(text.length, start + 180 - prefix.length);
      if (end < text.length) end--;
      if (end < text.length && isLowSurrogate(end)) end--;
      return prefix + text.slice(start, end) + (end < text.length ? "…" : "");
    }

    appendHighlightedText(element, text) {
      if (!this.highlightPattern) {
        element.textContent = text;
        return;
      }
      const matches = text.matchAll(new RegExp(this.highlightPattern.source, "giu"));
      let position = 0;
      for (const match of matches) {
        element.appendChild(document.createTextNode(text.slice(position, match.index)));
        const highlight = document.createElement("mark");
        highlight.textContent = match[0];
        element.appendChild(highlight);
        position = match.index + match[0].length;
      }
      element.appendChild(document.createTextNode(text.slice(position)));
    }

    renderMessage(message) {
      if (!searchResults || !searchList || !searchMessage) {
        return;
      }

      this.activeResultIndex = -1;
      this.results = [];
      this.renderedCount = 0;
      if (searchMore) searchMore.hidden = true;
      searchInput?.removeAttribute("aria-activedescendant");
      searchList.replaceChildren();
      searchMessage.textContent = message;
      searchMessage.hidden = false;
      searchResults.hidden = false;
      this.setExpanded(true);
      this.announceStatus(message);
    }

    areResultsVisible() {
      return Boolean(searchResults && !searchResults.hidden);
    }

    clearResults() {
      if (!searchResults || !searchList || !searchMessage) {
        return;
      }

      this.activeResultIndex = -1;
      this.results = [];
      this.renderedCount = 0;
      if (searchMore) searchMore.hidden = true;
      searchInput?.removeAttribute("aria-activedescendant");
      searchList.replaceChildren();
      searchMessage.textContent = "";
      searchMessage.hidden = true;
      searchResults.hidden = true;
      this.setExpanded(false);
      this.announceStatus("");
    }

    closeContainer() {
      const container = this.getSearchContainer();

      if (!container) {
        return;
      }

      if (container.tagName === "DIALOG" && container.open) {
        container.close();
      }

      container.hidden = true;
      container.classList.remove("is-open");
      container.setAttribute("aria-hidden", "true");
    }

    getActiveResultIndex() {
      return this.activeResultIndex;
    }

    isEventInsideRoot(event) {
      return searchRoot.contains(event.target);
    }

    openActiveResult() {
      const items = this.getResultItems();

      if (
        this.activeResultIndex < 0 ||
        !items[this.activeResultIndex]
      ) {
        return;
      }

      items[this.activeResultIndex].click();
    }

    openContainer() {
      const container = this.getSearchContainer();

      if (!container) {
        return;
      }

      if (container.tagName === "DIALOG" && !container.open) {
        if (typeof container.showModal === "function") {
          container.showModal();
        } else {
          container.setAttribute("open", "");
        }
      }

      container.hidden = false;
      container.classList.add("is-open");
      container.setAttribute("aria-hidden", "false");
    }

    renderResults(results, query) {
      if (!searchResults || !searchList || !searchMessage) {
        return;
      }

      this.activeResultIndex = -1;
      searchInput?.removeAttribute("aria-activedescendant");
      searchList.replaceChildren();

      if (results.length === 0) {
        this.renderMessage(searchLabels.noResults);
        return;
      }

      const terms = [...new Set(query.split(/\s+/u).filter(term => term && term.length <= 64))]
        .sort((left, right) => right.length - left.length)
        .slice(0, 8);
      this.highlightPattern = terms.length
        ? new RegExp(terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "iu")
        : null;
      this.results = results;
      this.renderedCount = 0;
      searchMessage.textContent = "";
      searchMessage.hidden = true;
      searchResults.hidden = false;
      this.setExpanded(true);
      this.appendResults();
    }

    appendResults() {
      const nextCount = Math.min(this.renderedCount + 8, this.results.length);
      for (let index = this.renderedCount; index < nextCount; index++) {
        searchList.appendChild(this.createResultItem(this.results[index], index));
      }
      this.renderedCount = nextCount;
      if (searchMore) searchMore.hidden = nextCount >= this.results.length;
      this.announceStatus(
        searchLabels.resultsCount.replace(
          "{count}",
          String(this.results.length)
        ).replace("{shown}", String(this.renderedCount))
      );
    }

    setActiveResult(index) {
      const items = this.getResultItems();

      if (items.length === 0) {
        this.clearActiveResult();
        return;
      }

      this.activeResultIndex = (index + items.length) % items.length;

      items.forEach((item, itemIndex) => {
        const isActive = itemIndex === this.activeResultIndex;

        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });

      const activeItem = items[this.activeResultIndex];

      searchInput?.setAttribute("aria-activedescendant", activeItem.id);
      activeItem.scrollIntoView({ block: "nearest" });
    }

    updateShortcutLabel() {
      if (!searchShortcut) {
        return;
      }

      const platform =
        navigator.userAgentData?.platform || navigator.platform || "";

      searchShortcut.textContent = /Mac|iPhone|iPad|iPod/.test(platform)
        ? "⌘ K"
        : "Ctrl+K";
    }
  }

  class SearchController {
    constructor(indexAdapter, view) {
      this.indexAdapter = indexAdapter;
      this.view = view;
      this.query = "";
    }

    runSearch(query) {
      this.query = query;
      if (["loading", "failed"].includes(searchRoot.dataset.searchState)) {
        return;
      }
      if (query.length === 0) {
        this.view.renderMessage(searchLabels.start);
        return;
      }

      if (query.length < 2) {
        this.view.clearResults();
        return;
      }

      try {
        this.view.renderResults(this.indexAdapter.search(query), query);
      } catch (_) {
        this.indexAdapter.reset();
        this.view.renderMessage(searchLabels.unavailable);
        searchRoot.dispatchEvent(new Event("devlab:search-error"));
      }
    }

    focusInput() {
      if (!searchInput) {
        return;
      }

      document.dispatchEvent(new Event("devlab:search-open"));
      this.view.openContainer();
      searchInput.focus();
      searchInput.select();
      this.runSearch(searchInput.value.trim());
    }

    moveActiveResult(direction) {
      const activeIndex = this.view.getActiveResultIndex();
      const resultCount = this.view.getResultItems().length;
      const nextIndex =
        activeIndex < 0
          ? direction > 0
            ? 0
            : resultCount - 1
          : activeIndex + direction;

      this.view.setActiveResult(nextIndex);
    }

    handleInputKeydown(event) {
      const hasResults = this.view.getResultItems().length > 0;

      if (event.key === "ArrowDown" && hasResults) {
        event.preventDefault();
        this.moveActiveResult(1);
        return;
      }

      if (event.key === "ArrowUp" && hasResults) {
        event.preventDefault();
        this.moveActiveResult(-1);
        return;
      }

      if (event.key === "Enter" && hasResults) {
        if (this.view.getActiveResultIndex() >= 0) {
          event.preventDefault();
          this.view.openActiveResult();
        }

        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (this.view.areResultsVisible()) {
          this.view.clearResults();
          return;
        }

        searchInput.value = "";
        this.view.clearResults();
        searchInput.blur();
        this.view.closeContainer();
      }
    }

    handleDocumentKeydown(event) {
      if (!searchInput) {
        return;
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        this.focusInput();
      }
    }

    handleDocumentClick(event) {
      if (!searchRoot || this.view.isEventInsideRoot(event)) {
        return;
      }

      this.view.clearResults();
    }

    init() {
      if (searchInput) {
        searchInput.addEventListener("focus", () => {
          const query = searchInput.value.trim();
          if (!this.view.areResultsVisible() || query !== this.query) {
            this.runSearch(query);
          }
        });

        searchInput.addEventListener("input", (event) => {
          this.runSearch(event.target.value.trim());
        });

        searchInput.addEventListener("keydown", (event) => {
          this.handleInputKeydown(event);
        });
      }

      this.view.updateShortcutLabel();

      searchMore?.addEventListener("click", () => {
        const firstNewIndex = this.view.getResultItems().length;
        this.view.appendResults();
        // Keep keyboard navigation in the combobox, including after the last
        // batch hides the button that was just activated.
        searchInput.focus({ preventScroll: true });
        this.view.setActiveResult(firstNewIndex);
      });

      searchMore?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          searchInput.focus({ preventScroll: true });
          this.view.clearResults();
        }
      });

      searchRoot.addEventListener("focusout", () => {
        // Wait until the browser finishes moving focus between controls.
        setTimeout(() => {
          if (!searchRoot.contains(document.activeElement)) {
            this.view.clearResults();
          }
        }, 0);
      });

      document.addEventListener("keydown", (event) => {
        this.handleDocumentKeydown(event);
      });

      document.addEventListener("click", (event) => {
        this.handleDocumentClick(event);
      });

      searchRoot.addEventListener("devlab:search-ready", () => {
        this.indexAdapter.reset();
        if (searchInput && document.activeElement === searchInput && this.view.areResultsVisible()) {
          this.view.openContainer();
          this.runSearch(searchInput.value.trim());
        }
      });

      // The bundle loads lazily: the visitor may have focused or typed in the
      // field before this script executed, so catch up with the current query.
      if (searchInput && document.activeElement === searchInput && searchRoot.dataset.searchState !== "loading") {
        this.view.openContainer();
        this.runSearch(searchInput.value.trim());
      }
    }
  }

  const searchIndexAdapter = new SearchIndexAdapter();
  const searchView = new SearchView(searchIndexAdapter);
  const searchController = new SearchController(
    searchIndexAdapter,
    searchView
  );

  searchController.init();
})();
