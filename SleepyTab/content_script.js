(function () {
  'use strict';

  // このスクリプトの役割はただ一つ。
  // タブの表示状態が変わったことを検知して、司令塔(background.js)に報告するだけ。
  document.addEventListener('visibilitychange', () => {
    chrome.runtime.sendMessage({
      type: 'visibilityChanged',
      isHidden: document.hidden
    });
  }, false);

})();