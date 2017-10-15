'use strict';

/**
 * @file API 管理器
 * 参考 hojs
 * @author Yourtion Guo <yourtion@gmail.com>
 */
module.exports = class Manager {
  
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
  get(name) {
    return this.map.get(name);
  }
  
  /**
   * 遍历
   *
   * @param {Function} iter
   * @return {Object}
   */
  forEach(iter) {
    return this.map.forEach(iter);
  }
  
};
