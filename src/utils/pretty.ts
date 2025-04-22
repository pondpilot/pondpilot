export function formatStringsAsMDList(list: string[]) {
  return list.map((s) => `- ${s}`).join('\n');
}
