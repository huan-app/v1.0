(function () {
  var containers = Array.from(document.querySelectorAll('[data-content-tabs]'));

  if (!containers.length) return;

  var storagePrefix = 'devlab-tabs-selection-v1:';
  var states = [];

  function readSelection(sync) {
    if (!sync) return '';

    try {
      return localStorage.getItem(storagePrefix + sync) || '';
    } catch (error) {
      return '';
    }
  }

  function saveSelection(sync, value) {
    if (!sync) return;

    try {
      localStorage.setItem(storagePrefix + sync, value);
    } catch (error) {
      // Storage can be unavailable without affecting the current tab group.
    }
  }

  function panelValue(panel) {
    return panel.dataset.tabValue || panel.dataset.tabName;
  }

  function selectTab(state, index, moveFocus) {
    state.tabs.forEach(function (tab, tabIndex) {
      var isActive = tabIndex === index;

      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      state.panels[tabIndex].hidden = !isActive;
    });

    state.activeIndex = index;

    if (moveFocus) state.tabs[index].focus();
  }

  function matchingIndex(state, value) {
    return state.panels.findIndex(function (panel) {
      return panelValue(panel) === value;
    });
  }

  function selectRelatedTabs(state, index, moveFocus, persist) {
    var value = panelValue(state.panels[index]);

    selectTab(state, index, moveFocus);

    if (!state.sync) return;

    if (persist) saveSelection(state.sync, value);

    states.forEach(function (otherState) {
      if (otherState === state || otherState.sync !== state.sync) return;

      var otherIndex = matchingIndex(otherState, value);
      if (otherIndex >= 0) selectTab(otherState, otherIndex, false);
    });
  }

  function hashTarget() {
    if (!window.location.hash) return null;

    try {
      return document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    } catch (error) {
      return null;
    }
  }

  function updateAddress(state, value) {
    var address = new URL(window.location.href);
    var hasQuery = false;

    function writeChoice(chosenState, chosenValue) {
      states.forEach(function (otherState) {
        if (otherState !== chosenState && (!chosenState.sync || otherState.sync !== chosenState.sync)) return;
        if (!otherState.query) return;

        // A query on any member represents the synchronized group's value,
        // including values that only some members offer.
        address.searchParams.set(otherState.query, chosenValue);
        hasQuery = true;
      });
    }

    writeChoice(state, value);

    if (!hasQuery) return;

    // Include configured parent choices when a fragment originally opened a
    // nested group. Removing that fragment must not hide the group on reload.
    states.forEach(function (otherState) {
      var panel = otherState.panels[otherState.activeIndex];
      if (panel.contains(state.container)) writeChoice(otherState, panelValue(panel));
    });

    var target = hashTarget();
    if (target && states.some(function (otherState) {
      return otherState.panels.some(function (panel) {
        return panel.hidden && panel.contains(target);
      });
    })) {
      // A fragment inside the previous panel would otherwise undo this choice
      // when the shared URL is opened again.
      address.hash = '';
    }

    if (address.href === window.location.href) return;

    try {
      window.history.pushState(window.history.state, '', address.href);
    } catch (error) {
      // Tab selection still works when the page cannot update browser history.
    }
  }

  function activateTab(state, index, moveFocus) {
    selectRelatedTabs(state, index, moveFocus, true);
    updateAddress(state, panelValue(state.panels[index]));
  }

  function restoreAddressSelection() {
    var parameters = new URL(window.location.href).searchParams;
    var querySyncs = new Set();
    var synchronizedValues = new Map();

    states.forEach(function (state) {
      if (!state.query || !state.sync) return;
      querySyncs.add(state.sync);

      var value = parameters.get(state.query);
      if (value === null || synchronizedValues.has(state.sync)) return;
      if (states.some(function (otherState) {
        return otherState.sync === state.sync && matchingIndex(otherState, value) >= 0;
      })) {
        synchronizedValues.set(state.sync, value);
      }
    });

    states.forEach(function (state) {
      if (!state.query && !querySyncs.has(state.sync)) return;

      var value = state.sync ? synchronizedValues.get(state.sync) : parameters.get(state.query);
      var index = value === null || value === undefined ? -1 : matchingIndex(state, value);
      // Keep the initial fallback for history entries without a valid query.
      // Reading localStorage here would make Back retain the latest click.
      selectTab(state, index >= 0 ? index : state.initialIndex, false);
    });
  }

  function revealHashTarget() {
    var target = hashTarget();
    if (!target) return;

    var revealed = false;
    // DOM order puts containing groups before nested groups.
    states.forEach(function (state) {
      var index = state.panels.findIndex(function (panel) {
        return panel.contains(target);
      });
      if (index < 0) return;

      selectRelatedTabs(state, index, false, false);
      revealed = true;
    });

    if (revealed) target.scrollIntoView({ block: 'start' });
  }

  containers.forEach(function (container, groupIndex) {
    var panels = Array.from(container.children).filter(function (child) {
      return child.matches('[data-content-tab]');
    });

    if (panels.length < 2) return;

    var tablist = document.createElement('div');
    var tabs = [];
    var sync = container.dataset.tabsSync || '';
    var tablistLabel = container.dataset.tabsLabel || 'Tabs';

    tablist.className = 'content-tab-list';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', tablistLabel);

    panels.forEach(function (panel, tabIndex) {
      var tab = document.createElement('button');
      var tabId = 'devlab-tabs-' + groupIndex + '-tab-' + tabIndex;
      var panelId = 'devlab-tabs-' + groupIndex + '-panel-' + tabIndex;
      var fallbackLabel = panel.querySelector('[data-tab-fallback-label]');

      tab.className = 'content-tab';
      tab.type = 'button';
      tab.id = tabId;
      tab.textContent = panel.dataset.tabName;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panelId);

      panel.id = panelId;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabId);
      panel.tabIndex = 0;

      if (fallbackLabel) fallbackLabel.hidden = true;

      tablist.appendChild(tab);
      tabs.push(tab);
    });

    container.insertBefore(tablist, panels[0]);
    container.classList.add('is-ready');

    var state = {
      activeIndex: 0,
      container: container,
      panels: panels,
      query: container.dataset.tabsQuery || '',
      sync: sync,
      tabs: tabs
    };
    var storedSelection = readSelection(sync);
    var initialIndex = storedSelection ? matchingIndex(state, storedSelection) : -1;

    if (initialIndex < 0 && sync) {
      var synchronizedState = states.find(function (otherState) {
        return otherState.sync === sync;
      });

      if (synchronizedState) {
        initialIndex = matchingIndex(
          state,
          panelValue(synchronizedState.panels[synchronizedState.activeIndex])
        );
      }
    }

    if (initialIndex < 0) {
      initialIndex = panels.findIndex(function (panel) {
        return panel.dataset.tabSelected === 'true';
      });
    }

    if (initialIndex < 0) initialIndex = 0;

    state.initialIndex = initialIndex;
    states.push(state);
    selectTab(state, initialIndex, false);

    tabs.forEach(function (tab, tabIndex) {
      tab.addEventListener('click', function () {
        activateTab(state, tabIndex, false);
      });

      tab.addEventListener('keydown', function (event) {
        var nextIndex = state.activeIndex;
        var isRtl = getComputedStyle(container).direction === 'rtl';

        if (event.key === 'Home') {
          nextIndex = 0;
        } else if (event.key === 'End') {
          nextIndex = tabs.length - 1;
        } else if (event.key === 'ArrowRight') {
          nextIndex = (state.activeIndex + (isRtl ? -1 : 1) + tabs.length) % tabs.length;
        } else if (event.key === 'ArrowLeft') {
          nextIndex = (state.activeIndex + (isRtl ? 1 : -1) + tabs.length) % tabs.length;
        } else {
          return;
        }

        event.preventDefault();
        activateTab(state, nextIndex, true);
      });
    });
  });

  // Resolve URL choices after every group exists so a query on a later group
  // can also select matching values in earlier synchronized groups.
  restoreAddressSelection();
  revealHashTarget();
  window.addEventListener('popstate', function () {
    restoreAddressSelection();
    revealHashTarget();
  });
  window.addEventListener('hashchange', revealHashTarget);
})();
