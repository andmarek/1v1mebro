import './roundUI.css';
import type { RoundSnapshot } from './rounds';

export const roundUIMarkup = `
<div id="round-countdown" hidden aria-live="polite"><span>FREE-FOR-ALL / THE SCRAPYARD</span><b id="round-countdown-number">3</b><p id="round-countdown-rule"></p></div>
<dialog id="round-results" aria-labelledby="round-results-title" aria-describedby="round-results-reason">
  <div class="round-results-shell">
    <header class="round-results-header"><span>DEADBOLT / AFTER-ACTION REPORT</span><h2 id="round-results-title">MATCH COMPLETE</h2><p id="round-results-reason"></p></header>
    <div class="round-personal"><div><span>ELIMINATIONS</span><b id="round-result-kills">0</b></div><div><span>DEATHS</span><b id="round-result-deaths">0</b></div><div><span>ACCURACY</span><b id="round-result-accuracy">—</b></div><div><span>QUICKSCOPES</span><b id="round-result-quicks">0</b></div></div>
    <div class="round-table-scroll"><table class="round-scoreboard"><caption>Final standings</caption><thead><tr><th scope="col">POS</th><th scope="col">PLAYER</th><th scope="col">KILLS</th><th scope="col">DEATHS</th><th scope="col">SCORE</th></tr></thead><tbody id="round-result-standings"></tbody></table></div>
    <footer class="round-results-footer"><button id="round-new-match" class="settings-secondary">NEW MATCH</button><button id="round-rematch" class="play-button"><span>REMATCH</span><span>↗</span></button></footer>
  </div>
</dialog>`;
const clock = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export function setupRoundUI(callbacks: { rematch: () => void; newMatch: () => void }) {
  const $ = (id: string) => document.getElementById(id)!;
  const countdown = $('round-countdown'), results = $('round-results') as HTMLDialogElement;
  const write = (id: string, text: string) => { const element = $(id); if (element.textContent !== text) element.textContent = text; };
  let renderedResults = false;
  // Results remain available until the player picks an action; Escape cannot resume a finished match.
  results.addEventListener('cancel', event => event.preventDefault());
  $('round-rematch').addEventListener('click', () => { results.close(); callbacks.rematch(); });
  // Keep the results available beneath match setup so cancelling setup preserves this screen.
  $('round-new-match').addEventListener('click', () => callbacks.newMatch());
  return {
    render(snapshot: RoundSnapshot, localPlayerId = 'player', visible = true) {
      countdown.hidden = !visible || snapshot.phase !== 'countdown';
      if (snapshot.phase === 'countdown') {
        write('round-countdown-number', String(Math.max(1, Math.ceil(snapshot.countdownRemaining))));
        const options = snapshot.options;
        write('round-countdown-rule', options.killLimit ? `FIRST TO ${options.killLimit} ELIMINATIONS` : options.timeLimitSeconds ? `MOST ELIMINATIONS IN ${clock(options.timeLimitSeconds)}` : 'UNLIMITED PRACTICE');
      }
      if (snapshot.phase !== 'finished') {
        renderedResults = false; if (results.open) results.close(); return;
      }
      if (!renderedResults) {
        const local = snapshot.standings.find(entry => entry.id === localPlayerId);
        const winners = snapshot.standings.filter(entry => snapshot.winnerIds.includes(entry.id));
        const won = snapshot.winnerIds.includes(localPlayerId);
        write('round-results-title', winners.length > 1 ? 'DRAW' : won ? 'VICTORY' : 'MATCH COMPLETE');
        const reason = snapshot.finishReason === 'kill-limit' ? `${snapshot.options.killLimit}-KILL LIMIT REACHED` : snapshot.finishReason === 'time-limit' ? 'TIME LIMIT REACHED' : 'MATCH ENDED';
        const leader = winners.length === 1 ? `${winners[0].name} WINS` : 'SHARED TOP SCORE';
        write('round-results-reason', `${leader} · ${reason} · ${clock(snapshot.elapsedSeconds)}`);
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
      if (visible && !results.open) { results.showModal(); $('round-rematch').focus(); }
    },
  };
}
