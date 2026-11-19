// Keep horizontally scrollable content reachable in browsers that do not
// provide native keyboard focus for scroll containers.
(function () {
  const selector = '.content table, [data-devlab-scroll-region], [data-devlab-diagram-stage], [data-devlab-diagram-source]';
  const states = new Map();
  let scheduled = false;

  function hasOverflow(element) {
    if (element.clientWidth === 0 || element.scrollWidth <= element.clientWidth + 1) return false;
    return /^(auto|scroll)$/.test(getComputedStyle(element).overflowX);
  }

  function update(element, state) {
    if (!state.managed) return;
    // An author or another enhancement can take over at any time.
    if (element.getAttribute('tabindex') !== state.expected) {
      state.managed = false;
      return;
    }
    const value = hasOverflow(element) ? '0' : null;
    if (value === state.expected) return;
    state.expected = value;
    if (value === null) element.removeAttribute('tabindex');
    else element.setAttribute('tabindex', value);
  }

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(schedule) : null;

  function register(element) {
    if (states.has(element)) return;
    // The named wrapper owns scrolling, so its table needs no second stop.
    if (element.matches('table') && element.closest('[data-devlab-scroll-region]')) return;
    const authored = element.getAttribute('tabindex');
    const state = {
      managed: authored === null || (element.hasAttribute('data-overflow-auto-tabstop') && authored === '0'),
      expected: authored,
    };
    states.set(element, state);
    resizeObserver?.observe(element);
  }

  function refresh() {
    scheduled = false;
    document.querySelectorAll(selector).forEach(register);
    states.forEach(function (state, element) {
      if (!element.isConnected) {
        resizeObserver?.unobserve(element);
        states.delete(element);
        return;
      }
      update(element, state);
    });
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }

  const mutationObserver = new MutationObserver(schedule);
  document.querySelectorAll('.content, [data-devlab-diagram], [data-devlab-scroll-region]').forEach(function (root) {
    mutationObserver.observe(root, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['tabindex', 'hidden', 'open'],
    });
  });
  // Opening native disclosures or changing the viewport can expose overflow.
  document.addEventListener('toggle', schedule, true);
  window.addEventListener('resize', schedule, { passive: true });
  refresh();
})();
