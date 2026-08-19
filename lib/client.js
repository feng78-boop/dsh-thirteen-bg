/**
 * dsh-thirteen-bg — client bundle (v2, self-contained).
 *
 * Animated background (live wallpaper) for the DeepSeek Harness Web GUI.
 * Pure client plugin: injects a fixed background layer (GIF / animated WebP /
 * APNG images, plus MP4 / WebM video), plus a card in General settings. The
 * card is fully self-contained — it reads/writes localStorage and IndexedDB
 * directly and never depends on injected business props, so it keeps working
 * regardless of how the slot renderer composes props.
 *
 * Storage:
 *  - localStorage: enabled flag, source ("url" | "upload"), kind, url, mask
 *  - IndexedDB (dsh-thirteen-bg/files): the uploaded Blob, any size
 *
 * Bundle format: `window.__ModuleLoader__.load({ id, factory })`.
 */
window.__ModuleLoader__.load({
  id: "dsh-thirteen-bg",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");

    // =====================================================================
    // persistence
    // =====================================================================
    var LS_ENABLED = "dsh-animated-bg.enabled";
    var LS_SOURCE = "dsh-animated-bg.source";
    var LS_KIND = "dsh-animated-bg.kind";   // "image" | "video"
    var LS_URL = "dsh-animated-bg.url";
    var LS_MASK = "dsh-animated-bg.mask";
    var LS_TONE = "dsh-animated-bg.tone";   // "off" | "auto" | preset id

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
    var videoEl = null;
    var maskEl = null;
    var visHandler = null;

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

    function removeVideoLayer() {
      if (videoEl) {
        try { videoEl.pause(); videoEl.removeAttribute("src"); videoEl.load(); } catch (e) { }
        try { videoEl.parentNode && videoEl.parentNode.removeChild(videoEl); } catch (e) { }
        videoEl = null;
      }
      if (maskEl) {
        try { maskEl.parentNode && maskEl.parentNode.removeChild(maskEl); } catch (e) { }
        maskEl = null;
      }
    }

    function removeAllLayers() {
      removeBgElement();
      removeVideoLayer();
    }

    /**
     * Apply the background as a real fixed layer — a real element (not a
     * shared html::before pseudo-element) cannot lose a CSS source-order
     * fight with other skin plugins that also target html::before/::after.
     * kind: "image" -> fixed div with (mask gradient + image) background;
     *       "video" -> fixed muted looping <video> + a separate mask div.
     */
    function applyMedia(kind, media, mask) {
      if (!media) {
        removeAllLayers();
        return;
      }
      var m = typeof mask === "number" ? mask : 0.3;
      if (kind === "video") {
        removeBgElement();
        if (!videoEl) {
          videoEl = document.createElement("video");
          videoEl.id = "dsh-animated-bg-video";
          videoEl.style.cssText =
            "position:fixed;inset:0;z-index:-1;pointer-events:none;" +
            "width:100%;height:100%;object-fit:cover;background:#000;";
          document.documentElement.appendChild(videoEl);
          // a broken url just drops the layer instead of leaving a black wall
          videoEl.onerror = function () { removeVideoLayer(); };
        }
        if (!maskEl) {
          maskEl = document.createElement("div");
          maskEl.id = "dsh-animated-bg-mask";
          maskEl.style.cssText =
            "position:fixed;inset:0;z-index:-1;pointer-events:none;";
          document.documentElement.appendChild(maskEl);
        }
        maskEl.style.background =
          "linear-gradient(rgba(5,6,9," + m + "),rgba(5,6,9," + m + "))";
        if (videoEl.getAttribute("src") !== media) {
          videoEl.muted = true;
          videoEl.loop = true;
          videoEl.autoplay = true;
          videoEl.playsInline = true;
          videoEl.setAttribute("playsinline", "");
          videoEl.setAttribute("muted", "");
          videoEl.setAttribute("src", media);
          videoEl.play().catch(function () { });
        }
        return;
      }
      // image path
      removeVideoLayer();
      var el = ensureBgElement();
      el.style.backgroundImage =
        "linear-gradient(rgba(5,6,9," + m + "),rgba(5,6,9," + m + "))," +
        'url("' + media + '")';
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
      var mask = Number(loadLS(LS_MASK, "0.3"));
      if (loadLS(LS_ENABLED, "0") !== "1") {
        applyMedia(null, null, mask);
        return Promise.resolve("off");
      }
      var source = loadLS(LS_SOURCE, "url");
      var kind = loadLS(LS_KIND, "image");
      if (source === "upload") {
        return idbGet("media").then(function (blob) {
          if (!blob) return idbGet("image").then(function (old) {   // migrate old key
            if (!old) { applyMedia(null, null, mask); return "no-image"; }
            return applyBlob(old, kind, mask);
          });
          return applyBlob(blob, kind, mask);
        }).catch(function () { applyMedia(null, null, mask); return "error"; });
      }
      var url = loadLS(LS_URL, "").trim();
      if (!url) { applyMedia(null, null, mask); return "no-url"; }
      if (kind === "video") {
        applyMedia("video", url, mask);
        return Promise.resolve("ok");
      }
      return testImage(url).then(function (loadable) {
        if (!loadable) { applyMedia(null, null, mask); return "bad-url"; }
        applyMedia("image", url, mask);
        return "ok";
      });
    }

    function applyBlob(blob, kind, mask) {
      if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch (e) { } }
      currentObjectUrl = URL.createObjectURL(blob);
      applyMedia(kind, currentObjectUrl, mask);
      return "ok";
    }

    // =====================================================================
    // chrome tone matching — tint the UI chrome (borders, bars, accents)
    // toward the wallpaper's hue via the theme token-override layer
    // =====================================================================
    var TONE_SOURCE = "dsh-thirteen-bg";
    var toneDisposer = null;
    var toneStatus = "";
    var themeService = null;

    var TONE_PRESETS = [
      { id: "ocean",  primary: "#3d6ff2" },
      { id: "mint",   primary: "#2fb8a3" },
      { id: "violet", primary: "#8b5cf6" },
      { id: "amber",  primary: "#d97706" },
      { id: "rose",   primary: "#e0536d" },
      { id: "slate",  primary: "#64748b" }
    ];

    function hexToRgb(hex) {
      var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
      if (!m) return { r: 0, g: 0, b: 0 };
      return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
    }
    function rgbToHex(r, g, b) {
      var c = function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return v.toString(16).padStart(2, "0"); };
      return "#" + c(r) + c(g) + c(b);
    }
    function mix(hexA, hexB, t) {
      var a = hexToRgb(hexA), b = hexToRgb(hexB);
      return rgbToHex(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
    }
    function withAlpha(hex, alpha) {
      var c = hexToRgb(hex);
      return "rgba(" + c.r + "," + c.g + "," + c.b + "," + alpha + ")";
    }
    function lighten(hex, amt) { return mix(hex, "#ffffff", amt); }
    function darken(hex, amt) { return mix(hex, "#000000", amt); }

    /** Token overrides for one primary hue — tuned for readability in both schemes. */
    function toneOverridesFor(primary) {
      return {
        "--dsw-alias-bg-base": { light: mix("#f8fafc", primary, 0.12), dark: mix("#0b0f17", primary, 0.20) },
        "--dsw-alias-bg-layer-1": { light: mix("#ffffff", primary, 0.08), dark: mix("#111827", primary, 0.18) },
        "--dsw-alias-bg-layer-2": { light: mix("#ffffff", primary, 0.05), dark: mix("#1a2332", primary, 0.16) },
        "--dsw-alias-bg-overlay": { light: "#ffffff", dark: mix("#1e293b", primary, 0.20) },
        "--dsw-alias-border-l1": { light: withAlpha(primary, 0.16), dark: withAlpha(primary, 0.15) },
        "--dsw-alias-border-l2": { light: withAlpha(primary, 0.30), dark: withAlpha(primary, 0.28) },
        "--dsw-alias-border-l3": { light: withAlpha(primary, 0.40), dark: withAlpha(primary, 0.38) },
        "--dsw-alias-brand-primary": { light: darken(primary, 0.08), dark: lighten(primary, 0.10) },
        "--dsw-alias-button-primary-fill": { light: darken(primary, 0.08), dark: lighten(primary, 0.10) },
        "--dsw-alias-button-primary-hover": { light: darken(primary, 0.16), dark: lighten(primary, 0.20) },
        "--dsw-alias-brand-primary-invert": { light: "#ffffff", dark: "#0b0f17" },
        "--dsw-specific-sidebar-fill": { light: mix("#ffffff", primary, 0.10), dark: mix("#0d1320", primary, 0.24) },
        "--dsw-specific-sidebar-nav-item-active": { light: mix(primary, "#ffffff", 0.85), dark: mix("#16203a", primary, 0.30) },
        "--dsw-specific-sidebar-nav-item-hover": { light: withAlpha(primary, 0.10), dark: withAlpha(primary, 0.14) },
        "--dsw-specific-sidebar-nav-item-active-accent": { light: primary, dark: lighten(primary, 0.15) },
        "--dsw-alias-interactive-bg-hover": { light: withAlpha(primary, 0.10), dark: withAlpha(primary, 0.16) },
        "--dsw-alias-interactive-bg-active": { light: withAlpha(primary, 0.16), dark: withAlpha(primary, 0.24) },
        "--dsw-alias-label-secondary": { light: mix("#475569", primary, 0.35), dark: mix("#a5b4d0", primary, 0.35) },
        "--dsw-alias-label-tertiary": { light: mix("#64748b", primary, 0.30), dark: mix("#7c8aa8", primary, 0.30) }
      };
    }

    /** Average the dominant colour of the current background media. */
    function sampleMediaColor() {
      return new Promise(function (resolve) {
        var draw = function (src) {
          var img = new Image();
          img.onload = function () {
            var cv = document.createElement("canvas");
            cv.width = 16; cv.height = 16;
            var cx = cv.getContext("2d");
            try { cx.drawImage(img, 0, 0, 16, 16); } catch (e) { resolve(null); return; }
            resolve(averageCanvas(cv));
          };
          img.onerror = function () { resolve(null); };
          img.src = src;
        };
        if (loadLS(LS_KIND, "image") === "video" && videoEl && videoEl.videoWidth) {
          var cv = document.createElement("canvas");
          cv.width = 16; cv.height = 16;
          var cx = cv.getContext("2d");
          try { cx.drawImage(videoEl, 0, 0, 16, 16); } catch (e) { resolve(null); return; }
          resolve(averageCanvas(cv));
          return;
        }
        var src = currentObjectUrl || loadLS(LS_URL, "").trim();
        if (!src) { resolve(null); return; }
        draw(src);
      });
    }

    function averageCanvas(cv) {
      try {
        var d = cv.getContext("2d").getImageData(0, 0, 16, 16).data;
        var r = 0, g = 0, b = 0, n = d.length / 4;
        for (var i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx - mn < 24) return null;   // near-grey: no useful hue
        return { r: r, g: g, b: b };
      } catch (e) { return null; }
    }

    /** Apply (or clear) the chrome tone. mode: "off" | "auto" | preset id. */
    function applyTone(mode, cb) {
      var finish = function (primary) {
        if (toneDisposer) { try { toneDisposer(); } catch (e) { } toneDisposer = null; }
        if (!primary) {
          toneStatus = "";
          if (cb) cb(null);
          return;
        }
        try {
          toneDisposer = themeService.overrideTokens(TONE_SOURCE, toneOverridesFor(primary));
          toneStatus = primary;
          if (cb) cb(primary);
        } catch (e) { toneStatus = ""; if (cb) cb(null); }
      };
      saveLS(LS_TONE, mode);
      if (mode === "off") { finish(null); return; }
      if (mode === "auto") {
        sampleMediaColor().then(function (rgb) {
          finish(rgb ? rgbToHex(rgb.r, rgb.g, rgb.b) : null);
        });
        return;
      }
      var p = TONE_PRESETS.find(function (t) { return t.id === mode; });
      finish(p ? p.primary : null);
    }

    function clearTone() {
      if (toneDisposer) { try { toneDisposer(); } catch (e) { } toneDisposer = null; }
      saveLS(LS_TONE, "off");
      toneStatus = "";
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
      ".dsh-animated-bg-btn{background:var(--dsw-alias-button-primary-fill);" +
      "color:var(--dsw-alias-label-primary-foreground);" +
      "border:1px solid transparent;border-radius:8px;padding:6px 14px;font:inherit;font-weight:500;cursor:pointer}" +
      ".dsh-animated-bg-btn:hover{background:var(--dsw-alias-button-primary-hover)}" +
      ".dsh-animated-bg-btn-ghost{background:transparent;color:var(--dsw-alias-label-primary,#222);" +
      "border:1px solid var(--dsw-alias-border-l2,#999);border-radius:8px;padding:6px 14px;font:inherit;cursor:pointer}" +
      ".dsh-animated-bg-btn-ghost:hover{background:var(--dsw-alias-interactive-bg-hover,#00000014)}" +
      ".dsh-animated-bg-upload{display:inline-flex;align-items:center;gap:6px;background:transparent;" +
      "color:var(--dsw-alias-label-primary,#222);border:1px solid var(--dsw-alias-border-l2,#999);" +
      "border-radius:8px;padding:6px 14px;font:inherit;cursor:pointer}" +
      ".dsh-animated-bg-upload:hover{background:var(--dsw-alias-interactive-bg-hover,#00000014)}" +
      ".dsh-animated-bg-swatch{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}" +
      ".dsh-animated-bg-swatch-on{border-color:var(--dsw-alias-label-primary,#222)}" +
      ".dsh-animated-bg-tone-preview{width:22px;height:22px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2,#999);display:inline-block;vertical-align:middle}" +
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
      url: "动图/视频 URL（GIF / WebP / APNG / mp4 / webm）",
      applyUrl: "应用 URL",
      upload: "上传本地动图/视频",
      uploaded: "已选择并应用",
      mask: "背景压暗",
      clear: "清除背景",
      statusOk: "已应用 ✓",
      statusOff: "动态背景已关闭",
      statusNoImage: "没有可用的媒体，请上传或填写 URL",
      statusBadUrl: "该地址无法加载——本地文件请用“上传”，或填 http(s) 链接",
      statusCleared: "已清除",
      statusError: "读取本地文件失败，请重试",
      statusTooBig: "文件较大，应用可能需要几秒",
      tone: "界面色调",
      toneAuto: "跟随背景",
      toneOff: "关闭",
      toneSampling: "正在取色…",
      toneNeutral: "背景色调偏灰，未自动着色",
      hint: "支持 GIF / 动图 WebP / APNG 图片，以及 MP4 / WebM / MOV 视频（自动识别格式；视频静音循环，切后台自动暂停）。建议 1080p、深色为主。文件存在本机浏览器，不限制大小。"
    };
    var en = {
      enabled: "Enable animated background",
      url: "Image/video URL (GIF / WebP / APNG / mp4 / webm)",
      applyUrl: "Apply URL",
      upload: "Upload local image/video",
      uploaded: "Selected and applied",
      mask: "Dim",
      clear: "Clear background",
      statusOk: "Applied ✓",
      statusOff: "Animated background off",
      statusNoImage: "No media available — upload one or paste a URL",
      statusBadUrl: "That address cannot load — use Upload for local files, or paste an http(s) link",
      statusCleared: "Cleared",
      statusError: "Failed to read the local file, try again",
      statusTooBig: "Large file — applying may take a few seconds",
      tone: "Chrome tone",
      toneAuto: "Match background",
      toneOff: "Off",
      toneSampling: "Sampling…",
      toneNeutral: "Background is near-grey — no auto tint applied",
      hint: "GIF / animated WebP / APNG images, plus MP4 / WebM / MOV video (auto-detected; video plays muted on loop and pauses in background tabs). Suggested: 1080p, dark tones. Uploads are stored in this browser with no size limit."
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
          tone: loadLS(LS_TONE, "off"),
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
        if (next.kind) saveLS(LS_KIND, next.kind);
        if (next.url !== undefined) saveLS(LS_URL, next.url);
        if (next.mask !== undefined) saveLS(LS_MASK, String(next.mask));
        patch(next, status);
        applyCurrent().then(function () {
          if (status !== undefined) patch({}, status);
        });
      }

      function kindFromUrl(u) {
        u = String(u || "").toLowerCase();
        if (/\.(mp4|webm|mov|m4v|ogv)([?#]|$)/.test(u)) return "video";
        return "image";
      }

      function onUrlApply() {
        var url = (cfg.url || "").trim();
        if (!isUsableUrl(url)) {
          patch({}, t("statusBadUrl"));
          return;
        }
        var kind = kindFromUrl(url);
        if (kind === "video") {
          persistAndApply({ enabled: true, source: "url", kind: "video", url: url, mask: cfg.mask }, t("statusOk"));
          return;
        }
        testImage(url).then(function (loadable) {
          if (!loadable) { patch({}, t("statusBadUrl")); return; }
          persistAndApply({ enabled: true, source: "url", kind: "image", url: url, mask: cfg.mask }, t("statusOk"));
        });
      }

      function kindFromFile(file) {
        var t = String(file.type || "").toLowerCase();
        return t.indexOf("video/") === 0 ? "video" : "image";
      }

      function onFile(ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        var kind = kindFromFile(file);
        var status = file.size > 8 * 1024 * 1024 ? t("statusTooBig") : t("statusOk");
        idbPut("media", file).then(function () {
          saveLS(LS_ENABLED, "1");
          saveLS(LS_SOURCE, "upload");
          saveLS(LS_KIND, kind);
          patch({ enabled: true, source: "upload", kind: kind, status: status });
          return applyCurrent();
        }).then(function () {
          patch({}, t("statusOk"));
        }).catch(function () {
          patch({}, t("statusError"));
        });
      }

      function onClear() {
        idbDel("media").catch(function () { });
        idbDel("image").catch(function () { });
        saveLS(LS_ENABLED, "0");
        saveLS(LS_SOURCE, "url");
        saveLS(LS_URL, "");
        saveLS(LS_KIND, "image");
        patch({ enabled: false, source: "url", url: "", status: t("statusCleared") });
        applyMedia(null, null, cfg.mask);
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

      function onTone(mode) {
        patch({ tone: mode });
        if (mode === "auto") {
          patch({}, t("toneSampling"));
          applyTone("auto", function (primary) {
            patch({}, primary ? t("statusOk") : t("toneNeutral"));
          });
          return;
        }
        applyTone(mode, function (primary) {
          patch({}, primary ? t("statusOk") : t("statusCleared"));
        });
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
              accept: "image/*,video/*",
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
        React.createElement(
          "div", { className: "dsh-animated-bg-row" },
          React.createElement("span", null, t("tone")),
          React.createElement(
            "button", {
              className: "dsh-animated-bg-btn-ghost" + (cfg.tone === "auto" ? " dsh-animated-bg-swatch-on" : ""),
              onClick: function () { onTone("auto"); }
            },
            t("toneAuto")
          ),
          TONE_PRESETS.map(function (p) {
            return React.createElement("button", {
              key: p.id,
              className: "dsh-animated-bg-swatch" + (cfg.tone === p.id ? " dsh-animated-bg-swatch-on" : ""),
              style: { background: p.primary },
              title: p.id,
              onClick: function () { onTone(p.id); }
            });
          }),
          React.createElement("span", {
            className: "dsh-animated-bg-tone-preview",
            style: toneStatus ? { background: toneStatus } : undefined
          }),
          React.createElement(
            "button", { className: "dsh-animated-bg-btn-ghost", onClick: function () { onTone("off"); } },
            t("toneOff")
          )
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
      themeService = ctx.get("theme");
      // restore the saved background at activation (not lazily from the card)
      var bgReady = applyCurrent();

      // restore the saved chrome tone (auto mode samples the media once it is up)
      var savedTone = loadLS(LS_TONE, "off");
      if (savedTone !== "off") {
        if (savedTone === "auto") {
          bgReady.then(function () { applyTone("auto"); });
        } else {
          applyTone(savedTone);
        }
      }

      // pause the video layer when the tab is hidden, resume when visible
      if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        visHandler = function () {
          if (!videoEl) return;
          if (document.hidden) { try { videoEl.pause(); } catch (e) { } }
          else { videoEl.play().catch(function () { }); }
        };
        document.addEventListener("visibilitychange", visHandler);
      }

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
        clearTone();
        themeService = null;
        removeAllLayers();
        if (visHandler) {
          try { document.removeEventListener("visibilitychange", visHandler); } catch (e) { }
          visHandler = null;
        }
        if (currentObjectUrl) { try { URL.revokeObjectURL(currentObjectUrl); } catch (e) { } }
        currentObjectUrl = null;
      };
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale", "theme"];
    return module.exports;
  }
});
