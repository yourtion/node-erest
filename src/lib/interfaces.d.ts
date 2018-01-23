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

}
