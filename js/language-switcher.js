(function () {
  const switcher = document.querySelector("details.language-switcher");
  if (!switcher) {
    return;
  }

  const summary = switcher.querySelector("summary");

  function closeOutside(event) {
    if (switcher.open && !switcher.contains(event.target)) {
      switcher.open = false;
    }
  }

  document.addEventListener("click", closeOutside);
  document.addEventListener("focusin", closeOutside);
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && switcher.open) {
      switcher.open = false;
      if (switcher.contains(event.target)) summary?.focus();
    }
  });
})();
