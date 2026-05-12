export const BUFF_PRESETS = [
  {
    id: "bless",
    label: "BOT.presets.bless.label",
    description: "BOT.presets.bless.description",
    flag: {
      targetMode: "target",
      type: "passive",
      rollModifier: {
        enabled: true,
        formula: "1d4",
        rollTypes: ["attack", "save"],
      },
      consumeOnTrigger: false,
    },
  },
  {
    id: "bane",
    label: "BOT.presets.bane.label",
    description: "BOT.presets.bane.description",
    flag: {
      targetMode: "target",
      type: "passive",
      rollModifier: {
        enabled: true,
        formula: "-1d4",
        rollTypes: ["attack", "save"],
      },
      save: {
        enabled: true,
        timing: "activation",
        ability: "cha",
        dcSource: "origin",
        activationApplyOn: "failure",
      },
      consumeOnTrigger: false,
    },
  },
  {
    id: "guidance",
    label: "BOT.presets.guidance.label",
    description: "BOT.presets.guidance.description",
    flag: {
      targetMode: "target",
      type: "passive",
      rollModifier: {
        enabled: true,
        formula: "1d4",
        rollTypes: ["ability", "skill"],
      },
      charges: 1,
      consumeOnTrigger: false,
    },
  },
  {
    id: "resistance",
    label: "BOT.presets.resistance.label",
    description: "BOT.presets.resistance.description",
    flag: {
      targetMode: "target",
      type: "passive",
      rollModifier: {
        enabled: true,
        formula: "1d4",
        rollTypes: ["save"],
      },
      charges: 1,
      consumeOnTrigger: false,
    },
  },
  {
    id: "hex",
    label: "BOT.presets.hex.label",
    description: "BOT.presets.hex.description",
    flag: {
      targetMode: "self",
      rememberTargetOnActivation: true,
      requireStoredTargetMatch: true,
      type: "anyAttack",
      condition: "hit",
      damage: {
        formula: "1d6",
        type: "necrotic",
        targetMode: "triggerTarget",
      },
      consumeOnTrigger: false,
    },
  },
  {
    id: "huntersMark",
    label: "BOT.presets.huntersMark.label",
    description: "BOT.presets.huntersMark.description",
    flag: {
      targetMode: "self",
      rememberTargetOnActivation: true,
      requireStoredTargetMatch: true,
      type: "weaponAttack",
      condition: "hit",
      damage: {
        formula: "1d6",
        targetMode: "triggerTarget",
      },
      consumeOnTrigger: false,
    },
  },
  {
    id: "fireShieldWarm",
    label: "BOT.presets.fireShieldWarm.label",
    description: "BOT.presets.fireShieldWarm.description",
    flag: {
      targetMode: "self",
      type: "damaged",
      receivedAttackType: "melee",
      damage: {
        formula: "2d8",
        type: "fire",
        targetMode: "attacker",
      },
      buffs: {
        resistances: ["cold"],
      },
      consumeOnTrigger: false,
      triggerFrequency: "none",
    },
  },
  {
    id: "fireShieldChill",
    label: "BOT.presets.fireShieldChill.label",
    description: "BOT.presets.fireShieldChill.description",
    flag: {
      targetMode: "self",
      type: "damaged",
      receivedAttackType: "melee",
      damage: {
        formula: "2d8",
        type: "cold",
        targetMode: "attacker",
      },
      buffs: {
        resistances: ["fire"],
      },
      consumeOnTrigger: false,
      triggerFrequency: "none",
    },
  },
  {
    id: "heroism",
    label: "BOT.presets.heroism.label",
    description: "BOT.presets.heroism.description",
    flag: {
      targetMode: "target",
      type: "turnStart",
      temporaryHp: {
        formula: "@origin.spell.mod",
        targetMode: "self",
        mode: "keepHighest",
      },
      buffs: {
        conditionImmunities: ["frightened"],
      },
      consumeOnTrigger: false,
      triggerFrequency: "none",
    },
  },
];
