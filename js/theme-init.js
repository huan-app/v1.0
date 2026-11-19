(function () {
  var storageKey = "devlab-theme-color-mode";
  var announcementStorageKey = "devlab-announcement-dismissed";
  var root = document.documentElement;
  var script = document.currentScript;
  var defaultMode = (script && script.dataset.defaultMode) || "system";

  function isValidMode(mode) {
    return mode === "light" || mode === "dark" || mode === "system";
  }

  function getSystemTheme() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function resolveTheme(mode) {
    return mode === "system" ? getSystemTheme() : mode;
  }

  function getStoredMode() {
    try {
      return localStorage.getItem(storageKey);
    } catch (_) {
      return null;
    }
  }

  if (!isValidMode(defaultMode)) {
    defaultMode = "system";
  }

  var storedMode = getStoredMode();
  var mode = isValidMode(storedMode) ? storedMode : defaultMode;

  root.dataset.themeDefault = defaultMode;
  root.dataset.themeMode = mode;
  root.dataset.theme = resolveTheme(mode);

  if (root.dataset.announcementKey) {
    try {
      if (localStorage.getItem(announcementStorageKey) === root.dataset.announcementKey) {
        root.dataset.announcementDismissed = "true";
      }
    } catch (_) {
      // Keep the announcement visible when persistent storage is unavailable.
    }
  }
})();
