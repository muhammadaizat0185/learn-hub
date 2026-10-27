const BULLET = /^·\s+/;
const SUB_BULLET = /^o\s+/;

interface Row {
  sub: boolean;
  text: string;
}

/**
 * Past papers often lay requirement lists out one "· item" per line. Kept verbatim,
 * those rows flatten into one run-on sentence, so render each line as a block and
 * nested "o" rows as a sub-list.
 */
export default function Stem({ text }: { text: string }) {
  const lines = text.split("\n");
  if (lines.length < 2) return <p className="qtext">{text}</p>;

  const toRow = (line: string): Row =>
    SUB_BULLET.test(line)
      ? { sub: true, text: line.replace(SUB_BULLET, "") }
      : { sub: false, text: line.replace(BULLET, "") };

  const blocks: ({ kind: "p"; text: string } | { kind: "ul"; rows: Row[] })[] = [];
  for (const line of lines) {
    const row = toRow(line);
    const last = blocks[blocks.length - 1];
    if (row.text !== line && last?.kind === "ul") last.rows.push(row);
    else if (row.text !== line) blocks.push({ kind: "ul", rows: [row] });
    else blocks.push({ kind: "p", text: line });
  }

  return (
    <div className="qstem">
      {blocks.map((block, index) =>
        block.kind === "p" ? (
          <p className="qtext" key={index}>
            {block.text}
          </p>
        ) : (
          <ul className="qstem-list" key={index}>
            {block.rows.map((row, rowIndex) => (
              <li className={row.sub ? "qstem-row-sub" : undefined} key={rowIndex}>
                {row.text}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
