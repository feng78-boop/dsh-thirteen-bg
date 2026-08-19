/**
 * dsh-animated-bg — client bundle (v1).
 *
 * Animated background (live wallpaper) for the DeepSeek Harness Web GUI.
 * Pure client plugin: injects a fixed background layer keyed on
 * `html[data-dsh-animated-bg]` (GIF / animated WebP / APNG via CSS
 * background-image, which browsers animate natively), plus a card in General
 * settings. The skin choice persists in localStorage.
 *
 * Bundle format: `window.__ModuleLoader__.load({ id, factory })`.
 */
window.__ModuleLoader__.load({
  id: "dsh-animated-bg",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    var React = require("react");

    // ---- persistence ----
    var LS_ENABLED = "dsh-animated-bg.enabled";
    var LS_IMAGE = "dsh-animated-bg.image";
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

    // ---- background layer ----
    function applyBackground(image, mask) {
      var host = document.documentElement;
      if (!image) {
        host.removeAttribute("data-dsh-animated-bg");
        host.style.removeProperty("--dsh-animated-bg-image");
        host.style.removeProperty("--dsh-animated-bg-mask");
        return;
      }
      host.setAttribute("data-dsh-animated-bg", "on");
      host.style.setProperty("--dsh-animated-bg-image", "url(" + image + ")");
      host.style.setProperty("--dsh-animated-bg-mask", String(mask));
    }

    // ---- styles ----
    var cssText =
      "html[data-dsh-animated-bg]::before{content:'';position:fixed;inset:0;z-index:-1;" +
      "background-image:var(--dsh-animated-bg-image);background-size:cover;" +
      "background-position:center;background-repeat:no-repeat}" +
      "html[data-dsh-animated-bg]::after{content:'';position:fixed;inset:0;z-index:-1;" +
      "background:rgba(5,6,9,var(--dsh-animated-bg-mask,0.3))}" +
      ".dsh-animated-bg-card{display:flex;flex-direction:column;gap:10px}" +
      ".dsh-animated-bg-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}" +
      ".dsh-animated-bg-input{flex:1;min-width:220px;background:var(--dsw-alias-bg-base,#fff);" +
      "border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;" +
      "color:var(--dsw-alias-label-primary,#222);padding:6px 10px;font:inherit}" +
      ".dsh-animated-bg-btn{background:var(--dsw-alias-interactive-bg,#eef);" +
      "border:1px solid var(--dsw-alias-border-l2,#ccc);border-radius:8px;" +
      "color:var(--dsw-alias-label-primary,#222);padding:6px 12px;font:inherit;cursor:pointer}" +
      ".dsh-animated-bg-hint{font-size:12px;color:var(--dsw-alias-label-tertiary,#888);line-height:1.5}";

    var styleTag = null;
    function ensureStyle() {
      if (styleTag || typeof document === "undefined") return;
      styleTag = document.createElement("style");
      styleTag.dataset.plugin = "dsh-animated-bg";
      styleTag.textContent = cssText;
      document.head.appendChild(styleTag);
    }

    // ---- locale ----
    var NS = "dsh-animated-bg";
    var zh = {
      enabled: "启用动态背景",
      url: "动图 URL（GIF / 动图 WebP / APNG）",
      applyUrl: "应用 URL",
      upload: "上传本地动图",
      mask: "背景压暗",
      clear: "清除背景",
      tooBig: "图片超过 4.5MB，请改用 URL 方式",
      hint: "建议：长边 ≤1920px、深色为主、8–20 秒无缝循环、文件 ≤4.5MB（更大的请用 URL 方式）。"
    };
    var en = {
      enabled: "Enable animated background",
      url: "Image URL (GIF / animated WebP / APNG)",
      applyUrl: "Apply URL",
      upload: "Upload local image",
      mask: "Dim",
      clear: "Clear background",
      tooBig: "Image exceeds 4.5MB — use a URL instead",
      hint: "Recommended: longest edge ≤1920px, dark tones, seamless 8–20s loop, ≤4.5MB (use URL for larger)."
    };

    // ---- settings card ----
    function AnimatedBgRow(props) {
      var t = props.t;
      var applyConfig = props.applyConfig;
      var initial = props.initial || { enabled: false, image: "", mask: 0.3 };

      var state = React.useState({
        enabled: !!initial.enabled,
        image: initial.image || "",
        mask: typeof initial.mask === "number" ? initial.mask : 0.3
      });
      var cfg = state[0];
      var setCfg = state[1];

      function update(next) {
        setCfg(next);
        applyConfig(next);
      }

      function onFile(ev) {
        var file = ev.target.files && ev.target.files[0];
        if (!file) return;
        if (file.size > 4.5 * 1024 * 1024) {
          window.alert(t("tooBig"));
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          update({ enabled: true, image: String(reader.result), mask: cfg.mask });
        };
        reader.readAsDataURL(file);
      }

      return React.createElement(
        "div", { className: "dsh-animated-bg-card" },
        React.createElement(
          "label", { className: "dsh-animated-bg-row" },
          React.createElement("input", {
            type: "checkbox",
            checked: !!cfg.enabled,
            onChange: function (e) {
              update({ enabled: e.target.checked, image: cfg.image, mask: cfg.mask });
            }
          }),
          t("enabled")
        ),
        React.createElement(
          "div", { className: "dsh-animated-bg-row" },
          React.createElement("input", {
            className: "dsh-animated-bg-input",
            type: "text",
            placeholder: t("url"),
            value: cfg.image,
            onChange: function (e) {
              setCfg({ enabled: cfg.enabled, image: e.target.value, mask: cfg.mask });
            }
          }),
          React.createElement(
            "button", {
              className: "dsh-animated-bg-btn",
              onClick: function () {
                update({ enabled: cfg.enabled || !!cfg.image, image: cfg.image, mask: cfg.mask });
              }
            },
            t("applyUrl")
          )
        ),
        React.createElement(
          "div", { className: "dsh-animated-bg-row" },
          React.createElement("input", {
            type: "file",
            accept: "image/gif,image/webp,image/apng,image/png,image/jpeg",
            onChange: onFile
          }),
          React.createElement(
            "button", {
              className: "dsh-animated-bg-btn",
              onClick: function () {
                update({ enabled: false, image: "", mask: cfg.mask });
              }
            },
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
            onChange: function (e) {
              update({ enabled: cfg.enabled, image: cfg.image, mask: Number(e.target.value) });
            }
          })
        ),
        React.createElement("div", { className: "dsh-animated-bg-hint" }, t("hint"))
      );
    }

    // ---- plugin body ----
    function apply(ctx) {
      ensureStyle();

      var enabled = loadLS(LS_ENABLED, "0") === "1";
      var image = loadLS(LS_IMAGE, "");
      var mask = Number(loadLS(LS_MASK, "0.3"));
      applyBackground(enabled && image ? image : null, mask);

      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-animated-bg: settings row dictionaries");

      var injected = function () {
        return {
          initial: { enabled: enabled, image: image, mask: mask },
          applyConfig: function (cfg) {
            var on = !!cfg.enabled && !!cfg.image;
            saveLS(LS_ENABLED, on ? "1" : "0");
            saveLS(LS_IMAGE, cfg.image || "");
            saveLS(LS_MASK, String(typeof cfg.mask === "number" ? cfg.mask : 0.3));
            applyBackground(on ? cfg.image : null, cfg.mask);
          }
        };
      };

      ctx.slots.inject("settings.general.item", function () {
        return ctx.slots.register({
          name: "settings.general.item",
          id: "animated-bg",
          order: 25,
          locale: NS,
          inject: injected
        }, AnimatedBgRow);
      });

      return function () {
        applyBackground(null);
      };
    }

    exports.apply = apply;
    exports.inject = ["slots", "locale"];
    return module.exports;
  }
});
