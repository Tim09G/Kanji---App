/*
 * clouddrive.js — optional Google Drive sync for automatic backups (Phase 20).
 *
 * Client-only: Google Identity Services (GIS) token client provides a short-lived
 * OAuth access token, which we use to read/write a single backup file in the user's
 * private Drive "appDataFolder" (hidden, app-scoped) via the Drive REST API. No
 * backend, no stored refresh token (token lives in memory for the session only).
 *
 * The OAuth Client ID is the user's own (from their Google Cloud project) and is
 * pasted in Settings — Client IDs are public, not secrets. Everything degrades
 * gracefully: if GIS isn't loaded, no Client ID is set, or there's no network, the
 * cloud calls become no-ops and the local backup (Store.autoBackup) still happens.
 */
window.CloudDrive = (function () {
  "use strict";

  var SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  var FILE_NAME = "kanji-app-backup.json";
  var CID_KEY = "kanji.gdrive.clientId";
  var LAST_KEY = "kanji.gdrive.lastSync";

  var tokenClient = null;
  var accessToken = null;
  var tokenExpiry = 0;

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) {} }

  function clientId() { return lsGet(CID_KEY); }
  function setClientId(id) { lsSet(CID_KEY, (id || "").trim()); tokenClient = null; accessToken = null; tokenExpiry = 0; }
  function lastSync() { return lsGet(LAST_KEY); }
  function setLastSync(t) { lsSet(LAST_KEY, t); }

  function gisReady() { return !!(window.google && window.google.accounts && window.google.accounts.oauth2); }
  function configured() { return !!clientId(); }

  function ensureTokenClient() {
    if (tokenClient) return tokenClient;
    if (!gisReady() || !configured()) return null;
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId(), scope: SCOPE, callback: function () {},
    });
    return tokenClient;
  }

  // Resolve an access token. interactive=true permits the consent popup; false tries
  // a silent grant (works after the user has connected once) and otherwise rejects.
  function getToken(interactive) {
    return new Promise(function (resolve, reject) {
      if (!gisReady()) return reject(new Error("Google sign-in is not available"));
      if (!configured()) return reject(new Error("No Google Client ID configured"));
      if (accessToken && Date.now() < tokenExpiry - 60000) return resolve(accessToken);
      var tc = ensureTokenClient();
      if (!tc) return reject(new Error("token client unavailable"));
      tc.callback = function (resp) {
        if (resp && resp.access_token) {
          accessToken = resp.access_token;
          tokenExpiry = Date.now() + ((resp.expires_in || 3600) * 1000);
          resolve(accessToken);
        } else {
          reject(new Error((resp && resp.error) || "authorization failed"));
        }
      };
      if (typeof tc.error_callback !== "undefined") {
        tc.error_callback = function (err) { reject(new Error((err && err.type) || "authorization error")); };
      }
      try { tc.requestAccessToken({ prompt: interactive ? "consent" : "" }); }
      catch (e) { reject(e); }
    });
  }

  function api(token, url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: "Bearer " + token }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error("Drive API " + r.status);
      return r;
    });
  }

  function findFileId(token) {
    var url = "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder" +
      "&fields=files(id,name,modifiedTime)&q=" + encodeURIComponent("name='" + FILE_NAME + "'");
    return api(token, url).then(function (r) { return r.json(); }).then(function (j) {
      return (j.files && j.files[0]) ? j.files[0].id : null;
    });
  }

  // Build a multipart/related body (metadata + file content) for the Drive upload.
  function buildMultipart(meta, content) {
    var boundary = "kanjibk" + Date.now();
    var body =
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n" +
      "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + content + "\r\n" +
      "--" + boundary + "--";
    return { boundary: boundary, body: body };
  }

  // Create or update the single backup file in appDataFolder.
  function upload(jsonString, interactive) {
    return getToken(!!interactive).then(function (token) {
      return findFileId(token).then(function (id) {
        var meta = id ? {} : { name: FILE_NAME, parents: ["appDataFolder"] };
        var mp = buildMultipart(meta, jsonString);
        var url = "https://www.googleapis.com/upload/drive/v3/files" + (id ? "/" + id : "") +
          "?uploadType=multipart&fields=id,modifiedTime";
        return api(token, url, {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "multipart/related; boundary=" + mp.boundary },
          body: mp.body,
        });
      }).then(function (r) { return r.json(); }).then(function (j) {
        setLastSync(new Date().toISOString());
        return j;
      });
    });
  }

  // Returns the backup JSON string from Drive, or null if none exists yet.
  function download(interactive) {
    return getToken(!!interactive).then(function (token) {
      return findFileId(token).then(function (id) {
        if (!id) return null;
        return api(token, "https://www.googleapis.com/drive/v3/files/" + id + "?alt=media")
          .then(function (r) { return r.text(); });
      });
    });
  }

  // Best-effort backup used by the automatic triggers — never rejects, never blocks.
  function backupSilent(jsonString) {
    if (!configured() || !gisReady()) return Promise.resolve(false);
    return upload(jsonString, false).then(function () { return true; }, function () { return false; });
  }

  return {
    configured: configured,
    gisReady: gisReady,
    clientId: clientId,
    setClientId: setClientId,
    lastSync: lastSync,
    connect: function () { return getToken(true); },   // interactive consent
    upload: upload,
    download: download,
    backupSilent: backupSilent,
    buildMultipart: buildMultipart,                     // exposed for tests
  };
})();
