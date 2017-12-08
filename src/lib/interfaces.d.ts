import { Schema } from "./schema";

export type ICallback<T> = (err: Error | null, ret?: T) => void;

export interface IPromiseCallback<T> extends ICallback<T> {
  reject?: any;
  resolve?: any;
  promise?: Promise<T>;
}

export interface IKVObject {
  [key: string]: any;
}

export interface IApiOption {
  info?: any;
  path?: any;
  missingParameterError?: any;
  invalidParameterError?: any;
  internalError?: any;
  router?: any;
  errors?: any;
  groups?: any;
}

export interface IDocOptions {
  markdown: boolean,
  index: boolean,
  home: boolean,
  swagger: boolean,
  json: boolean,
  all: boolean,
}

export interface IApiInfo extends IKVObject {
  $schemas: Map<string, Schema>;
  beforeHooks: any[];
  afterHooks: any[];
  docs?: any;
  test?: any;
  formatOutputReverse?: any;
  docOutputForamt?: any;
  $flag: IApiFlag;
}

export interface IApiFlag {
  saveApiInputOutput: boolean;
}
