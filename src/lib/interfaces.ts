import { Schema } from "./schema";

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

export interface IApiInfo {
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
