const fs = require('fs').promises;

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

const main = async () => {
  await process('int2000', 'C');
  await process('adv2000', 'D');
  await processBeginner();
  await fs.writeFile('./dict.json', JSON.stringify(dict, null, 2));
  const stats = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
  };
  Object.values(dict).forEach(({ level }) => stats[level]++);
  console.log(stats);
};

main().catch(err => console.warn(err.stack));
