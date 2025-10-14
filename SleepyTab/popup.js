// 言語グローバル化
// data-i18n → テキストノード
document.querySelectorAll("[data-i18n]").forEach((el) => {
  const key = el.getAttribute("data-i18n");
  const msg = chrome.i18n.getMessage(key);
  if (msg) el.textContent = msg;
});

// data-i18n-placeholder → placeholder属性
document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
  const key = el.getAttribute("data-i18n-placeholder");
  const msg = chrome.i18n.getMessage(key);
  if (msg) el.placeholder = msg;
});



document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("toggleBtn");
  const statusText = document.getElementById("statusText");
  const siteInput = document.getElementById("siteInput");
  const addSiteBtn = document.getElementById("addSiteBtn");
  const whitelistUl = document.getElementById("whitelist");
  const muteToggleCheckbox = document.getElementById("muteToggleCheckbox");

  // モーダル要素
  const modal = document.getElementById("confirmModal");
  const modalText = document.getElementById("modalText");
  const confirmBtn = document.getElementById("confirmBtn");
  const cancelBtn = document.getElementById("cancelBtn");

  // defaultWhitelistのベタ書きを削除！
  let defaultWhitelist = []; 
  let userWhitelist = [];
  let removedSites = [];
  let siteToRemove = null;

  function updateUI(isEnabled) {
    if (isEnabled) {
      btn.textContent = "";
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-circle-check";
      btn.appendChild(icon);
      btn.append(chrome.i18n.getMessage("Active"));
      btn.classList.remove("disabled");
      btn.classList.add("enabled");
      statusText.textContent = chrome.i18n.getMessage("ActiveMessage");
    } else {
      btn.textContent = "";
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-circle-xmark";
      btn.appendChild(icon);
      btn.append(chrome.i18n.getMessage("Disabled"));
      btn.classList.remove("enabled");
      btn.classList.add("disabled");
      statusText.textContent = chrome.i18n.getMessage("DisabledMessage");
    }
    muteToggleCheckbox.disabled = !isEnabled;
  }

  function getFaviconUrl(site) {
    return `https://www.google.com/s2/favicons?sz=32&domain=${site}`;
  }

  function renderWhitelist() {
    whitelistUl.innerHTML = "";
    // 司令塔からもらったリストとユーザー設定を組み合わせて表示
    [...defaultWhitelist, ...userWhitelist].forEach((site) => {
      if (removedSites.includes(site)) return;
      const li = document.createElement("li");
      const favicon = document.createElement("img");
      favicon.src = getFaviconUrl(site);
      favicon.alt = site;
      favicon.width = 18;
      favicon.height = 18;
      li.appendChild(favicon);
      const span = document.createElement("span");
      span.textContent = site;
      li.appendChild(span);
      const delBtn = document.createElement("button");
      delBtn.textContent = chrome.i18n.getMessage("DeleteButton");
      delBtn.addEventListener("click", () => {
        siteToRemove = site;
        modalText.textContent = chrome.i18n.getMessage("DeleteMessage",[site]);
        modal.style.display = "flex";
      });
      li.appendChild(delBtn);
      whitelistUl.appendChild(li);
    });
  }

  function removeSite(site) {
    if (!removedSites.includes(site)) removedSites.push(site);
    userWhitelist = userWhitelist.filter((s) => s !== site);
    chrome.storage.local.set(
      { whitelist: userWhitelist, removedSites: removedSites },
      () => {
        // 削除後も、リストを再取得して再描画
        initialize();
      }
    );
  }

  confirmBtn.addEventListener("click", () => {
    if (siteToRemove) {
      removeSite(siteToRemove);
      siteToRemove = null;
    }
    modal.style.display = "none";
  });

  cancelBtn.addEventListener("click", () => {
    siteToRemove = null;
    modal.style.display = "none";
  });

  addSiteBtn.addEventListener("click", () => {
    const site = siteInput.value.trim();
    if (!site) return;
    const currentWhitelist = [...defaultWhitelist, ...userWhitelist].filter(
      (s) => !removedSites.includes(s)
    );
    if (currentWhitelist.includes(site)) return;
    removedSites = removedSites.filter((s) => s !== site);
    if (!defaultWhitelist.includes(site)) {
      if (!userWhitelist.includes(site)) {
        userWhitelist.push(site);
      }
    }
    chrome.storage.local.set(
      { whitelist: userWhitelist, removedSites: removedSites },
      () => {
        siteInput.value = "";
        // 追加後も、リストを再取得して再描画
        initialize();
      }
    );
  });

  btn.addEventListener("click", () => {
    chrome.storage.local.get({ enabled: true }, (data) => {
      const newState = !data.enabled;
      chrome.storage.local.set({ enabled: newState }, () => {
        updateUI(newState);
      });
    });
  });

  muteToggleCheckbox.addEventListener("change", () => {
    chrome.storage.local.set({ muteEnabled: muteToggleCheckbox.checked });
  });

  // 新しい初期化関数
  function initialize() {
    // 1. 司令塔にリストのリクエスト
    chrome.runtime.sendMessage({ type: "getWhitelist" }, (response) => {
      if (chrome.runtime.lastError) {
        // ポップアップが閉じた後などにエラーが出ることがあるが、無視してOK
        console.warn(chrome.runtime.lastError.message);
        return;
      }
      if (response) {
        defaultWhitelist = response.defaultWhitelist || [];
        userWhitelist = response.userWhitelist || [];
        removedSites = response.removedSites || [];
        renderWhitelist();
      }
    });

    // 拡張機能全体の有効/無効状態やミュート設定は、storageから読む
    chrome.storage.local.get({ enabled: true, muteEnabled: true }, (data) => {
      updateUI(data.enabled);
      muteToggleCheckbox.checked = data.muteEnabled;
    });

    // 現在のタブ情報を取得して入力欄にセット
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].url) {
        try {
          const url = new URL(tabs[0].url);
          siteInput.value = url.hostname;
        } catch (e) {
          /* no-op */
        }
      }
    });
  }

  // 最初の初期化処理を実行
  initialize();
});
