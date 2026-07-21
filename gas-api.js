/**
 * google.script.run 互換シム ＋ 起動ゲート
 *
 * GitHub Pages に置いた静的フロントから、GASウェブアプリの doPost を呼ぶ。
 * 既存の index.html / mobile.html にある
 *   google.script.run.withSuccessHandler(f).withFailureHandler(g).関数名(引数...)
 * という呼び出しを1行も書き換えずに動かすことが目的（呼び出しは全16か所）。
 *
 * ■ 変更してはいけない制約（GAS側の仕様。破るとCORSで必ず壊れる）
 *  - Content-Type は "text/plain" 固定。application/json にすると preflight(OPTIONS) が
 *    発生するが、GASは OPTIONS に応答できないため全リクエストが失敗する。
 *  - 同じ理由でカスタムヘッダー（Authorization 等）は使えない。トークンは引数で渡す。
 *  - /exec は 302 で script.googleusercontent.com へ転送される。fetch の redirect は
 *    既定の "follow" のままにすること（"manual" にすると壊れる）。
 *  以上は 2026-07-20 に実機で検証済み。
 */
(function () {
  "use strict";

  /* 本人用GASウェブアプリのURL。公開されて問題ない（サーバー側がトークンを毎回検証するため）。 */
  var EXEC_URL = "https://script.google.com/macros/s/AKfycbxwUOIxuWBHQV6b053PLcIxHRB-WgOjmk2tYS_aSGq_iGa4rFT3CxUbJ4W9TjONe2x5hg/exec";

  /**
   * 呼び出せるサーバー関数。
   * **worker-app/Code.gs の rpcFuncs_() と一致させること**（片方だけ足すと動かない）。
   * ここに無い名前を書いてもサーバー側が「不正な呼び出しです」で弾く。
   */
  var FUNCS = [
    "getBoot",
    "getOrderInfo",
    "getOrderInfoByApp38Record",
    "getMyKaeRecent",
    "searchMyKae",
    "getMyKaeByNumber",
    "submitMyRecords"
  ];

  function call(fn, args, onSuccess, onFailure) {
    fetch(EXEC_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ fn: fn, args: args })
    })
      .then(function (r) {
        if (!r.ok) throw new Error("通信に失敗しました（HTTP " + r.status + "）");
        return r.json();
      })
      .then(function (res) {
        if (res && res.ok) {
          onSuccess(res.result);
          return;
        }
        throw new Error((res && res.error) || "サーバーでエラーが発生しました。");
      })
      .catch(function (e) {
        onFailure(e instanceof Error ? e : new Error(String(e)));
      });
  }

  /**
   * google.script.run 相当のオブジェクトを1回分作る。
   * 本家と同じく、成功/失敗ハンドラは呼び出しごとに独立させる必要があるため、
   * google.script.run へアクセスするたびに新しいものを返す（下の defineProperty）。
   */
  function makeRunner() {
    var onSuccess = function () {};
    var onFailure = function (e) { throw e; };
    var runner = {
      withSuccessHandler: function (f) { onSuccess = f; return runner; },
      withFailureHandler: function (f) { onFailure = f; return runner; }
    };
    FUNCS.forEach(function (name) {
      runner[name] = function () {
        call(name, Array.prototype.slice.call(arguments), onSuccess, onFailure);
      };
    });
    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, "run", { get: makeRunner });

  /* ===== 起動ゲート =====
     GAS版は doGet がサーバー側でトークンを検証し、無効なら invalidPage_() を返していた。
     Pages では先にHTMLが表示されてしまうため、検証が済むまで全面オーバーレイで覆う。 */

  function overlay(html) {
    var el = document.getElementById("__gate__");
    if (!el) {
      el = document.createElement("div");
      el.id = "__gate__";
      el.style.cssText =
        "position:fixed;inset:0;z-index:99999;background:#fff;display:flex;" +
        "align-items:center;justify-content:center;padding:24px;" +
        "font-family:sans-serif;text-align:center;color:#333";
      document.body.appendChild(el);
    }
    el.innerHTML = html;
    return el;
  }

  /**
   * 起動中の画面。
   * 「確認しています」だと利用者が“自分が何か確認を求められている”と受け取って不安になるため、
   * システム側が正常に準備中であることだけを穏やかに伝える文言にしている。
   * ロゴは外部画像を持たずに済むよう、絹糸をイメージした線のインラインSVG。
   */
  function showBooting() {
    overlay(
      '<style>@keyframes __gsp__{to{transform:rotate(360deg)}}' +
      "@keyframes __gfd__{from{opacity:0}to{opacity:1}}</style>" +
      '<div style="animation:__gfd__ .6s ease both">' +
      '<svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">' +
      '<circle cx="56" cy="56" r="46" fill="none" stroke="#e6ecf2" stroke-width="6"/>' +
      '<circle cx="56" cy="56" r="46" fill="none" stroke="#2b7de9" stroke-width="6" ' +
      'stroke-linecap="round" stroke-dasharray="60 229" ' +
      'style="transform-origin:56px 56px;animation:__gsp__ 1.4s linear infinite"/>' +
      '<path d="M56 33c-11 8-16 15-16 22a16 16 0 0 0 32 0c0-7-5-14-16-22z" ' +
      'fill="none" stroke="#1a2733" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M48 57c5 4 11 4 16 0" fill="none" stroke="#9aa4ad" stroke-width="2.5" ' +
      'stroke-linecap="round"/>' +
      "</svg>" +
      '<div style="margin-top:16px;font-size:17px;font-weight:700;letter-spacing:2px;color:#1a2733">' +
      "株式会社 松栄シルク</div>" +
      '<div style="margin-top:14px;font-size:20px;font-weight:700;color:#1a2733">起動中です</div>' +
      '<div style="margin-top:8px;font-size:14px;line-height:1.8;color:#5a6b7b">' +
      "画面の準備をしています。<br>そのままお待ちください。</div></div>"
    );
  }

  function showInvalid() {
    overlay(
      '<div style="max-width:480px">' +
      '<h2 style="margin-top:0">無効なリンクです</h2>' +
      "<p>このページを開くには、お渡しした専用のURLが必要です。<br>" +
      "URLが正しいかご確認のうえ、開けない場合は会社までご連絡ください。</p></div>"
    );
  }

  /**
   * ?t=トークン を検証し、通れば startApp() を呼ぶ。
   * 検証が通るまで画面の中身は見せない。
   * @param {function()} startApp 各ページのアプリ本体（__startApp__）
   */
  window.startWithToken = function (startApp) {
    var token = new URLSearchParams(location.search).get("t") || "";
    showBooting();

    /* 32桁未満は通信するまでもなく拒否（サーバー側 resolveToken_ と同じ判定）。
       上限に達したkintoneや通信断で無駄なリクエストを出さないため。 */
    if (token.length < 32) {
      showInvalid();
      return;
    }

    google.script.run
      .withSuccessHandler(function (who) {
        window.__BOOT__ = { token: token, name: who.name, code: who.code };
        var gate = document.getElementById("__gate__");
        if (gate) gate.remove();
        startApp();
      })
      .withFailureHandler(function (err) {
        /* トークンが無効なら案内ページ、通信エラーなら再読み込みを促す（原因を区別する）。 */
        var msg = String((err && err.message) || err);
        if (msg.indexOf("無効") >= 0) {
          showInvalid();
          return;
        }
        overlay(
          '<div style="max-width:480px">' +
          '<h2 style="margin-top:0">接続できませんでした</h2>' +
          "<p>電波の状態をご確認のうえ、ページを読み込み直してください。<br>" +
          "何度も失敗する場合は会社までご連絡ください。</p>" +
          '<p style="color:#888;font-size:13px">' + msg + "</p></div>"
        );
      })
      .getBoot(token);
  };
})();
