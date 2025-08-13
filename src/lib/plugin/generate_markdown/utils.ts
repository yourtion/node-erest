export function trimSpaces(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n\n+/g, "\n\n")
    .replace(/\n\s+\n/g, "\n\n");
}

export function toString(str: string | undefined, defaultStr = "") {
  return typeof str !== "undefined" ? String(str) : defaultStr;
}

export function stringOrEmpty(str: string | undefined, comm = false) {
  const res = toString(str, "（无）");
  return comm ? "`" + res + "`" : res;
}

export function itemTF(obj: any) {
  return obj ? "是" : "否";
}

export function itemTFEmoji(obj: any) {
  return obj ? "✅" : "❌";
}

export function tableHeader(titles: string[]) {
  return `${titles.join(" | ")} \n${"---|".repeat(titles.length)}`.slice(0, -1);
}

export function fieldString(field: string[]) {
  return field.join(" | ").trim();
}
