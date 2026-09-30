import { DEFAULT_MATCH_RULES, type MatchRules } from './match';

export const matchSetupMarkup = `
<dialog id="match-setup" aria-labelledby="match-title">
  <form id="match-form" class="settings-shell">
    <header class="settings-header"><div><span class="settings-kicker">DEADBOLT / SOLO FREE-FOR-ALL</span><h2 id="match-title">CREATE MATCH</h2></div><button type="button" id="match-close" class="settings-back" aria-label="Cancel match setup">← <span>BACK</span></button></header>
    <div class="match-content">
      <div class="match-map"><span>SECTOR 07</span><b>THE SCRAPYARD</b><p>9 respawning opponents · Intervention + FIELD-9 · Unlimited practice time</p></div>
      <div class="match-presets"><button type="button" id="preset-practice">QUICKSCOPE PRACTICE</button><button type="button" id="preset-combat">COMBAT RANGE</button></div>
      <div class="setting-row"><div><label for="rule-secondary">Secondary weapon damage</label><p>Allow pistol hits to damage enemies. Turn off for swapping and aim practice.</p></div><input id="rule-secondary" type="checkbox" role="switch" class="setting-switch" checked></div>
      <div class="setting-row"><div><label for="rule-knives">Allow knives</label><p>Press E or Mouse 4 for a close-range strike. Cover blocks melee hits.</p></div><input id="rule-knives" type="checkbox" role="switch" class="setting-switch" checked></div>
      <div class="setting-row"><div><label for="rule-bots">Enemies shoot back</label><p>Fight armed bots with 100 health, automatic respawns, and brief spawn protection.</p></div><input id="rule-bots" type="checkbox" role="switch" class="setting-switch"></div>
      <p class="match-note">These rules apply to the new match. Your control and graphics preferences stay saved separately.</p>
    </div>
    <footer class="settings-footer"><span id="match-summary" role="status"></span><button type="submit" class="play-button"><span>START MATCH</span><span>↗</span></button></footer>
  </form>
</dialog>`;

export function setupMatch(start: (rules: MatchRules) => void) {
  const dialog = document.getElementById('match-setup') as HTMLDialogElement;
  const field = (id: string) => document.getElementById(id) as HTMLInputElement;
  const secondary = field('rule-secondary'), knives = field('rule-knives'), bots = field('rule-bots');
  const read = (): MatchRules => ({ secondaryDamage: secondary.checked, knives: knives.checked, botsShoot: bots.checked });
  const summary = () => { document.getElementById('match-summary')!.textContent = bots.checked ? 'SOLO COMBAT · 100 HP · 2 SECOND RESPAWN' : 'SOLO PRACTICE · ENEMIES DO NOT FIRE'; };
  const set = (rules: Readonly<MatchRules>) => { secondary.checked = rules.secondaryDamage; knives.checked = rules.knives; bots.checked = rules.botsShoot; summary(); };
  for (const input of [secondary, knives, bots]) input.addEventListener('change', summary);
  document.getElementById('preset-practice')!.addEventListener('click', () => set(DEFAULT_MATCH_RULES));
  document.getElementById('preset-combat')!.addEventListener('click', () => set({ secondaryDamage: true, knives: true, botsShoot: true }));
  document.getElementById('match-close')!.addEventListener('click', () => dialog.close());
  document.getElementById('match-form')!.addEventListener('submit', event => { event.preventDefault(); const rules = read(); dialog.close(); start(rules); });
  set(DEFAULT_MATCH_RULES);
  let previousFocus: HTMLElement | null = null;
  dialog.addEventListener('close', () => previousFocus?.focus());
  return { open() { previousFocus = document.activeElement as HTMLElement; dialog.showModal(); } };
}
