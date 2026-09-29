type SettingsCallbacks = {
  sensitivity: (value: number) => void; ads: (value: number) => void; volume: (value: number) => void;
  walking: (value: boolean) => void; impacts: (value: boolean) => void; invert: (value: boolean) => void;
  fps: (value: boolean) => void; shadows: (value: string) => void; resolution: (value: string) => void;
  resetPractice: () => void;
};

export const settingsMarkup = `
<dialog id="settings-screen" aria-labelledby="settings-title">
  <div class="settings-shell">
    <header class="settings-header"><div><span class="settings-kicker">DEADBOLT / FIELD LAB</span><h2 id="settings-title">RANGE SETTINGS</h2></div><button id="settings-close" class="settings-back" aria-label="Back to range menu">← <span>BACK TO RANGE</span></button></header>
    <div class="settings-body">
      <nav class="settings-nav" role="tablist" aria-label="Settings categories" aria-orientation="vertical">
        <button id="tab-controls" role="tab" aria-selected="true" aria-controls="panel-controls"><span>01</span> CONTROLS</button>
        <button id="tab-graphics" role="tab" aria-selected="false" aria-controls="panel-graphics" tabindex="-1"><span>02</span> GRAPHICS</button>
        <button id="tab-audio" role="tab" aria-selected="false" aria-controls="panel-audio" tabindex="-1"><span>03</span> AUDIO</button>
        <button id="tab-practice" role="tab" aria-selected="false" aria-controls="panel-practice" tabindex="-1"><span>04</span> PRACTICE</button>
        <div class="settings-nav-note">SECTOR 07<br><b>THE SCRAPYARD</b></div>
      </nav>
      <main class="settings-content">
        <section id="panel-controls" role="tabpanel" aria-labelledby="tab-controls" tabindex="0">
          <div class="settings-section-heading"><span>01 / INPUT</span><h3>Find your feel.</h3><p>Fine-tune how you look around the range.</p></div>
          <div class="setting-row setting-range"><div><label for="sensitivity">Mouse sensitivity</label><p>Adjust how far the camera turns as you move the mouse.</p></div><div class="setting-input"><output id="sensitivity-value" for="sensitivity">1.0</output><input id="sensitivity" type="range" min="0.3" max="2.5" step="0.1" value="1"></div></div>
          <div class="setting-row"><div><label for="invert-y">Invert vertical look</label><p>Move the mouse up to look down.</p></div><input id="invert-y" class="setting-switch" type="checkbox" role="switch"></div>
          <div class="settings-controls"><span>FIELD CONTROLS</span><div><b><kbd>W A S D</kbd> Move</b><b><kbd>SHIFT</kbd> Sprint</b><b><kbd>SPACE</kbd> Jump</b><b><kbd>C</kbd> Lower stance</b><b><kbd>RMB / Q</kbd> Aim</b><b><kbd>LMB</kbd> Fire</b><b><kbd>R</kbd> Reload</b><b><kbd>V</kbd> Inspect</b></div><p>In embedded previews, use arrow keys or drag to look.</p></div>
        </section>
        <section id="panel-graphics" role="tabpanel" aria-labelledby="tab-graphics" tabindex="0" hidden>
          <div class="settings-section-heading"><span>02 / VISUALS</span><h3>Make every shot clear.</h3><p>Balance surface detail with a smooth frame rate.</p></div>
          <div class="setting-row"><div><label for="render-detail">Render detail</label><p>Higher detail makes the range sharper.</p></div><select id="render-detail"><option value="performance">Performance</option><option value="balanced" selected>Balanced</option><option value="sharp">Sharp</option></select></div>
          <div class="setting-row"><div><label for="shadow-detail">Shadow detail</label><p>Lower detail may improve frame rate.</p></div><select id="shadow-detail"><option value="off">Off</option><option value="low">Low</option><option value="high" selected>High</option></select></div>
          <div class="setting-row"><div><label for="impact-marks">Bullet impact marks</label><p>Show textured entry and exit marks. Up to 64 holes stay for 30 seconds.</p></div><input id="impact-marks" class="setting-switch" type="checkbox" role="switch" checked></div>
          <div class="setting-row"><div><label for="show-fps">Show frame rate</label><p>Keep an FPS counter visible while you play.</p></div><input id="show-fps" class="setting-switch" type="checkbox" role="switch" checked></div>
        </section>
        <section id="panel-audio" role="tabpanel" aria-labelledby="tab-audio" tabindex="0" hidden>
          <div class="settings-section-heading"><span>03 / SOUND</span><h3>Hear the next shot.</h3><p>Set the level for shots, footsteps, and hit feedback.</p></div>
          <div class="setting-row setting-range"><div><label for="volume">Master volume</label><p>Set to zero to mute all game audio.</p></div><div class="setting-input"><output id="volume-value" for="volume">50%</output><input id="volume" type="range" min="0" max="100" step="5" value="50"></div></div>
        </section>
        <section id="panel-practice" role="tabpanel" aria-labelledby="tab-practice" tabindex="0" hidden>
          <div class="settings-section-heading"><span>04 / TRAINING</span><h3>Practice your way.</h3><p>Set up the range for tracking or precision.</p></div>
          <div class="setting-row"><div><label for="moving">Walking enemies</label><p>Enemies patrol the yard and tower decks. Turn off for stationary practice.</p></div><input id="moving" class="setting-switch" type="checkbox" role="switch" checked></div>
          <div class="setting-row setting-range"><div><label for="ads-speed">Scope-in time</label><p>Choose how quickly the rifle settles into its scope.</p></div><div class="setting-input"><output id="ads-value" for="ads-speed">180 ms</output><input id="ads-speed" type="range" min="120" max="320" step="10" value="180"></div></div>
          <div class="setting-row setting-reset"><div><b>Fresh session</b><p>Clear your score, refill the rifle, and restore enemies to full health at spawn.</p></div><button id="reset" class="settings-secondary">RESET PRACTICE ↺</button></div>
        </section>
      </main>
    </div>
    <footer class="settings-footer"><span id="settings-status" role="status">Changes saved automatically.</span><button id="settings-defaults" class="settings-secondary">RESTORE DEFAULTS</button></footer>
  </div>
</dialog>`;

