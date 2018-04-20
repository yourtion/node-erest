export function trimSpaces(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n\n+/g, "\n\n")
    .replace(/\n\s+\n/g, "\n\n");
}

export function toString(str: string, defaultStr = "") {
  return typeof str !== "undefined" ? String(str) : defaultStr;
}

export function stringOrEmpty(str: string, comm = false) {
  const res = toString(str, "（无）");
  return comm ? "`" + res + "`" : res;
}

export function itemTF(obj: any) {
  return obj ? "是" : "否";
}

export function tableHeader(titles: string[]) {
  return `${titles.join(" | ")} \n${"---|".repeat(titles.length)}`.slice(0, -1);
}

export function fieldString(field: string[]) {
  return field.join(" | ").trim();
}
