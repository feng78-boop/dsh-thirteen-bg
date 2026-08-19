/**
 * dsh-animated-bg — client bundle (v2.1, self-contained).
 *
 * Animated background (live wallpaper) for the DeepSeek Harness Web GUI.
 * Pure client plugin: injects a fixed background layer as a REAL element
 * (a div appended to <html>), so it cannot lose a CSS source-order fight
 * with other skin plugins that also target html::before/::after. Plus a card
 * in General settings; the card is fully self-contained — it reads/writes
 * localStorage and IndexedDB directly and never depends on injected props.
 *
 * Storage:
 *  - localStorage: enabled flag, source ("url" | "upload"), url, mask
 *  - IndexedDB (dsh-animated-bg/files): the uploaded Blob
 *
 * Bundle format: `window.__ModuleLoader__.load({ id, factory })`.
 */
window.__ModuleLoader__.load({
  id: "dsh-animated-bg",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");

    // =====================================================================
    // persistence
    // =====================================================================
    var LS_ENABLED = "dsh-animated-bg.enabled";
    var LS_SOURCE = "dsh-animated-bg.source";
    var LS_URL = "dsh-animated-bg.url";
    var LS_MASK = "dsh-animated-bg.mask";

    function loadLS(key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw === null ? fallback : raw;
      } catch (err) { return fallback; }
    }
    function saveLS(key, value) {
      try { localStorage.setItem(key, value); } catch (err) { /* quota / privacy mode */ }
    }

    // IndexedDB blob store (large uploaded files live here, not localStorage)
    var IDB_NAME = "dsh-animated-bg";
    var IDB_STORE = "files";
    function idbOpen() {
      return new Promise(function (resolve, reject) {
        try {
          var req = indexedDB.open(IDB_NAME, 1);
          req.onupgradeneeded = function () { req.result.createObjectStore(IDB_STORE); };
          req.onsuccess = function () { resolve(req.result); };
          req.onerror = function () { reject(req.error); };
        } catch (err) { reject(err); }
      });
    }
    function idbPut(key, value) {
      return idbOpen().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).put(value, key);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
          } catch (err) { reject(err); }
        });
      });
    }
    function idbGet(key) {
      return idbOpen().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var tx = db.transaction(IDB_STORE, "readonly");
            var rq = tx.objectStore(IDB_STORE).get(key);
            rq.onsuccess = function () { resolve(rq.result); };
            rq.onerror = function () { reject(rq.error); };
          } catch (err) { reject(err); }
        });
      });
    }
    function idbDel(key) {
      return idbOpen().then(function (db) {
        return new Promise(function (resolve, reject) {
          try {
            var tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
          } catch (err) { reject(err); }
        });
      });
    }

    // =====================================================================
    // background layer
    // =====================================================================
    var currentObjectUrl = null;
    var bgEl = null;

    function ensureBgElement() {
      if (bgEl) return bgEl;
      bgEl = document.getElementById("dsh-animated-bg");
      if (!bgEl) {
        bgEl = document.createElement("div");
        bgEl.id = "dsh-animated-bg";
        bgEl.style.cssText =
          "position:fixed;inset:0;z-index:-1;pointer-events:none;" +
          "background-size:cover;background-position:center;background-repeat:no-repeat;";
        // Appended to <html>: nothing the app renders can displace it, and it
        // paints after the skins plugin's html::before layer in the
        // negative-z band, so the animated layer always wins visually.
        document.documentElement.appendChild(bgEl);
      }
      return bgEl;
    }

    function removeBgElement() {
      if (bgEl) {
        try { bgEl.parentNode && bgEl.parentNode.removeChild(bgEl); } catch (e) { }
        bgEl = null;
      }
    }

    /**
     * Apply the animated background as a real fixed layer. A real element
     * (not a shared html::before pseudo-element) cannot lose a CSS
     * source-order fight with other skin plugins that also target
     * html::before / html::after.
     */
    function applyBackground(image, mask) {
      if (!image) {
        removeBgElement();
        return;
      }
      var el = ensureBgElement();
      // first background layer = dim mask gradient, second = the (animated) image
      var m = typeof mask === "number" ? mask : 0.3;
      el.style.backgroundImage =
        "linear-gradient(rgba(5,6,9," + m + "),rgba(5,6,9," + m + "))," +
        'url("' + image + '")';
    }

    /** True when the browser can actually load the given url as an image. */
    function testImage(url) {
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve(true); };
        img.onerror = function () { resolve(false); };
        img.src = url;
      });
    }

    /** The browser blocks file:// and bare paths in CSS; accept web-usable ones. */
    function isUsableUrl(u) {
      u = String(u || "").trim();
      if (!u) return false;
      return /^(https?:\/\/|data:|blob:|\/)/i.test(u);
    }

    /**
     * Re-read persisted state and render the background. Returns a Promise of
     * a status string for the settings card.
     */
    function applyCurrent() {
      if (loadLS(LS_ENABLED, "0") !== "1") {
        applyBackground(null);
        return Promise.resolve("off");
      }
      var mask = Number(loadLS(LS_MASK, "0.3"));
      var source = loadLS(LS_SOURCE, "url");
      if (source === "upload") {
        return idbGet("media").then(function (blob) {
          if (!blob) { applyBackground(null); return "no-image"; }
          if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch (e) { } }
          currentObjectUrl = URL.createObjectURL(blob);
          applyBackground(currentObjectUrl, mask);
          return "ok";
        }).catch(function () { applyBackground(null); return "error"; });
      }
      var url = loadLS(LS_URL, "").trim();
      if (!url) { applyBackground(null); return "no-url"; }
      return testImage(url).then(function (loadable) {
        if (!loadable) { applyBackground(null); return "bad-url"; }
        applyBackground(url, mask);
        return "ok";
      });
    }

    // =====================================================================
    // styles (readable in both light and dark themes)
    // =====================================================================
    var cssText =
      ".dsh-animated-bg-card{display:flex;flex-direction:column;gap:10px}" +
      ".dsh-animated-bg-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}" +
      ".dsh-animated-bg-input{flex:1;min-width:200px;background:var(--dsw-alias-bg-base,#fff);" +
      "border:1px solid var(--dsw-alias-border-l2,#999);border-radius:8px;" +
      "color:var(--dsw-alias-label-primary,#222);padding:6px 10px;font:inherit}" +
      ".dsh-animated-bg-btn{background:var(--dsw-alias-brand-primary,#4f6ef7);color:#fff;" +
      "border:1px solid transparent;border-radius:8px;padding:6px 14px;font:inherit;font-weight:500;cursor:pointer}" +
      ".dsh-animated-bg-btn:hover{filter:brightness(1.12)}" +
      ".dsh-animated-bg-btn-ghost{background:transparent;color:var(--dsw-alias-label-primary,#222);" +
      "border:1px solid var(--dsw-alias-border-l2,#999);border-radius:8px;padding:6px 14px;font:inherit;cursor:pointer}" +
      ".dsh-animated-bg-btn-ghost:hover{background:var(--dsw-alias-interactive-bg-hover,#00000014)}" +
      ".dsh-animated-bg-upload{display:inline-flex;align-items:center;gap:6px;background:transparent;" +
      "color:var(--dsw-alias-label-primary,#222);border:1px solid var(--dsw-alias-border-l2,#999);" +
      "border-radius:8px;padding:6px 14px;font:inherit;cursor:pointer}" +
      ".dsh-animated-bg-upload:hover{background:var(--dsw-alias-interactive-bg-hover,#00000014)}" +
      "input[type=checkbox],input[type=range]{accent-color:var(--dsw-alias-brand-primary,#4f6ef7)}" +
      ".dsh-animated-bg-status{font-size:12px;line-height:1.5;min-height:16px;" +
      "color:var(--dsw-alias-label-tertiary,#888)}" +
      ".dsh-animated-bg-status.ok{color:var(--dsw-alias-state-success,#2f9e44)}" +
      ".dsh-animated-bg-status.err{color:var(--dsw-alias-state-danger,#e03131)}" +
      ".dsh-animated-bg-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#888);line-height:1.5}";

    var styleTag = null;
    function ensureStyle() {
      if (styleTag || typeof document === "undefined") return;
      styleTag = document.createElement("style");
      styleTag.dataset.plugin = "dsh-animated-bg";
      styleTag.textContent = cssText;
      document.head.appendChild(styleTag);
    }

    // =====================================================================
    // locale
    // =====================================================================
    var NS = "dsh-animated-bg";
    var zh = {
      enabled: "启用动态背景",
      url: "动图 URL（GIF / 动图 WebP / APNG）",
      applyUrl: "应用 URL",
      upload: "上传本地动图",
      mask: "背景压暗",
      clear: "清除背景",
      statusOk: "已应用 ✓",
      statusOff: "动态背景已关闭",
      statusNoImage: "没有可用的图片，请上传或填写 URL",
      statusBadUrl: "该地址无法加载图片——本地文件请用“上传”，或填 http(s) 链接",
      statusCleared: "已清除",
      statusError: "读取本地图片失败，请重试",
      statusTooBig: "文件较大，应用可能需要几秒",
      hint: "支持 GIF / 动图 WebP / APNG；建议长边 ≤1920px、深色为主、8–20 秒无缝循环。上传的图片存在本机浏览器，不限制大小。"
    };
    var en = {
      enabled: "Enable animated background",
      url: "Image URL (GIF / animated WebP / APNG)",
      applyUrl: "Apply URL",
      upload: "Upload local image",
      mask: "Dim",
      clear: "Clear background",
      statusOk: "Applied ✓",
      statusOff: "Animated background off",
      statusNoImage: "No image available — upload one or paste a URL",
      statusBadUrl: "That address cannot load an image — use Upload for local files, or paste an http(s) link",
      statusCleared: "Cleared",
      statusError: "Failed to read the local image, try again",
      statusTooBig: "Large file — applying may take a few seconds",
      hint: "GIF / animated WebP / APNG supported. Suggested: longest edge ≤1920px, dark tones, seamless 8–20s loop. Uploads are stored in this browser with no size limit."
    };

    // =====================================================================
    // settings card (self-contained — no injected business props needed)
    // =====================================================================
    function AnimatedBgRow(props) {
      var t = props.t;

      var state = React.useState(function () {
        return {
          enabled: loadLS(LS_ENABLED, "0") === "1",
          source: loadLS(LS_SOURCE, "url"),
          url: loadLS(LS_URL, ""),
          mask: Number(loadLS(LS_MASK, "0.3")),
          status: ""
        };
      });
      var cfg = state[0];
      var setCfg = state[1];

      function patch(next, status) {
        setCfg(Object.assign({}, cfg, next, { status: status === undefined ? cfg.status : status }));
      }

      function persistAndApply(next, status) {
        saveLS(LS_ENABLED, next.enabled ? "1" : "0");
        if (next.source) saveLS(LS_SOURCE, next.source);
        if (next.url !== undefined) saveLS(LS_URL, next.url);
        if (next.mask !== undefined) saveLS(LS_MASK, String(next.mask));
        patch(next, status);
        applyCurrent().then(function () {
          if (status !== undefined) patch({}, status);
        });
      }

      function onUrlApply() {
        var url = (cfg.url || "").trim();
        if (!isUsableUrl(url)) {
          patch({}, t("statusBadUrl"));
          return;
        }
        testImage(url).then(function (loadable) {
          if (!loadable) { patch({}, t("statusBadUrl")); return; }
          persistAndApply({ enabled: true, source: "url", url: url, mask: cfg.mask }, t("statusOk"));
        });
      }

      function onFile(ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        var status = file.size > 8 * 1024 * 1024 ? t("statusTooBig") : t("statusOk");
        idbPut("media", file).then(function () {
          saveLS(LS_ENABLED, "1");
          saveLS(LS_SOURCE, "upload");
          patch({ enabled: true, source: "upload", status: status });
          return applyCurrent();
        }).then(function () {
          patch({}, t("statusOk"));
        }).catch(function () {
          patch({}, t("statusError"));
        });
      }

      function onClear() {
        idbDel("media").catch(function () { });
        saveLS(LS_ENABLED, "0");
        saveLS(LS_SOURCE, "url");
        saveLS(LS_URL, "");
        patch({ enabled: false, source: "url", url: "", status: t("statusCleared") });
        applyBackground(null);
      }

      function onEnable(ev) {
        var on = ev.target.checked;
        saveLS(LS_ENABLED, on ? "1" : "0");
        patch({ enabled: on, status: "" });
        applyCurrent().then(function (st) {
          if (on) patch({}, st === "ok" ? t("statusOk") : (st === "bad-url" || st === "no-url" || st === "no-image") ? t("statusNoImage") : t("statusOk"));
        });
      }

      function onMask(ev) {
        var mask = Number(ev.target.value);
        saveLS(LS_MASK, String(mask));
        patch({ mask: mask });
        applyCurrent();
      }

      var statusClass = "";
      var statusText = cfg.status || "";
      if (statusText === t("statusOk") || statusText === t("statusCleared")) statusClass = "ok";
      if (statusText === t("statusBadUrl") || statusText === t("statusError")) statusClass = "err";

      return React.createElement(
        "div", { className: "dsh-animated-bg-card" },
        React.createElement(
          "label", { className: "dsh-animated-bg-row" },
          React.createElement("input", {
            type: "checkbox",
            checked: !!cfg.enabled,
            onChange: onEnable
          }),
          t("enabled")
        ),
        React.createElement(
          "div", { className: "dsh-animated-bg-row" },
          React.createElement("input", {
            className: "dsh-animated-bg-input",
            type: "text",
            placeholder: t("url"),
            value: cfg.url,
            onChange: function (e) { patch({ url: e.target.value }); }
          }),
          React.createElement(
            "button", { className: "dsh-animated-bg-btn", onClick: onUrlApply },
            t("applyUrl")
          )
        ),
        React.createElement(
          "div", { className: "dsh-animated-bg-row" },
          React.createElement(
            "label", { className: "dsh-animated-bg-upload" },
            t("upload"),
            React.createElement("input", {
              type: "file",
              style: { display: "none" },
              accept: "image/gif,image/webp,image/apng,image/png,image/jpeg",
              onChange: onFile
            })
          ),
          React.createElement(
            "button", { className: "dsh-animated-bg-btn-ghost", onClick: onClear },
            t("clear")
          )
        ),
        React.createElement(
          "div", { className: "dsh-animated-bg-row" },
          React.createElement("span", null, t("mask")),
          React.createElement("input", {
            type: "range",
            min: "0",
            max: "0.8",
            step: "0.05",
            value: cfg.mask,
            onChange: onMask
          })
        ),
        React.createElement("div", { className: "dsh-animated-bg-status " + statusClass }, statusText),
        React.createElement("div", { className: "dsh-animated-bg-hint" }, t("hint"))
      );
    }

    // =====================================================================
    // plugin body
    // =====================================================================
    function apply(ctx) {
      ensureStyle();
      applyCurrent();

      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-animated-bg: settings row dictionaries");

      ctx.slots.inject("settings.general.item", function () {
        return ctx.slots.register({
          name: "settings.general.item",
          id: "animated-bg",
          order: 25,
          locale: NS
        }, AnimatedBgRow);
      });

      return function () {
        applyBackground(null);
        if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch (e) { } }
        currentObjectUrl = null;
      };
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    return module.exports;
  }
});
