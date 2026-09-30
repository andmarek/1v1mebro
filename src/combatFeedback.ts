import './combatFeedback.css';
import type { CombatVector } from './match';

import type { EliminationEvent } from './combatEvents';
export function damageBearing(player: CombatVector, source: CombatVector, yaw: number) {
  const angle = Math.atan2(source.x - player.x, source.z - player.z) - yaw;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
export const combatFeedbackMarkup = `<div id="kill-feed" aria-label="Recent eliminations" role="log" aria-live="polite"></div><div id="damage-directions" aria-hidden="true"></div>`;

/** Visual feedback follows simulation events; it never applies damage or changes scores. */
export function setupCombatFeedback(name: (id: string) => string) {
  const feed = document.getElementById('kill-feed')!;
  const directions = document.getElementById('damage-directions')!;
  const eliminations: { node: HTMLElement; until: number }[] = [];
  const markers: { node: HTMLElement; source: CombatVector; until: number }[] = [];
  return {
    elimination(event: EliminationEvent) {
      const node = document.createElement('div'); node.className = 'kill-feed-row';
      if (event.killerId === 'player') node.classList.add('your-kill');
      if (event.victimId === 'player') node.classList.add('your-death');
      const killer = document.createElement('b'), weapon = document.createElement('span'), victim = document.createElement('b');
      killer.textContent = name(event.killerId); victim.textContent = name(event.victimId);
      weapon.textContent = event.source === 'knife' ? 'KNIFE' : event.source === 'pistol' ? 'FIELD-9' : 'INTERVENTION';
      const badges = document.createElement('small');
      badges.textContent = [event.headshot && 'HEADSHOT', event.quickscope && 'QUICKSCOPE', event.throughCover && 'WALLBANG'].filter(Boolean).join(' / ');
      node.append(killer, weapon, victim); if (badges.textContent) node.append(badges);
      feed.prepend(node); eliminations.push({ node, until: event.at + 6 });
      if (eliminations.length > 5) eliminations.shift()!.node.remove();
    },
    damage(source: CombatVector, now: number) {
      const node = document.createElement('i'); node.className = 'damage-direction';
      directions.append(node); markers.push({ node, source: { ...source }, until: now + 1.2 });
      if (markers.length > 4) markers.shift()!.node.remove();
    },
    update(now: number, player: CombatVector, yaw: number) {
      for (let i = eliminations.length - 1; i >= 0; i--) if (now >= eliminations[i].until) { eliminations[i].node.remove(); eliminations.splice(i, 1); }
      for (let i = markers.length - 1; i >= 0; i--) {
        const mark = markers[i];
        if (now >= mark.until) { mark.node.remove(); markers.splice(i, 1); continue; }
        mark.node.style.transform = `rotate(${damageBearing(player, mark.source, yaw)}rad)`;
        mark.node.style.opacity = String(Math.min(1, (mark.until - now) / .6));
      }
    },
    clear() { feed.replaceChildren(); directions.replaceChildren(); eliminations.length = markers.length = 0; },
  };
}
