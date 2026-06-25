/**
 * 简单内存存储（示例用）。
 * 三个框架入口共享同一份存储与 API 定义，体现 erest「API 定义与框架无关」。
 */

/** @typedef {{ id: number; name: string; email: string; age: number }} User */

export function createStore() {
  let nextId = 1;
  /** @type {Map<number, User>} */
  const users = new Map();

  return {
    /** @param {{ name: string; email: string; age: number }} input */
    createUser({ name, email, age }) {
      const id = nextId++;
      const user = { id, name, email, age };
      users.set(id, user);
      return user;
    },
    /** @param {number} id @param {Partial<User>} patch */
    updateUser(id, patch) {
      const u = users.get(id);
      if (!u) {
        throw Object.assign(new Error('user not found'), { status: 404 });
      }
      Object.assign(u, patch);
      return u;
    },
    /** @param {number} id @returns {User | undefined} */
    getUser(id) {
      return users.get(id);
    },
  };
}
