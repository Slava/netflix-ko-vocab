let dict = null;
const fetchDict = async () => {
  dict = await (await fetch(chrome.runtime.getURL('/src/dict.json'))).json();
}

let levels = null;
const fetchLevels = async () => {
  levels = await (await fetch(chrome.runtime.getURL('/src/levels.json'))).json();
}

let top2k = null;
const fetchTop2k = async () => {
  top2k = await (await fetch(chrome.runtime.getURL('/src/top2000.json'))).json();
}

// words that are commonly misidentified should be skipped
const filteredWords = {
  '게': true,
  '같은': true,
  '네': true,
  '내': true,
  '해': true,
  '야': true,
  '아': true,
  '안': true,
  '애가': true,
  '오케이': true,
};

const rank2Level = (rank) => {
  if (rank < 200) {
    return 'A';
  }
  if (rank < 600) {
    return 'B';
  }
  if (rank < 1200) {
    return 'C';
  }
  return 'D';
};

const enchanceDefs = ({ word, definition, level }) => {
  if (top2k[word]) {
    return {
      word,
      definition: top2k[word].def.trim(),
      level: rank2Level(top2k[word].rank),
    }
  }

  definition = definition.replace(/(\(.*\))/g, '');
  return { word, definition, level };
};

const lookupDefs = (word) => {
  if (!dict || !levels) {
    throw new Error('Lookup before dictionary is fetched');
  }

  for (let i = 0; i < Math.max(1, Math.min(word.length - 1, 3)); i++) {
    const prefix = word.substring(0, word.length - i);
    if (prefix in dict) {
      const { defs, roots } = dict[prefix];
      if (defs) {
        return {
          word: prefix,
          definition: defs.split('|').join(','),
          level: levels[prefix] || 'U',
        };
      } else if (roots) {
        const root = Array.from(Object.keys(roots))[0];
        if (root in dict) {
          return {
            word: root,
            definition: dict[root].defs.split('|').join(','),
            level: levels[root] || 'U',
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

const uniqueArray = (list) => {
  return [...new Set(list)];
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
  await Promise.all([fetchDict(), fetchLevels(), fetchTop2k()]);

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
    const words = sub.content.replace(/\n/g, ' ').replace(/\([^)]*\)/g, '').replace(/\[[^\]]*\]/g, '').replace(/[^\uac00-\ud7af\u1100-\u11ff\u3130-\u318f\ua960-\ua97f\ud7b0-\ud7ff\s]/g, '').split(' ').filter(x => x !== '');
    const defs = uniqueArray(words)
          .map(lookupDefs)
          .filter(def => !!def)
          .map(enchanceDefs)
          .filter(({ word }) => !filteredWords[word])
          .filter(({ level }) => level >= 'C');
    display(defs);
  }, 100);
};

const stylesheet = `
#netflix-ko-vocab {
  display: flex;
  justify-content: center;
  text-shadow: 0px 0px 6px #000000;
}

#netflix-ko-vocab .card {
  max-width: 150px;
  margin-left: 30px;
  text-align: center;
}

#netflix-ko-vocab .word {
  font-size: 30px;
}

#netflix-ko-vocab .def {
  font-size: 14px;
}
`;

const subsDivParentId = 'lln-main-subs';
let subsDiv = null;
const display = (words) => {
  if (!subsDiv) {
    const parentDiv = document.getElementById(subsDivParentId);
    if (!parentDiv) {
      return;
    }
    subsDiv = document.createElement('div');
    parentDiv.prepend(subsDiv);
    subsDiv.id = 'netflix-ko-vocab';
  }
  subsDiv.innerHTML = words.map(
    ({ word, definition, level }) =>
      `<div class="card">
         <div class="word">${word}</div>
         <div class="def">${definition}</div>
       </div>`
  ).join('');
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

function injectStylesheet() {
  const s = document.createElement('style');
  s.innerHTML = stylesheet;
  (document.head || document.documentElement).appendChild(s);
}

injectScript();
injectStylesheet();
