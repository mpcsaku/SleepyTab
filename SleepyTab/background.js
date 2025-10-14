"use strict";

// ★★★★★ このリストが、唯一の情報源！ ★★★★★
const defaultWhitelist = [
  "amazon.co.jp",
  "netflix.com",
  "abema.tv",
  "tver.jp",
  "youtube.com",
  "nicovideo.jp",
];

let extensionEnabled = true;
let muteEnabled = true;

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ enabled: true, muteEnabled: true }, (data) => {
      extensionEnabled = data.enabled;
      muteEnabled = data.muteEnabled;
      resolve();
    });
  });
}

function isSiteWhitelisted(url) {
  // isSiteWhitelistedは、ユーザー設定も加味する必要があるため、
  // storageから最新の情報を都度読むのが確実
  return new Promise((resolve) => {
    chrome.storage.local.get({ whitelist: [], removedSites: [] }, (data) => {
      if (!url) return resolve(false);
      try {
        const hostname = new URL(url).hostname;
        const currentWhitelist = [
          ...defaultWhitelist,
          ...(data.whitelist || []),
        ].filter((site) => !(data.removedSites || []).includes(site));
        resolve(currentWhitelist.some((site) => hostname.includes(site)));
      } catch (e) {
        resolve(false);
      }
    });
  });
}

/**
 * ページ内に注入して、動画/音声を停止させ、印を付けるための関数
 */
function pauseMediaAndMark() {
  const WAS_PLAYING_ATTR = "data-tab-paused-by-ext";
  document.querySelectorAll("video, audio").forEach((media) => {
    if (!media.paused && !media.ended) {
      media.pause();
      media.setAttribute(WAS_PLAYING_ATTR, "true");
    }
  });
}

/**
 * ページ内に注入して、印が付いた動画/音声を再生させるための関数
 */
function playMarkedMedia() {
  const WAS_PLAYING_ATTR = "data-tab-paused-by-ext";
  document.querySelectorAll("video, audio").forEach((media) => {
    if (media.getAttribute(WAS_PLAYING_ATTR) === "true") {
      media.play().catch(() => {});
      media.removeAttribute(WAS_PLAYING_ATTR);
    }
  });
}

// 2種類のメッセージをここでまとめて受け取る
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. content_scriptからの表示状態の報告
  if (message.type === "visibilityChanged") {
    isSiteWhitelisted(sender.tab.url).then((isWhitelisted) => {
      if (!extensionEnabled || !isWhitelisted) {
        return;
      }
      const targetTabId = sender.tab.id;
      if (message.isHidden) {
        chrome.scripting.executeScript({
          target: { tabId: targetTabId, allFrames: true },
          func: pauseMediaAndMark,
        });
      } else {
        chrome.scripting.executeScript({
          target: { tabId: targetTabId, allFrames: true },
          func: playMarkedMedia,
        });
      }
    });
  }

  // 2. popup.jsからのリクエスト
  if (message.type === "getWhitelist") {
    chrome.storage.local.get({ whitelist: [], removedSites: [] }, (data) => {
      sendResponse({
        defaultWhitelist: defaultWhitelist,
        userWhitelist: data.whitelist || [],
        removedSites: data.removedSites || [],
      });
    });
    return true; // 非同期でsendResponseを使うため
  }
});

async function updateMuteStateForWindow(windowId) {
  const data = await chrome.storage.local.get({
    enabled: true,
    muteEnabled: true,
    whitelist: [],
    removedSites: [],
  });
  extensionEnabled = data.enabled;
  muteEnabled = data.muteEnabled;

  if (!extensionEnabled || !muteEnabled) {
    chrome.tabs.query({ windowId: windowId }, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.mutedInfo && tab.mutedInfo.reason === "extension") {
          chrome.tabs.update(tab.id, { muted: false });
        }
      });
    });
    return;
  }

  const isTargetSite = (url) => {
    if (!url) return false;
    try {
      const hostname = new URL(url).hostname;
      const currentWhitelist = [
        ...defaultWhitelist,
        ...(data.whitelist || []),
      ].filter((site) => !(data.removedSites || []).includes(site));
      return currentWhitelist.some((site) => hostname.includes(site));
    } catch (e) {
      return false;
    }
  };

  chrome.tabs.query({ active: true, windowId: windowId }, (activeTabs) => {
    const activeTabId = activeTabs.length > 0 ? activeTabs[0].id : null;
    chrome.tabs.query({ windowId: windowId }, (tabs) => {
      tabs.forEach((tab) => {
        if (!isTargetSite(tab.url)) return;
        if (tab.id === activeTabId) {
          if (tab.mutedInfo && tab.mutedInfo.muted) {
            chrome.tabs.update(tab.id, { muted: false });
          }
        } else {
          if (!tab.mutedInfo.muted && tab.audible) {
            chrome.tabs.update(tab.id, { muted: true });
          }
        }
      });
    });
  });
}

// --- イベントリスナーの初期化部分 ---
chrome.runtime.onStartup.addListener(loadSettings);
chrome.runtime.onInstalled.addListener(loadSettings);

chrome.storage.onChanged.addListener(async () => {
  await loadSettings();
  chrome.windows.getAll({ populate: false }, (windows) => {
    windows.forEach((win) => updateMuteStateForWindow(win.id));
  });
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  updateMuteStateForWindow(activeInfo.windowId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.hasOwnProperty("audible")) {
    updateMuteStateForWindow(tab.windowId);
  }
});

loadSettings();
