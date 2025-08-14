import { fs, vol } from "memfs";
import { vi } from "vitest";

// Mock Node.js fs module with memfs
vi.mock("node:fs", () => {
  const mockCreateReadStream = vi.fn(() => ({
    pipe: vi.fn(),
    on: vi.fn(),
    read: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    destroy: vi.fn(),
    readable: true,
    readableEnded: false,
  }));

  return {
    ...fs,
    createReadStream: mockCreateReadStream,
  };
});

vi.mock("node:fs/promises", () => fs.promises);
vi.mock("fs", () => {
  const mockCreateReadStream = vi.fn(() => ({
    pipe: vi.fn(),
    on: vi.fn(),
    read: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    destroy: vi.fn(),
    readable: true,
    readableEnded: false,
  }));

  return {
    ...fs,
    createReadStream: mockCreateReadStream,
  };
});
vi.mock("fs/promises", () => fs.promises);

// Mock os.tmpdir() to return a consistent path
vi.mock("node:os", async () => {
  const actual = await vi.importActual("node:os");
  return {
    ...actual,
    tmpdir: vi.fn(() => "/tmp"),
  };
});

vi.mock("os", async () => {
  const actual = await vi.importActual("os");
  return {
    ...actual,
    tmpdir: vi.fn(() => "/tmp"),
  };
});

// Setup function to reset the virtual file system before each test
export function setupMemfs() {
  beforeEach(() => {
    // Clear the virtual file system
    vol.reset();

    // Setup basic directory structure
    vol.mkdirSync("/tmp", { recursive: true });
    vol.mkdirSync("/src", { recursive: true });
    vol.mkdirSync("/docs", { recursive: true });
    vol.mkdirSync("/test", { recursive: true });
    vol.mkdirSync("/test/dir", { recursive: true });
    vol.mkdirSync("/custom", { recursive: true });
    vol.mkdirSync("/custom/docs", { recursive: true });
  });
}

// Export vol for direct manipulation in tests if needed
export { vol };

// Global setup
setupMemfs();
