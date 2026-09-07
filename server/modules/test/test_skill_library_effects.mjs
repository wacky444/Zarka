import assert from "node:assert";
import pkg from "../build/main.js";
const { SkillLibrary, getActionEnergyDiscount } = pkg;

console.log("Testing SkillLibrary definitions...");
assert.ok(SkillLibrary.vitality.effect, "vitality should have effect");
assert.strictEqual(SkillLibrary.vitality.effect.type, "max_health_increase");
assert.strictEqual(SkillLibrary.vitality.effect.value, 1);

assert.ok(SkillLibrary.strength1.effect, "strength1 should have effect");
assert.strictEqual(SkillLibrary.strength1.effect.type, "action_energy_discount");
assert.strictEqual(SkillLibrary.strength1.effect.affectedAction, "punch");
assert.strictEqual(SkillLibrary.strength1.effect.value, 3);

assert.ok(SkillLibrary.strength2.effect, "strength2 should have effect");
assert.strictEqual(SkillLibrary.strength2.effect.type, "action_energy_discount");
assert.deepStrictEqual(SkillLibrary.strength2.effect.affectedAction, ["knife_attack", "bat_attack", "axe_attack"]);
assert.strictEqual(SkillLibrary.strength2.effect.value, 3);

assert.ok(SkillLibrary.strength3.effect, "strength3 should have effect");
assert.strictEqual(SkillLibrary.strength3.effect.type, "action_energy_discount");
assert.deepStrictEqual(SkillLibrary.strength3.effect.affectedAction, ["shoot_pistol", "shoot_harpoon"]);
assert.strictEqual(SkillLibrary.strength3.effect.value, 2);

// Test getActionEnergyDiscount function directly from server bundle:
assert.strictEqual(getActionEnergyDiscount({ abilities: ["strength1"] }, "punch"), 3);
assert.strictEqual(getActionEnergyDiscount({ abilities: ["strength1", "strength1"] }, "punch"), 6);
assert.strictEqual(getActionEnergyDiscount({ abilities: ["strength2"] }, "knife_attack"), 3);
assert.strictEqual(getActionEnergyDiscount({ abilities: ["strength2"] }, "bat_attack"), 3);
assert.strictEqual(getActionEnergyDiscount({ abilities: ["strength2"] }, "axe_attack"), 3);
assert.strictEqual(getActionEnergyDiscount({ abilities: ["strength3"] }, "shoot_pistol"), 2);
assert.strictEqual(getActionEnergyDiscount({ abilities: ["strength3"] }, "shoot_harpoon"), 2);
assert.strictEqual(getActionEnergyDiscount({ abilities: ["strength1"] }, "move"), 0);

console.log("All SkillLibrary definitions and getActionEnergyDiscount tests passed!");
