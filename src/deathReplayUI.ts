export const deathReplayMarkup = `
<section id="death-kill-replay" hidden aria-label="Attacker killcam">
  <header><span class="replay-dot"></span><b>KILLCAM</b><span id="death-replay-attacker"></span></header>
  <div id="replay-victim-label" hidden>YOU</div>
  <footer><span>THE SHOT THAT ELIMINATED YOU / ATTACKER PERSPECTIVE</span><button id="death-replay-skip">SKIP & RESPAWN <span>ESC ↗</span></button></footer>
  <div id="death-replay-progress" class="replay-progress" role="progressbar" aria-label="Killcam progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
</section>`;

export function setupDeathReplayUI(skip: () => void) {
  const section = document.getElementById('death-kill-replay')!, button = document.getElementById('death-replay-skip')!;
  const progress = document.getElementById('death-replay-progress')!, victim = document.getElementById('replay-victim-label')!;
  let showing = false;
  button.addEventListener('click', skip);
  document.addEventListener('keydown', event => {
    if (event.code === 'Escape' && !section.hidden) { event.preventDefault(); event.stopPropagation(); skip(); }
  });
  return {
    render(attacker: number | null, fraction = 0, roundFinished = false) {
      section.hidden = attacker === null;
      if (section.hidden) { showing = false; victim.hidden = true; return; }
      document.getElementById('death-replay-attacker')!.textContent = `ENEMY ${String(attacker! + 1).padStart(2, '0')} / INTERVENTION`;
      const mode = roundFinished ? 'results' : 'respawn';
      if (button.dataset.mode !== mode) { button.dataset.mode = mode; button.innerHTML = `${roundFinished ? 'SKIP REPLAY' : 'SKIP & RESPAWN'} <span>ESC ↗</span>`; }
      const value = Math.max(0, Math.min(100, Math.round(fraction * 100)));
      progress.setAttribute('aria-valuenow', String(value)); (progress.firstElementChild as HTMLElement).style.width = `${value}%`;
      if (!showing) { showing = true; button.focus({ preventScroll: true }); }
    },
    victim(x: number, y: number, visible: boolean) {
      victim.hidden = !visible || x < 0 || x > 1 || y < 0 || y > 1;
      victim.style.left = `${x * 100}%`; victim.style.top = `${y * 100}%`;
    },
  };
}
