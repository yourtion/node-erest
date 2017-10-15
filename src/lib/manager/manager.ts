"use strict";

/**
 * @file API 管理器
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */
export class Manager {

  protected map: Map<string, object>;
  private parent: object;

  /**
   * Creates an instance of Manager.
   * @param {Object} parent 上下文
   */
  constructor(parent) {
    this.parent = parent;
    this.map = new Map();
  }

  /**
   * 获取
   *
   * @param {String} name
   * @return {Object}
   */
  public get(name) {
    return this.map.get(name);
  }

  /**
   * 遍历
   *
   * @param {Function} iter
   * @return {Object}
   */
  public forEach(iter) {
    return this.map.forEach(iter);
  }

}
