const fs = require('fs').promises;
const fetch = require('node-fetch');

const sleep = (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const dict = {};
const process = async (fileName, level) => {
  const text = await fs.readFile(fileName, 'utf8');
  const lines = text.split('\n').filter(line => line !== '');
  const entries = lines.map(line => {
    const [everything, word] = line.split('|');
    const def = everything.replace(word, '').replace(/&nbsp;/g, ' ')
    return {
      word: word.trim(),
      def: def.trim(),
      level: level,
    };
  });
  entries.forEach(entry => dict[entry.word] = entry);
};

const processBeginner = async () => {
  const text = await fs.readFile('beginner2000', 'utf8');
  const parts = text.split(/^[0-9]+-/mg).slice(1)
  const entries = parts.map((part, i) => {
    const [head, example, example2, exampleTranslation] = part.replace(/\r\n/g, '\n').trim().split('\n\n');
    const match = head.match(/(.*)\/(.*)\](.*)/);
    return {
      word: match[1].trim(),
      def: match[3].trim(),
      //example,
      //exampleTranslation,
      //rank: i+1,
      level: i < 800 ? 'A' : 'B',
    };
  })
  entries.forEach(entry => dict[entry.word] = entry);
};

const collectStats = () => {
  const stats = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
  };
  Object.values(dict).forEach(({ level }) => stats[level]++);
  console.log(stats);
};

const conjugations = async () => {
  const verbs = Object.keys(dict).filter(word => word.endsWith('다'));
  const api = 'https://api.verbix.com/conjugator/iv1/ab8e7bb5-9ac6-11e7-ab6a-00089be4dcbc/1/8442/8442/';
  const conjugationDict = {};
  let done = 0;
  for (const word of verbs) {
    const resp = await (await fetch(api + encodeURI(word))).json();
    const text = resp.p1.html;
    const conjugates = text.match(/>(.*)<\/span>/g);
    conjugates.forEach(dirty => {
      const clean = dirty.replace(/[^\u3131-\uD79D]/g, '').trim();
      if (clean === '') {
        return;
      }
      conjugationDict[clean] = word;
    });
    done++;
    if (done % 50 === 0) {
      console.log(done)
      // avoid overwhelming the api
      await sleep(500);
    }
  }

  await fs.writeFile('./conjugations.json', JSON.stringify(conjugationDict, null, 2));
};

const main = async () => {
  await process('int2000', 'C');
  await process('adv2000', 'D');
  await processBeginner();
  await fs.writeFile('./dict.json', JSON.stringify(dict, null, 2));
  await conjugations();
};

main().catch(err => console.warn(err.stack));
