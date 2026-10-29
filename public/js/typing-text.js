"use strict";

(function attachTypingText(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TypingText = api;
})(typeof window !== "undefined" ? window : null, function createTypingText() {
  const WORDS = ("about above across act action actually add after again against age ago air all almost along also always among an and animal another answer any appear area around ask at away back because become before begin best better between big book both bring build business call came can change child city close come company complete consider could country course create day different down during each early earth easy end enough even every example eye face fact family feel few find first follow food form found friend from general get give good govern great group grow hand happen have head help here high home house however idea important include increase interest into issue just keep kind know large last late learn leave left less life light like line list little live long look made man many market may mean measure member might mind more most move much music must name nation near need never new next night no not number often old once one only open order other our out over own page paper part people person place plan play point possible power practice present problem program public question quick quite rather reach read real reason remember report result right room run same say school science sea second seem sentence set several should show side simple since small social some something sound spell stand start state still story study such system take talk tell than that their them then there these thing think this those though through time together too turn under understand until up use value very view want water way we well what when where which while white who why will with word work world would write year young").split(/\s+/);
  const lastGenerated = Object.create(null);
  const pick = (items, random) => items[Math.floor(random() * items.length)];
  const pickWord = (random, previous) => {
    let word = pick(WORDS, random);
    while (word === previous) word = pick(WORDS, random);
    return word;
  };

  function generate(mode = "words", count = 70, previous = "", random = Math.random) {
    if (!["words", "punctuation", "numbers"].includes(mode)) mode = "words";
    previous = previous || lastGenerated[mode] || "";
    const remember = (text) => { lastGenerated[mode] = text; return text; };
    const words = [];
    let previousWord = "";
    const total = Math.max(20, Math.min(160, Number(count) || 70));

    if (mode === "words") {
      for (let i = 0; i < total; i++) {
        const word = pickWord(random, previousWord);
        words.push(word);
        previousWord = word;
      }
      let result = words.join(" ");
      if (result === previous) {
        words.push(pickWord(random, previousWord));
        result = words.join(" ");
      }
      return remember(result);
    }

    if (mode === "numbers") {
      for (let i = 0; i < total; i++) {
        if (random() < 0.36) {
          words.push(String(Math.floor(random() * 9999) + 1));
          previousWord = "";
        } else {
          const word = pickWord(random, previousWord);
          words.push(word);
          previousWord = word;
        }
      }
      if (!words.some((word) => /\d/.test(word))) words[1] = String(Math.floor(random() * 9999) + 1);
      let result = words.join(" ");
      if (result === previous) result = `${result} ${Math.floor(random() * 9999) + 1}`;
      return remember(result);
    }

    // Punctuation mode uses varied sentence structures, capitalization, and punctuation
    // throughout the passage, rather than appending an occasional symbol to plain words.
    const sentenceEndings = [".", "?", "!", ".", ";"];
    while (words.length < total) {
      const sentenceLength = Math.min(total - words.length, 5 + Math.floor(random() * 8));
      const sentence = [];
      for (let i = 0; i < sentenceLength; i++) {
        let word = pickWord(random, previousWord);
        if (i === 0) word = word.charAt(0).toUpperCase() + word.slice(1);
        else if (random() < 0.17) word += pick([",", ";", ":"], random);
        sentence.push(word);
        previousWord = word.toLowerCase().replace(/[,:;]$/, "");
      }
      sentence[sentence.length - 1] += pick(sentenceEndings, random);
      words.push(...sentence);
    }
    let result = words.join(" ");
    if (result === previous) result = `${result.slice(0, 1).toLowerCase()}${result.slice(1)}!`;
    return remember(result);
  }

  return { generate, wordCount: WORDS.length };
});
