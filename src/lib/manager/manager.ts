/**
 * @file 管理器
 * @author Yourtion Guo <yourtion@gmail.com>
 */
export class Manager<T = unknown> {
  protected map: Map<string, T> = new Map();

  /** 获取 */
  public get(name: string) {
    return this.map.get(name);
  }

  /** 遍历 */
  public forEach(iter: (value: T, key: string, map: Map<string, T>) => void) {
    return this.map.forEach(iter);
  }
}
