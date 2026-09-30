import { DEFAULT_MATCH_RULES, type MatchRules } from './match';
import { DEFAULT_ROUND_OPTIONS, PRACTICE_ROUND_OPTIONS, type RoundOptions } from './rounds';

export const matchSetupMarkup = `
<dialog id="match-setup" aria-labelledby="match-title">
  <form id="match-form" class="settings-shell">
    <header class="settings-header"><div><span class="settings-kicker">DEADBOLT / SOLO FREE-FOR-ALL</span><h2 id="match-title">CREATE MATCH</h2></div><button type="button" id="match-close" class="settings-back" aria-label="Cancel match setup">← <span>BACK</span></button></header>
    <div class="match-content">
      <div class="match-map"><span>SECTOR 07</span><b>THE SCRAPYARD</b><p>9 respawning opponents · Intervention + FIELD-9 · Solo free-for-all</p></div>
      <div class="match-presets"><button type="button" id="preset-practice">QUICKSCOPE PRACTICE</button><button type="button" id="preset-combat">COMBAT RANGE</button></div>
      <div class="setting-row"><div><label for="round-kill-limit">Kill limit</label><p>The first player to reach this score wins. Unlimited keeps the range open.</p></div><select id="round-kill-limit"><option value="0">Unlimited</option><option value="5">5 kills</option><option value="10">10 kills</option><option value="20" selected>20 kills</option><option value="30">30 kills</option><option value="50">50 kills</option></select></div>
      <div class="setting-row"><div><label for="round-time-limit">Time limit</label><p>Most eliminations wins when the clock runs out. Matches begin with a 3-second countdown.</p></div><select id="round-time-limit"><option value="0">Unlimited</option><option value="60">1 minute</option><option value="180">3 minutes</option><option value="300" selected>5 minutes</option><option value="600">10 minutes</option></select></div>
      <div class="setting-row"><div><label for="rule-secondary">Secondary weapon damage</label><p>Allow pistol hits to damage enemies. Turn off for swapping and aim practice.</p></div><input id="rule-secondary" type="checkbox" role="switch" class="setting-switch" checked></div>
      <div class="setting-row"><div><label for="rule-knives">Allow knives</label><p>Press E or Mouse 4 for a close-range strike. Cover blocks melee hits.</p></div><input id="rule-knives" type="checkbox" role="switch" class="setting-switch" checked></div>
      <div class="setting-row"><div><label for="rule-bots">Enemies shoot back</label><p>Fight armed bots with 100 health, automatic respawns, and brief spawn protection.</p></div><input id="rule-bots" type="checkbox" role="switch" class="setting-switch"></div>
      <p class="match-note">These rules apply to the new match. Your control and graphics preferences stay saved separately.</p>
    </div>
    <footer class="settings-footer"><span id="match-summary" role="status"></span><button type="submit" class="play-button"><span>START MATCH</span><span>↗</span></button></footer>
  </form>
</dialog>`;

export function setupMatch(start: (rules: MatchRules, options: RoundOptions) => void) {
  const dialog = document.getElementById('match-setup') as HTMLDialogElement;
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  const secondary = field('rule-secondary'), knives = field('rule-knives'), bots = field('rule-bots');
  const killLimit = document.getElementById('round-kill-limit') as HTMLSelectElement;
  const timeLimit = document.getElementById('round-time-limit') as HTMLSelectElement;
  const read = (): MatchRules => ({ secondaryDamage: secondary.checked, knives: knives.checked, botsShoot: bots.checked });
  const readOptions = (): RoundOptions => ({ killLimit: Number(killLimit.value), timeLimitSeconds: Number(timeLimit.value) });
  const summary = () => {
    const options = readOptions(), mode = bots.checked ? 'SOLO COMBAT' : 'SOLO PRACTICE';
    const kills = options.killLimit ? `${options.killLimit} KILLS` : 'NO KILL LIMIT';
    const time = options.timeLimitSeconds ? `${options.timeLimitSeconds / 60} MIN` : 'NO TIME LIMIT';
    document.getElementById('match-summary')!.textContent = `${mode} · ${kills} · ${time}`;
  };
  const set = (rules: Readonly<MatchRules>, options: Readonly<RoundOptions>) => {
    secondary.checked = rules.secondaryDamage; knives.checked = rules.knives; bots.checked = rules.botsShoot;
    killLimit.value = String(options.killLimit); timeLimit.value = String(options.timeLimitSeconds); summary();
  };
  for (const input of [secondary, knives, bots, killLimit, timeLimit]) input.addEventListener('change', summary);
  document.getElementById('preset-practice')!.addEventListener('click', () => set(DEFAULT_MATCH_RULES, PRACTICE_ROUND_OPTIONS));
  document.getElementById('preset-combat')!.addEventListener('click', () => set({ secondaryDamage: true, knives: true, botsShoot: true }, DEFAULT_ROUND_OPTIONS));
  document.getElementById('match-close')!.addEventListener('click', () => dialog.close());
  document.getElementById('match-form')!.addEventListener('submit', event => { event.preventDefault(); const rules = read(), options = readOptions(); dialog.close(); start(rules, options); });
  set(DEFAULT_MATCH_RULES, DEFAULT_ROUND_OPTIONS);
  let previousFocus: HTMLElement | null = null;
  dialog.addEventListener('close', () => previousFocus?.focus());
  return { open() { previousFocus = document.activeElement as HTMLElement; dialog.showModal(); } };
}
