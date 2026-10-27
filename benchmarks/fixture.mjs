import { z } from "zod";

export const schemas = {
  params: z.object({ id: z.string().min(1) }),
  query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(10) }),
  body: z.object({
    name: z.string().min(1).max(100),
    age: z.number().int().min(0).max(150),
    email: z.string().email(),
    tags: z.array(z.string()).max(10),
    address: z.object({ city: z.string(), zip: z.string() }),
  }),
};
export const payload = {
  name: "Tom",
  age: 25,
  email: "tom@example.com",
  tags: ["node", "typescript", "api"],
  address: { city: "Shenzhen", zip: "518000" },
};
export const path = "/users/u123?limit=20";
export function output(req) {
  return { id: req.params.id, limit: Number(req.query.limit), ...req.body };
}
export const expectedPost = output({ params: { id: "u123" }, query: { limit: 20 }, body: payload });
export const expectedGet = { ok: true, message: "hello erest" };

export function validate(input) {
  const result = {};
  for (const key of ["params", "query", "body"]) {
    const parsed = schemas[key].safeParse(input[key]);
    if (!parsed.success) {
      const error = new Error("invalid input");
      error.status = 400;
      throw error;
    }
    result[key] = parsed.data;
  }
  return result;
}
