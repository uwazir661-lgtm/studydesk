// Per-account browser backup for tasks and notes. This is only a fallback cache.
window.StudyCache = (function () {
  const prefix = "studydesk:backup:v1:";
  const activeUserKey = "studydesk:last-user";

  function key(username, section) {
    return prefix + encodeURIComponent(username) + ":" + section;
  }

  return {
    save: function (username, section, value) {
      try {
        localStorage.setItem(key(username, section), JSON.stringify(value));
      } catch (error) {
        // App data still works online if browser storage is unavailable/full.
      }
    },
    read: function (username, section) {
      try {
        const value = localStorage.getItem(key(username, section));
        return value ? JSON.parse(value) : null;
      } catch (error) {
        return null;
      }
    },
    rememberUser: function (username) {
      try { localStorage.setItem(activeUserKey, username); } catch (error) { /* optional */ }
    },
    lastUser: function () {
      try { return localStorage.getItem(activeUserKey); } catch (error) { return null; }
    },
    clearUser: function (username) {
      try {
        localStorage.removeItem(key(username, "tasks"));
        localStorage.removeItem(key(username, "notes"));
        localStorage.removeItem(activeUserKey);
      } catch (error) { /* optional */ }
    },
    hasBackup: function (username) {
      return Boolean(this.read(username, "tasks") || this.read(username, "notes"));
    }
  };
})();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch(function () {
    // The local data backup still works while the page is open if SW is unavailable.
  });
}
