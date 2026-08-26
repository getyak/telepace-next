export type MessageBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function isLineWhitespace(character: string | undefined): boolean {
  return character !== undefined && character.trim() === "";
}

function parseListLine(line: string): { kind: "ul" | "ol"; text: string } | null {
  let cursor = 0;
  while (isLineWhitespace(line[cursor])) cursor += 1;

  if (line[cursor] === "-" || line[cursor] === "*" || line[cursor] === "•") {
    cursor += 1;
    if (!isLineWhitespace(line[cursor])) return null;
    while (isLineWhitespace(line[cursor])) cursor += 1;
    return { kind: "ul", text: line.slice(cursor) };
  }

  const firstDigit = cursor;
  while (line[cursor] !== undefined && line[cursor] >= "0" && line[cursor] <= "9") {
    cursor += 1;
  }
  if (cursor === firstDigit || (line[cursor] !== "." && line[cursor] !== ")")) {
    return null;
  }
  cursor += 1;
  if (!isLineWhitespace(line[cursor])) return null;
  while (isLineWhitespace(line[cursor])) cursor += 1;
  return { kind: "ol", text: line.slice(cursor) };
}

/** Group chat prose into paragraphs and lists with a bounded linear scan. */
export function toBlocks(text: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  const lines = text.split("\n");
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join(" ") });
      para = [];
    }
  };

  for (const line of lines) {
    const listLine = parseListLine(line);
    if (listLine?.kind === "ul") {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ul") last.items.push(listLine.text);
      else blocks.push({ kind: "ul", items: [listLine.text] });
    } else if (listLine?.kind === "ol") {
      flushPara();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === "ol") last.items.push(listLine.text);
      else blocks.push({ kind: "ol", items: [listLine.text] });
    } else if (line.trim() === "") {
      flushPara();
    } else {
      para.push(line.trim());
    }
  }
  flushPara();
  return blocks;
}
