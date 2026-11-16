/**
 * The visitor's language (README, "Chinese"). Every page runs this small
 * script in its <head>, before anything shows. English is the default, and a
 * page's Chinese counterpart is the same address under zh/. Nothing guesses
 * the language: not the browser's, not where the visitor is. A visitor who
 * chose Chinese with the language link, which this script remembers in this
 * browser, is taken from an English page to its Chinese counterpart before the
 * English shows. A Chinese address always shows Chinese, as it was asked for.
 *
 * The language link (a[data-language]) leads to the counterpart of the page as
 * it is now: the editor changes the address as tools change. The editor asks
 * before leaving unsaved work (app.js), and then this script does nothing.
 * Kept in step with i18n.js (LANGUAGE_KEY, pageAddress) by tests/i18n.test.mjs.
 */
(function () {
  var KEY = 'qft-pdf-language';
  var script = document.currentScript;
  if (!script) return;
  // This file sits at the site's root, whatever the page's folder.
  var root = new URL('./', script.src).pathname;

  function chosen() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (error) {
      return null; // storage blocked: the page is shown as it is
    }
  }
  function remember(language) {
    try {
      window.localStorage.setItem(KEY, language);
    } catch (error) {
      // Not remembered: the link still leads there.
    }
  }
  /** This page's address in `language`, or null when it is not a page of the site. */
  function counterpart(language) {
    var path = window.location.pathname;
    if (path.indexOf(root) !== 0) return null;
    var page = path.slice(root.length).replace(/^zh(\/|$)/, '');
    return root + (language === 'zh' ? 'zh/' : '') + page + window.location.search + window.location.hash;
  }

  var chinese = /^zh(\/|$)/.test(window.location.pathname.slice(root.length));
  if (!chinese && chosen() === 'zh') {
    var target = counterpart('zh');
    if (target) {
      window.location.replace(target);
      return;
    }
  }

  // The link's own address was written for the page as it was loaded; the editor
  // changes the address as tools change. So it is brought up to date before the
  // link is used another way than a click: opened in a new tab, or copied.
  function refresh(event) {
    var link = event.target.closest && event.target.closest('a[data-language]');
    var target = link && counterpart(link.getAttribute('data-language'));
    if (target) link.setAttribute('href', target);
  }
  ['pointerover', 'pointerdown', 'focusin', 'contextmenu'].forEach(function (type) {
    document.addEventListener(type, refresh, true);
  });
  // A middle click opens it in a new tab, and is a choice as a click is.
  document.addEventListener('auxclick', function (event) {
    var link = event.target.closest && event.target.closest('a[data-language]');
    if (link && event.button === 1) remember(link.getAttribute('data-language'));
  });

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[data-language]');
    if (!link || event.defaultPrevented || event.button !== 0) return;
    var language = link.getAttribute('data-language');
    remember(language);
    // A new tab or window opens the link's own address.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var target = counterpart(language);
    if (!target) return;
    event.preventDefault();
    window.location.assign(target);
  });
})();
