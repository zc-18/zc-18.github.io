/* =====================================================================
 * AI 知识库助手 · 悬浮入口（交互）
 * 与 css/ai-assistant.css 配套。挂载到 <body>，全站可用。
 *
 * 智能体地址集中在 AGENT_URL 一处：今后若上了 HTTPS / 绑了域名，
 * 只改这一行即可；也可把 CTA 的「新标签打开」换成 iframe 弹层。
 * ===================================================================== */
(function () {
  "use strict";

  var AGENT_URL = "http://101.200.184.201:8081/";

  // 示例问题与智能体欢迎页保持一致（rag-blog-kb / Welcome.tsx）
  var EXAMPLES = [
    { tag: "CC链", q: "CC1 链的核心利用思路是什么？入口在哪里？" },
    { tag: "Java安全", q: "RMI 攻击有哪几种方式，高版本怎么绕过？" },
    { tag: "学成在线", q: "学成在线的认证授权是怎么实现的？" },
    { tag: "苍穹外卖", q: "苍穹外卖里缓存和锁是怎么处理的？" },
    { tag: "LangChain", q: "LangChain 里提示词、工具和记忆分别是做什么的？" }
  ];

  // —— 内联 SVG 图标（lucide）——
  var ICON_SPARKLES =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>';
  var ICON_CLOSE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  var ICON_ARROW =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
  var ICON_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var ICON_SHIELD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function openAgent() {
    window.open(AGENT_URL, "_blank", "noopener,noreferrer");
  }

  function showToast(html) {
    var t = document.getElementById("ai-toast");
    if (!t) return;
    t.innerHTML = html;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () {
      t.classList.remove("show");
    }, 2400);
  }

  // 点击示例：复制问题到剪贴板，再打开智能体，方便粘贴发送
  function pickExample(q) {
    var done = function () {
      showToast(ICON_CHECK + "问题已复制，到新页面粘贴(Ctrl+V)即可提问");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(q).then(done, openAgent);
    }
    openAgent();
  }

  function build() {
    if (document.getElementById("ai-assistant-root")) return;

    var root = document.createElement("div");
    root.id = "ai-assistant-root";

    var chips = EXAMPLES.map(function (e) {
      return (
        '<button class="ai-chip" type="button" data-q="' +
        esc(e.q) +
        '"><span class="tag">' +
        esc(e.tag) +
        '</span><span class="q">' +
        esc(e.q) +
        "</span></button>"
      );
    }).join("");

    root.innerHTML =
      // 介绍卡片
      '<div id="ai-panel" role="dialog" aria-label="AI 知识库助手">' +
      '<div class="ai-panel-head">' +
      '<div class="ai-panel-avatar">' + ICON_SPARKLES + "</div>" +
      '<div class="ai-panel-title"><div class="t">川的技术博客 · AI 助手</div>' +
      '<div class="s"><i>● 在线</i> · 已读全站 47 篇技术笔记</div></div>' +
      '<button class="ai-close" type="button" aria-label="关闭">' + ICON_CLOSE + "</button>" +
      "</div>" +
      '<div class="ai-panel-body">' +
      '<p class="ai-greet">嗨，我是这个博客的 <b>知识库问答助手</b> 🤖<br>' +
      "Java 安全与反序列化、学成在线 / 苍穹外卖后端实战、LangChain 智能体开发 —— 站内文章我都读过，问我会附上出处。</p>" +
      '<div class="ai-examples-label">试着问问</div>' +
      '<div class="ai-examples">' + chips + "</div>" +
      '<a class="ai-cta" href="' + AGENT_URL + '" target="_blank" rel="noopener noreferrer">开始对话' + ICON_ARROW + "</a>" +
      '<div class="ai-foot">' + ICON_SHIELD + "新标签页打开 · 答案均来自本站文章原文</div>" +
      "</div>" +
      "</div>" +
      // 悬浮球
      '<button id="ai-launcher" type="button" aria-label="打开 AI 助手"><span class="ai-dot"></span>' +
      ICON_SPARKLES + "</button>" +
      // 引导气泡
      '<div id="ai-tip"><b>问问 AI</b>，秒查全站文章 →</div>';

    document.body.appendChild(root);

    var toast = document.createElement("div");
    toast.id = "ai-toast";
    document.body.appendChild(toast);

    var launcher = root.querySelector("#ai-launcher");
    var tip = root.querySelector("#ai-tip");

    function toggle(force) {
      var open = force != null ? force : !root.classList.contains("open");
      root.classList.toggle("open", open);
      launcher.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && tip) tip.classList.remove("show");
    }

    launcher.addEventListener("click", function (e) {
      e.stopPropagation();
      toggle();
    });

    root.querySelector(".ai-close").addEventListener("click", function () {
      toggle(false);
    });

    root.querySelectorAll(".ai-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        pickExample(btn.getAttribute("data-q"));
      });
    });

    // 点击卡片外部收起
    document.addEventListener("click", function (e) {
      if (root.classList.contains("open") && !root.contains(e.target)) {
        toggle(false);
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") toggle(false);
    });

    // 引导气泡：每个会话只露一次
    try {
      if (!sessionStorage.getItem("ai-tip-seen") && tip) {
        setTimeout(function () {
          if (!root.classList.contains("open")) tip.classList.add("show");
        }, 1600);
        setTimeout(function () {
          tip.classList.remove("show");
        }, 7600);
        sessionStorage.setItem("ai-tip-seen", "1");
      }
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
  // 兼容 Butterfly 开启 pjax 时局部刷新后控件丢失的情况
  document.addEventListener("pjax:complete", build);
})();
