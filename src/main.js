let dict = null;
const fetchDict = async () => {
  dict = await (await fetch(chrome.runtime.getURL('/src/dict.json'))).json();
}

const lookupDefs = (word) => {
  if (!dict) {
    throw new Error('Lookup before dictionary is fetched');
  }

  for (let i = 0; i < word.length; i++) {
    const prefix = word.substring(0, word.length - i);
    if (prefix in dict) {
      const { defs, roots } = dict[prefix];
      if (defs) {
        return {
          word: prefix,
          defintion: defs.split('|').join(','),
          level: 'a',
        };
      } else if (roots) {
        const root = Array.from(Object.keys(roots))[0];
        if (root in dict) {
          return {
            word: root,
            definition: dict[root].defs.split('|').join(','),
            level: 'a',
          };
        }
      }
    }
  }

  return null;
};

const getMovieId = () => {
  const { pathname } = window.location;
  const movieId = pathname.split('/').pop();
  return movieId;
};

let manifests = null;
const getManifest = () => {
  if (!manifests) return null;
  const movieId = getMovieId();
  return manifests[movieId];
};

const getKoCC = () => {
  const manifest = getManifest();
  const subs = manifest.timedtexttracks;
  const koSub = subs.filter(x => x.language === 'ko' && x.trackType === 'ASSISTIVE')[0] || null;
  return koSub;
};

const fetchSubtitles = async () => {
  const sub = getKoCC();
  if (!sub) {
    return null;
  }

  try {
    const urls = sub.ttDownloadables['webvtt-lssdh-ios8'].downloadUrls;
    const url = Array.from(Object.values(urls))[0];
    return await (await fetch(url)).text();
  } catch(err) {
    return null;
  }
};

const parseTs = (ts) => {
  const [hours, minutes, seconds] = ts.split(':').map(parseFloat);
  return hours * 60 * 60 + minutes * 60 + seconds;
};

const parseSubLine = (line) => {
  return line.replace('&lrm;', '').replace(/\<[^>]+\>/g, '');
};

const parseNetflixSubs = (allText) => {
  const [header, body] = allText.split('\n\n\n');
  const parts = body.split('\n\n');
  return parts.map(block => {
    if (block.trim() === '') {
      return;
    }
    const [id, meta, ...contentBlocks] = block.split('\n');
    const [startTs, arrow, endTs] = meta.split(' ');
    const content = contentBlocks.map(parseSubLine).join('\n');
    return {
      start: parseTs(startTs),
      end: parseTs(endTs),
      content,
    };
  });
};

const findInSubs = (segments, ts) => {
  let l = 0, r = segments.length;
  while (l < r) {
    const m = Math.floor((l + r) / 2);
    if (segments[m].start > ts) {
      r = m;
    } else {
      l = m + 1;
    }
  }
  const seg = segments[r - 1];
  if (seg && seg.start <= ts && seg.end >= ts) {
    return seg;
  }
  return null;
};

const getVideoNode = async () => {
  const checkVideo = (resolve) => {
    const video = document.querySelectorAll('video')[0];
    if (video) {
      resolve(video);
    } else {
      setTimeout(() => checkVideo(resolve), 50);
    }
  };
  return new Promise(resolve => {
    checkVideo(resolve);
  });
};

const netflixKoVocabMain = async () => {
  const subs = await fetchSubtitles();
  await fetchDict();

  if (!subs) {
    return;
  }

  const parsedSubs = parseNetflixSubs(subs);
  const video = await getVideoNode();

  let lastDisplayed = null;
  setInterval(() => {
    const { currentTime } = video;
    const sub = findInSubs(parsedSubs, currentTime);
    if (!sub) {
      return;
    }
    if (sub === lastDisplayed) {
      return;
    }
    lastDisplayed = sub;
    const words = sub.content.replace(/\n/g, ' ').replace(/[^\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff\s]/g, '').split(' ').filter(x => x !== '');
    display(words);
  }, 100);
};

const display = (words) => {
  console.log(words);
};

document.addEventListener('netflixKoVocab_manifests', function(e) {
  manifests = JSON.parse(e.detail);
  netflixKoVocabMain().catch(err => {
    console.error(err.stack);
  });
});

function injectScript() {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('/src/inject/inject.js');
  s.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(s);
}
injectScript();

