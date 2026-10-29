"use strict";

(() => {
  const featureScripts = [
    "progression.js",
    "app-core.js",
    "typing-text.js",
    "app-games.js",
    "app-social.js",
    "app-messages.js",
    "app-duel.js",
    "app-ludo.js",
    "app-leaderboard.js",
    "app-emoji.js",
    "app-socket.js"
  ];
  let index = 0;

  function loadNextFeature() {
    if (index >= featureScripts.length) return;
    const script = document.createElement("script");
    script.src = `/js/${featureScripts[index++]}`;
    script.async = false;
    script.onload = loadNextFeature;
    script.onerror = () => {
      console.error(`Brain Arena could not load ${script.src}`);
      const toast = document.getElementById("toastRegion");
      if (toast) {
        const item = document.createElement("div");
        item.className = "toast error";
        item.textContent = "Some game features could not load. Refresh the page and try again.";
        toast.appendChild(item);
      }
    };
    document.body.appendChild(script);
  }

  loadNextFeature();
})();
