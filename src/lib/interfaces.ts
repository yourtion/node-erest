import { IDocOptions } from "./index";
import { Schema } from "./schema";

export type ICallback<T> = (err: Error | null, ret?: T) => void;

export interface IPromiseCallback<T> extends ICallback<T> {
  reject?: any;
  resolve?: any;
  promise?: Promise<T>;
}

export interface IKVObject<T = any> {
  [key: string]: T;
}

export type IDocGeneratePlugin = (data: any, dir: string, options: IDocOptions) => void;
