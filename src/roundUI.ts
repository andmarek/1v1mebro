import './roundUI.css';
import type { RoundSnapshot } from './rounds';
import type { OutroStage } from './roundOutro';

export const roundUIMarkup = `
<div id="round-countdown" hidden aria-live="polite"><span>FREE-FOR-ALL / THE SCRAPYARD</span><b id="round-countdown-number">3</b><p id="round-countdown-rule"></p></div>
<section id="round-end" hidden aria-labelledby="round-end-title" aria-live="polite">
  <div class="round-end-card"><span>THE SCRAPYARD / ROUND COMPLETE</span><h2 id="round-end-title">VICTORY</h2><p id="round-end-reason"></p>
    <div class="round-end-stats"><div><span>ELIMINATIONS</span><b id="round-end-kills">0</b></div><div><span>DEATHS</span><b id="round-end-deaths">0</b></div><div><span>SCORE</span><b id="round-end-score">0</b></div></div>
    <button id="round-view-standings">VIEW STANDINGS <span>↗</span></button>
  </div>
</section>
<dialog id="round-results" aria-labelledby="round-results-title" aria-describedby="round-results-reason">
  <div class="round-results-shell">
    <header class="round-results-header"><span>DEADBOLT / AFTER-ACTION REPORT</span><h2 id="round-results-title">MATCH COMPLETE</h2><p id="round-results-reason"></p></header>
    <div class="round-personal"><div><span>ELIMINATIONS</span><b id="round-result-kills">0</b></div><div><span>DEATHS</span><b id="round-result-deaths">0</b></div><div><span>ACCURACY</span><b id="round-result-accuracy">—</b></div><div><span>QUICKSCOPES</span><b id="round-result-quicks">0</b></div></div>
    <div class="round-table-scroll"><table class="round-scoreboard"><caption>Final standings</caption><thead><tr><th scope="col">POS</th><th scope="col">PLAYER</th><th scope="col">KILLS</th><th scope="col">DEATHS</th><th scope="col">SCORE</th></tr></thead><tbody id="round-result-standings"></tbody></table></div>
    <footer class="round-results-footer"><button id="round-new-match" class="settings-secondary">NEW MATCH</button><button id="round-rematch" class="play-button"><span>REMATCH</span><span>↗</span></button></footer>
  </div>
</dialog>`;
const clock = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function setupRoundUI(callbacks: { rematch: () => void; newMatch: () => void; viewStandings: () => void }) {
  const $ = (id: string) => document.getElementById(id)!;
  const countdown = $('round-countdown'), results = $('round-results') as HTMLDialogElement;
  const end = $('round-end');
  const write = (id: string, text: string) => { const element = $(id); if (element.textContent !== text) element.textContent = text; };
  let renderedResults = false;
  let bannerShown = false;
  // Results remain available until the player picks an action; Escape cannot resume a finished match.
  results.addEventListener('cancel', event => event.preventDefault());
  $('round-rematch').addEventListener('click', () => { results.close(); callbacks.rematch(); });
  // Keep the results available beneath match setup so cancelling setup preserves this screen.
  $('round-new-match').addEventListener('click', () => callbacks.newMatch());
  $('round-view-standings').addEventListener('click', callbacks.viewStandings);
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape' && !end.hidden) { event.preventDefault(); callbacks.viewStandings(); }
  });
  return {
    render(snapshot: RoundSnapshot, localPlayerId = 'player', visible = true, stage: OutroStage = 'results') {
      end.hidden = !visible || snapshot.phase !== 'finished' || stage !== 'banner';
      countdown.hidden = !visible || snapshot.phase !== 'countdown';
      if (snapshot.phase === 'countdown') {
        write('round-countdown-number', String(Math.max(1, Math.ceil(snapshot.countdownRemaining))));
        const options = snapshot.options;
        write('round-countdown-rule', options.killLimit ? `FIRST TO ${options.killLimit} ELIMINATIONS` : options.timeLimitSeconds ? `MOST ELIMINATIONS IN ${clock(options.timeLimitSeconds)}` : 'UNLIMITED PRACTICE');
      }
      if (snapshot.phase !== 'finished') {
        renderedResults = bannerShown = false; if (results.open) results.close(); return;
      }
      if (!renderedResults) {
        const local = snapshot.standings.find(entry => entry.id === localPlayerId);
        const winners = snapshot.standings.filter(entry => snapshot.winnerIds.includes(entry.id));
        const won = snapshot.winnerIds.includes(localPlayerId);
        const title = winners.length > 1 ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
        write('round-results-title', title); write('round-end-title', title);
        end.dataset.outcome = winners.length > 1 ? 'draw' : won ? 'win' : 'loss';
        const reason = snapshot.finishReason === 'kill-limit' ? `${snapshot.options.killLimit}-KILL LIMIT REACHED` : snapshot.finishReason === 'time-limit' ? 'TIME LIMIT REACHED' : 'MATCH ENDED';
        const leader = winners.length === 1 ? winners[0].id === localPlayerId ? 'YOU WIN' : `${winners[0].name} WINS` : 'SHARED TOP SCORE';
        write('round-results-reason', `${leader} · ${reason} · ${clock(snapshot.elapsedSeconds)}`);
        write('round-end-reason', `${leader} · ${reason}`);
        write('round-end-kills', String(local?.kills ?? 0)); write('round-end-deaths', String(local?.deaths ?? 0)); write('round-end-score', String(local?.points ?? 0));
        write('round-result-kills', String(local?.kills ?? 0)); write('round-result-deaths', String(local?.deaths ?? 0));
        write('round-result-quicks', String(local?.quickscopes ?? 0));
        write('round-result-accuracy', local?.shots ? `${Math.round(local.hits / local.shots * 100)}%` : '—');
        const rows = snapshot.standings.map((entry, index) => {
          const row = document.createElement('tr'); row.classList.toggle('is-local', entry.id === localPlayerId);
          row.classList.toggle('is-winner', snapshot.winnerIds.includes(entry.id));
          for (const value of [String(index + 1).padStart(2, '0'), entry.name, entry.kills, entry.deaths, entry.points]) {
            const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell);
          }
          return row;
        });
        $('round-result-standings').replaceChildren(...rows); renderedResults = true;
      }
      if (!end.hidden && !bannerShown) { bannerShown = true; $('round-view-standings').focus({ preventScroll: true }); }
      if (visible && stage === 'results' && !results.open) { results.showModal(); $('round-rematch').focus(); }
    },
  };
}
