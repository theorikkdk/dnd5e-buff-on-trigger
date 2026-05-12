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
];
