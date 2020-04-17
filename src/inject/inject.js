function netflixKoVocabInject() {
  document.dispatchEvent(new CustomEvent('netflixKoVocab_manifests', {
    detail: JSON.stringify(window.manifests),
  }));
}

const interval = setInterval(() => {
  if (window.manifests && Array.from(Object.keys(window.manifests)).length > 0) {
    netflixKoVocabInject();
    clearInterval(interval);
  }
}, 100);
