(function () {
  var script = document.currentScript;
  var sources = JSON.parse((script && script.dataset.searchSources) || "[]");
  var root = document.querySelector("[data-search]");
  var input = document.querySelector("[data-search-input]");
  var results = document.querySelector("[data-search-results]");
  var list = document.querySelector("[data-search-list]");
  var message = document.querySelector("[data-search-message]");
  var status = document.querySelector("[data-search-status]");
  var more = document.querySelector("[data-search-more]");
  var retry = document.querySelector("[data-search-retry]");
  var fallback = document.querySelector("[data-search-fallback]");
  var shortcut = document.querySelector("[data-search-shortcut]");
  var state = "idle";
  var nextSource = 0;
  var uiLoaded = false;
  var showPopup = false;

  function hideMessage() {
    showPopup = false;
    if (results) results.hidden = true;
    if (input) input.setAttribute("aria-expanded", "false");
    if (status) status.textContent = "";
  }

  function renderState() {
    if (!root) return;
    root.dataset.searchState = state;
    if (results) results.setAttribute("aria-busy", String(state === "loading"));
    if (retry) retry.hidden = state !== "failed";
    if (state !== "loading" && state !== "failed") return;

    var label = state === "loading"
      ? root.dataset.searchLoadingLabel || "Loading search…"
      : root.dataset.searchUnavailableLabel || "Search is currently unavailable.";
    if (list) list.replaceChildren();
    if (more) more.hidden = true;
    if (message) {
      message.textContent = label;
      message.hidden = false;
    }
    if (results) results.hidden = !showPopup;
    if (input) input.setAttribute("aria-expanded", String(showPopup));
    if (status) status.textContent = showPopup ? label : "";
  }

  function fail() {
    state = "failed";
    renderState();
  }

  function loadNext() {
    // The UI is installed only once, including when an unusable index needs
    // another attempt after the UI has already executed.
    if (uiLoaded && nextSource === sources.length - 1) nextSource++;
    if (nextSource >= sources.length) {
      state = "ready";
      renderState();
      if (root) root.dispatchEvent(new Event("devlab:search-ready"));
      return;
    }

    var sourceIndex = nextSource;
    var dependency = document.createElement("script");
    dependency.src = sources[sourceIndex];
    dependency.async = false;
    dependency.onload = function () {
      if (sourceIndex === sources.length - 1) uiLoaded = true;
      nextSource = sourceIndex + 1;
      loadNext();
    };
    dependency.onerror = function () {
      dependency.remove();
      fail();
    };
    document.head.appendChild(dependency);
  }

  function loadSearch() {
    if (state === "ready") return;
    showPopup = true;
    if (state !== "idle") {
      renderState();
      return;
    }
    state = "loading";
    renderState();
    loadNext();
  }

  function retrySearch() {
    if (state !== "failed") return;
    // Change state before focusing: focusin must not start a second attempt.
    state = "loading";
    showPopup = true;
    renderState();
    if (input) input.focus({ preventScroll: true });
    loadNext();
  }

  function showPendingStatus() {
    if (state === "loading" || state === "failed") {
      showPopup = true;
      renderState();
    }
  }

  // Opening search does not always move focus: Ctrl+K can be pressed while
  // the input is already focused after Escape closed its status message.
  document.addEventListener("devlab:search-open", showPendingStatus);
  if (input) input.addEventListener("input", showPendingStatus);

  if (retry) {
    retry.addEventListener("click", retrySearch);
    retry.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (input) input.focus({ preventScroll: true });
        hideMessage();
      }
    });
  }

  if (root) {
    root.addEventListener("devlab:search-error", function () {
      // A successfully downloaded but unusable index can be retried too.
      // Reload its dependency chain while retaining the installed UI handlers.
      nextSource = 0;
      showPopup = true;
      fail();
    });
    root.addEventListener("focusout", function () {
      setTimeout(function () {
        if (!root.contains(document.activeElement)) {
          showPopup = false;
          if (!uiLoaded) hideMessage();
        }
      }, 0);
    });
  }

  document.addEventListener("focusin", function (event) {
    var target = event.target;
    if (target && target.matches && target.matches("[data-search-input]")) {
      loadSearch();
    }
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && root && root.contains(event.target)) {
      if (uiLoaded) {
        showPopup = false;
        return; // The installed UI handles closing its results.
      }
      event.preventDefault();
      if (!showPopup && input) {
        input.value = "";
        input.blur();
      }
      hideMessage();
      return;
    }
    if (uiLoaded) return;
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "k"
    ) {
      if (input) {
        event.preventDefault();
        document.dispatchEvent(new Event("devlab:search-open"));
        input.focus();
      }
      loadSearch();
    }
  }, true);

  document.addEventListener("click", function (event) {
    if (root && !root.contains(event.target)) {
      showPopup = false;
      if (!uiLoaded) hideMessage();
    }
  });

  // Reveal the action only after its handlers exist. The static message uses
  // the same header space when JavaScript is disabled or this file fails.
  if (input && root) {
    input.hidden = false;
    if (shortcut) shortcut.hidden = false;
    if (fallback) fallback.hidden = true;
  }
  // A site-owned header can already have exposed and focused the input.
  if (input && document.activeElement === input) loadSearch();
})();