export function setupSettings(callbacks: SettingsCallbacks) {
  const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = get<HTMLDialogElement>('settings-screen'), status = get<HTMLElement>('settings-status');
  let previousFocus: HTMLElement | null = null;
  let canSave = true;
  const save = (id: string, value: string) => {
    try { localStorage.setItem(`deadbolt-${id}`, value); }
    catch { canSave = false; }
    status.textContent = canSave ? 'Changes saved automatically.' : 'Changes apply immediately.';
  };
  const read = (id: string) => { try { return localStorage.getItem(`deadbolt-${id}`); } catch { canSave = false; return null; } };
  const defaults: (() => void)[] = [];
  function range(id: string, label: string, initial: number, apply: (n: number) => void, format: (n: number) => string) {
    const input = get<HTMLInputElement>(id), output = get<HTMLOutputElement>(label);
    const stored = read(id); input.value = stored !== null && Number.isFinite(Number(stored)) ? stored : String(initial);
    const update = () => { const value = Number(input.value); output.value = format(value); apply(value); save(id, input.value); };
    input.addEventListener('input', update); defaults.push(() => { input.value = String(initial); update(); }); update();
  }
  function toggle(id: string, initial: boolean, apply: (n: boolean) => void) {
    const input = get<HTMLInputElement>(id), stored = read(id);
    input.checked = stored === null ? initial : stored === 'true';
    const update = () => { apply(input.checked); save(id, String(input.checked)); };
    input.addEventListener('change', update); defaults.push(() => { input.checked = initial; update(); }); update();
  }
  function select(id: string, initial: string, apply: (s: string) => void) {
    const input = get<HTMLSelectElement>(id), stored = read(id);
    input.value = Array.from(input.options).some(option => option.value === stored) ? stored! : initial;
    const update = () => { apply(input.value); save(id, input.value); };
    input.addEventListener('change', update); defaults.push(() => { input.value = initial; update(); }); update();
  }
  range('sensitivity', 'sensitivity-value', 1, callbacks.sensitivity, n => n.toFixed(1));
  range('volume', 'volume-value', 50, callbacks.volume, n => `${n}%`);
  range('ads-speed', 'ads-value', 180, callbacks.ads, n => `${n} ms`);
  toggle('moving', true, callbacks.walking); toggle('impact-marks', true, callbacks.impacts);
  toggle('invert-y', false, callbacks.invert); toggle('show-fps', true, callbacks.fps);
  select('shadow-detail', 'high', callbacks.shadows); select('render-detail', 'balanced', callbacks.resolution);
  const tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>('[role=tab]'));
  function activate(tab: HTMLButtonElement) {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1;
      get<HTMLElement>(item.getAttribute('aria-controls')!).hidden = !selected;
    }
    dialog.querySelector('.settings-content')!.scrollTop = 0;
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', e => {
      let next = index;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = tabs.length - 1;
      else return;
      e.preventDefault(); activate(tabs[next]); tabs[next].focus();
    });
  });
  get<HTMLElement>('settings-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => previousFocus?.focus());
  get<HTMLElement>('settings-defaults').addEventListener('click', () => { defaults.forEach(reset => reset()); status.textContent = 'Defaults restored.'; });
  get<HTMLElement>('reset').addEventListener('click', () => { callbacks.resetPractice(); status.textContent = 'Practice reset. Ready for another run.'; });
  return { open: () => { previousFocus = document.activeElement as HTMLElement; if (!dialog.open) dialog.showModal(); } };
}
