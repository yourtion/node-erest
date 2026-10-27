// Experimental alternatives for this benchmark's body only; never a runtime dependency.
import assert from "node:assert/strict";
import Ajv from "ajv";
import { z } from "zod";
import { schemas } from "../fixture.mjs";

const fixtureSchema = z.toJSONSchema(schemas.body, { target: "draft-7" });
export function makeAjvBodyParser(schema, fallback) {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" });
  assert.deepEqual(jsonSchema, fixtureSchema, "Ajv experiment supports only the benchmark body schema");
  const ajv = new Ajv({ removeAdditional: true, strict: true });
  ajv.addFormat("email", z.regexes.email);
  const validate = ajv.compile(jsonSchema);
  return (input) => {
    // Include defensive copying in measurements, just as Zod returns independent objects.
    const output = structuredClone(input);
    return validate(output) ? output : fallback(input);
  };
}

export function manualBody(input) {
  // A hard-coded ceiling probe: no schema reflection or private Zod internals.
  // Failed fast-path guards fall back to Zod for the exact error.
  const b = input;
  if (!b || typeof b !== "object" || Array.isArray(b)
    || typeof b.name !== "string" || b.name.length < 1 || b.name.length > 100
    || !Number.isInteger(b.age) || b.age < 0 || b.age > 150
    || typeof b.email !== "string" || !z.regexes.email.test(b.email)
    || !Array.isArray(b.tags) || b.tags.length > 10 || !stringItems(b.tags)
    || !b.address || typeof b.address !== "object" || Array.isArray(b.address)
    || typeof b.address.city !== "string" || typeof b.address.zip !== "string") return schemas.body.parse(input);
  return { name: b.name, age: b.age, email: b.email, tags: b.tags.slice(), address: { city: b.address.city, zip: b.address.zip } };
}

function stringItems(items) {
  for (const item of items) if (typeof item !== "string") return false;
  return true;
}

export function makeManualBodyParser(schema, fallback) {
  assert.deepEqual(z.toJSONSchema(schema, {target:"draft-7"}), fixtureSchema, "Manual experiment supports only the benchmark body schema");
  return input => { try { return manualBody(input); } catch { return fallback(input); } };
}
