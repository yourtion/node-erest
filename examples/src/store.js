/**
 * 内存存储（示例用）：用户 + 文章。
 *
 * 三个框架入口共享同一份存储，体现 erest「数据与框架无关」。
 * 用一个 reset 入口便于测试间隔离。
 */

/** @typedef {{ id: number; name: string; email: string; role: 'user' | 'admin' }} User */
/** @typedef {{ id: number; slug: string; title: string; content: string; authorId: number; published: boolean }} Post */

/** 已签发 token -> 用户 id 的映射（示例用，非生产鉴权） */
const TOKENS = new Map([
  ['user-token', { id: 1, role: 'user' }],
  ['admin-token', { id: 2, role: 'admin' }],
]);

export function createStore() {
  let nextUserId = 1;
  let nextPostId = 1;
  /** @type {Map<number, User>} */
  const users = new Map();
  /** @type {Map<number, Post>} */
  const posts = new Map();

  // 种子数据
  const alice = { id: nextUserId++, name: 'Alice', email: 'alice@ex.com', role: 'admin' };
  const bob = { id: nextUserId++, name: 'Bob', email: 'bob@ex.com', role: 'user' };
  users.set(alice.id, alice);
  users.set(bob.id, bob);
  const post1 = {
    id: nextPostId++,
    slug: 'hello-erest',
    title: 'Hello ERest',
    content: 'erest 让 API 开发更简单',
    authorId: alice.id,
    published: true,
  };
  posts.set(post1.id, post1);

  return {
    // —— 用户 ——
    /** @param {number} id @returns {User | undefined} */
    getUser(id) {
      return users.get(id);
    },
    /** @returns {User[]} */
    listUsers() {
      return [...users.values()];
    },

    // —— 文章 ——
    /** @returns {Post[]} */
    listPosts() {
      return [...posts.values()];
    },
    /** @returns {Post[]} */
    listPublishedPosts() {
      return [...posts.values()].filter((p) => p.published);
    },
    /** @param {number} id @returns {Post | undefined} */
    getPost(id) {
      return posts.get(id);
    },
    /** @param {string} slug @returns {Post | undefined} */
    getPostBySlug(slug) {
      return [...posts.values()].find((p) => p.slug === slug);
    },
    /** @param {{ slug: string; title: string; content: string; authorId: number }} input @returns {Post} */
    createPost({ slug, title, content, authorId }) {
      const post = { id: nextPostId++, slug, title, content, authorId, published: false };
      posts.set(post.id, post);
      return post;
    },
    /**
     * @param {number} id
     * @param {Partial<Post>} patch
     * @returns {Post}
     */
    updatePost(id, patch) {
      const p = posts.get(id);
      if (!p) throw Object.assign(new Error('post not found'), { status: 404 });
      Object.assign(p, patch);
      return p;
    },
    /** @param {number} id */
    deletePost(id) {
      if (!posts.delete(id)) throw Object.assign(new Error('post not found'), { status: 404 });
    },

    // —— 统计（mock 用）——
    stats() {
      return { users: users.size, posts: posts.size, published: this.listPublishedPosts().length };
    },

    // —— 鉴权 ——
    /**
     * 由 token 解析当前用户，失败返回 null。
     * @param {string | undefined} token
     * @returns {{ id: number; role: string } | null}
     */
    authenticate(token) {
      if (!token) return null;
      return TOKENS.get(token) ?? null;
    },

    /** 重置到种子状态（测试用） */
    reset() {
      users.clear();
      posts.clear();
      nextUserId = 1;
      nextPostId = 1;
      const a = { id: nextUserId++, name: 'Alice', email: 'alice@ex.com', role: 'admin' };
      const b = { id: nextUserId++, name: 'Bob', email: 'bob@ex.com', role: 'user' };
      users.set(a.id, a);
      users.set(b.id, b);
      const p = {
        id: nextPostId++,
        slug: 'hello-erest',
        title: 'Hello ERest',
        content: 'erest 让 API 开发更简单',
        authorId: a.id,
        published: true,
      };
      posts.set(p.id, p);
    },
  };
}
