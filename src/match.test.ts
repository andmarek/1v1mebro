import { describe, expect, it } from 'vitest';
import { allowsDamage, DEFAULT_MATCH_RULES } from './match';
describe('match damage rules', () => {
  it('keeps default practice safe while permitting both player weapons and knives', () => {
    expect(allowsDamage(DEFAULT_MATCH_RULES, 'sniper')).toBe(true);
    expect(allowsDamage(DEFAULT_MATCH_RULES, 'pistol')).toBe(true);
    expect(allowsDamage(DEFAULT_MATCH_RULES, 'knife')).toBe(true);
    expect(allowsDamage(DEFAULT_MATCH_RULES, 'bot')).toBe(false);
  });
  it('gates each optional attack independently and always permits the primary', () => {
    for (const secondaryDamage of [false, true]) for (const knives of [false, true]) for (const botsShoot of [false, true]) {
      const rules = { secondaryDamage, knives, botsShoot };
      expect(allowsDamage(rules, 'pistol')).toBe(secondaryDamage);
      expect(allowsDamage(rules, 'knife')).toBe(knives);
      expect(allowsDamage(rules, 'bot')).toBe(botsShoot);
      expect(allowsDamage(rules, 'sniper')).toBe(true);
    }
  });
});
