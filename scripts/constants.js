export const MODULE_ID = "dnd5e-buff-on-trigger";

export const ABILITY_IDS = ["str","dex","con","int","wis","cha"];

export const SKILL_IDS = ["acr","ani","arc","ath","dec","his","ins","itm","inv","med","nat","prc","prf","per","rel","slt","ste","sur"];

export const DAMAGE_TYPES = ["acid","bludgeoning","cold","fire","force","lightning","necrotic","piercing","poison","psychic","radiant","slashing","thunder"];

export const CONDITION_IDS = ["blinded","charmed","deafened","frightened","grappled","incapacitated","invisible","paralyzed","petrified","poisoned","prone","restrained","stunned","unconscious"];

export const ARMOR_PROF_IDS = ["lgt","med","hvy","shl"];

export const WEAPON_PROF_IDS = ["sim","mar","longsword","shortsword","dagger","handaxe","greataxe","battleaxe","mace","warhammer","spear","quarterstaff","bow","crossbow"];

export const LANGUAGE_IDS = ["common","elvish","dwarvish","orcish","draconic","infernal","celestial","abyssal","undercommon","gnomish","halfling","goblin","sylvan","primordial","deep"];

export const ATTACK_ACTION_TYPES = ["mwak","rwak","msak","rsak"];
export const GROUPED_ATTACK_TRIGGER_TYPES = ["anyAttack","weaponAttack","spellAttack"];
export const ATTACK_TRIGGER_TYPES = [...ATTACK_ACTION_TYPES, ...GROUPED_ATTACK_TRIGGER_TYPES];

export const BUFF_ICON = "modules/dnd5e-buff-on-trigger/icons/buff-active.svg";
export const STORED_TARGET_ICON = "modules/dnd5e-buff-on-trigger/icons/buff-stored-target.svg";

export function isDebugEnabled() {
  try {
    return game.settings?.get?.(MODULE_ID, "debug") === true;
  } catch {
    return false;
  }
}

export function debugLog(...args) {
  if (isDebugEnabled()) console.log(...args);
}
