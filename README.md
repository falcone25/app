# peacefeed v0.3

This version separates the app interface from the content database.

## Content files
- `data/cards.json` — published cards shown in the feed.
- `data/review.json` — future moderation queue for newly generated factual cards.
- `data/editorial-config.json` — future automation targets and editorial rules.

## Updating content manually
Add a valid card object to `data/cards.json`, commit it to GitHub, and the app will fetch the updated content without changing `app.js` or `index.html`.

## v0.3 learning behavior
- cards already viewed are remembered locally;
- unseen cards are prioritized;
- cards scheduled with `↻ повторить` return on the selected date;
- factual cards keep a source/read-more link;
- notes, favorites, and daily reflection stay in the device browser via localStorage.

## Next automation step
A scheduled GitHub Action can later create candidate cards and put them in `data/review.json`. After review, approved cards can be moved into `data/cards.json`. Derived items (retrieval, quiz, grammar practice, repeat cards) can be generated from already approved content with lower factual risk.
